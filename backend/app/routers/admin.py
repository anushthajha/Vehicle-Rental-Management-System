from datetime import datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import and_, case, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.booking import Booking
from app.models.vehicle import Vehicle, VehicleImage
from app.models.coupon import Coupon
from app.models.manager import ManagerPayoutRequest, ManagerProfile
from app.models.payment import Payment, UserWallet
from app.models.support import SupportTicket
from app.models.user import User, UserKYC
from app.models.vehicle_category import VehicleCategory, VehicleType
from app.mongo_models.analytics import get_admin_activity_feed, log_activity
from app.mongo_models.notification import create_notification
from app.mongo_models.support_message import add_support_message, get_ticket_messages
from app.redis import get_redis
from app.services.booking_flow import add_wallet_transaction, get_or_create_wallet, money
from app.tasks.email_tasks import (
    send_manager_payout_email,
    send_kyc_approved_email,
    send_kyc_rejected_email,
    send_manager_role_update_email,
    send_manager_welcome_email,
)
from app.utils.auth import get_password_hash, require_admin, validate_password_strength
from app.utils.validators import validate_phone


router = APIRouter(prefix="/admin", tags=["admin"])


class UserUpdateRequest(BaseModel):
    is_active: bool | None = None
    role: str | None = Field(default=None, pattern="^(customer|vehicle_manager|admin)$")


class RejectRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=1000)


class ManualRefundRequest(BaseModel):
    amount: float = Field(gt=0)
    reason: str = Field(min_length=3, max_length=1000)


class SupportReplyRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


class StatusRequest(BaseModel):
    status: str


class PriorityRequest(BaseModel):
    priority: str = Field(pattern="^(low|medium|high)$")


class CouponRequest(BaseModel):
    code: str = Field(min_length=2, max_length=50)
    description: str = Field(min_length=3, max_length=500)
    discount_type: str = Field(pattern="^(percent|flat)$")
    discount_value: float = Field(gt=0)
    max_discount: float | None = Field(default=None, ge=0)
    min_booking_amount: float = Field(default=0, ge=0)
    usage_limit: int | None = Field(default=None, ge=1)
    valid_from: datetime
    valid_until: datetime
    applicable_for: str = Field(default="all", pattern="^(all|new_users|specific_users)$")
    is_active: bool = True


class VehicleManagerCreateRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=200)
    email: str = Field(min_length=5, max_length=255)
    phone: str | None = Field(default=None, max_length=20)
    password: str = Field(min_length=8, max_length=128)
    send_welcome_email: bool = False
    department: str | None = Field(default=None, max_length=100)

    @field_validator("phone")
    @classmethod
    def phone_is_valid(cls, value: str | None) -> str | None:
        return validate_phone(value) if value else value


class PromoteManagerRequest(BaseModel):
    confirm: bool
    department: str | None = Field(default=None, max_length=100)


class DemoteManagerRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=1000)


class SuspendManagerRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=1000)


def _dt(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _pages(total: int, limit: int) -> int:
    return (total + limit - 1) // limit if total else 0


def _car_status(car: Vehicle) -> str:
    if car.is_approved:
        return "approved" if car.is_available else "inactive"
    return "pending" if car.is_available else "rejected"


def _primary_image(images: dict[str, str | None], vehicle_id: str) -> str | None:
    return images.get(vehicle_id)


def _coupon_payload(coupon: Coupon) -> dict:
    return {
        "id": coupon.id,
        "code": coupon.code,
        "description": coupon.description,
        "discount_type": coupon.discount_type,
        "discount_value": money(coupon.discount_value),
        "max_discount": money(coupon.max_discount),
        "min_booking_amount": money(coupon.min_booking_amount),
        "usage_limit": coupon.usage_limit,
        "used_count": coupon.used_count,
        "valid_from": _dt(coupon.valid_from),
        "valid_until": _dt(coupon.valid_until),
        "applicable_for": coupon.applicable_for,
        "is_active": coupon.is_active,
        "created_at": _dt(coupon.created_at),
    }


async def _image_map(db: AsyncSession, vehicle_ids: list[str]) -> dict[str, str | None]:
    if not vehicle_ids:
        return {}
    rows = (
        await db.execute(
            select(VehicleImage)
            .where(VehicleImage.vehicle_id.in_(vehicle_ids))
            .order_by(VehicleImage.vehicle_id, VehicleImage.is_primary.desc(), VehicleImage.order_index)
        )
    ).scalars().all()
    images: dict[str, str | None] = {}
    for image in rows:
        images.setdefault(image.vehicle_id, image.image_url)
    return images


async def _active_now_count(db: AsyncSession) -> int:
    now = datetime.utcnow()
    redis = get_redis()
    try:
        cached = await redis.get("admin:active_bookings_now")
        if cached is not None:
            return int(cached)
    except Exception:
        pass
    count = await db.scalar(
        select(func.count())
        .select_from(Booking)
        .where(Booking.status == "active", Booking.pickup_datetime <= now, Booking.return_datetime >= now)
    ) or 0
    try:
        await redis.setex("admin:active_bookings_now", 30, int(count))
    except Exception:
        pass
    return int(count)


async def _booking_status_counts(db: AsyncSession) -> dict:
    rows = (await db.execute(select(Booking.status, func.count()).group_by(Booking.status))).all()
    return {status: count for status, count in rows}


async def _manager_stats(db: AsyncSession, manager_id: str) -> dict:
    total_vehicles = await db.scalar(select(func.count()).select_from(Vehicle).where(Vehicle.manager_id == manager_id)) or 0
    active_bookings = await db.scalar(
        select(func.count()).select_from(Booking).where(Booking.manager_id == manager_id, Booking.status.in_(("confirmed", "active")))
    ) or 0
    total_revenue = await db.scalar(
        select(func.coalesce(func.sum(Booking.manager_earnings), 0)).where(Booking.manager_id == manager_id, Booking.status == "completed")
    ) or Decimal("0")
    return {"total_vehicles": total_vehicles, "active_bookings": active_bookings, "total_revenue": money(total_revenue)}


async def _get_or_create_manager_profile(db: AsyncSession, manager_id: str, admin_id: str | None = None, department: str | None = None) -> ManagerProfile:
    profile = await db.scalar(select(ManagerProfile).where(ManagerProfile.user_id == manager_id))
    if profile is None:
        profile = ManagerProfile(user_id=manager_id, assigned_by=admin_id, department=department)
        db.add(profile)
        await db.flush()
    else:
        profile.is_active = True
        if admin_id and not profile.assigned_by:
            profile.assigned_by = admin_id
        if department is not None:
            profile.department = department
    return profile


@router.post("/vehicle-managers/create", status_code=status.HTTP_201_CREATED)
async def create_vehicle_manager(payload: VehicleManagerCreateRequest, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    email = payload.email.strip().lower()
    existing = await db.scalar(select(User).where(func.lower(User.email) == email))
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already in use")
    if not validate_password_strength(payload.password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be 8+ chars with uppercase, digit, and special character")
    user = User(
        email=email,
        hashed_password=get_password_hash(payload.password),
        full_name=payload.full_name.strip(),
        phone=payload.phone,
        role="vehicle_manager",
        is_vehicle_manager=True,
        is_verified=True,
    )
    db.add(user)
    await db.flush()
    db.add(ManagerProfile(user_id=user.id, assigned_by=admin.id, department=payload.department))
    db.add(UserWallet(user_id=user.id))
    await db.commit()
    if payload.send_welcome_email:
        send_manager_welcome_email.delay(user.email, user.full_name, payload.password)
    await create_notification(user.id, "Vehicle Manager account created", "Your SigFleet manager account is ready.", "account", action_url="/manager/dashboard")
    await log_activity(admin.id, "admin_created_vehicle_manager", "user", user.id, {"message": f"Admin created Vehicle Manager account for {email}", "email": email})
    return {"user_id": user.id, "message": "Vehicle Manager account created successfully."}


@router.post("/vehicle-managers/promote/{user_id}")
async def promote_vehicle_manager(user_id: str, payload: PromoteManagerRequest, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    if not payload.confirm:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Promotion confirmation is required")
    user = await db.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.role != "customer":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only customer accounts can be promoted")
    user.role = "vehicle_manager"
    user.is_vehicle_manager = True
    user.is_verified = True
    await _get_or_create_manager_profile(db, user.id, admin.id, payload.department)
    if await db.scalar(select(func.count()).select_from(UserWallet).where(UserWallet.user_id == user.id)) == 0:
        db.add(UserWallet(user_id=user.id))
    await db.commit()
    send_manager_role_update_email.delay(user.email, user.full_name, "Your account has been upgraded to Vehicle Manager", "Your account has been upgraded to Vehicle Manager. You can now manage vehicles from the manager dashboard.")
    await create_notification(user.id, "Account upgraded", "Your account has been upgraded to Vehicle Manager.", "account", action_url="/manager/dashboard")
    await log_activity(admin.id, "admin_promoted_vehicle_manager", "user", user.id, {"email": user.email})
    return {"message": f"User {user.full_name} promoted to Vehicle Manager."}


@router.post("/vehicle-managers/demote/{user_id}")
async def demote_vehicle_manager(user_id: str, payload: DemoteManagerRequest, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.role != "vehicle_manager":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User is not a Vehicle Manager")
    blockers = (
        await db.execute(
            select(Booking, Vehicle.title)
            .join(Vehicle, Vehicle.id == Booking.vehicle_id)
            .where(Booking.manager_id == user.id, Booking.status.in_(("confirmed", "active")))
            .order_by(Booking.pickup_datetime.asc())
        )
    ).all()
    if blockers:
        blocking_bookings = [
            {
                "booking_id": booking.id,
                "booking_ref": booking.booking_ref,
                "vehicle": title,
                "status": booking.status,
                "pickup_datetime": _dt(booking.pickup_datetime),
                "return_datetime": _dt(booking.return_datetime),
            }
            for booking, title in blockers
        ]
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"message": "Manager has active or confirmed bookings", "blocking_bookings": blocking_bookings})
    user.role = "customer"
    user.is_vehicle_manager = False
    profile = await db.scalar(select(ManagerProfile).where(ManagerProfile.user_id == user.id))
    if profile:
        profile.is_active = False
    await db.commit()
    send_manager_role_update_email.delay(user.email, user.full_name, "Vehicle Manager access removed", f"Your Vehicle Manager access was removed. Reason: {payload.reason}")
    await create_notification(user.id, "Vehicle Manager access removed", payload.reason, "account", action_url="/customer/dashboard")
    await log_activity(admin.id, "admin_demoted_vehicle_manager", "user", user.id, {"reason": payload.reason})
    return {"message": "Vehicle Manager demoted to Customer."}


@router.get("/vehicle-managers")
async def list_vehicle_managers(
    search: str | None = None,
    is_active: bool | None = None,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    conditions = [User.role == "vehicle_manager"]
    if search:
        like = f"%{search.strip()}%"
        conditions.append(or_(User.full_name.ilike(like), User.email.ilike(like), User.phone.ilike(like)))
    if is_active is not None:
        conditions.append(User.is_active.is_(is_active))
    total = await db.scalar(select(func.count()).select_from(User).outerjoin(ManagerProfile, ManagerProfile.user_id == User.id).where(*conditions)) or 0
    rows = (
        await db.execute(
            select(User, ManagerProfile)
            .outerjoin(ManagerProfile, ManagerProfile.user_id == User.id)
            .where(*conditions)
            .order_by(User.created_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
    ).all()
    managers = []
    for user, profile in rows:
        stats = await _manager_stats(db, user.id)
        managers.append(
            {
                "id": user.id,
                "full_name": user.full_name,
                "email": user.email,
                "phone": user.phone,
                "is_active": bool(profile.is_active) if profile else user.is_active,
                "account_active": user.is_active,
                "department": profile.department if profile else None,
                "assigned_at": _dt(profile.assigned_at) if profile else None,
                **stats,
            }
        )
    return {"vehicle_managers": managers, "total": total, "page": page, "pages": _pages(total, limit)}


@router.get("/vehicle-managers/{user_id}")
async def get_vehicle_manager(user_id: str, _: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    row = (
        await db.execute(
            select(User, ManagerProfile).outerjoin(ManagerProfile, ManagerProfile.user_id == User.id).where(User.id == user_id, User.role == "vehicle_manager")
        )
    ).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle Manager not found")
    user, profile = row
    vehicles = (await db.execute(select(Vehicle).where(Vehicle.manager_id == user.id).order_by(Vehicle.created_at.desc()))).scalars().all()
    images = await _image_map(db, [car.id for car in vehicles])
    stats = await _manager_stats(db, user.id)
    booking_statuses = (await db.execute(select(Booking.status, func.count()).where(Booking.manager_id == user.id).group_by(Booking.status))).all()
    return {
        "user": {"id": user.id, "full_name": user.full_name, "email": user.email, "phone": user.phone, "is_active": user.is_active, "created_at": _dt(user.created_at)},
        "profile": None
        if profile is None
        else {
            "id": profile.id,
            "department": profile.department,
            "bio": profile.bio,
            "is_active": profile.is_active,
            "assigned_by": profile.assigned_by,
            "assigned_at": _dt(profile.assigned_at),
            "acceptance_rate": money(profile.acceptance_rate),
            "average_vehicle_rating": money(profile.average_vehicle_rating),
            "response_time_avg_hours": money(profile.response_time_avg_hours),
            "payout_bank_name": profile.payout_bank_name,
            "payout_account_holder": profile.payout_account_holder,
            "payout_ifsc": profile.payout_ifsc,
        },
        "stats": {**stats, "booking_statuses": {status: count for status, count in booking_statuses}},
        "vehicles": [
            {
                "id": car.id,
                "title": car.title,
                "make": car.make,
                "car_model": car.car_model,
                "year": car.year,
                "is_available": car.is_available,
                "is_approved": car.is_approved,
                "rating": money(car.average_rating),
                "total_trips": car.total_trips,
                "total_earnings": money(car.total_earnings),
                "primary_image_url": _primary_image(images, car.id),
            }
            for car in vehicles
        ],
    }


@router.patch("/vehicle-managers/{user_id}/suspend")
async def suspend_vehicle_manager(user_id: str, payload: SuspendManagerRequest, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.id == user_id, User.role == "vehicle_manager"))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle Manager not found")
    profile = await _get_or_create_manager_profile(db, user.id, admin.id)
    profile.is_active = False
    await db.execute(update(Vehicle).where(Vehicle.manager_id == user.id).values(is_available=False))
    await db.commit()
    send_manager_role_update_email.delay(user.email, user.full_name, "Vehicle Manager account suspended", f"Your Vehicle Manager account was suspended. Reason: {payload.reason}")
    await create_notification(user.id, "Manager account suspended", payload.reason, "account", action_url="/manager/profile")
    await log_activity(admin.id, "admin_suspended_vehicle_manager", "user", user.id, {"reason": payload.reason})
    return {"message": "Vehicle Manager suspended. Vehicles were set unavailable."}


@router.patch("/vehicle-managers/{user_id}/reactivate")
async def reactivate_vehicle_manager(user_id: str, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.id == user_id, User.role == "vehicle_manager"))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle Manager not found")
    profile = await _get_or_create_manager_profile(db, user.id, admin.id)
    profile.is_active = True
    await db.commit()
    await create_notification(user.id, "Manager account reactivated", "Your manager account is active again. Please manually reactivate vehicles that are ready for bookings.", "account", action_url="/manager/vehicles")
    await log_activity(admin.id, "admin_reactivated_vehicle_manager", "user", user.id)
    return {"message": "Vehicle Manager reactivated. Vehicles remain unavailable until the manager re-activates them."}


@router.get("/stats/overview")
async def stats_overview(_: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    now = datetime.utcnow()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = now - timedelta(days=7)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    total_users = await db.scalar(select(func.count()).select_from(User)) or 0
    new_today = await db.scalar(select(func.count()).select_from(User).where(User.created_at >= today)) or 0
    new_week = await db.scalar(select(func.count()).select_from(User).where(User.created_at >= week_start)) or 0
    total_managers = await db.scalar(select(func.count()).select_from(User).where(or_(User.role == "vehicle_manager", User.is_vehicle_manager.is_(True)))) or 0
    new_managers_month = await db.scalar(
        select(func.count()).select_from(User).where(or_(User.role == "vehicle_manager", User.is_vehicle_manager.is_(True)), User.created_at >= month_start)
    ) or 0

    car_rows = (await db.execute(select(Vehicle.is_approved, Vehicle.is_available, func.count()).group_by(Vehicle.is_approved, Vehicle.is_available))).all()
    vehicles = {"total": 0, "approved": 0, "pending_approval": 0, "inactive": 0}
    for approved, available, count in car_rows:
        vehicles["total"] += count
        if approved:
            vehicles["approved"] += count
        elif available:
            vehicles["pending_approval"] += count
        if not available:
            vehicles["inactive"] += count

    total_bookings = await db.scalar(select(func.count()).select_from(Booking)) or 0
    bookings_month = await db.scalar(select(func.count()).select_from(Booking).where(Booking.created_at >= month_start)) or 0
    completed_month = await db.scalar(select(func.count()).select_from(Booking).where(Booking.status == "completed", Booking.updated_at >= month_start)) or 0

    paid_filter = Payment.status.in_(("paid", "refunded"))
    revenue_total = await db.scalar(select(func.coalesce(func.sum(Payment.amount), 0)).where(paid_filter)) or Decimal("0")
    revenue_month = await db.scalar(select(func.coalesce(func.sum(Payment.amount), 0)).where(paid_filter, Payment.created_at >= month_start)) or Decimal("0")
    revenue_week = await db.scalar(select(func.coalesce(func.sum(Payment.amount), 0)).where(paid_filter, Payment.created_at >= week_start)) or Decimal("0")
    fees_month = await db.scalar(
        select(func.coalesce(func.sum(Booking.platform_fee), 0)).join(Payment, Payment.booking_id == Booking.id).where(paid_filter, Payment.created_at >= month_start)
    ) or Decimal("0")

    pending_kyc = await db.scalar(select(func.count()).select_from(UserKYC).where(UserKYC.kyc_status == "under_review")) or 0
    open_tickets = await db.scalar(select(func.count()).select_from(SupportTicket).where(SupportTicket.status.in_(("open", "in_progress")))) or 0
    pending_payouts = await db.scalar(select(func.count()).select_from(ManagerPayoutRequest).where(ManagerPayoutRequest.status == "pending")) or 0

    return {
        "users": {"total": total_users, "new_today": new_today, "new_this_week": new_week},
        "vehicle_managers": {"total": total_managers, "new_this_month": new_managers_month},
        "managers": {"total": total_managers, "new_this_month": new_managers_month},
        "vehicles": vehicles,
        "bookings": {
            "total": total_bookings,
            "this_month": bookings_month,
            "active_now": await _active_now_count(db),
            "completed_this_month": completed_month,
            "status_distribution": await _booking_status_counts(db),
        },
        "revenue": {
            "total_all_time": money(revenue_total),
            "this_month": money(revenue_month),
            "this_week": money(revenue_week),
            "platform_fees_this_month": money(fees_month),
        },
        "pending": {
            "kyc_count": pending_kyc,
            "car_approval_count": vehicles["pending_approval"],
            "support_tickets_count": open_tickets,
            "payout_requests_count": pending_payouts,
        },
    }


@router.get("/analytics/revenue")
async def revenue_analytics(
    period: str = Query(default="monthly"),
    year: int | None = Query(default=None),
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    year = year or datetime.utcnow().year
    if period != "monthly":
        period = "monthly"
    rows = (
        await db.execute(
            select(
                func.month(Payment.created_at).label("month"),
                func.coalesce(func.sum(Payment.amount), 0),
                func.coalesce(func.sum(Booking.platform_fee), 0),
                func.coalesce(func.sum(Booking.manager_earnings), 0),
                func.coalesce(func.sum(case((Payment.status == "refunded", Payment.amount), else_=0)), 0),
            )
            .join(Booking, Booking.id == Payment.booking_id)
            .where(func.year(Payment.created_at) == year, Payment.status.in_(("paid", "refunded")))
            .group_by(func.month(Payment.created_at))
        )
    ).all()
    by_month = {row[0]: row for row in rows}
    names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    return [
        {
            "month": names[index - 1],
            "gross": money(by_month.get(index, [None, 0, 0, 0, 0])[1]),
            "platform_fee": money(by_month.get(index, [None, 0, 0, 0, 0])[2]),
            "manager_payouts": money(by_month.get(index, [None, 0, 0, 0, 0])[3]),
            "refunds": money(by_month.get(index, [None, 0, 0, 0, 0])[4]),
        }
        for index in range(1, 13)
    ]


@router.get("/analytics/daily-bookings")
async def daily_bookings(_: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    since = datetime.utcnow() - timedelta(days=29)
    rows = (
        await db.execute(
            select(func.date(Booking.created_at), func.count()).where(Booking.created_at >= since).group_by(func.date(Booking.created_at))
        )
    ).all()
    counts = {str(day): count for day, count in rows}
    return [{"date": (since + timedelta(days=i)).strftime("%d %b"), "count": counts.get((since + timedelta(days=i)).date().isoformat(), 0)} for i in range(30)]


@router.get("/analytics/new-users")
async def new_users(_: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    now = datetime.utcnow()
    start = (now.replace(day=1) - timedelta(days=365)).replace(day=1)
    rows = (
        await db.execute(
            select(func.year(User.created_at), func.month(User.created_at), func.count())
            .where(User.created_at >= start)
            .group_by(func.year(User.created_at), func.month(User.created_at))
        )
    ).all()
    counts = {(year, month): count for year, month, count in rows}
    result = []
    cursor = start
    for _ in range(12):
        result.append({"month": cursor.strftime("%b"), "users": counts.get((cursor.year, cursor.month), 0)})
        next_month = cursor.replace(day=28) + timedelta(days=4)
        cursor = next_month.replace(day=1)
    return result


@router.get("/analytics/cities")
async def city_analytics(_: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            select(
                Vehicle.location_city,
                func.count(Booking.id),
                func.coalesce(func.sum(Booking.total_amount), 0),
                func.count(func.distinct(case((and_(Vehicle.is_approved.is_(True), Vehicle.is_available.is_(True)), Vehicle.id)))),
            )
            .select_from(Vehicle)
            .outerjoin(Booking, Booking.vehicle_id == Vehicle.id)
            .group_by(Vehicle.location_city)
            .order_by(func.count(Booking.id).desc())
            .limit(10)
        )
    ).all()
    return [{"city": city, "booking_count": bookings, "revenue": money(revenue), "active_cars": active_cars} for city, bookings, revenue, active_cars in rows]


@router.get("/analytics/top-vehicles")
async def top_cars(limit: int = Query(default=10, ge=1, le=50), _: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            select(Vehicle, User.full_name, func.count(Booking.id), func.coalesce(func.sum(Booking.total_amount), 0))
            .join(User, User.id == Vehicle.manager_id)
            .outerjoin(Booking, Booking.vehicle_id == Vehicle.id)
            .group_by(Vehicle.id, User.full_name)
            .order_by(func.coalesce(func.sum(Booking.total_amount), 0).desc())
            .limit(limit)
        )
    ).all()
    images = await _image_map(db, [car.id for car, *_ in rows])
    return [
        {
            "id": car.id,
            "title": car.title,
            "image": _primary_image(images, car.id),
            "manager_name": manager_name,
            "trips": trips or car.total_trips,
            "revenue": money(revenue),
            "rating": money(car.average_rating),
        }
        for car, manager_name, trips, revenue in rows
    ]


@router.get("/analytics/activity-feed")
async def activity_feed(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    _: User = Depends(require_admin),
):
    return {"items": await get_admin_activity_feed(page, limit), "page": page}


@router.get("/analytics/category-distribution")
async def category_distribution(_: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            select(VehicleCategory.name, func.count(Vehicle.id))
            .outerjoin(Vehicle, Vehicle.category_id == VehicleCategory.id)
            .group_by(VehicleCategory.id, VehicleCategory.name)
            .order_by(VehicleCategory.display_order.asc())
        )
    ).all()
    return [{"name": category or "Unassigned", "value": count} for category, count in rows]


@router.get("/analytics/booking-funnel")
async def booking_funnel(_: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    total = await db.scalar(select(func.count()).select_from(Booking)) or 0
    completed = await db.scalar(select(func.count()).select_from(Booking).where(Booking.status == "completed")) or 0
    reviewed = await db.scalar(select(func.count()).select_from(Booking).where(Booking.status == "completed", Booking.updated_at.is_not(None))) or 0
    return [
        {"stage": "Views", "count": max(total * 4, total)},
        {"stage": "Bookings", "count": total},
        {"stage": "Completed", "count": completed},
        {"stage": "Reviewed", "count": reviewed},
    ]


@router.get("/users")
async def list_users(
    search: str | None = None,
    role: str | None = None,
    is_active: bool | None = None,
    is_verified: bool | None = None,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    conditions = []
    if search:
        term = f"%{search}%"
        conditions.append(or_(User.full_name.ilike(term), User.email.ilike(term), User.phone.ilike(term)))
    if role:
        conditions.append(User.role == role)
    if is_active is not None:
        conditions.append(User.is_active.is_(is_active))
    if is_verified is not None:
        conditions.append(User.is_verified.is_(is_verified))
    total = await db.scalar(select(func.count()).select_from(User).where(*conditions)) or 0
    rows = (
        await db.execute(
            select(
                User,
                UserKYC.kyc_status,
                func.count(Booking.id).label("booking_count"),
            )
            .outerjoin(UserKYC, UserKYC.user_id == User.id)
            .outerjoin(Booking, Booking.customer_id == User.id)
            .where(*conditions)
            .group_by(User.id, UserKYC.kyc_status)
            .order_by(User.created_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
    ).all()
    return {
        "items": [
            {
                "id": user.id,
                "full_name": user.full_name,
                "email": user.email,
                "phone": user.phone,
                "profile_picture": user.profile_picture,
                "role": user.role,
                "is_active": user.is_active,
                "is_verified": user.is_verified,
                "kyc_status": kyc_status or "not_submitted",
                "bookings_count": booking_count,
                "created_at": _dt(user.created_at),
            }
            for user, kyc_status, booking_count in rows
        ],
        "total": total,
        "page": page,
        "pages": _pages(total, limit),
    }


@router.get("/users/{user_id}/details")
async def user_details(user_id: str, _: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    kyc = await db.scalar(select(UserKYC).where(UserKYC.user_id == user_id))
    wallet = await get_or_create_wallet(db, user_id)
    rows = (
        await db.execute(
            select(Booking, Vehicle.title)
            .outerjoin(Vehicle, Vehicle.id == Booking.vehicle_id)
            .where(Booking.customer_id == user_id)
            .order_by(Booking.created_at.desc())
            .limit(5)
        )
    ).all()
    summary = (
        await db.execute(
            select(Booking.status, func.count(), func.coalesce(func.sum(Booking.total_amount), 0))
            .where(Booking.customer_id == user_id)
            .group_by(Booking.status)
        )
    ).all()
    await db.commit()
    return {
        "user": {
            "id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "phone": user.phone,
            "profile_picture": user.profile_picture,
            "role": user.role,
            "is_active": user.is_active,
            "is_verified": user.is_verified,
            "is_vehicle_manager": user.role == "vehicle_manager",
            "created_at": _dt(user.created_at),
            "last_login": _dt(user.last_login),
        },
        "kyc": None
        if kyc is None
        else {
            "id": kyc.id,
            "status": kyc.kyc_status,
            "dl_number": kyc.dl_number,
            "aadhar_number": kyc.aadhar_number,
            "dl_front_image": kyc.dl_front_image,
            "dl_back_image": kyc.dl_back_image,
            "aadhar_front_image": kyc.aadhar_front_image,
            "aadhar_back_image": kyc.aadhar_back_image,
            "rejection_reason": kyc.rejection_reason,
            "submitted_at": _dt(kyc.submitted_at),
        },
        "wallet_balance": money(wallet.balance),
        "booking_summary": [{"status": status, "count": count, "amount": money(amount)} for status, count, amount in summary],
        "recent_bookings": [
            {
                "id": booking.id,
                "booking_ref": booking.booking_ref,
                "vehicle_name": title,
                "status": booking.status,
                "pickup_datetime": _dt(booking.pickup_datetime),
                "total_amount": money(booking.total_amount),
            }
            for booking, title in rows
        ],
    }


@router.patch("/users/{user_id}")
async def update_user(user_id: str, payload: UserUpdateRequest, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if payload.role is not None:
        user.role = payload.role
        user.is_vehicle_manager = payload.role == "vehicle_manager" or user.is_vehicle_manager
    if payload.is_active is not None:
        user.is_active = payload.is_active
        if not payload.is_active:
            pending = (await db.execute(select(Booking).where(Booking.customer_id == user.id, Booking.status == "pending"))).scalars().all()
            for booking in pending:
                booking.status = "cancelled"
                booking.cancelled_by = admin.id
                booking.cancelled_at = datetime.utcnow()
                booking.cancellation_reason = "Cancelled after account suspension"
            await create_notification(user.id, "Account suspended", "Your pending bookings were cancelled by admin review.", "system")
    await db.commit()
    await log_activity(admin.id, "user_updated", "user", user.id, {"is_active": payload.is_active, "role": payload.role})
    return {"message": "User updated"}


@router.get("/vehicles")
async def list_cars(
    status_filter: str = Query(default="all", alias="status", pattern="^(pending|approved|inactive|rejected|all)$"),
    city: str | None = None,
    category: str | None = None,
    category_id: str | None = None,
    vehicle_type_id: str | None = None,
    manager_id: str | None = None,
    sort: str = Query(default="newest"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    conditions = []
    if status_filter == "pending":
        conditions += [Vehicle.is_approved.is_(False), Vehicle.is_available.is_(True)]
    elif status_filter == "approved":
        conditions.append(Vehicle.is_approved.is_(True))
    elif status_filter == "inactive":
        conditions.append(Vehicle.is_available.is_(False))
    elif status_filter == "rejected":
        conditions += [Vehicle.is_approved.is_(False), Vehicle.is_available.is_(False)]
    if city:
        conditions.append(Vehicle.location_city == city)
    if category_id:
        conditions.append(Vehicle.category_id == category_id)
    elif category:
        category_match = await db.scalar(select(VehicleCategory).where((VehicleCategory.id == category) | (VehicleCategory.slug == category)))
        if category_match:
            conditions.append(Vehicle.category_id == category_match.id)
    if vehicle_type_id:
        conditions.append(Vehicle.vehicle_type_id == vehicle_type_id)
    if manager_id:
        conditions.append(Vehicle.manager_id == manager_id)
    total = await db.scalar(select(func.count()).select_from(Vehicle).where(*conditions)) or 0
    order = Vehicle.created_at.desc()
    if sort == "oldest":
        order = Vehicle.created_at.asc()
    elif sort == "price":
        order = Vehicle.price_per_day.asc()
    elif sort == "rating":
        order = Vehicle.average_rating.desc()
    rows = (
        await db.execute(
            select(Vehicle, User.full_name, User.email, VehicleCategory, VehicleType)
            .join(User, User.id == Vehicle.manager_id)
            .outerjoin(VehicleCategory, VehicleCategory.id == Vehicle.category_id)
            .outerjoin(VehicleType, VehicleType.id == Vehicle.vehicle_type_id)
            .where(*conditions)
            .order_by(order)
            .offset((page - 1) * limit)
            .limit(limit)
        )
    ).all()
    images = await _image_map(db, [car.id for car, *_ in rows])
    return {
        "items": [
            {
                "id": car.id,
                "title": car.title,
                "image": _primary_image(images, car.id),
                "city": car.location_city,
                "area": car.location_area,
                "vehicle_manager": {"id": car.manager_id, "name": manager_name, "email": manager_email},
                "manager": {"id": car.manager_id, "name": manager_name, "email": manager_email},
                "category": category.slug if category else None,
                "category_id": car.category_id,
                "category_name": category.name if category else None,
                "vehicle_type": vehicle_type.slug if vehicle_type else None,
                "vehicle_type_id": car.vehicle_type_id,
                "vehicle_type_name": vehicle_type.name if vehicle_type else None,
                "price_per_day": money(car.price_per_day),
                "trips": car.total_trips,
                "rating": money(car.average_rating),
                "status": _car_status(car),
                "is_featured": car.is_featured,
                "is_approved": car.is_approved,
                "is_available": car.is_available,
                "listed_date": _dt(car.created_at),
                "description": car.description,
            }
            for car, manager_name, manager_email, category, vehicle_type in rows
        ],
        "total": total,
        "page": page,
        "pages": _pages(total, limit),
    }


@router.patch("/vehicles/{vehicle_id}/approve")
async def approve_car(vehicle_id: str, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    car = await db.scalar(select(Vehicle).where(Vehicle.id == vehicle_id))
    if car is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found")
    car.is_approved = True
    car.is_available = True
    await db.commit()
    await create_notification(car.manager_id, "Vehicle approved", f"{car.title} is live for bookings.", "manager", action_url="/manager/vehicles", meta={"vehicle_id": car.id})
    await log_activity(admin.id, "car_approved", "car", car.id, {"title": car.title})
    return {"status": "approved"}


@router.patch("/vehicles/{vehicle_id}/reject")
async def reject_car(vehicle_id: str, payload: RejectRequest, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    car = await db.scalar(select(Vehicle).where(Vehicle.id == vehicle_id))
    if car is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found")
    car.is_approved = False
    car.is_available = False
    await db.commit()
    await create_notification(car.manager_id, "Vehicle rejected", payload.reason, "manager", action_url="/manager/vehicles", meta={"vehicle_id": car.id})
    await log_activity(admin.id, "car_rejected", "car", car.id, {"reason": payload.reason})
    return {"status": "rejected"}


@router.patch("/vehicles/{vehicle_id}/feature")
async def feature_car(vehicle_id: str, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    car = await db.scalar(select(Vehicle).where(Vehicle.id == vehicle_id))
    if car is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found")
    car.is_featured = not car.is_featured
    await db.commit()
    await log_activity(admin.id, "car_feature_toggled", "car", car.id, {"is_featured": car.is_featured})
    return {"is_featured": car.is_featured}


@router.get("/bookings")
async def list_bookings(
    status_filter: str | None = Query(default=None, alias="status"),
    city: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    conditions = []
    if status_filter:
        conditions.append(Booking.status == status_filter)
    if start_date:
        conditions.append(Booking.pickup_datetime >= start_date)
    if end_date:
        conditions.append(Booking.pickup_datetime <= end_date)
    if city:
        conditions.append(Vehicle.location_city == city)
    total = await db.scalar(select(func.count()).select_from(Booking).join(Vehicle, Vehicle.id == Booking.vehicle_id).where(*conditions)) or 0
    rows = (
        await db.execute(
            select(Booking, Vehicle.title, Vehicle.location_city, User.full_name)
            .join(Vehicle, Vehicle.id == Booking.vehicle_id)
            .join(User, User.id == Booking.customer_id)
            .where(*conditions)
            .order_by(Booking.created_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
    ).all()
    return {
        "items": [
            {
                "id": booking.id,
                "booking_ref": booking.booking_ref,
                "vehicle_name": title,
                "city": city_name,
                "customer_name": customer,
                "status": booking.status,
                "pickup_datetime": _dt(booking.pickup_datetime),
                "return_datetime": _dt(booking.return_datetime),
                "total_amount": money(booking.total_amount),
                "platform_fee": money(booking.platform_fee),
            }
            for booking, title, city_name, customer in rows
        ],
        "total": total,
        "page": page,
        "pages": _pages(total, limit),
    }


@router.get("/bookings/{booking_id}")
async def booking_details(booking_id: str, _: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    row = (
        await db.execute(
            select(Booking, Vehicle, User.full_name.label("customer_name"))
            .join(Vehicle, Vehicle.id == Booking.vehicle_id)
            .join(User, User.id == Booking.customer_id)
            .where(Booking.id == booking_id)
        )
    ).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    booking, car, customer_name = row
    return {"booking": {
        "id": booking.id,
        "booking_ref": booking.booking_ref,
        "status": booking.status,
        "customer_name": customer_name,
        "vehicle_name": car.title,
        "pickup_datetime": _dt(booking.pickup_datetime),
        "return_datetime": _dt(booking.return_datetime),
        "total_amount": money(booking.total_amount),
        "platform_fee": money(booking.platform_fee),
        "manager_earnings": money(booking.manager_earnings),
    }}


@router.get("/kyc")
async def list_kyc(
    status_filter: str | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    conditions = []
    if status_filter:
        conditions.append(UserKYC.kyc_status == status_filter)
    total = await db.scalar(select(func.count()).select_from(UserKYC).where(*conditions)) or 0
    rows = (
        await db.execute(
            select(UserKYC, User)
            .join(User, User.id == UserKYC.user_id)
            .where(*conditions)
            .order_by(UserKYC.submitted_at.asc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
    ).all()
    return {
        "items": [
            {
                "id": kyc.id,
                "user_id": user.id,
                "user": {"id": user.id, "full_name": user.full_name, "email": user.email, "phone": user.phone, "created_at": _dt(user.created_at)},
                "dl_number": kyc.dl_number,
                "dl_front_image": kyc.dl_front_image,
                "dl_back_image": kyc.dl_back_image,
                "aadhar_number": kyc.aadhar_number,
                "aadhar_front_image": kyc.aadhar_front_image,
                "aadhar_back_image": kyc.aadhar_back_image,
                "status": kyc.kyc_status,
                "rejection_reason": kyc.rejection_reason,
                "submitted_at": _dt(kyc.submitted_at),
                "reviewed_at": _dt(kyc.reviewed_at),
            }
            for kyc, user in rows
        ],
        "total": total,
        "page": page,
        "pages": _pages(total, limit),
    }


@router.post("/kyc/{kyc_id}/approve")
async def approve_kyc(kyc_id: str, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    kyc = await db.scalar(select(UserKYC).where(UserKYC.id == kyc_id))
    if kyc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KYC record not found")
    user = await db.scalar(select(User).where(User.id == kyc.user_id))
    kyc.kyc_status = "approved"
    kyc.reviewed_at = datetime.utcnow()
    kyc.reviewed_by = admin.id
    kyc.rejection_reason = None
    if user:
        user.is_verified = True
    await db.commit()
    if user:
        try:
            send_kyc_approved_email.delay(user.email, user.full_name)
        except Exception:
            pass
        await create_notification(user.id, "KYC approved", "Your documents are verified.", "kyc", action_url="/dashboard/kyc")
    await log_activity(admin.id, "kyc_approved", "user_kyc", kyc.id)
    return {"status": "approved"}


@router.post("/kyc/{kyc_id}/reject")
async def reject_kyc(kyc_id: str, payload: RejectRequest, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    kyc = await db.scalar(select(UserKYC).where(UserKYC.id == kyc_id))
    if kyc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KYC record not found")
    user = await db.scalar(select(User).where(User.id == kyc.user_id))
    kyc.kyc_status = "rejected"
    kyc.rejection_reason = payload.reason
    kyc.reviewed_at = datetime.utcnow()
    kyc.reviewed_by = admin.id
    if user:
        user.is_verified = False
    await db.commit()
    if user:
        try:
            send_kyc_rejected_email.delay(user.email, user.full_name, payload.reason)
        except Exception:
            pass
        await create_notification(user.id, "KYC rejected", payload.reason, "kyc", action_url="/dashboard/kyc")
    await log_activity(admin.id, "kyc_rejected", "user_kyc", kyc.id, {"reason": payload.reason})
    return {"status": "rejected"}


@router.get("/payments")
async def list_payments(
    status_filter: str | None = Query(default=None, alias="status"),
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    conditions = []
    if status_filter:
        conditions.append(Payment.status == status_filter)
    if start_date:
        conditions.append(Payment.created_at >= start_date)
    if end_date:
        conditions.append(Payment.created_at <= end_date)
    total = await db.scalar(select(func.count()).select_from(Payment).where(*conditions)) or 0
    rows = (
        await db.execute(
            select(Payment, Booking.booking_ref, User.full_name)
            .join(Booking, Booking.id == Payment.booking_id)
            .join(User, User.id == Payment.user_id)
            .where(*conditions)
            .order_by(Payment.created_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
    ).all()
    return {
        "items": [
            {
                "id": payment.id,
                "booking_id": payment.booking_id,
                "booking_ref": ref,
                "user_name": user_name,
                "amount": money(payment.amount),
                "method": payment.payment_method,
                "status": payment.status,
                "paid_at": _dt(payment.paid_at),
                "created_at": _dt(payment.created_at),
            }
            for payment, ref, user_name in rows
        ],
        "total": total,
        "page": page,
        "pages": _pages(total, limit),
    }


@router.post("/payments/{payment_id}/manual-refund")
async def manual_refund(payment_id: str, payload: ManualRefundRequest, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    payment = await db.scalar(select(Payment).where(Payment.id == payment_id))
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    if Decimal(str(payload.amount)) > Decimal(str(payment.amount)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Refund cannot exceed payment amount")
    wallet = await get_or_create_wallet(db, payment.user_id)
    wallet.balance = Decimal(str(wallet.balance)) + Decimal(str(payload.amount))
    add_wallet_transaction(db, payment.user_id, "credit", payload.amount, wallet.balance, f"Manual refund: {payload.reason}", payment.id)
    payment.status = "refunded"
    await db.commit()
    await create_notification(payment.user_id, "Refund processed", f"₹{payload.amount:,.2f} was credited to your wallet.", "payment", action_url="/dashboard/wallet")
    await log_activity(admin.id, "payment_refunded", "payment", payment.id, {"amount": payload.amount, "reason": payload.reason})
    return {"status": "refunded", "wallet_balance": money(wallet.balance)}


@router.get("/support")
async def list_support(
    status_filter: str | None = Query(default=None, alias="status"),
    priority: str | None = None,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    conditions = []
    if status_filter and status_filter != "all":
        conditions.append(SupportTicket.status == status_filter)
    if priority:
        conditions.append(SupportTicket.priority == priority)
    total = await db.scalar(select(func.count()).select_from(SupportTicket).where(*conditions)) or 0
    rows = (
        await db.execute(
            select(SupportTicket, User.full_name, User.email)
            .outerjoin(User, User.id == SupportTicket.user_id)
            .where(*conditions)
            .order_by(SupportTicket.updated_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
    ).all()
    items = []
    for ticket, user_name, user_email in rows:
        messages = await get_ticket_messages(ticket.id)
        items.append(
            {
                "id": ticket.id,
                "subject": ticket.subject,
                "description": ticket.description,
                "category": ticket.category,
                "priority": ticket.priority,
                "status": ticket.status,
                "booking_ref": ticket.booking_ref,
                "user": {
                    "id": ticket.user_id,
                    "name": user_name or ticket.contact_name,
                    "email": user_email or ticket.contact_email,
                },
                "created_at": _dt(ticket.created_at),
                "updated_at": _dt(ticket.updated_at),
                "messages": messages,
                "latest_message": messages[-1] if messages else None,
            }
        )
    return {"items": items, "total": total, "page": page, "pages": _pages(total, limit)}


@router.post("/support/{ticket_id}/reply")
async def support_reply(ticket_id: str, payload: SupportReplyRequest, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    ticket = await db.scalar(select(SupportTicket).where(SupportTicket.id == ticket_id))
    if ticket is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    await add_support_message(ticket.id, admin.id, "SigFleet Support", "admin", payload.message)
    if ticket.status == "open":
        ticket.status = "in_progress"
    ticket.updated_at = datetime.utcnow()
    await db.commit()
    if ticket.user_id:
        await create_notification(ticket.user_id, "Support replied", payload.message[:160], "system", action_url="/dashboard/support", meta={"ticket_id": ticket.id})
    await log_activity(admin.id, "support_replied", "support_ticket", ticket.id)
    return {"message": "Reply sent"}


@router.patch("/support/{ticket_id}/status")
async def support_status(ticket_id: str, payload: StatusRequest, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    if payload.status not in {"open", "in_progress", "resolved", "closed"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid support status")
    ticket = await db.scalar(select(SupportTicket).where(SupportTicket.id == ticket_id))
    if ticket is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    ticket.status = payload.status
    ticket.updated_at = datetime.utcnow()
    await db.commit()
    await log_activity(admin.id, "support_status_updated", "support_ticket", ticket.id, {"status": payload.status})
    return {"status": ticket.status}


@router.patch("/support/{ticket_id}/priority")
async def support_priority(ticket_id: str, payload: PriorityRequest, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    ticket = await db.scalar(select(SupportTicket).where(SupportTicket.id == ticket_id))
    if ticket is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    ticket.priority = payload.priority
    ticket.updated_at = datetime.utcnow()
    await db.commit()
    await log_activity(admin.id, "support_priority_updated", "support_ticket", ticket.id, {"priority": payload.priority})
    return {"priority": ticket.priority}


@router.get("/coupons")
async def list_coupons(
    active: bool | None = None,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    conditions = []
    if active is not None:
        conditions.append(Coupon.is_active.is_(active))
    total = await db.scalar(select(func.count()).select_from(Coupon).where(*conditions)) or 0
    coupons = (
        await db.execute(select(Coupon).where(*conditions).order_by(Coupon.created_at.desc()).offset((page - 1) * limit).limit(limit))
    ).scalars().all()
    return {"items": [_coupon_payload(coupon) for coupon in coupons], "total": total, "page": page, "pages": _pages(total, limit)}


@router.post("/coupons", status_code=status.HTTP_201_CREATED)
async def create_coupon(payload: CouponRequest, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    code = payload.code.strip().upper()
    if payload.valid_until <= payload.valid_from:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Valid until must be after valid from")
    if await db.scalar(select(Coupon).where(Coupon.code == code)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Coupon code already exists")
    coupon = Coupon(
        code=code,
        description=payload.description,
        discount_type=payload.discount_type,
        discount_value=Decimal(str(payload.discount_value)),
        max_discount=Decimal(str(payload.max_discount)) if payload.max_discount is not None else None,
        min_booking_amount=Decimal(str(payload.min_booking_amount)),
        usage_limit=payload.usage_limit,
        valid_from=payload.valid_from,
        valid_until=payload.valid_until,
        applicable_for=payload.applicable_for,
        is_active=payload.is_active,
    )
    db.add(coupon)
    await db.commit()
    await db.refresh(coupon)
    await log_activity(admin.id, "coupon_created", "coupon", coupon.id, {"code": coupon.code})
    return _coupon_payload(coupon)


@router.patch("/coupons/{coupon_id}")
async def update_coupon(coupon_id: str, payload: CouponRequest, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    coupon = await db.scalar(select(Coupon).where(Coupon.id == coupon_id))
    if coupon is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Coupon not found")
    code = payload.code.strip().upper()
    existing = await db.scalar(select(Coupon).where(Coupon.code == code, Coupon.id != coupon_id))
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Coupon code already exists")
    coupon.code = code
    coupon.description = payload.description
    coupon.discount_type = payload.discount_type
    coupon.discount_value = Decimal(str(payload.discount_value))
    coupon.max_discount = Decimal(str(payload.max_discount)) if payload.max_discount is not None else None
    coupon.min_booking_amount = Decimal(str(payload.min_booking_amount))
    coupon.usage_limit = payload.usage_limit
    coupon.valid_from = payload.valid_from
    coupon.valid_until = payload.valid_until
    coupon.applicable_for = payload.applicable_for
    coupon.is_active = payload.is_active
    await db.commit()
    await log_activity(admin.id, "coupon_updated", "coupon", coupon.id, {"code": coupon.code})
    return _coupon_payload(coupon)


@router.delete("/coupons/{coupon_id}")
async def delete_coupon(coupon_id: str, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    coupon = await db.scalar(select(Coupon).where(Coupon.id == coupon_id))
    if coupon is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Coupon not found")
    await db.delete(coupon)
    await db.commit()
    await log_activity(admin.id, "coupon_deleted", "coupon", coupon_id)
    return {"message": "Coupon deleted"}


@router.get("/payouts")
async def list_payouts(
    status_filter: str | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    conditions = []
    if status_filter:
        conditions.append(ManagerPayoutRequest.status == status_filter)
    total = await db.scalar(select(func.count()).select_from(ManagerPayoutRequest).where(*conditions)) or 0
    rows = (
        await db.execute(
            select(ManagerPayoutRequest, User.full_name, User.email)
            .join(User, User.id == ManagerPayoutRequest.manager_id)
            .where(*conditions)
            .order_by(ManagerPayoutRequest.requested_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
    ).all()
    return {
        "items": [
            {
                "id": payout.id,
                "vehicle_manager": {"id": payout.manager_id, "name": name, "email": email},
                "manager": {"id": payout.manager_id, "name": name, "email": email},
                "amount": money(payout.amount),
                "status": payout.status,
                "requested_at": _dt(payout.requested_at),
                "processed_at": _dt(payout.processed_at),
            }
            for payout, name, email in rows
        ],
        "total": total,
        "page": page,
        "pages": _pages(total, limit),
    }


async def _payout_action(payout_id: str, action: str, admin: User, db: AsyncSession) -> dict:
    payout = await db.scalar(select(ManagerPayoutRequest).where(ManagerPayoutRequest.id == payout_id))
    if payout is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payout request not found")
    vehicle_manager = await db.scalar(select(User).where(User.id == payout.manager_id))
    if action == "process":
        payout.status = "processing"
    elif action == "complete":
        payout.status = "paid"
        payout.processed_at = datetime.utcnow()
        if vehicle_manager:
            try:
                send_manager_payout_email.delay(vehicle_manager.email, money(payout.amount))
            except Exception:
                pass
            await create_notification(vehicle_manager.id, "Payout paid", f"₹{money(payout.amount):,.2f} was processed.", "manager", action_url="/manager/earnings")
    elif action == "fail":
        payout.status = "failed"
        payout.processed_at = datetime.utcnow()
        wallet = await get_or_create_wallet(db, payout.manager_id)
        wallet.balance = Decimal(str(wallet.balance)) + Decimal(str(payout.amount))
        add_wallet_transaction(db, payout.manager_id, "credit", payout.amount, wallet.balance, "Failed payout returned to wallet", payout.id)
        if vehicle_manager:
            await create_notification(vehicle_manager.id, "Payout failed", "Your payout was returned to wallet.", "manager", action_url="/manager/earnings")
    await db.commit()
    await log_activity(admin.id, f"payout_{action}", "manager_payout_request", payout.id)
    return {"status": payout.status}


@router.patch("/payouts/{payout_id}/process")
async def process_payout(payout_id: str, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    return await _payout_action(payout_id, "process", admin, db)


@router.patch("/payouts/{payout_id}/complete")
async def complete_payout(payout_id: str, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    return await _payout_action(payout_id, "complete", admin, db)


@router.patch("/payouts/{payout_id}/fail")
async def fail_payout(payout_id: str, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    return await _payout_action(payout_id, "fail", admin, db)


# FIX: Added custom PUT status, PUT role, and DELETE endpoints to support natively clickable action buttons in Customers and Vehicle Managers tables with full data cascading delete integrity.

class UpdateUserStatusRequest(BaseModel):
    is_active: bool

@router.put("/users/{user_id}/status")
async def update_user_status(user_id: str, payload: UpdateUserStatusRequest, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.is_active = payload.is_active
    if not payload.is_active:
        from app.models.booking import Booking
        pending = (await db.execute(select(Booking).where(Booking.customer_id == user.id, Booking.status == "pending"))).scalars().all()
        for booking in pending:
            booking.status = "cancelled"
            booking.cancelled_by = admin.id
            booking.cancelled_at = datetime.utcnow()
            booking.cancellation_reason = "Cancelled after account suspension"
    await db.commit()
    await log_activity(admin.id, "user_status_updated", "user", user.id, {"is_active": payload.is_active})
    return {"message": f"User status updated to {'active' if payload.is_active else 'inactive'}"}

class UpdateUserRoleRequest(BaseModel):
    role: str = Field(pattern="^(customer|vehicle_manager|admin)$")

@router.put("/users/{user_id}/role")
async def update_user_role(user_id: str, payload: UpdateUserRoleRequest, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    
    if user.role == "vehicle_manager" and payload.role == "customer":
        from app.models.booking import Booking
        from app.models.vehicle import Vehicle
        blockers = (
            await db.execute(
                select(Booking, Vehicle.title)
                .join(Vehicle, Vehicle.id == Booking.vehicle_id)
                .where(Booking.manager_id == user.id, Booking.status.in_(("confirmed", "active")))
                .order_by(Booking.pickup_datetime.asc())
            )
        ).all()
        if blockers:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Manager has active or confirmed bookings and cannot be demoted.")
        user.role = "customer"
        user.is_vehicle_manager = False
        profile = await db.scalar(select(ManagerProfile).where(ManagerProfile.user_id == user.id))
        if profile:
            profile.is_active = False
    else:
        user.role = payload.role
        user.is_vehicle_manager = payload.role == "vehicle_manager"
        
    await db.commit()
    await log_activity(admin.id, "user_role_updated", "user", user.id, {"role": payload.role})
    return {"message": f"User role updated to {payload.role}"}

@router.delete("/users/{user_id}")
async def delete_user(user_id: str, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    from app.models.booking import Booking
    bookings_count = await db.scalar(select(func.count()).select_from(Booking).where((Booking.customer_id == user_id) | (Booking.manager_id == user_id)))
    if bookings_count and bookings_count > 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User has bookings and cannot be deleted. Please suspend the account instead.")
    
    from app.models.user import UserKYC
    from app.models.payment import UserWallet
    from app.models.manager import ManagerProfile
    from sqlalchemy import delete
    await db.execute(delete(UserKYC).where(UserKYC.user_id == user_id))
    await db.execute(delete(UserWallet).where(UserWallet.user_id == user_id))
    await db.execute(delete(ManagerProfile).where(ManagerProfile.user_id == user_id))
    await db.delete(user)
    await db.commit()
    await log_activity(admin.id, "user_deleted", "user", user_id, {"email": user.email})
    return {"message": "User deleted successfully"}
