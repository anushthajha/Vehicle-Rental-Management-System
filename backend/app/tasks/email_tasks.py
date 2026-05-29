import asyncio

from app.celery_app import celery_app
from app.utils import email


def _run(coro) -> None:
    asyncio.run(coro)


@celery_app.task(name="app.tasks.email.send_verification_email")
def send_verification_email(to_email: str, full_name: str, token: str) -> None:
    _run(email.send_verification_email(to_email, full_name, token))


@celery_app.task(name="app.tasks.email.send_password_reset_email")
def send_password_reset_email(to_email: str, full_name: str, token: str) -> None:
    _run(email.send_password_reset_email(to_email, full_name, token))


@celery_app.task(name="app.tasks.email.send_booking_confirmation_email")
def send_booking_confirmation_email(to_email: str, booking: dict) -> None:
    _run(email.send_booking_confirmation_email(to_email, booking))


@celery_app.task(name="app.tasks.email.send_damage_penalty_email")
def send_damage_penalty_email(to_email: str, booking: dict) -> None:
    _run(email.send_damage_penalty_email(to_email, booking))


@celery_app.task(name="app.tasks.email.send_booking_request_to_manager_email")
def send_booking_request_to_manager_email(to_email: str, booking: dict) -> None:
    _run(email.send_booking_request_to_manager_email(to_email, booking))


@celery_app.task(name="app.tasks.email.send_booking_cancelled_email")
def send_booking_cancelled_email(to_email: str, booking: dict, refund_amount: float) -> None:
    _run(email.send_booking_cancelled_email(to_email, booking, refund_amount))


@celery_app.task(name="app.tasks.email.send_kyc_approved_email")
def send_kyc_approved_email(to_email: str, full_name: str) -> None:
    _run(email.send_kyc_approved_email(to_email, full_name))


@celery_app.task(name="app.tasks.email.send_kyc_submission_confirmation")
def send_kyc_submission_confirmation(to_email: str, full_name: str) -> None:
    _run(email.send_kyc_submission_confirmation(to_email, full_name))


@celery_app.task(name="app.tasks.email.send_kyc_rejected_email")
def send_kyc_rejected_email(to_email: str, full_name: str, reason: str) -> None:
    _run(email.send_kyc_rejected_email(to_email, full_name, reason))


@celery_app.task(name="app.tasks.email.send_trip_reminder_email")
def send_trip_reminder_email(to_email: str, booking: dict) -> None:
    _run(email.send_trip_reminder_email(to_email, booking))


@celery_app.task(name="app.tasks.email.send_review_request_email")
def send_review_request_email(to_email: str, full_name: str, booking_ref: str) -> None:
    _run(email.send_review_request_email(to_email, full_name, booking_ref))


@celery_app.task(name="app.tasks.email.send_manager_payout_email")
def send_manager_payout_email(to_email: str, amount: float) -> None:
    _run(email.send_manager_payout_email(to_email, amount))


@celery_app.task(name="app.tasks.email.send_manager_welcome_email")
def send_manager_welcome_email(to_email: str, full_name: str, password: str) -> None:
    _run(email.send_manager_welcome_email(to_email, full_name, password))


@celery_app.task(name="app.tasks.email.send_manager_role_update_email")
def send_manager_role_update_email(to_email: str, full_name: str, subject: str, message: str) -> None:
    _run(email.send_manager_role_update_email(to_email, full_name, subject, message))


@celery_app.task(name="app.tasks.email.send_support_reply_email")
def send_support_reply_email(to_email: str, full_name: str, subject: str, reply_message: str) -> None:
    _run(email.send_support_reply_email(to_email, full_name, subject, reply_message))


@celery_app.task(name="app.tasks.email.send_vehicle_approved_email")
def send_vehicle_approved_email(to_email: str, full_name: str, vehicle_title: str, city: str) -> None:
    _run(email.send_vehicle_approved_email(to_email, full_name, vehicle_title, city))


@celery_app.task(name="app.tasks.email.send_vehicle_rejected_email")
def send_vehicle_rejected_email(to_email: str, full_name: str, vehicle_title: str, reason: str) -> None:
    _run(email.send_vehicle_rejected_email(to_email, full_name, vehicle_title, reason))
