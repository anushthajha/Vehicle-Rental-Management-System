from datetime import datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.booking import Booking
from app.models.car import Car, CarImage
from app.models.coupon import Coupon
from app.models.host import HostPayoutRequest
from app.models.payment import Payment
from app.models.support import SupportTicket
from app.models.user import User, UserKYC
from app.mongo_models.analytics import get_admin_activity_feed, log_activity
from app.mongo_models.notification import create_notification
from app.mongo_models.support_message import add_support_message, get_ticket_messages
from app.redis import get_redis
from app.services.booking_flow import add_wallet_transaction, get_or_create_wallet, money
from app.tasks.email_tasks import send_host_payout_email, send_kyc_approved_email, send_kyc_rejected_email
from app.utils.auth import require_admin


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


def _dt(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _pages(total: int, limit: int) -> int:
    return (total + limit - 1) // limit if total else 0


def _car_status(car: Car) -> str:
    if car.is_approved:
        return "approved" if car.is_available else "inactive"
    return "pending" if car.is_available else "rejected"


def _primary_image(images: dict[str, str | None], car_id: str) -> str | None:
    return images.get(car_id)


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


async def _image_map(db: AsyncSession, car_ids: list[str]) -> dict[str, str | None]:
    if not car_ids:
        return {}
    rows = (
        await db.execute(
            select(CarImage)
            .where(CarImage.car_id.in_(car_ids))
            .order_by(CarImage.car_id, CarImage.is_primary.desc(), CarImage.order_index)
        )
    ).scalars().all()
    images: dict[str, str | None] = {}
    for image in rows:
        images.setdefault(image.car_id, image.image_url)
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


@router.get("/stats/overview")
async def stats_overview(_: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    now = datetime.utcnow()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = now - timedelta(days=7)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    total_users = await db.scalar(select(func.count()).select_from(User)) or 0
    new_today = await db.scalar(select(func.count()).select_from(User).where(User.created_at >= today)) or 0
    new_week = await db.scalar(select(func.count()).select_from(User).where(User.created_at >= week_start)) or 0
    total_managers = await db.scalar(select(func.count()).select_from(User).where(or_(User.role == "vehicle_manager", User.is_host.is_(True)))) or 0
    new_managers_month = await db.scalar(
        select(func.count()).select_from(User).where(or_(User.role == "vehicle_manager", User.is_host.is_(True)), User.created_at >= month_start)
    ) or 0

    car_rows = (await db.execute(select(Car.is_approved, Car.is_available, func.count()).group_by(Car.is_approved, Car.is_available))).all()
    cars = {"total": 0, "approved": 0, "pending_approval": 0, "inactive": 0}
    for approved, available, count in car_rows:
        cars["total"] += count
        if approved:
            cars["approved"] += count
        elif available:
            cars["pending_approval"] += count
        if not available:
            cars["inactive"] += count

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
    pending_payouts = await db.scalar(select(func.count()).select_from(HostPayoutRequest).where(HostPayoutRequest.status == "pending")) or 0

    return {
        "users": {"total": total_users, "new_today": new_today, "new_this_week": new_week},
        "vehicle_managers": {"total": total_managers, "new_this_month": new_managers_month},
        "hosts": {"total": total_managers, "new_this_month": new_managers_month},
        "cars": cars,
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
            "car_approval_count": cars["pending_approval"],
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
                func.coalesce(func.sum(Booking.host_earnings), 0),
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
            "host_payouts": money(by_month.get(index, [None, 0, 0, 0, 0])[3]),
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
                Car.location_city,
                func.count(Booking.id),
                func.coalesce(func.sum(Booking.total_amount), 0),
                func.count(func.distinct(case((and_(Car.is_approved.is_(True), Car.is_available.is_(True)), Car.id)))),
            )
            .select_from(Car)
            .outerjoin(Booking, Booking.car_id == Car.id)
            .group_by(Car.location_city)
            .order_by(func.count(Booking.id).desc())
            .limit(10)
        )
    ).all()
    return [{"city": city, "booking_count": bookings, "revenue": money(revenue), "active_cars": active_cars} for city, bookings, revenue, active_cars in rows]


@router.get("/analytics/top-cars")
async def top_cars(limit: int = Query(default=10, ge=1, le=50), _: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            select(Car, User.full_name, func.count(Booking.id), func.coalesce(func.sum(Booking.total_amount), 0))
            .join(User, User.id == Car.managerId)
            .outerjoin(Booking, Booking.car_id == Car.id)
            .group_by(Car.id, User.full_name)
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
            "host_name": host_name,
            "trips": trips or car.total_trips,
            "revenue": money(revenue),
            "rating": money(car.average_rating),
        }
        for car, host_name, trips, revenue in rows
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
    rows = (await db.execute(select(Car.category, func.count()).group_by(Car.category))).all()
    return [{"name": category, "value": count} for category, count in rows]


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
            .outerjoin(Booking, Booking.guest_id == User.id)
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
            select(Booking, Car.title)
            .outerjoin(Car, Car.id == Booking.car_id)
            .where(Booking.guest_id == user_id)
            .order_by(Booking.created_at.desc())
            .limit(5)
        )
    ).all()
    summary = (
        await db.execute(
            select(Booking.status, func.count(), func.coalesce(func.sum(Booking.total_amount), 0))
            .where(Booking.guest_id == user_id)
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
            "is_host": user.role == "vehicle_manager",
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
                "car_title": title,
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
        user.is_host = payload.role == "vehicle_manager" or user.is_host
    if payload.is_active is not None:
        user.is_active = payload.is_active
        if not payload.is_active:
            pending = (await db.execute(select(Booking).where(Booking.guest_id == user.id, Booking.status == "pending"))).scalars().all()
            for booking in pending:
                booking.status = "cancelled"
                booking.cancelled_by = admin.id
                booking.cancelled_at = datetime.utcnow()
                booking.cancellation_reason = "Cancelled after account suspension"
            await create_notification(user.id, "Account suspended", "Your pending bookings were cancelled by admin review.", "system")
    await db.commit()
    await log_activity(admin.id, "user_updated", "user", user.id, {"is_active": payload.is_active, "role": payload.role})
    return {"message": "User updated"}


@router.get("/cars")
async def list_cars(
    status_filter: str = Query(default="all", alias="status", pattern="^(pending|approved|inactive|rejected|all)$"),
    city: str | None = None,
    category: str | None = None,
    host_id: str | None = None,
    sort: str = Query(default="newest"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    conditions = []
    if status_filter == "pending":
        conditions += [Car.is_approved.is_(False), Car.is_available.is_(True)]
    elif status_filter == "approved":
        conditions.append(Car.is_approved.is_(True))
    elif status_filter == "inactive":
        conditions.append(Car.is_available.is_(False))
    elif status_filter == "rejected":
        conditions += [Car.is_approved.is_(False), Car.is_available.is_(False)]
    if city:
        conditions.append(Car.location_city == city)
    if category:
        conditions.append(Car.category == category)
    if host_id:
        conditions.append(Car.managerId == host_id)
    total = await db.scalar(select(func.count()).select_from(Car).where(*conditions)) or 0
    order = Car.created_at.desc()
    if sort == "oldest":
        order = Car.created_at.asc()
    elif sort == "price":
        order = Car.price_per_day.asc()
    elif sort == "rating":
        order = Car.average_rating.desc()
    rows = (
        await db.execute(
            select(Car, User.full_name, User.email)
            .join(User, User.id == Car.managerId)
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
                "vehicle_manager": {"id": car.host_id, "name": host_name, "email": host_email},
                "manager": {"id": car.host_id, "name": host_name, "email": host_email},
                "category": car.category,
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
            for car, host_name, host_email in rows
        ],
        "total": total,
        "page": page,
        "pages": _pages(total, limit),
    }


@router.patch("/cars/{car_id}/approve")
async def approve_car(car_id: str, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    car = await db.scalar(select(Car).where(Car.id == car_id))
    if car is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Car not found")
    car.is_approved = True
    car.is_available = True
    await db.commit()
    await create_notification(car.host_id, "Car approved", f"{car.title} is live for bookings.", "host", action_url="/manager/cars", meta={"car_id": car.id})
    await log_activity(admin.id, "car_approved", "car", car.id, {"title": car.title})
    return {"status": "approved"}


@router.patch("/cars/{car_id}/reject")
async def reject_car(car_id: str, payload: RejectRequest, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    car = await db.scalar(select(Car).where(Car.id == car_id))
    if car is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Car not found")
    car.is_approved = False
    car.is_available = False
    await db.commit()
    await create_notification(car.host_id, "Car rejected", payload.reason, "host", action_url="/manager/cars", meta={"car_id": car.id})
    await log_activity(admin.id, "car_rejected", "car", car.id, {"reason": payload.reason})
    return {"status": "rejected"}


@router.patch("/cars/{car_id}/feature")
async def feature_car(car_id: str, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    car = await db.scalar(select(Car).where(Car.id == car_id))
    if car is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Car not found")
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
        conditions.append(Car.location_city == city)
    total = await db.scalar(select(func.count()).select_from(Booking).join(Car, Car.id == Booking.car_id).where(*conditions)) or 0
    rows = (
        await db.execute(
            select(Booking, Car.title, Car.location_city, User.full_name)
            .join(Car, Car.id == Booking.car_id)
            .join(User, User.id == Booking.guest_id)
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
                "car_title": title,
                "city": city_name,
                "guest_name": customer,
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
            select(Booking, Car, User.full_name.label("guest_name"))
            .join(Car, Car.id == Booking.car_id)
            .join(User, User.id == Booking.guest_id)
            .where(Booking.id == booking_id)
        )
    ).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    booking, car, guest_name = row
    return {"booking": {
        "id": booking.id,
        "booking_ref": booking.booking_ref,
        "status": booking.status,
        "guest_name": guest_name,
        "car_title": car.title,
        "pickup_datetime": _dt(booking.pickup_datetime),
        "return_datetime": _dt(booking.return_datetime),
        "total_amount": money(booking.total_amount),
        "platform_fee": money(booking.platform_fee),
        "host_earnings": money(booking.host_earnings),
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
        conditions.append(HostPayoutRequest.status == status_filter)
    total = await db.scalar(select(func.count()).select_from(HostPayoutRequest).where(*conditions)) or 0
    rows = (
        await db.execute(
            select(HostPayoutRequest, User.full_name, User.email)
            .join(User, User.id == HostPayoutRequest.host_id)
            .where(*conditions)
            .order_by(HostPayoutRequest.requested_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
    ).all()
    return {
        "items": [
            {
                "id": payout.id,
                "vehicle_manager": {"id": payout.host_id, "name": name, "email": email},
                "host": {"id": payout.host_id, "name": name, "email": email},
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
    payout = await db.scalar(select(HostPayoutRequest).where(HostPayoutRequest.id == payout_id))
    if payout is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payout request not found")
    vehicle_manager = await db.scalar(select(User).where(User.id == payout.host_id))
    if action == "process":
        payout.status = "processing"
    elif action == "complete":
        payout.status = "paid"
        payout.processed_at = datetime.utcnow()
        if vehicle_manager:
            try:
                send_host_payout_email.delay(vehicle_manager.email, money(payout.amount))
            except Exception:
                pass
            await create_notification(vehicle_manager.id, "Payout paid", f"₹{money(payout.amount):,.2f} was processed.", "host", action_url="/manager/earnings")
    elif action == "fail":
        payout.status = "failed"
        payout.processed_at = datetime.utcnow()
        wallet = await get_or_create_wallet(db, payout.host_id)
        wallet.balance = Decimal(str(wallet.balance)) + Decimal(str(payout.amount))
        add_wallet_transaction(db, payout.host_id, "credit", payout.amount, wallet.balance, "Failed payout returned to wallet", payout.id)
        if vehicle_manager:
            await create_notification(vehicle_manager.id, "Payout failed", "Your payout was returned to wallet.", "host", action_url="/manager/earnings")
    await db.commit()
    await log_activity(admin.id, f"payout_{action}", "host_payout_request", payout.id)
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
