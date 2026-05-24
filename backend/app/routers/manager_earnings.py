import re
from datetime import datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.booking import Booking
from app.models.vehicle import Vehicle, VehicleImage
from app.models.manager import ManagerProfile, ManagerPayoutRequest
from app.models.payment import WalletTransaction
from app.models.user import User
from app.mongo_models.notification import create_notification
from app.services.booking_flow import add_wallet_transaction, get_or_create_wallet, money
from app.services.super_manager import check_and_update_super_manager
from app.utils.auth import require_vehicle_manager
from app.utils.validators import validate_ifsc


router = APIRouter(prefix="/manager", tags=["manager earnings"])

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
class PayoutRequest(BaseModel):
    amount: float = Field(ge=500)


class BankDetailsRequest(BaseModel):
    bank_name: str = Field(min_length=2, max_length=200)
    account_number: str = Field(min_length=6, max_length=50)
    ifsc: str = Field(min_length=11, max_length=11)
    account_holder: str = Field(min_length=2, max_length=200)

    @field_validator("ifsc")
    @classmethod
    def ifsc_is_valid(cls, value: str) -> str:
        return validate_ifsc(value)


class ManagerProfileUpdateRequest(BaseModel):
    bio: str | None = Field(default=None, max_length=500)
    response_time: str | None = Field(default=None, max_length=100)


def _dt(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _pages(total: int, limit: int) -> int:
    return (total + limit - 1) // limit if total else 0


def _bank_payload(profile: ManagerProfile | None) -> dict:
    if profile is None or not profile.payout_bank_name or not profile.payout_account_number:
        return {"has_bank_account": False}
    account = profile.payout_account_number or ""
    return {
        "has_bank_account": True,
        "bank_name": profile.payout_bank_name,
        "account_holder": profile.payout_account_holder,
        "account_last4": account[-4:],
        "ifsc": profile.payout_ifsc,
        "label": f"{profile.payout_bank_name} ••••{account[-4:]}",
    }


async def _get_or_create_profile(db: AsyncSession, manager_id: str) -> ManagerProfile:
    profile = await db.scalar(select(ManagerProfile).where(ManagerProfile.user_id == manager_id))
    if profile is None:
        profile = ManagerProfile(user_id=manager_id)
        db.add(profile)
        await db.flush()
    return profile


async def _primary_image_map(db: AsyncSession, vehicle_ids: list[str]) -> dict[str, str | None]:
    if not vehicle_ids:
        return {}
    images = (
        await db.execute(
            select(VehicleImage)
            .where(VehicleImage.vehicle_id.in_(vehicle_ids))
            .order_by(VehicleImage.vehicle_id, VehicleImage.is_primary.desc(), VehicleImage.order_index.asc())
        )
    ).scalars().all()
    result: dict[str, str | None] = {}
    for image in images:
        result.setdefault(image.vehicle_id, image.image_url)
    return result


async def _manager_wallet_credits(db: AsyncSession, manager_id: str, start: datetime | None = None, end: datetime | None = None) -> Decimal:
    conditions = [WalletTransaction.user_id == manager_id, WalletTransaction.transaction_type == "credit"]
    if start:
        conditions.append(WalletTransaction.created_at >= start)
    if end:
        conditions.append(WalletTransaction.created_at < end)
    return await db.scalar(select(func.coalesce(func.sum(WalletTransaction.amount), 0)).where(*conditions)) or Decimal("0")


async def _summary_data(db: AsyncSession, manager: User) -> dict:
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last_month_end = month_start
    last_month_start = (month_start.replace(day=1) - datetime.resolution).replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    wallet = await get_or_create_wallet(db, manager.id)
    total = await _manager_wallet_credits(db, manager.id)
    this_month = await _manager_wallet_credits(db, manager.id, month_start)
    last_month = await _manager_wallet_credits(db, manager.id, last_month_start, last_month_end)
    trips = await db.scalar(select(func.count()).select_from(Booking).where(Booking.manager_id == manager.id, Booking.status == "completed")) or 0
    active_listings = await db.scalar(select(func.count()).select_from(Vehicle).where(Vehicle.manager_id == manager.id, Vehicle.is_available.is_(True), Vehicle.is_approved.is_(True))) or 0
    pending_requests = await db.scalar(select(func.count()).select_from(Booking).where(Booking.manager_id == manager.id, Booking.status == "pending")) or 0
    avg_rating = await db.scalar(select(func.coalesce(func.avg(Vehicle.average_rating), 0)).where(Vehicle.manager_id == manager.id)) or 0

    best_row = (
        await db.execute(
            select(Vehicle.id, Vehicle.title, func.count(Booking.id), func.coalesce(func.sum(Booking.manager_earnings), 0))
            .join(Booking, Booking.vehicle_id == Vehicle.id)
            .where(Vehicle.manager_id == manager.id, Booking.status == "completed")
            .group_by(Vehicle.id, Vehicle.title)
            .order_by(func.coalesce(func.sum(Booking.manager_earnings), 0).desc())
            .limit(1)
        )
    ).first()
    change = 100.0 if money(this_month) and not money(last_month) else ((money(this_month) - money(last_month)) / money(last_month) * 100 if money(last_month) else 0)
    return {
        "total_earned_all_time": money(total),
        "total_earned_this_month": money(this_month),
        "total_earned_last_month": money(last_month),
        "wallet_balance": money(wallet.balance),
        "total_trips_completed": trips,
        "average_earnings_per_trip": money(Decimal(str(total)) / Decimal(trips)) if trips else 0,
        "best_car": None if best_row is None else {"id": best_row[0], "title": best_row[1], "trips": best_row[2], "earnings": money(best_row[3])},
        "month_over_month_change_percent": round(change, 2),
        "active_listings": active_listings,
        "avg_car_rating": money(avg_rating),
        "pending_requests": pending_requests,
    }


@router.get("/earnings/summary")
async def earnings_summary(current_user: User = Depends(require_vehicle_manager), db: AsyncSession = Depends(get_db)):
    return await _summary_data(db, current_user)


@router.get("/earnings/monthly")
async def monthly_earnings(
    year: int | None = Query(default=None),
    current_user: User = Depends(require_vehicle_manager),
    db: AsyncSession = Depends(get_db),
):
    year = year or datetime.utcnow().year
    rows = (
        await db.execute(
            select(
                func.month(Booking.actual_return_time).label("month"),
                func.count(Booking.id),
                func.coalesce(func.sum(Booking.total_amount), 0),
                func.coalesce(func.sum(Booking.platform_fee), 0),
                func.coalesce(func.sum(Booking.manager_earnings), 0),
            )
            .where(Booking.manager_id == current_user.id, Booking.status == "completed", func.year(Booking.actual_return_time) == year)
            .group_by(func.month(Booking.actual_return_time))
        )
    ).all()
    by_month = {row[0]: row for row in rows}
    return [
        {
            "month": MONTHS[index - 1],
            "trips": by_month.get(index, [None, 0, 0, 0, 0])[1],
            "gross": money(by_month.get(index, [None, 0, 0, 0, 0])[2]),
            "platform_fees": money(by_month.get(index, [None, 0, 0, 0, 0])[3]),
            "net": money(by_month.get(index, [None, 0, 0, 0, 0])[4]),
        }
        for index in range(1, 13)
    ]


@router.get("/earnings/per-car")
async def per_car_earnings(current_user: User = Depends(require_vehicle_manager), db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            select(
                Vehicle.id,
                Vehicle.title,
                Vehicle.average_rating,
                func.count(Booking.id),
                func.coalesce(func.sum(Booking.total_amount), 0),
                func.coalesce(func.sum(Booking.platform_fee), 0),
                func.coalesce(func.sum(Booking.manager_earnings), 0),
            )
            .outerjoin(Booking, (Booking.vehicle_id == Vehicle.id) & (Booking.status == "completed"))
            .where(Vehicle.manager_id == current_user.id)
            .group_by(Vehicle.id, Vehicle.title, Vehicle.average_rating)
            .order_by(func.coalesce(func.sum(Booking.manager_earnings), 0).desc())
        )
    ).all()
    images = await _primary_image_map(db, [row[0] for row in rows])
    return [
        {
            "vehicle_id": vehicle_id,
            "title": title,
            "primary_image": images.get(vehicle_id),
            "trips": trips,
            "gross": money(gross),
            "platform_fees": money(platform_fees),
            "net": money(net),
            "avg_rating": money(rating),
        }
        for vehicle_id, title, rating, trips, gross, platform_fees, net in rows
    ]


@router.get("/earnings/transactions")
async def earning_transactions(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(require_vehicle_manager),
    db: AsyncSession = Depends(get_db),
):
    conditions = [WalletTransaction.user_id == current_user.id, WalletTransaction.transaction_type == "credit"]
    total = await db.scalar(select(func.count()).select_from(WalletTransaction).where(*conditions)) or 0
    rows = (
        await db.execute(
            select(WalletTransaction, Booking.booking_ref)
            .outerjoin(Booking, Booking.id == WalletTransaction.reference_id)
            .where(*conditions)
            .order_by(WalletTransaction.created_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
    ).all()
    return {
        "items": [
            {
                "id": txn.id,
                "date": _dt(txn.created_at),
                "description": txn.description,
                "booking_ref": booking_ref,
                "amount": money(txn.amount),
                "type": txn.transaction_type,
                "balance_after": money(txn.balance_after),
            }
            for txn, booking_ref in rows
        ],
        "total": total,
        "page": page,
        "pages": _pages(total, limit),
    }


@router.post("/payouts/request", status_code=status.HTTP_201_CREATED)
async def request_payout(payload: PayoutRequest, current_user: User = Depends(require_vehicle_manager), db: AsyncSession = Depends(get_db)):
    profile = await _get_or_create_profile(db, current_user.id)
    if not profile.payout_bank_name or not profile.payout_account_number or not profile.payout_ifsc or not profile.payout_account_holder:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Add bank account details before requesting payout")
    pending = await db.scalar(
        select(ManagerPayoutRequest).where(ManagerPayoutRequest.manager_id == current_user.id, ManagerPayoutRequest.status.in_(("pending", "processing")))
    )
    if pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A payout request is already pending")
    wallet = await get_or_create_wallet(db, current_user.id)
    amount = Decimal(str(payload.amount))
    if amount > Decimal(str(wallet.balance)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payout amount exceeds wallet balance")
    wallet.balance = Decimal(str(wallet.balance)) - amount
    payout = ManagerPayoutRequest(manager_id=current_user.id, amount=amount, status="pending")
    db.add(payout)
    add_wallet_transaction(db, current_user.id, "debit", amount, wallet.balance, "Payout request hold", payout.id)
    admins = (await db.execute(select(User).where(User.role == "admin", User.is_active.is_(True)))).scalars().all()
    for admin in admins:
        await create_notification(admin.id, "Payout request", f"{current_user.full_name} requested ₹{money(amount):,.2f}.", "manager", action_url="/admin/payouts", meta={"payout_id": payout.id})
    await db.commit()
    return {"message": f"Payout of ₹{money(amount):,.2f} requested. Processed within 2-3 business days."}


@router.get("/payouts")
async def payout_history(current_user: User = Depends(require_vehicle_manager), db: AsyncSession = Depends(get_db)):
    profile = await _get_or_create_profile(db, current_user.id)
    payouts = (
        await db.execute(select(ManagerPayoutRequest).where(ManagerPayoutRequest.manager_id == current_user.id).order_by(ManagerPayoutRequest.requested_at.desc()))
    ).scalars().all()
    return {
        "bank_account": _bank_payload(profile),
        "items": [
            {
                "id": payout.id,
                "amount": money(payout.amount),
                "status": payout.status,
                "requested_at": _dt(payout.requested_at),
                "processed_at": _dt(payout.processed_at),
                "bank_account": _bank_payload(profile).get("label"),
            }
            for payout in payouts
        ],
    }


@router.post("/profile/bank-details")
async def update_bank_details(payload: BankDetailsRequest, current_user: User = Depends(require_vehicle_manager), db: AsyncSession = Depends(get_db)):
    profile = await _get_or_create_profile(db, current_user.id)
    profile.payout_bank_name = payload.bank_name.strip()
    profile.payout_account_number = re.sub(r"\s+", "", payload.account_number)
    profile.payout_ifsc = payload.ifsc.upper()
    profile.payout_account_holder = payload.account_holder.strip()
    await db.commit()
    return {"message": "Bank account updated", "bank_account": _bank_payload(profile)}


@router.patch("/profile")
async def update_manager_profile(payload: ManagerProfileUpdateRequest, current_user: User = Depends(require_vehicle_manager), db: AsyncSession = Depends(get_db)):
    profile = await _get_or_create_profile(db, current_user.id)
    if payload.bio is not None:
        profile.bio = payload.bio
    if payload.response_time is not None:
        profile.response_time = payload.response_time
    await db.commit()
    return {"message": "Vehicle Manager profile updated"}


@router.get("/profile")
async def manager_profile(current_user: User = Depends(require_vehicle_manager), db: AsyncSession = Depends(get_db)):
    profile = await _get_or_create_profile(db, current_user.id)
    await check_and_update_super_manager(current_user.id, db)
    summary = await _summary_data(db, current_user)
    cancellation_count = await db.scalar(
        select(func.count())
        .select_from(Booking)
        .where(Booking.manager_id == current_user.id, Booking.status == "cancelled", Booking.cancelled_by == current_user.id)
    ) or 0
    return {
        "profile": {
            "id": profile.id,
            "user_id": profile.user_id,
            "bio": profile.bio,
            "response_time": profile.response_time,
            "acceptance_rate": money(profile.acceptance_rate),
            "total_listings": profile.total_listings,
            "average_rating": money(profile.average_rating),
            "total_reviews": profile.total_reviews,
            "is_super_manager": profile.is_super_manager,
            "assigned_at": _dt(profile.assigned_at),
            "bank_account": _bank_payload(profile),
        },
        "stats": summary | {
            "manager_cancellations": cancellation_count,
            "super_manager_criteria": {
                "completed_trips": summary["total_trips_completed"],
                "average_rating": money(profile.average_rating),
                "acceptance_rate": money(profile.acceptance_rate),
                "manager_cancellations_90d": await db.scalar(
                    select(func.count()).select_from(Booking).where(
                        Booking.manager_id == current_user.id,
                        Booking.status == "cancelled",
                        Booking.cancelled_by == current_user.id,
                        Booking.cancelled_at >= datetime.utcnow().replace(microsecond=0) - timedelta(days=90),
                    )
                ) or 0,
            },
        },
        "verification": {
            "kyc": current_user.is_verified,
            "phone": bool(current_user.phone),
            "bank_account": _bank_payload(profile)["has_bank_account"],
        },
    }
