from datetime import datetime
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking
from app.models.car import Car
from app.models.payment import Payment, UserWallet, WalletTransaction
from app.models.user import User
from app.mongo_models.notification import create_notification
from app.tasks.email_tasks import send_booking_confirmation_email


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


def booking_email_payload(booking: Booking, car: Car) -> dict:
    return {
        "booking_ref": booking.booking_ref,
        "car_title": car.title,
        "pickup_date": booking.pickup_datetime.strftime("%d %b %Y, %I:%M %p"),
        "return_date": booking.return_datetime.strftime("%d %b %Y, %I:%M %p"),
        "location": car.location_address or f"{car.location_area or ''}, {car.location_city}".strip(", "),
        "total_amount": f"{money(booking.total_amount):,.2f}",
    }


def queue_booking_confirmation(to_email: str, payload: dict) -> None:
    try:
        send_booking_confirmation_email.delay(to_email, payload)
    except Exception:
        pass


async def mark_payment_paid(
    db: AsyncSession,
    booking: Booking,
    payment: Payment,
    car: Car,
    guest: User,
    host: User,
    payment_method: str = "simulated",
    debit_wallet: bool = False,
) -> str:
    txn_id = transaction_id()
    now = datetime.utcnow()
    payment.status = "paid"
    payment.payment_method = payment_method
    payment.paid_at = now
    payment.simulated_transaction_id = txn_id
    if booking.status == "pending" and car.auto_accept_bookings:
        booking.status = "confirmed"
        booking.host_accepted_at = now

    if debit_wallet:
        guest_wallet = await get_or_create_wallet(db, guest.id)
        guest_wallet.balance = Decimal(str(guest_wallet.balance)) - Decimal(str(payment.amount))
        add_wallet_transaction(
            db,
            guest.id,
            "debit",
            payment.amount,
            guest_wallet.balance,
            f"Booking payment {booking.booking_ref}",
            booking.id,
        )

    host_wallet = await get_or_create_wallet(db, host.id)
    add_wallet_transaction(
        db,
        host.id,
        "credit",
        booking.host_earnings,
        host_wallet.balance,
        f"Pending host earning for {booking.booking_ref}",
        booking.id,
    )

    payload = booking_email_payload(booking, car)
    queue_booking_confirmation(guest.email, payload)
    queue_booking_confirmation(host.email, payload)
    await create_notification(
        guest.id,
        "Payment successful",
        f"Your booking {booking.booking_ref} is confirmed.",
        "payment",
        action_url=f"/dashboard/bookings/{booking.id}",
        meta={"booking_id": booking.id, "transaction_id": txn_id},
    )
    return txn_id
