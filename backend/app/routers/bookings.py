import math
import random
import string
from datetime import datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.rate_limiter import rate_limit
from app.models.booking import Booking, BookingExtension
from app.models.vehicle import Vehicle, VehicleImage, VehiclePricingRule
from app.models.coupon import Coupon, CouponUsage
from app.models.manager import ManagerProfile
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
from app.services.availability import AvailabilityService
from app.services.pricing import calculate_booking_price
from app.services.super_manager import check_and_update_super_manager
from app.tasks.email_tasks import send_booking_cancelled_email, send_booking_request_to_manager_email
from app.tasks.maintenance_tasks import send_review_request_task
from app.utils.auth import get_current_active_user, require_customer, require_vehicle_manager, require_kyc_user
from app.utils.validators import validate_booking_dates


router = APIRouter(prefix="/bookings", tags=["bookings"])

BLOCKING_STATUSES = ("confirmed", "active", "pending")


class BookingPreviewRequest(BaseModel):
    vehicle_id: str
    pickup_datetime: datetime
    return_datetime: datetime
    insurance_plan: str = "standard"
    coupon_code: str | None = None

    @field_validator("pickup_datetime", "return_datetime", mode="before")
    @classmethod
    def require_datetime_with_time(cls, value):
        if isinstance(value, str):
            normalized = value.replace("Z", "+00:00")
            if "T" not in normalized and " " not in normalized:
                raise ValueError("ISO8601 datetime with time is required")
            datetime.fromisoformat(normalized)
        return value

    @model_validator(mode="after")
    def dates_are_valid(self):
        validate_booking_dates(self.pickup_datetime, self.return_datetime)
        return self


class BookingCreateRequest(BookingPreviewRequest):
    customer_notes: str | None = Field(default=None, max_length=1000)


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


def _validation_error(field: str, message: str, code: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"detail": "VALIDATION_ERROR", "field": field, "message": message, "code": code})


async def _load_car(db: AsyncSession, vehicle_id: str) -> Vehicle:
    car = await db.scalar(select(Vehicle).where(Vehicle.id == vehicle_id))
    if car is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found")
    return car


async def _attach_pricing_rules(db: AsyncSession, car: Vehicle) -> None:
    rules = (await db.execute(select(VehiclePricingRule).where(VehiclePricingRule.vehicle_id == car.id))).scalars().all()
    setattr(car, "pricing_rules", rules)


async def _primary_image(db: AsyncSession, vehicle_id: str) -> str | None:
    return await db.scalar(
        select(VehicleImage.image_url)
        .where(VehicleImage.vehicle_id == vehicle_id)
        .order_by(VehicleImage.is_primary.desc(), VehicleImage.order_index.asc())
        .limit(1)
    )


async def _validate_dates(car: Vehicle, pickup: datetime, return_at: datetime) -> None:
    if return_at <= pickup:
        raise _validation_error("return_date", "Return date must be after pickup date", "INVALID_RANGE")
    if pickup < datetime.utcnow() + timedelta(hours=1):
        raise _validation_error("pickup_date", "Pickup must be at least 1 hour from now", "PAST_DATE")
    hours = AvailabilityService.calculate_rental_duration(pickup, return_at)["total_hours"]
    if hours < car.min_trip_hours:
        raise _validation_error("return_date", f"Trip must be at least {car.min_trip_hours} hours", "TOO_SHORT")
    if hours / 24 > car.max_trip_days:
        raise _validation_error("return_date", f"Trip cannot exceed {car.max_trip_days} days", "TOO_LONG")


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
        previous = await db.scalar(select(func.count()).select_from(Booking).where(Booking.customer_id == user.id))
        if previous:
            return None, "Coupon is only for new users"
    return coupon, None


async def _price_breakdown(db: AsyncSession, car: Vehicle, payload: BookingPreviewRequest, user: User | None = None) -> tuple[dict, Coupon | None, str | None]:
    await _attach_pricing_rules(db, car)
    raw = calculate_booking_price(car, payload.pickup_datetime, payload.return_datetime, payload.insurance_plan, payload.coupon_code)
    coupon, coupon_error = await _validate_coupon(db, payload.coupon_code, user, raw["base_amount"])
    breakdown = calculate_booking_price(car, payload.pickup_datetime, payload.return_datetime, payload.insurance_plan, payload.coupon_code, coupon)
    breakdown["duration"] = AvailabilityService.calculate_rental_duration(payload.pickup_datetime, payload.return_datetime)
    return breakdown, coupon, coupon_error


async def _ensure_available(db: AsyncSession, car: Vehicle, pickup: datetime, return_at: datetime, customer_id: str | None = None) -> None:
    available, reason = await AvailabilityService.check_vehicle_available(car.id, pickup, return_at, db)
    if not available:
        raise _validation_error("pickup_date", reason, "OVERLAP_CONFLICT")
    if customer_id:
        customer_conflict = await db.scalar(
            select(func.count()).select_from(Booking).where(Booking.customer_id == customer_id, Booking.status.in_(BLOCKING_STATUSES), Booking.pickup_datetime < return_at, Booking.return_datetime > pickup)
        )
        if customer_conflict:
            raise _validation_error("pickup_date", "You already have a booking during this time", "CUSTOMER_OVERLAP")


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
    if current_user.id not in {booking.customer_id, booking.manager_id} and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed to access this booking")
    return booking


async def _payment_for(db: AsyncSession, booking_id: str) -> Payment:
    payment = await db.scalar(select(Payment).where(Payment.booking_id == booking_id))
    if payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    return payment


def _booking_payload(booking: Booking, car: Vehicle, image: str | None, counterparty: User | None = None, payment: Payment | None = None) -> dict:
    return {
        "id": booking.id,
        "booking_ref": booking.booking_ref,
        "customer_id": booking.customer_id,
        "manager_id": booking.manager_id,
        "status": booking.status,
        "created_at": _dt(booking.created_at),
        "pickup_datetime": _dt(booking.pickup_datetime),
        "return_datetime": _dt(booking.return_datetime),
        "duration": AvailabilityService.calculate_rental_duration(booking.pickup_datetime, booking.return_datetime),
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
        "manager_earnings": money(booking.manager_earnings),
        "extra_km_charged": money(booking.extra_km_charged),
        "refund_amount": money(booking.refund_amount),
        "refund_status": booking.refund_status,
        "customer_notes": booking.customer_notes,
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
    car = await _load_car(db, payload.vehicle_id)
    await _validate_dates(car, payload.pickup_datetime, payload.return_datetime)
    available, reason = await AvailabilityService.check_vehicle_available(car.id, payload.pickup_datetime, payload.return_datetime, db)
    if not available:
        raise _validation_error("pickup_date", reason, "OVERLAP_CONFLICT")
    breakdown, _, coupon_error = await _price_breakdown(db, car, payload)
    return {"price_breakdown": breakdown, "coupon_error": coupon_error}


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_booking(
    payload: BookingCreateRequest,
    _: None = Depends(rate_limit("bookings_create", 5, 60, "user_or_ip")),
    current_user: User = Depends(require_kyc_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in {"customer", "admin"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Customer access required.")
    car = await _load_car(db, payload.vehicle_id)
    await _validate_dates(car, payload.pickup_datetime, payload.return_datetime)
    await _ensure_available(db, car, payload.pickup_datetime, payload.return_datetime, current_user.id)
    breakdown, coupon, coupon_error = await _price_breakdown(db, car, payload, current_user)
    if coupon_error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=coupon_error)

    ref = await _booking_ref(db)
    booking = Booking(
        booking_ref=ref,
        vehicle_id=car.id,
        customer_id=current_user.id,
        manager_id=car.manager_id,
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
        manager_earnings=Decimal(str(breakdown["manager_earnings"])),
        customer_notes=payload.customer_notes,
        manager_accepted_at=datetime.utcnow() if car.auto_accept_bookings else None,
    )
    db.add(booking)
    await db.flush()

    if coupon:
        db.add(CouponUsage(coupon_id=coupon.id, user_id=current_user.id, booking_id=booking.id))
        coupon.used_count += 1

    payment = Payment(booking_id=booking.id, user_id=current_user.id, amount=booking.total_amount, payment_method="simulated", status="created")
    db.add(payment)
    manager = await db.scalar(select(User).where(User.id == car.manager_id))
    image = await _primary_image(db, car.id)

    if car.auto_accept_bookings and manager:
        await mark_payment_paid(db, booking, payment, car, current_user, manager)

    await db.commit()

    if manager:
        notify_payload = booking_email_payload(booking, car) | {"customer_name": current_user.full_name}
        try:
            send_booking_request_to_manager_email.delay(manager.email, notify_payload)
        except Exception:
            pass
        await create_notification(manager.id, "New booking request", f"{current_user.full_name} requested {car.title}.", "booking", action_url="/manager/bookings", meta={"booking_id": booking.id})
    await create_notification(current_user.id, "Booking request submitted", f"Booking {booking.booking_ref} was created.", "booking", action_url=f"/dashboard/bookings/{booking.id}", meta={"booking_id": booking.id})

    return {
        "booking_id": booking.id,
        "booking_ref": booking.booking_ref,
        "status": booking.status,
        "price_breakdown": breakdown,
        "vehicle_name": car.title,
        "car_primary_image": image,
        "requires_payment": not car.auto_accept_bookings,
    }


@router.post("/{booking_id}/simulate-payment")
async def simulate_payment(booking_id: str, current_user: User = Depends(require_customer), db: AsyncSession = Depends(get_db)):
    booking = await _booking_with_access(booking_id, current_user, db)
    if booking.customer_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the customer can pay for this booking")
    car = await _load_car(db, booking.vehicle_id)
    if not (booking.status == "confirmed" or (booking.status == "pending" and car.auto_accept_bookings)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Booking is not ready for payment")
    payment = await _payment_for(db, booking.id)
    if payment.status != "created":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payment is not payable")
    manager = await db.scalar(select(User).where(User.id == booking.manager_id))
    txn_id = await mark_payment_paid(db, booking, payment, car, current_user, manager)
    await db.commit()
    return {"success": True, "booking_ref": booking.booking_ref, "transaction_id": txn_id, "message": "Payment successful. Booking confirmed!"}


@router.patch("/{booking_id}/accept")
async def accept_booking(booking_id: str, current_user: User = Depends(require_vehicle_manager), db: AsyncSession = Depends(get_db)):
    booking = await _booking_with_access(booking_id, current_user, db)
    if booking.manager_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the manager can accept this booking")
    if booking.status != "pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending bookings can be accepted")
    booking.status = "confirmed"
    booking.manager_accepted_at = datetime.utcnow()
    await db.commit()
    await create_notification(booking.customer_id, "Booking accepted", "Your booking request was accepted! Complete payment to confirm.", "booking", action_url=f"/booking/pay/{booking.id}", meta={"booking_id": booking.id})
    return {"status": booking.status}


@router.patch("/{booking_id}/reject")
async def reject_booking(booking_id: str, payload: RejectRequest, current_user: User = Depends(require_vehicle_manager), db: AsyncSession = Depends(get_db)):
    booking = await _booking_with_access(booking_id, current_user, db)
    if booking.manager_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the manager can reject this booking")
    if booking.status != "pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending bookings can be rejected")
    booking.status = "rejected"
    booking.cancellation_reason = payload.reason
    payment = await db.scalar(select(Payment).where(Payment.booking_id == booking.id))
    if payment and payment.status == "paid":
        booking.refund_status = "pending"
    await db.commit()
    await create_notification(booking.customer_id, "Booking rejected", payload.reason, "booking", action_url=f"/dashboard/bookings/{booking.id}", meta={"booking_id": booking.id})
    return {"status": booking.status}


@router.post("/{booking_id}/cancel")
async def cancel_booking(booking_id: str, payload: CancelRequest, current_user: User = Depends(require_customer), db: AsyncSession = Depends(get_db)):
    booking = await _booking_with_access(booking_id, current_user, db)
    if booking.status in {"cancelled", "completed", "rejected"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Booking cannot be cancelled")
    payment = await db.scalar(select(Payment).where(Payment.booking_id == booking.id))
    is_manager_cancel = False
    refund = Decimal("0.00")
    if payment and payment.status == "paid":
        hours_to_pickup = (booking.pickup_datetime - datetime.utcnow()).total_seconds() / 3600
        if is_manager_cancel:
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
        wallet = await get_or_create_wallet(db, booking.customer_id)
        wallet.balance = Decimal(str(wallet.balance)) + refund
        add_wallet_transaction(db, booking.customer_id, "credit", refund, wallet.balance, f"Refund for {booking.booking_ref}", booking.id)
    if is_manager_cancel:
        profile = await db.scalar(select(ManagerProfile).where(ManagerProfile.user_id == booking.manager_id))
        if profile:
            profile.acceptance_rate = max(Decimal("0.00"), Decimal(str(profile.acceptance_rate)) - Decimal("2.00"))
    car = await _load_car(db, booking.vehicle_id)
    customer = await db.scalar(select(User).where(User.id == booking.customer_id))
    manager = await db.scalar(select(User).where(User.id == booking.manager_id))
    await db.commit()
    for user in [customer, manager]:
        if user:
            await create_notification(user.id, "Booking cancelled", f"{booking.booking_ref} was cancelled.", "booking", action_url=f"/dashboard/bookings/{booking.id}", meta={"booking_id": booking.id, "refund_amount": money(refund)})
            try:
                send_booking_cancelled_email.delay(user.email, booking_email_payload(booking, car), money(refund))
            except Exception:
                pass
    return {"status": booking.status, "refund_amount": money(refund), "refund_status": booking.refund_status}


@router.patch("/{booking_id}/start-trip")
async def start_trip(booking_id: str, payload: StartTripRequest, current_user: User = Depends(require_vehicle_manager), db: AsyncSession = Depends(get_db)):
    booking = await _booking_with_access(booking_id, current_user, db)
    if booking.manager_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the manager can start this trip")
    if booking.status != "confirmed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only confirmed bookings can be started")
    booking.status = "active"
    booking.actual_pickup_time = datetime.utcnow()
    booking.odometer_start = payload.odometer_start
    await db.commit()
    return {"status": booking.status}


@router.patch("/{booking_id}/end-trip")
async def end_trip(booking_id: str, payload: EndTripRequest, current_user: User = Depends(require_vehicle_manager), db: AsyncSession = Depends(get_db)):
    booking = await _booking_with_access(booking_id, current_user, db)
    if booking.manager_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the manager can end this trip")
    if booking.status != "active":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only active trips can be ended")
    if booking.odometer_start is not None and payload.odometer_end < booking.odometer_start:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ending odometer must be greater than starting odometer")
    car = await _load_car(db, booking.vehicle_id)
    days = max(math.ceil(money(booking.total_hours) / 24), 1)
    allowed_km = car.included_km_per_day * days
    actual_km = max((payload.odometer_end - (booking.odometer_start or payload.odometer_end)), 0)
    extra_km = max(actual_km - allowed_km, 0)
    booking.extra_km_charged = Decimal(str(extra_km)) * Decimal(str(car.extra_km_charge))
    booking.status = "completed"
    booking.actual_return_time = datetime.utcnow()
    booking.odometer_end = payload.odometer_end
    customer_wallet = await get_or_create_wallet(db, booking.customer_id)
    customer_wallet.balance = Decimal(str(customer_wallet.balance)) + Decimal(str(booking.security_deposit_amount))
    add_wallet_transaction(db, booking.customer_id, "credit", booking.security_deposit_amount, customer_wallet.balance, f"Security deposit released for {booking.booking_ref}", booking.id)
    manager_wallet = await get_or_create_wallet(db, booking.manager_id)
    manager_wallet.balance = Decimal(str(manager_wallet.balance)) + Decimal(str(booking.manager_earnings))
    add_wallet_transaction(db, booking.manager_id, "credit", booking.manager_earnings, manager_wallet.balance, f"Vehicle Manager earning for {booking.booking_ref}", booking.id)
    car.total_trips += 1
    profile = await db.scalar(select(ManagerProfile).where(ManagerProfile.user_id == booking.manager_id))
    if profile:
        profile.acceptance_rate = min(Decimal("100.00"), max(Decimal(str(profile.acceptance_rate)), Decimal("95.00")))
    customer = await db.scalar(select(User).where(User.id == booking.customer_id))
    await check_and_update_super_manager(booking.manager_id, db)
    await db.commit()
    if customer:
        try:
            send_review_request_task.apply_async(args=[booking.id], countdown=7200)
        except Exception:
            pass
    return {"status": booking.status, "extra_km_charged": money(booking.extra_km_charged)}


@router.get("/")
async def list_bookings(
    as_role: str = Query(default="customer", pattern="^(customer|vehicle_manager)$"),
    status_filter: str | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=50),
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    if as_role == "customer" and current_user.role not in {"customer", "admin"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Customer access required.")
    if as_role == "vehicle_manager" and current_user.role not in {"vehicle_manager", "admin"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Vehicle Manager access required.")
    conditions = [Booking.customer_id == current_user.id] if as_role == "customer" else [Booking.manager_id == current_user.id]
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
        car = await _load_car(db, booking.vehicle_id)
        image = await _primary_image(db, car.id)
        counterparty_id = booking.manager_id if as_role == "customer" else booking.customer_id
        counterparty = await db.scalar(select(User).where(User.id == counterparty_id))
        payment = await db.scalar(select(Payment).where(Payment.booking_id == booking.id))
        items.append(_booking_payload(booking, car, image, counterparty, payment))
    pages = math.ceil(total / limit) if total else 0
    return {"bookings": items, "total": total, "page": page, "pages": pages, "has_next": page < pages}


@router.get("/{booking_id}")
async def get_booking(booking_id: str, current_user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    booking = await _booking_with_access(booking_id, current_user, db)
    car = await _load_car(db, booking.vehicle_id)
    image = await _primary_image(db, car.id)
    counterparty_id = booking.manager_id if current_user.id == booking.customer_id else booking.customer_id
    counterparty = await db.scalar(select(User).where(User.id == counterparty_id))
    payment = await db.scalar(select(Payment).where(Payment.booking_id == booking.id))
    reviews = await get_booking_reviews(booking.id)
    payload = _booking_payload(booking, car, image, counterparty, payment)
    payload["has_reviewed"] = any(review.get("reviewer_id") == current_user.id for review in reviews)
    return payload


@router.post("/{booking_id}/extend", status_code=status.HTTP_201_CREATED)
async def extend_booking(booking_id: str, payload: ExtendRequest, current_user: User = Depends(require_customer), db: AsyncSession = Depends(get_db)):
    booking = await _booking_with_access(booking_id, current_user, db)
    if booking.customer_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the customer can request an extension")
    if booking.status != "active":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only active bookings can be extended")
    if payload.new_return_datetime <= booking.return_datetime:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New return datetime must be later than current return")
    car = await _load_car(db, booking.vehicle_id)
    available, reason = await AvailabilityService.check_vehicle_available(car.id, booking.return_datetime, payload.new_return_datetime, db, exclude_booking_id=booking.id)
    if not available:
        raise _validation_error("return_date", reason, "OVERLAP_CONFLICT")
    extra_hours = (payload.new_return_datetime - booking.return_datetime).total_seconds() / 3600
    additional_amount = Decimal(str(round(extra_hours * money(car.price_per_hour), 2)))
    extension = BookingExtension(booking_id=booking.id, extended_return_datetime=payload.new_return_datetime, additional_amount=additional_amount)
    db.add(extension)
    await db.commit()
    await db.refresh(extension)
    await create_notification(booking.manager_id, "Extension requested", f"{booking.booking_ref} has an extension request.", "booking", action_url="/manager/bookings", meta={"booking_id": booking.id, "extension_id": extension.id})
    return {"extension_id": extension.id, "status": extension.status, "additional_amount": money(additional_amount)}


@router.patch("/extensions/{extension_id}/respond")
async def respond_extension(extension_id: str, payload: ExtensionResponse, current_user: User = Depends(require_vehicle_manager), db: AsyncSession = Depends(get_db)):
    extension = await db.scalar(select(BookingExtension).where(BookingExtension.id == extension_id))
    if extension is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Extension not found")
    booking = await _booking_with_access(extension.booking_id, current_user, db)
    if booking.manager_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the manager can respond")
    if extension.status != "pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Extension already responded")
    extension.status = "approved" if payload.approved else "rejected"
    extension.responded_at = datetime.utcnow()
    if payload.approved:
        booking.return_datetime = extension.extended_return_datetime
    await db.commit()
    await create_notification(booking.customer_id, "Extension response", f"Your extension was {extension.status}.", "booking", action_url=f"/dashboard/bookings/{booking.id}", meta={"booking_id": booking.id, "extension_id": extension.id})
    return {"status": extension.status}
