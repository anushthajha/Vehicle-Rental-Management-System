from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.booking import Booking
from app.models.coupon import Coupon, CouponUsage
from app.models.user import User
from app.services.booking_flow import money
from app.utils.auth import get_current_active_user


router = APIRouter(prefix="/coupons", tags=["coupons"])


class CouponValidateRequest(BaseModel):
    code: str = Field(min_length=2, max_length=50)
    booking_amount: float = Field(ge=0)


def _coupon_payload(coupon: Coupon, already_used: bool = False) -> dict:
    return {
        "id": coupon.id,
        "code": coupon.code,
        "description": coupon.description,
        "discount_type": "percentage" if coupon.discount_type == "percent" else coupon.discount_type,
        "discount_value": money(coupon.discount_value),
        "discount_percent": money(coupon.discount_value) if coupon.discount_type == "percent" else 0,
        "min_booking_amount": money(coupon.min_booking_amount),
        "max_discount": money(coupon.max_discount),
        "usage_limit": coupon.usage_limit,
        "used_count": coupon.used_count,
        "valid_until": coupon.valid_until.isoformat() if coupon.valid_until else None,
        "is_active": coupon.is_active,
        "already_used": already_used,
    }


async def validate_coupon_for_user(db: AsyncSession, code: str | None, user: User | None, booking_amount: float) -> tuple[Coupon | None, dict]:
    if not code:
        return None, {"valid": False, "discount_amount": 0, "discount_percent": 0, "message": "Coupon code is required"}
    coupon = await db.scalar(select(Coupon).where(func.upper(Coupon.code) == code.strip().upper()))
    now = datetime.utcnow()
    if coupon is None or not coupon.is_active:
        return None, {"valid": False, "discount_amount": 0, "discount_percent": 0, "message": "Coupon not found or inactive"}
    if coupon.valid_until < now or coupon.valid_from > now:
        return None, {"valid": False, "discount_amount": 0, "discount_percent": 0, "message": "Coupon has expired"}
    if booking_amount < money(coupon.min_booking_amount):
        return None, {"valid": False, "discount_amount": 0, "discount_percent": 0, "message": f"Minimum booking ₹{money(coupon.min_booking_amount):.0f} required"}
    if user is not None and coupon.usage_limit == 1:
        used = await db.scalar(select(func.count()).select_from(CouponUsage).where(CouponUsage.coupon_id == coupon.id, CouponUsage.user_id == user.id)) or 0
        previous_bookings = await db.scalar(select(func.count()).select_from(Booking).where(Booking.customer_id == user.id)) or 0
        if used or (coupon.applicable_for == "new_users" and previous_bookings):
            return None, {"valid": False, "discount_amount": 0, "discount_percent": 0, "message": "Already used"}
    if coupon.usage_limit is not None and coupon.usage_limit != 1 and coupon.used_count >= coupon.usage_limit:
        return None, {"valid": False, "discount_amount": 0, "discount_percent": 0, "message": "Coupon usage limit reached"}

    amount = Decimal(str(booking_amount))
    if coupon.discount_type == "percent":
        discount = amount * (Decimal(str(coupon.discount_value)) / Decimal("100"))
        if coupon.max_discount is not None:
            discount = min(discount, Decimal(str(coupon.max_discount)))
        percent = money(coupon.discount_value)
    else:
        discount = Decimal(str(coupon.discount_value))
        percent = 0
    discount = min(discount, amount).quantize(Decimal("0.01"))
    return coupon, {
        "valid": True,
        "discount_amount": money(discount),
        "discount_percent": percent,
        "message": f"{coupon.code} applied! You save ₹{money(discount):.0f}",
    }


@router.get("")
async def list_available_coupons(current_user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    now = datetime.utcnow()
    coupons = (
        await db.execute(
            select(Coupon)
            .where(Coupon.is_active.is_(True), Coupon.valid_until >= now, Coupon.valid_from <= now)
            .order_by(Coupon.created_at.desc())
        )
    ).scalars().all()
    used_ids = set(
        (await db.execute(select(CouponUsage.coupon_id).where(CouponUsage.user_id == current_user.id))).scalars().all()
    )
    return {"items": [_coupon_payload(coupon, coupon.id in used_ids) for coupon in coupons]}


@router.post("/validate")
async def validate_coupon(payload: CouponValidateRequest, current_user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    _, result = await validate_coupon_for_user(db, payload.code, current_user, payload.booking_amount)
    return result
