from datetime import datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.booking import Booking
from app.models.vehicle import Vehicle, VehicleImage
from app.models.manager import ManagerProfile
from app.models.user import User
from app.services.booking_flow import money
from app.utils.auth import require_vehicle_manager


router = APIRouter(prefix="/manager", tags=["manager"])


class ManagerProfileUpdate(BaseModel):
    bio: str | None = Field(default=None, max_length=1000)
    department: str | None = Field(default=None, max_length=100)
    payout_bank_name: str | None = Field(default=None, max_length=200)
    payout_account_number: str | None = Field(default=None, max_length=50)
    payout_ifsc: str | None = Field(default=None, max_length=20)
    payout_account_holder: str | None = Field(default=None, max_length=200)


def _dt(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


async def _get_or_create_profile(db: AsyncSession, user_id: str) -> ManagerProfile:
    profile = await db.scalar(select(ManagerProfile).where(ManagerProfile.user_id == user_id))
    if profile is None:
        profile = ManagerProfile(user_id=user_id)
        db.add(profile)
        await db.flush()
    return profile


def _profile_payload(profile: ManagerProfile, user: User) -> dict:
    account = profile.payout_account_number or ""
    return {
        "id": profile.id,
        "user": {"id": user.id, "full_name": user.full_name, "email": user.email, "phone": user.phone, "profile_picture": user.profile_picture},
        "bio": profile.bio,
        "department": profile.department,
        "assigned_by": profile.assigned_by,
        "assigned_at": _dt(profile.assigned_at),
        "total_vehicles": profile.total_vehicles,
        "total_bookings_handled": profile.total_bookings_handled,
        "total_revenue_generated": money(profile.total_revenue_generated),
        "average_vehicle_rating": money(profile.average_vehicle_rating),
        "acceptance_rate": money(profile.acceptance_rate),
        "response_time_avg_hours": money(profile.response_time_avg_hours),
        "is_active": profile.is_active,
        "payout_bank_name": profile.payout_bank_name,
        "payout_account_number": profile.payout_account_number,
        "payout_ifsc": profile.payout_ifsc,
        "payout_account_holder": profile.payout_account_holder,
        "bank_account": {
            "has_bank_account": bool(profile.payout_bank_name and profile.payout_account_number),
            "account_last4": account[-4:] if account else None,
            "label": f"{profile.payout_bank_name} ••••{account[-4:]}" if profile.payout_bank_name and account else None,
        },
    }


@router.get("/profile")
async def get_manager_profile(current_user: User = Depends(require_vehicle_manager), db: AsyncSession = Depends(get_db)):
    profile = await _get_or_create_profile(db, current_user.id)
    await db.commit()
    return {"profile": _profile_payload(profile, current_user)}


@router.patch("/profile")
async def update_manager_profile(payload: ManagerProfileUpdate, current_user: User = Depends(require_vehicle_manager), db: AsyncSession = Depends(get_db)):
    profile = await _get_or_create_profile(db, current_user.id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)
    await db.commit()
    return {"profile": _profile_payload(profile, current_user), "message": "Manager profile updated."}


@router.get("/stats")
async def manager_stats(current_user: User = Depends(require_vehicle_manager), db: AsyncSession = Depends(get_db)):
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    total_vehicles = await db.scalar(select(func.count()).select_from(Vehicle).where(Vehicle.manager_id == current_user.id)) or 0
    active_vehicles = await db.scalar(
        select(func.count()).select_from(Vehicle).where(Vehicle.manager_id == current_user.id, Vehicle.is_available.is_(True), Vehicle.is_approved.is_(True))
    ) or 0
    total_bookings = await db.scalar(select(func.count()).select_from(Booking).where(Booking.manager_id == current_user.id)) or 0
    pending_requests = await db.scalar(select(func.count()).select_from(Booking).where(Booking.manager_id == current_user.id, Booking.status == "pending")) or 0
    active_rentals = await db.scalar(select(func.count()).select_from(Booking).where(Booking.manager_id == current_user.id, Booking.status == "active")) or 0
    completed_rentals = await db.scalar(select(func.count()).select_from(Booking).where(Booking.manager_id == current_user.id, Booking.status == "completed")) or 0
    total_revenue = await db.scalar(
        select(func.coalesce(func.sum(Booking.manager_earnings), 0)).where(Booking.manager_id == current_user.id, Booking.status == "completed")
    ) or Decimal("0")
    this_month_revenue = await db.scalar(
        select(func.coalesce(func.sum(Booking.manager_earnings), 0)).where(
            Booking.manager_id == current_user.id,
            Booking.status == "completed",
            Booking.actual_return_time >= month_start,
        )
    ) or Decimal("0")
    approved = await db.scalar(select(func.count()).select_from(Booking).where(Booking.manager_id == current_user.id, Booking.status.in_(("confirmed", "active", "completed")))) or 0
    rejected = await db.scalar(select(func.count()).select_from(Booking).where(Booking.manager_id == current_user.id, Booking.status == "rejected")) or 0
    decided = approved + rejected
    acceptance_rate = round((approved / decided) * 100, 2) if decided else 0
    avg_vehicle_rating = await db.scalar(select(func.coalesce(func.avg(Vehicle.average_rating), 0)).where(Vehicle.manager_id == current_user.id)) or 0
    recent_rows = (
        await db.execute(
            select(Booking, Vehicle.title, VehicleImage.image_url, User.full_name)
            .join(Vehicle, Vehicle.id == Booking.vehicle_id)
            .join(User, User.id == Booking.customer_id)
            .outerjoin(VehicleImage, (VehicleImage.vehicle_id == Vehicle.id) & (VehicleImage.is_primary.is_(True)))
            .where(Booking.manager_id == current_user.id)
            .order_by(Booking.created_at.desc())
            .limit(5)
        )
    ).all()
    monthly_rows = (
        await db.execute(
            select(
                func.month(Booking.created_at),
                func.sum(case((Booking.status.in_(("confirmed", "active", "completed")), 1), else_=0)),
                func.sum(case((Booking.status == "rejected", 1), else_=0)),
                func.coalesce(func.sum(case((Booking.status == "completed", Booking.manager_earnings), else_=0)), 0),
            )
            .where(Booking.manager_id == current_user.id, Booking.created_at >= now - timedelta(days=185))
            .group_by(func.month(Booking.created_at))
        )
    ).all()
    monthly = {row[0]: row for row in monthly_rows}
    return {
        "total_vehicles": total_vehicles,
        "active_vehicles": active_vehicles,
        "total_bookings": total_bookings,
        "pending_requests": pending_requests,
        "active_rentals": active_rentals,
        "completed_rentals": completed_rentals,
        "total_revenue": money(total_revenue),
        "this_month_revenue": money(this_month_revenue),
        "acceptance_rate": acceptance_rate,
        "avg_vehicle_rating": money(avg_vehicle_rating),
        "monthly_bookings": [
            {"month": (now.replace(day=1) - timedelta(days=30 * i)).strftime("%b"), "approved": int(monthly.get((now.replace(day=1) - timedelta(days=30 * i)).month, [0, 0, 0, 0])[1] or 0), "rejected": int(monthly.get((now.replace(day=1) - timedelta(days=30 * i)).month, [0, 0, 0, 0])[2] or 0), "revenue": money(monthly.get((now.replace(day=1) - timedelta(days=30 * i)).month, [0, 0, 0, 0])[3])}
            for i in reversed(range(6))
        ],
        "recent_bookings": [
            {
                "id": booking.id,
                "booking_ref": booking.booking_ref,
                "status": booking.status,
                "customer_name": customer_name,
                "vehicle": title,
                "primary_image_url": image,
                "pickup_datetime": _dt(booking.pickup_datetime),
                "return_datetime": _dt(booking.return_datetime),
                "total_amount": money(booking.total_amount),
                "manager_earnings": money(booking.manager_earnings),
            }
            for booking, title, image, customer_name in recent_rows
        ],
    }
