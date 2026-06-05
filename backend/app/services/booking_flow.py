from datetime import datetime, timedelta
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking
from app.models.vehicle import Vehicle
from app.models.payment import Payment, UserWallet, WalletTransaction
from app.models.user import User
from app.mongo_models.notification import create_notification
from app.tasks.email_tasks import send_booking_confirmation_email
from app.tasks.maintenance_tasks import send_trip_reminder_task
from app.utils import email as email_utils

BLOCKING_STATUSES = ("pending", "confirmed", "active")


def money(value) -> float:
    return float(value or 0)


def transaction_id() -> str:
    return f"SIM_TXN_{uuid4().hex[:12].upper()}"


async def get_or_create_wallet(db: AsyncSession, user_id: str) -> UserWallet:
    wallet = await db.scalar(select(UserWallet).where(UserWallet.user_id == user_id))
    if wallet is None:
        wallet = UserWallet(user_id=user_id, balance=Decimal("0.00"))
        db.add(wallet)
        await db.flush()
    return wallet


async def sync_vehicle_availability(db: AsyncSession, vehicle_id: str) -> None:
    """
    Set is_available=False when all units are booked, True when slots free up.
    Called after any booking status change that affects the active booking count.
    """
    car = await db.scalar(select(Vehicle).where(Vehicle.id == vehicle_id))
    if car is None:
        return
    total_units = car.total_units or 1
    active_count = await db.scalar(
        select(func.count()).select_from(Booking).where(
            Booking.vehicle_id == vehicle_id,
            Booking.status.in_(BLOCKING_STATUSES),
        )
    ) or 0
    should_be_available = active_count < total_units
    if car.is_available != should_be_available:
        car.is_available = should_be_available


async def complete_booking_lifecycle(
    db: AsyncSession,
    booking: Booking,
    completed_at: datetime | None = None,
) -> None:
    """Close a paid trip and release money exactly once when status changes to completed."""
    if booking.status == "completed":
        return

    now = completed_at or datetime.utcnow()
    booking.status = "completed"
    booking.actual_pickup_time = booking.actual_pickup_time or booking.pickup_datetime
    booking.actual_return_time = booking.actual_return_time or now

    customer_wallet = await get_or_create_wallet(db, booking.customer_id)
    customer_wallet.balance = Decimal(str(customer_wallet.balance)) + Decimal(str(booking.security_deposit_amount))
    add_wallet_transaction(
        db,
        booking.customer_id,
        "credit",
        booking.security_deposit_amount,
        customer_wallet.balance,
        f"Security deposit released for {booking.booking_ref}",
        booking.id,
    )

    manager_wallet = await get_or_create_wallet(db, booking.manager_id)
    manager_wallet.balance = Decimal(str(manager_wallet.balance)) + Decimal(str(booking.manager_earnings))
    add_wallet_transaction(
        db,
        booking.manager_id,
        "credit",
        booking.manager_earnings,
        manager_wallet.balance,
        f"Vehicle Manager earning for {booking.booking_ref}",
        booking.id,
    )

    car = await db.scalar(select(Vehicle).where(Vehicle.id == booking.vehicle_id))
    if car:
        car.total_trips += 1


async def sync_booking_lifecycle(
    db: AsyncSession,
    bookings: list[Booking],
    now: datetime | None = None,
) -> bool:
    """
    Bring booking statuses in line with time and payment state.

    - confirmed + paid + pickup reached -> active
    - active + return passed -> completed
    - confirmed + unpaid + pickup passed -> cancelled
    """
    now = now or datetime.utcnow()
    changed = False
    touched_vehicle_ids: set[str] = set()

    for booking in bookings:
        payment = await db.scalar(select(Payment).where(Payment.booking_id == booking.id))

        if booking.status == "confirmed" and booking.manager_accepted_at:
            car = await db.scalar(select(Vehicle).where(Vehicle.id == booking.vehicle_id))
            paid_at = payment.paid_at if payment else None
            accepted_at = booking.manager_accepted_at
            auto_created = booking.created_at and abs((accepted_at - booking.created_at).total_seconds()) <= 2
            auto_paid = paid_at and abs((accepted_at - paid_at).total_seconds()) <= 2
            if car and car.auto_accept_bookings and (auto_created or auto_paid):
                booking.status = "pending"
                booking.manager_accepted_at = None
                touched_vehicle_ids.add(booking.vehicle_id)
                changed = True
                continue

        if booking.status not in {"confirmed", "active"}:
            continue

        is_paid = bool(payment and payment.status == "paid")

        if booking.status == "confirmed" and not is_paid and booking.pickup_datetime <= now:
            booking.status = "cancelled"
            booking.cancellation_reason = "[EXPIRED] Payment not completed before pickup"
            booking.cancelled_at = now
            booking.cancelled_by = booking.customer_id
            booking.refund_status = "not_applicable"
            touched_vehicle_ids.add(booking.vehicle_id)
            changed = True
            await create_notification(
                booking.customer_id,
                "Booking expired",
                f"Booking {booking.booking_ref} expired because payment was not completed before pickup.",
                "booking",
                action_url=f"/dashboard/bookings/{booking.id}",
                meta={"booking_id": booking.id},
            )
            continue

        if not is_paid:
            continue

        if booking.return_datetime <= now:
            await complete_booking_lifecycle(db, booking, booking.return_datetime)
            touched_vehicle_ids.add(booking.vehicle_id)
            changed = True
            await create_notification(
                booking.customer_id,
                "Trip completed",
                f"Your trip {booking.booking_ref} has been marked completed.",
                "booking",
                action_url=f"/dashboard/bookings/{booking.id}",
                meta={"booking_id": booking.id},
            )
        elif booking.status == "confirmed" and booking.pickup_datetime <= now:
            booking.status = "active"
            booking.actual_pickup_time = booking.actual_pickup_time or booking.pickup_datetime
            touched_vehicle_ids.add(booking.vehicle_id)
            changed = True
            await create_notification(
                booking.manager_id,
                "Trip active",
                f"Booking {booking.booking_ref} is now active.",
                "booking",
                action_url="/manager/trips/active",
                meta={"booking_id": booking.id},
            )

    if changed:
        await db.flush()
        for vehicle_id in touched_vehicle_ids:
            await sync_vehicle_availability(db, vehicle_id)
    return changed


def add_wallet_transaction(
    db: AsyncSession,
    user_id: str,
    transaction_type: str,
    amount,
    balance_after,
    description: str,
    reference_id: str | None = None,
) -> WalletTransaction:
    txn = WalletTransaction(
        user_id=user_id,
        transaction_type=transaction_type,
        amount=Decimal(str(amount)),
        balance_after=Decimal(str(balance_after)),
        description=description,
        reference_id=reference_id,
    )
    db.add(txn)
    return txn


def booking_email_payload(booking: Booking, car: Vehicle) -> dict:
    return {
        "booking_id": booking.id,
        "booking_ref": booking.booking_ref,
        "vehicle_name": car.title,
        "pickup_date": booking.pickup_datetime.strftime("%d %b %Y, %I:%M %p"),
        "return_date": booking.return_datetime.strftime("%d %b %Y, %I:%M %p"),
        "location": car.location_address or f"{car.location_area or ''}, {car.location_city}".strip(", "),
        "total_amount": f"{money(booking.total_amount):,.2f}",
        "with_chauffeur": booking.with_chauffeur,
        "chauffeur_fee": money(booking.chauffeur_fee),
    }


async def queue_booking_confirmation(to_email: str, payload: dict) -> None:
    try:
        send_booking_confirmation_email.delay(to_email, payload)
    except Exception:
        await email_utils.send_booking_confirmation_email(to_email, payload)


async def mark_payment_paid(
    db: AsyncSession,
    booking: Booking,
    payment: Payment,
    car: Vehicle,
    customer: User,
    manager: User,
    payment_method: str = "simulated",
    debit_wallet: bool = False,
) -> str:
    txn_id = transaction_id()
    payment.status = "paid"
    payment.payment_method = payment_method
    payment.paid_at = datetime.utcnow()
    payment.simulated_transaction_id = txn_id

    if debit_wallet:
        customer_wallet = await get_or_create_wallet(db, customer.id)
        customer_wallet.balance = Decimal(str(customer_wallet.balance)) - Decimal(str(payment.amount))
        add_wallet_transaction(
            db,
            customer.id,
            "debit",
            payment.amount,
            customer_wallet.balance,
            f"Booking payment {booking.booking_ref}",
            booking.id,
        )

    manager_wallet = await get_or_create_wallet(db, manager.id)
    add_wallet_transaction(
        db,
        manager.id,
        "credit",
        booking.manager_earnings,
        manager_wallet.balance,
        f"Pending manager earning for {booking.booking_ref}",
        booking.id,
    )

    payload = booking_email_payload(booking, car)
    await queue_booking_confirmation(customer.email, payload)
    await queue_booking_confirmation(manager.email, payload)
    try:
        reminder_at = booking.pickup_datetime - timedelta(hours=2)
        countdown = max(int((reminder_at - datetime.utcnow()).total_seconds()), 0)
        send_trip_reminder_task.apply_async(args=[booking.id], countdown=countdown)
    except Exception:
        pass
    if booking.status == "pending":
        title = "Payment successful"
        message = f"Payment for {booking.booking_ref} is complete. Your booking is pending manager approval."
    else:
        title = "Payment successful"
        message = f"Your booking {booking.booking_ref} is confirmed."
    await create_notification(
        customer.id,
        title,
        message,
        "payment",
        action_url=f"/dashboard/bookings/{booking.id}",
        meta={"booking_id": booking.id, "transaction_id": txn_id},
    )
    return txn_id
