import asyncio
from datetime import datetime, timedelta
from decimal import Decimal

from sqlalchemy import select

from app.celery_app import celery_app
from app.database import async_session_maker
from app.models.booking import Booking
from app.models.host import HostProfile
from app.models.payment import Payment
from app.models.user import User
from app.mongo_models.notification import create_notification
from app.tasks import email_tasks
from app.tasks.email_tasks import send_review_request_email, send_trip_reminder_email


def _run(coro):
    return asyncio.run(coro)


@celery_app.task(name="app.tasks.maintenance.send_email_task")
def send_email_task(email_type: str, to_email: str, data: dict) -> None:
    routes = {
        "verification": lambda: email_tasks.send_verification_email(to_email, data["full_name"], data["token"]),
        "password_reset": lambda: email_tasks.send_password_reset_email(to_email, data["full_name"], data["token"]),
        "booking_confirmation": lambda: email_tasks.send_booking_confirmation_email(to_email, data),
        "kyc_approved": lambda: email_tasks.send_kyc_approved_email(to_email, data["full_name"]),
        "kyc_rejected": lambda: email_tasks.send_kyc_rejected_email(to_email, data["full_name"], data.get("reason", "")),
        "trip_reminder": lambda: email_tasks.send_trip_reminder_email(to_email, data),
    }
    if email_type not in routes:
        raise ValueError(f"Unknown email_type: {email_type}")
    routes[email_type]()


@celery_app.task(name="app.tasks.maintenance.send_review_request_task")
def send_review_request_task(booking_id: str) -> None:
    async def _task() -> None:
        async with async_session_maker() as db:
            booking = await db.scalar(select(Booking).where(Booking.id == booking_id))
            if booking is None or booking.status != "completed":
                return
            guest = await db.scalar(select(User).where(User.id == booking.guest_id))
            if guest:
                send_review_request_email.delay(guest.email, guest.full_name, booking.booking_ref)

    _run(_task())


@celery_app.task(name="app.tasks.maintenance.auto_cancel_unpaid_bookings")
def auto_cancel_unpaid_bookings() -> int:
    async def _task() -> int:
        cutoff = datetime.utcnow() - timedelta(hours=24)
        cancelled = 0
        async with async_session_maker() as db:
            bookings = (
                await db.execute(
                    select(Booking).where(
                        Booking.status == "pending",
                        Booking.created_at < cutoff,
                    )
                )
            ).scalars().all()
            for booking in bookings:
                booking.status = "cancelled"
                booking.cancellation_reason = "Host did not respond"
                booking.cancelled_at = datetime.utcnow()
                booking.cancelled_by = booking.host_id
                payment = await db.scalar(select(Payment).where(Payment.booking_id == booking.id))
                if payment and payment.status == "paid":
                    payment.status = "refunded"
                    booking.refund_amount = booking.total_amount
                    booking.refund_status = "processed"
                await create_notification(
                    booking.guest_id,
                    "Booking cancelled",
                    f"Booking {booking.booking_ref} was cancelled because the host did not respond.",
                    "booking",
                    action_url=f"/dashboard/bookings/{booking.id}",
                    meta={"booking_id": booking.id},
                )
                cancelled += 1
            await db.commit()
        return cancelled

    return _run(_task())


@celery_app.task(name="app.tasks.maintenance.update_superhost_status")
def update_superhost_status() -> int:
    async def _task() -> int:
        updated = 0
        async with async_session_maker() as db:
            profiles = (await db.execute(select(HostProfile))).scalars().all()
            for profile in profiles:
                was_superhost = profile.is_superhost
                profile.is_superhost = (
                    Decimal(str(profile.average_rating)) >= Decimal("4.70")
                    and profile.total_reviews >= 10
                    and Decimal(str(profile.acceptance_rate)) >= Decimal("90.00")
                    and profile.total_listings >= 1
                )
                if profile.is_superhost != was_superhost:
                    updated += 1
                    await create_notification(
                        profile.user_id,
                        "Superhost status updated",
                        "Your host badge status has been refreshed.",
                        "host",
                        action_url="/host/dashboard",
                    )
            await db.commit()
        return updated

    return _run(_task())


@celery_app.task(name="app.tasks.maintenance.send_trip_reminder_task")
def send_trip_reminder_task(booking_id: str) -> None:
    async def _task() -> None:
        async with async_session_maker() as db:
            booking = await db.scalar(select(Booking).where(Booking.id == booking_id))
            if booking is None or booking.status not in {"confirmed", "active"}:
                return
            guest = await db.scalar(select(User).where(User.id == booking.guest_id))
            if guest:
                payload = {
                    "booking_ref": booking.booking_ref,
                    "pickup_datetime": booking.pickup_datetime.isoformat(),
                    "return_datetime": booking.return_datetime.isoformat(),
                }
                send_trip_reminder_email.delay(guest.email, payload)
                await create_notification(
                    guest.id,
                    "Trip reminder",
                    f"Your trip {booking.booking_ref} starts soon.",
                    "booking",
                    action_url=f"/dashboard/bookings/{booking.id}",
                    meta={"booking_id": booking.id},
                )

    _run(_task())
