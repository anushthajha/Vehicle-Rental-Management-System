import asyncio
from datetime import datetime, timedelta

from sqlalchemy import select

from app.celery_app import celery_app
from app.database import async_session_maker
from app.models.booking import Booking
from app.models.manager import ManagerProfile
from app.models.payment import Payment
from app.models.user import User
from app.mongo_models.notification import create_notification
from app.services.super_manager import check_and_update_super_manager
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
            customer = await db.scalar(select(User).where(User.id == booking.customer_id))
            if customer:
                send_review_request_email.delay(customer.email, customer.full_name, booking.booking_ref)

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
                booking.cancellation_reason = "Vehicle Manager did not respond"
                booking.cancelled_at = datetime.utcnow()
                booking.cancelled_by = booking.manager_id
                payment = await db.scalar(select(Payment).where(Payment.booking_id == booking.id))
                if payment and payment.status == "paid":
                    payment.status = "refunded"
                    booking.refund_amount = booking.total_amount
                    booking.refund_status = "processed"
                await create_notification(
                    booking.customer_id,
                    "Booking cancelled",
                    f"Booking {booking.booking_ref} was cancelled because the manager did not respond.",
                    "booking",
                    action_url=f"/dashboard/bookings/{booking.id}",
                    meta={"booking_id": booking.id},
                )
                cancelled += 1
            await db.commit()
        return cancelled

    return _run(_task())


@celery_app.task(name="app.tasks.maintenance.update_super_manager_status")
def update_super_manager_status() -> int:
    async def _task() -> int:
        updated = 0
        async with async_session_maker() as db:
            profiles = (await db.execute(select(ManagerProfile))).scalars().all()
            for profile in profiles:
                was_super_manager = profile.is_super_manager
                await check_and_update_super_manager(profile.user_id, db)
                if profile.is_super_manager != was_super_manager:
                    updated += 1
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
            customer = await db.scalar(select(User).where(User.id == booking.customer_id))
            if customer:
                payload = {
                    "booking_ref": booking.booking_ref,
                    "pickup_datetime": booking.pickup_datetime.isoformat(),
                    "return_datetime": booking.return_datetime.isoformat(),
                }
                send_trip_reminder_email.delay(customer.email, payload)
                await create_notification(
                    customer.id,
                    "Trip reminder",
                    f"Your trip {booking.booking_ref} starts soon.",
                    "booking",
                    action_url=f"/dashboard/bookings/{booking.id}",
                    meta={"booking_id": booking.id},
                )

    _run(_task())
