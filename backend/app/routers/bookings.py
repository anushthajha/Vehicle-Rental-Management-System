import math
import random
import string
from datetime import datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.booking import Booking, BookingExtension
from app.models.car import Car, CarAvailabilityBlock, CarImage, CarPricingRule
from app.models.coupon import Coupon, CouponUsage
from app.models.host import HostProfile
from app.models.payment import Payment
from app.models.user import User
from app.mongo_models.notification import create_notification
from app.mongo_models.review import get_booking_reviews
from app.services.booking_flow import (
    add_wallet_transaction,
    booking_email_payload,
    get_or_create_wallet,
    mark_payment_paid,
    money,
)
from app.services.pricing import calculate_booking_price
from app.tasks.email_tasks import (
    send_booking_cancelled_email,
    send_booking_request_to_host_email,
    send_review_request_email,
)
from app.utils.auth import get_current_active_user, require_host, require_kyc_user


router = APIRouter(prefix="/bookings", tags=["bookings"])

BLOCKING_STATUSES = ("confirmed", "active", "pending")


class BookingPreviewRequest(BaseModel):
    car_id: str
    pickup_datetime: datetime
    return_datetime: datetime
    insurance_plan: str = "standard"
    coupon_code: str | None = None


class BookingCreateRequest(BookingPreviewRequest):
    guest_notes: str | None = Field(default=None, max_length=1000)


class RejectRequest(BaseModel):
    reason: str = Field(min_length=2, max_length=500)


class CancelRequest(BaseModel):
    reason: str = Field(min_length=2, max_length=500)


class StartTripRequest(BaseModel):
    odometer_start: int = Field(ge=0)


class EndTripRequest(BaseModel):
    odometer_end: int = Field(ge=0)
    condition_notes: str | None = Field(default=None, max_length=1000)


class ExtendRequest(BaseModel):
    new_return_datetime: datetime


class ExtensionResponse(BaseModel):
    approved: bool


def _dt(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _overlap(start: datetime, end: datetime):
    return Booking.pickup_datetime < end, Booking.return_datetime > start, Booking.status.in_(BLOCKING_STATUSES)


async def _load_car(db: AsyncSession, car_id: str) -> Car:
    car = await db.scalar(select(Car).where(Car.id == car_id))
    if car is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Car not found")
    return car


async def _attach_pricing_rules(db: AsyncSession, car: Car) -> None:
    rules = (await db.execute(select(CarPricingRule).where(CarPricingRule.car_id == car.id))).scalars().all()
    setattr(car, "pricing_rules", rules)


async def _primary_image(db: AsyncSession, car_id: str) -> str | None:
    return await db.scalar(
        select(CarImage.image_url)
        .where(CarImage.car_id == car_id)
        .order_by(CarImage.is_primary.desc(), CarImage.order_index.asc())
        .limit(1)
    )


async def _validate_dates(car: Car, pickup: datetime, return_at: datetime) -> None:
    if pickup < datetime.utcnow() + timedelta(hours=1):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Pickup must be at least 1 hour from now")
    hours = (return_at - pickup).total_seconds() / 3600
    if hours < car.min_trip_hours:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Trip must be at least {car.min_trip_hours} hours")
    if hours / 24 > car.max_trip_days:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Trip cannot exceed {car.max_trip_days} days")


async def _validate_coupon(db: AsyncSession, code: str | None, user: User | None, base_amount: float) -> tuple[Coupon | None, str | None]:
    if not code:
        return None, None
    coupon = await db.scalar(select(Coupon).where(func.upper(Coupon.code) == code.upper()))
    now = datetime.utcnow()
    if coupon is None:
        return None, "Coupon not found"
    if not coupon.is_active:
        return None, "Coupon is inactive"
    if coupon.valid_from > now or coupon.valid_until < now:
        return None, "Coupon has expired"
    if coupon.usage_limit is not None and coupon.used_count >= coupon.usage_limit:
        return None, "Coupon usage limit reached"
    if base_amount < money(coupon.min_booking_amount):
        return None, f"Minimum booking amount is ₹{money(coupon.min_booking_amount):.0f}"
    if coupon.applicable_for == "new_users" and user is not None:
        previous = await db.scalar(select(func.count()).select_from(Booking).where(Booking.guest_id == user.id))
        if previous:
            return None, "Coupon is only for new users"
    return coupon, None


async def _price_breakdown(db: AsyncSession, car: Car, payload: BookingPreviewRequest, user: User | None = None) -> tuple[dict, Coupon | None, str | None]:
    await _attach_pricing_rules(db, car)
    raw = calculate_booking_price(car, payload.pickup_datetime, payload.return_datetime, payload.insurance_plan, payload.coupon_code)
    coupon, coupon_error = await _validate_coupon(db, payload.coupon_code, user, raw["base_amount"])
    breakdown = calculate_booking_price(car, payload.pickup_datetime, payload.return_datetime, payload.insurance_plan, payload.coupon_code, coupon)
    return breakdown, coupon, coupon_error


async def _ensure_available(db: AsyncSession, car: Car, pickup: datetime, return_at: datetime, guest_id: str | None = None) -> None:
    if not car.is_approved or not car.is_available:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Car is not available for booking")
    conflict = await db.scalar(select(func.count()).select_from(Booking).where(Booking.car_id == car.id, *_overlap(pickup, return_at)))
    if conflict:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Car already has a booking in this date range")
    block = await db.scalar(
        select(func.count())
        .select_from(CarAvailabilityBlock)
        .where(CarAvailabilityBlock.car_id == car.id, CarAvailabilityBlock.blocked_from < return_at, CarAvailabilityBlock.blocked_to > pickup)
    )
    if block:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Car is blocked by the host for this date range")
    if guest_id:
        guest_conflict = await db.scalar(
            select(func.count()).select_from(Booking).where(Booking.guest_id == guest_id, Booking.status.in_(("confirmed", "active")), Booking.pickup_datetime < return_at, Booking.return_datetime > pickup)
        )
        if guest_conflict:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You already have a confirmed booking during this time")


async def _booking_ref(db: AsyncSession) -> str:
    alphabet = string.ascii_uppercase + string.digits
    while True:
        ref = "JPSN" + "".join(random.choice(alphabet) for _ in range(6))
        exists = await db.scalar(select(Booking.id).where(Booking.booking_ref == ref))
        if not exists:
            return ref


async def _booking_with_access(booking_id: str, current_user: User, db: AsyncSession) -> Booking:
    booking = await db.scalar(select(Booking).where(Booking.id == booking_id))
    if booking is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    if current_user.id not in {booking.guest_id, booking.host_id} and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed to access this booking")
    return booking


async def _payment_for(db: AsyncSession, booking_id: str) -> Payment:
    payment = await db.scalar(select(Payment).where(Payment.booking_id == booking_id))
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    return payment


def _booking_payload(booking: Booking, car: Car, image: str | None, counterparty: User | None = None, payment: Payment | None = None) -> dict:
    return {
        "id": booking.id,
        "booking_ref": booking.booking_ref,
        "status": booking.status,
        "created_at": _dt(booking.created_at),
        "pickup_datetime": _dt(booking.pickup_datetime),
        "return_datetime": _dt(booking.return_datetime),
        "actual_pickup_time": _dt(booking.actual_pickup_time),
        "actual_return_time": _dt(booking.actual_return_time),
        "pickup_location": booking.pickup_location,
        "total_hours": money(booking.total_hours),
        "base_amount": money(booking.base_amount),
        "discount_amount": money(booking.discount_amount),
        "insurance_amount": money(booking.insurance_amount),
        "insurance_plan": booking.insurance_plan,
        "security_deposit_amount": money(booking.security_deposit_amount),
        "total_amount": money(booking.total_amount),
        "platform_fee": money(booking.platform_fee),
        "host_earnings": money(booking.host_earnings),
        "extra_km_charged": money(booking.extra_km_charged),
        "refund_amount": money(booking.refund_amount),
        "refund_status": booking.refund_status,
        "guest_notes": booking.guest_notes,
        "cancellation_reason": booking.cancellation_reason,
        "car": {
            "id": car.id,
            "title": car.title,
            "registration_number": car.registration_number,
            "location_city": car.location_city,
            "location_area": car.location_area,
            "location_address": car.location_address,
            "primary_image_url": image,
            "price_per_day": money(car.price_per_day),
        },
        "counterparty": {
            "id": counterparty.id,
            "name": counterparty.full_name,
            "photo": counterparty.profile_picture,
            "phone": counterparty.phone if booking.status in {"confirmed", "active", "completed"} else None,
        } if counterparty else None,
        "payment": {
            "id": payment.id,
            "amount": money(payment.amount),
            "status": payment.status,
            "payment_method": payment.payment_method,
            "transaction_id": payment.simulated_transaction_id,
            "paid_at": _dt(payment.paid_at),
        } if payment else None,
    }


@router.post("/preview")
async def preview_booking(payload: BookingPreviewRequest, db: AsyncSession = Depends(get_db)):
    car = await _load_car(db, payload.car_id)
    if not car.is_approved:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Car is not approved")
    await _validate_dates(car, payload.pickup_datetime, payload.return_datetime)
    breakdown, _, coupon_error = await _price_breakdown(db, car, payload)
    return {"price_breakdown": breakdown, "coupon_error": coupon_error}


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_booking(payload: BookingCreateRequest, current_user: User = Depends(require_kyc_user), db: AsyncSession = Depends(get_db)):
    car = await _load_car(db, payload.car_id)
    await _validate_dates(car, payload.pickup_datetime, payload.return_datetime)
    await _ensure_available(db, car, payload.pickup_datetime, payload.return_datetime, current_user.id)
    breakdown, coupon, coupon_error = await _price_breakdown(db, car, payload, current_user)
    if coupon_error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=coupon_error)

    ref = await _booking_ref(db)
    booking = Booking(
        booking_ref=ref,
        car_id=car.id,
        guest_id=current_user.id,
        host_id=car.host_id,
        status="confirmed" if car.auto_accept_bookings else "pending",
        pickup_datetime=payload.pickup_datetime,
        return_datetime=payload.return_datetime,
        pickup_location=car.location_address or f"{car.location_area or ''}, {car.location_city}".strip(", "),
        total_hours=Decimal(str(breakdown["duration_hours"])),
        base_amount=Decimal(str(breakdown["base_amount"])),
        discount_amount=Decimal(str(breakdown.get("discount_from_rules", 0))) + Decimal(str(breakdown.get("coupon_discount", 0))),
        coupon_code=coupon.code if coupon else None,
        insurance_amount=Decimal(str(breakdown["insurance_amount"])),
        insurance_plan=payload.insurance_plan,
        security_deposit_amount=Decimal(str(breakdown["security_deposit"])),
        total_amount=Decimal(str(breakdown["total_amount"])),
        platform_fee=Decimal(str(breakdown["platform_fee"])),
        host_earnings=Decimal(str(breakdown["host_earnings"])),
        guest_notes=payload.guest_notes,
        host_accepted_at=datetime.utcnow() if car.auto_accept_bookings else None,
    )
    db.add(booking)
    await db.flush()

    if coupon:
        db.add(CouponUsage(coupon_id=coupon.id, user_id=current_user.id, booking_id=booking.id))
        coupon.used_count += 1

    payment = Payment(booking_id=booking.id, user_id=current_user.id, amount=booking.total_amount, payment_method="simulated", status="created")
    db.add(payment)
    host = await db.scalar(select(User).where(User.id == car.host_id))
    image = await _primary_image(db, car.id)

    if car.auto_accept_bookings and host:
        await mark_payment_paid(db, booking, payment, car, current_user, host)

    await db.commit()

    if host:
        notify_payload = booking_email_payload(booking, car) | {"guest_name": current_user.full_name}
        try:
            send_booking_request_to_host_email.delay(host.email, notify_payload)
        except Exception:
            pass
        await create_notification(host.id, "New booking request", f"{current_user.full_name} requested {car.title}.", "booking", action_url=f"/host/bookings", meta={"booking_id": booking.id})
    await create_notification(current_user.id, "Booking request submitted", f"Booking {booking.booking_ref} was created.", "booking", action_url=f"/dashboard/bookings/{booking.id}", meta={"booking_id": booking.id})

    return {
        "booking_id": booking.id,
        "booking_ref": booking.booking_ref,
        "status": booking.status,
        "price_breakdown": breakdown,
        "car_title": car.title,
        "car_primary_image": image,
        "requires_payment": not car.auto_accept_bookings,
    }


@router.post("/{booking_id}/simulate-payment")
async def simulate_payment(booking_id: str, current_user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    booking = await _booking_with_access(booking_id, current_user, db)
    if booking.guest_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the guest can pay for this booking")
    car = await _load_car(db, booking.car_id)
    if not (booking.status == "confirmed" or (booking.status == "pending" and car.auto_accept_bookings)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Booking is not ready for payment")
    payment = await _payment_for(db, booking.id)
    if payment.status != "created":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payment is not payable")
    host = await db.scalar(select(User).where(User.id == booking.host_id))
    txn_id = await mark_payment_paid(db, booking, payment, car, current_user, host)
    await db.commit()
    return {"success": True, "booking_ref": booking.booking_ref, "transaction_id": txn_id, "message": "Payment successful. Booking confirmed!"}


@router.patch("/{booking_id}/accept")
async def accept_booking(booking_id: str, current_user: User = Depends(require_host), db: AsyncSession = Depends(get_db)):
    booking = await _booking_with_access(booking_id, current_user, db)
    if booking.host_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the host can accept this booking")
    if booking.status != "pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending bookings can be accepted")
    booking.status = "confirmed"
    booking.host_accepted_at = datetime.utcnow()
    await db.commit()
    await create_notification(booking.guest_id, "Booking accepted", "Your booking request was accepted! Complete payment to confirm.", "booking", action_url=f"/booking/pay/{booking.id}", meta={"booking_id": booking.id})
    return {"status": booking.status}


@router.patch("/{booking_id}/reject")
async def reject_booking(booking_id: str, payload: RejectRequest, current_user: User = Depends(require_host), db: AsyncSession = Depends(get_db)):
    booking = await _booking_with_access(booking_id, current_user, db)
    if booking.host_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the host can reject this booking")
    if booking.status != "pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending bookings can be rejected")
    booking.status = "rejected"
    booking.cancellation_reason = payload.reason
    payment = await db.scalar(select(Payment).where(Payment.booking_id == booking.id))
    if payment and payment.status == "paid":
        booking.refund_status = "pending"
    await db.commit()
    await create_notification(booking.guest_id, "Booking rejected", payload.reason, "booking", action_url=f"/dashboard/bookings/{booking.id}", meta={"booking_id": booking.id})
    return {"status": booking.status}


@router.post("/{booking_id}/cancel")
async def cancel_booking(booking_id: str, payload: CancelRequest, current_user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    booking = await _booking_with_access(booking_id, current_user, db)
    if booking.status in {"cancelled", "completed", "rejected"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Booking cannot be cancelled")
    payment = await db.scalar(select(Payment).where(Payment.booking_id == booking.id))
    is_host_cancel = current_user.id == booking.host_id
    refund = Decimal("0.00")
    if payment and payment.status == "paid":
        hours_to_pickup = (booking.pickup_datetime - datetime.utcnow()).total_seconds() / 3600
        if is_host_cancel:
            refund = Decimal(str(payment.amount))
        elif hours_to_pickup > 48:
            refund = Decimal(str(payment.amount)) * Decimal("0.90")
        elif hours_to_pickup >= 24:
            refund = Decimal(str(payment.amount)) * Decimal("0.50")
    booking.status = "cancelled"
    booking.cancellation_reason = payload.reason
    booking.cancelled_by = current_user.id
    booking.cancelled_at = datetime.utcnow()
    booking.refund_amount = refund.quantize(Decimal("0.01"))
    booking.refund_status = "processed" if refund > 0 else "not_applicable"
    if refund > 0:
        wallet = await get_or_create_wallet(db, booking.guest_id)
        wallet.balance = Decimal(str(wallet.balance)) + refund
        add_wallet_transaction(db, booking.guest_id, "credit", refund, wallet.balance, f"Refund for {booking.booking_ref}", booking.id)
    if is_host_cancel:
        profile = await db.scalar(select(HostProfile).where(HostProfile.user_id == booking.host_id))
        if profile:
            profile.acceptance_rate = max(Decimal("0.00"), Decimal(str(profile.acceptance_rate)) - Decimal("2.00"))
    car = await _load_car(db, booking.car_id)
    guest = await db.scalar(select(User).where(User.id == booking.guest_id))
    host = await db.scalar(select(User).where(User.id == booking.host_id))
    await db.commit()
    for user in [guest, host]:
        if user:
            await create_notification(user.id, "Booking cancelled", f"{booking.booking_ref} was cancelled.", "booking", action_url=f"/dashboard/bookings/{booking.id}", meta={"booking_id": booking.id, "refund_amount": money(refund)})
            try:
                send_booking_cancelled_email.delay(user.email, booking_email_payload(booking, car), money(refund))
            except Exception:
                pass
    return {"status": booking.status, "refund_amount": money(refund), "refund_status": booking.refund_status}


@router.patch("/{booking_id}/start-trip")
async def start_trip(booking_id: str, payload: StartTripRequest, current_user: User = Depends(require_host), db: AsyncSession = Depends(get_db)):
    booking = await _booking_with_access(booking_id, current_user, db)
    if booking.host_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the host can start this trip")
    if booking.status != "confirmed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only confirmed bookings can be started")
    booking.status = "active"
    booking.actual_pickup_time = datetime.utcnow()
    booking.odometer_start = payload.odometer_start
    await db.commit()
    return {"status": booking.status}


@router.patch("/{booking_id}/end-trip")
async def end_trip(booking_id: str, payload: EndTripRequest, current_user: User = Depends(require_host), db: AsyncSession = Depends(get_db)):
    booking = await _booking_with_access(booking_id, current_user, db)
    if booking.host_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the host can end this trip")
    if booking.status != "active":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only active trips can be ended")
    if booking.odometer_start is not None and payload.odometer_end < booking.odometer_start:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ending odometer must be greater than starting odometer")
    car = await _load_car(db, booking.car_id)
    days = max(math.ceil(money(booking.total_hours) / 24), 1)
    allowed_km = car.included_km_per_day * days
    actual_km = max((payload.odometer_end - (booking.odometer_start or payload.odometer_end)), 0)
    extra_km = max(actual_km - allowed_km, 0)
    booking.extra_km_charged = Decimal(str(extra_km)) * Decimal(str(car.extra_km_charge))
    booking.status = "completed"
    booking.actual_return_time = datetime.utcnow()
    booking.odometer_end = payload.odometer_end
    guest_wallet = await get_or_create_wallet(db, booking.guest_id)
    guest_wallet.balance = Decimal(str(guest_wallet.balance)) + Decimal(str(booking.security_deposit_amount))
    add_wallet_transaction(db, booking.guest_id, "credit", booking.security_deposit_amount, guest_wallet.balance, f"Security deposit released for {booking.booking_ref}", booking.id)
    host_wallet = await get_or_create_wallet(db, booking.host_id)
    host_wallet.balance = Decimal(str(host_wallet.balance)) + Decimal(str(booking.host_earnings))
    add_wallet_transaction(db, booking.host_id, "credit", booking.host_earnings, host_wallet.balance, f"Host earning for {booking.booking_ref}", booking.id)
    car.total_trips += 1
    profile = await db.scalar(select(HostProfile).where(HostProfile.user_id == booking.host_id))
    if profile:
        profile.acceptance_rate = min(Decimal("100.00"), max(Decimal(str(profile.acceptance_rate)), Decimal("95.00")))
    guest = await db.scalar(select(User).where(User.id == booking.guest_id))
    await db.commit()
    if guest:
        try:
            send_review_request_email.apply_async(args=[guest.email, guest.full_name, booking.booking_ref], countdown=7200)
        except Exception:
            pass
    return {"status": booking.status, "extra_km_charged": money(booking.extra_km_charged)}


@router.get("/")
async def list_bookings(
    as_role: str = Query(default="guest", pattern="^(guest|host)$"),
    status_filter: str | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=50),
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    conditions = [Booking.guest_id == current_user.id] if as_role == "guest" else [Booking.host_id == current_user.id]
    if status_filter:
        statuses = [item.strip() for item in status_filter.split(",") if item.strip()]
        conditions.append(Booking.status.in_(statuses))
    if start_date:
        conditions.append(Booking.pickup_datetime >= start_date)
    if end_date:
        conditions.append(Booking.return_datetime <= end_date)
    total = await db.scalar(select(func.count()).select_from(Booking).where(*conditions)) or 0
    rows = (await db.execute(select(Booking).where(*conditions).order_by(Booking.created_at.desc()).offset((page - 1) * limit).limit(limit))).scalars().all()
    items = []
    for booking in rows:
        car = await _load_car(db, booking.car_id)
        image = await _primary_image(db, car.id)
        counterparty_id = booking.host_id if as_role == "guest" else booking.guest_id
        counterparty = await db.scalar(select(User).where(User.id == counterparty_id))
        payment = await db.scalar(select(Payment).where(Payment.booking_id == booking.id))
        items.append(_booking_payload(booking, car, image, counterparty, payment))
    pages = math.ceil(total / limit) if total else 0
    return {"bookings": items, "total": total, "page": page, "pages": pages, "has_next": page < pages}


@router.get("/{booking_id}")
async def get_booking(booking_id: str, current_user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    booking = await _booking_with_access(booking_id, current_user, db)
    car = await _load_car(db, booking.car_id)
    image = await _primary_image(db, car.id)
    counterparty_id = booking.host_id if current_user.id == booking.guest_id else booking.guest_id
    counterparty = await db.scalar(select(User).where(User.id == counterparty_id))
    payment = await db.scalar(select(Payment).where(Payment.booking_id == booking.id))
    reviews = await get_booking_reviews(booking.id)
    payload = _booking_payload(booking, car, image, counterparty, payment)
    payload["has_reviewed"] = any(review.get("reviewer_id") == current_user.id for review in reviews)
    return payload


@router.post("/{booking_id}/extend", status_code=status.HTTP_201_CREATED)
async def extend_booking(booking_id: str, payload: ExtendRequest, current_user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    booking = await _booking_with_access(booking_id, current_user, db)
    if booking.guest_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the guest can request an extension")
    if booking.status != "active":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only active bookings can be extended")
    if payload.new_return_datetime <= booking.return_datetime:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New return datetime must be later than current return")
    conflict = await db.scalar(
        select(func.count()).select_from(Booking).where(Booking.car_id == booking.car_id, Booking.id != booking.id, Booking.pickup_datetime < payload.new_return_datetime, Booking.return_datetime > booking.return_datetime, Booking.status.in_(BLOCKING_STATUSES))
    )
    if conflict:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Car has another booking during the extension period")
    car = await _load_car(db, booking.car_id)
    extra_hours = (payload.new_return_datetime - booking.return_datetime).total_seconds() / 3600
    additional_amount = Decimal(str(round(extra_hours * money(car.price_per_hour), 2)))
    extension = BookingExtension(booking_id=booking.id, extended_return_datetime=payload.new_return_datetime, additional_amount=additional_amount)
    db.add(extension)
    await db.commit()
    await db.refresh(extension)
    await create_notification(booking.host_id, "Extension requested", f"{booking.booking_ref} has an extension request.", "booking", action_url="/host/bookings", meta={"booking_id": booking.id, "extension_id": extension.id})
    return {"extension_id": extension.id, "status": extension.status, "additional_amount": money(additional_amount)}


@router.patch("/extensions/{extension_id}/respond")
async def respond_extension(extension_id: str, payload: ExtensionResponse, current_user: User = Depends(require_host), db: AsyncSession = Depends(get_db)):
    extension = await db.scalar(select(BookingExtension).where(BookingExtension.id == extension_id))
    if extension is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Extension not found")
    booking = await _booking_with_access(extension.booking_id, current_user, db)
    if booking.host_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the host can respond")
    if extension.status != "pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Extension already responded")
    extension.status = "approved" if payload.approved else "rejected"
    extension.responded_at = datetime.utcnow()
    if payload.approved:
        booking.return_datetime = extension.extended_return_datetime
    await db.commit()
    await create_notification(booking.guest_id, "Extension response", f"Your extension was {extension.status}.", "booking", action_url=f"/dashboard/bookings/{booking.id}", meta={"booking_id": booking.id, "extension_id": extension.id})
    return {"status": extension.status}
