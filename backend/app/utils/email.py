from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html import escape

import aiosmtplib

from app.config import settings


BRAND_RED = "#E31837"


def _button(url: str, label: str) -> str:
    return (
        f'<a href="{escape(url)}" style="display:inline-block;background:{BRAND_RED};'
        'color:#ffffff;text-decoration:none;font-weight:700;padding:14px 22px;'
        'border-radius:6px;margin:18px 0;">'
        f"{escape(label)}</a>"
    )


def _layout(title: str, body: str) -> str:
    return f"""
    <html>
      <body style="margin:0;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;color:#111827;">
        <table width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
          <tr>
            <td align="center">
              <table width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
                <tr>
                  <td style="background:{BRAND_RED};color:#ffffff;padding:22px 28px;font-size:24px;font-weight:800;">SigFleet</td>
                </tr>
                <tr>
                  <td style="padding:30px 28px;">
                    <h1 style="margin:0 0 14px;font-size:24px;line-height:1.25;color:#111827;">{escape(title)}</h1>
                    <div style="font-size:16px;line-height:1.65;color:#374151;">{body}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 28px;background:#f9fafb;color:#6b7280;font-size:13px;">
                    This is an automated SigFleet message. If you did not request this, you can ignore it.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
    """


async def _send_html_email(to_email: str, subject: str, html: str) -> None:
    message = MIMEMultipart("alternative")
    message["From"] = settings.SMTP_FROM
    message["To"] = to_email
    message["Subject"] = subject
    message.attach(MIMEText(html, "html"))

    await aiosmtplib.send(
        message,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USER,
        password=settings.SMTP_PASSWORD,
        start_tls=True,
    )


async def send_verification_email(to_email: str, full_name: str, token: str) -> None:
    url = f"{settings.FRONTEND_URL}/auth/verify-email?token={token}"
    body = (
        f"<p>Hi {escape(full_name)}, welcome to SigFleet. Verify your email to finish setting up your account.</p>"
        f"{_button(url, 'Verify email')}"
        "<p>This verification link expires in 24 hours.</p>"
    )
    await _send_html_email(to_email, "Verify your SigFleet account", _layout("Verify your account", body))


async def send_password_reset_email(to_email: str, full_name: str, token: str) -> None:
    url = f"{settings.FRONTEND_URL}/auth/reset-password?token={token}"
    body = (
        f"<p>Hi {escape(full_name)}, use the secure link below to reset your SigFleet password.</p>"
        f"{_button(url, 'Reset password')}"
        "<p>This reset link expires in 2 hours.</p>"
    )
    await _send_html_email(to_email, "Reset your SigFleet password", _layout("Reset your password", body))


async def send_booking_confirmation_email(to_email: str, booking: dict) -> None:
    ref = booking.get("booking_ref", "")
    body = _booking_details(booking)
    await _send_html_email(to_email, f"Booking Confirmed — {ref}", _layout("Booking confirmed", body))


async def send_booking_request_to_host_email(to_email: str, booking: dict) -> None:
    car_title = booking.get("car_title", "your car")
    url = f"{settings.FRONTEND_URL}/manager/dashboard"
    body = (
        f"<p>You have a new booking request for <strong>{escape(car_title)}</strong>.</p>"
        f"<p><strong>Guest:</strong> {escape(str(booking.get('guest_name', 'Guest')))}</p>"
        f"{_booking_details(booking)}"
        f"{_button(url, 'Open manager dashboard')}"
    )
    await _send_html_email(to_email, f"New Booking Request — {car_title}", _layout("New booking request", body))


async def send_booking_cancelled_email(to_email: str, booking: dict, refund_amount: float) -> None:
    ref = booking.get("booking_ref", "")
    body = _booking_details(booking) + f"<p><strong>Refund amount:</strong> ₹{refund_amount:,.2f}</p>"
    await _send_html_email(to_email, f"Booking Cancelled — {ref}", _layout("Booking cancelled", body))


async def send_kyc_approved_email(to_email: str, full_name: str) -> None:
    body = f"<p>Hi {escape(full_name)}, your KYC is verified. You're ready to book your next SigFleet trip.</p>"
    await _send_html_email(to_email, "KYC Verified ✓ — You're ready to book", _layout("KYC verified", body))


async def send_kyc_submission_confirmation(to_email: str, full_name: str) -> None:
    body = (
        f"<p>Hi {escape(full_name)}, we received your KYC documents.</p>"
        "<p>Our team will review them within 24 hours and notify you as soon as verification is complete.</p>"
    )
    await _send_html_email(to_email, "KYC submitted — Review in progress", _layout("KYC under review", body))


async def send_kyc_rejected_email(to_email: str, full_name: str, reason: str) -> None:
    body = (
        f"<p>Hi {escape(full_name)}, we need a little more information to verify your KYC.</p>"
        f"<p><strong>Reason:</strong> {escape(reason)}</p>"
    )
    await _send_html_email(to_email, "KYC Verification — Action Required", _layout("KYC action required", body))


async def send_trip_reminder_email(to_email: str, booking: dict) -> None:
    body = "<p>Your trip starts in 2 hours. Please keep your driving licence and booking details handy.</p>"
    body += _booking_details(booking)
    await _send_html_email(to_email, "Your trip starts in 2 hours!", _layout("Trip reminder", body))


async def send_review_request_email(to_email: str, full_name: str, booking_ref: str) -> None:
    url = f"{settings.FRONTEND_URL}/bookings/{booking_ref}/review"
    body = (
        f"<p>Hi {escape(full_name)}, how was your SigFleet trip?</p>"
        f"{_button(url, 'Leave a review')}"
    )
    await _send_html_email(to_email, "How was your SigFleet trip?", _layout("Share your trip feedback", body))


async def send_host_payout_email(to_email: str, amount: float) -> None:
    body = f"<p>Your host payout of <strong>₹{amount:,.2f}</strong> has been processed.</p>"
    await _send_html_email(to_email, f"Payout Processed — ₹{amount:,.2f}", _layout("Payout processed", body))


def _booking_details(booking: dict) -> str:
    return f"""
    <p><strong>Car:</strong> {escape(str(booking.get("car_title", booking.get("car_name", ""))))}</p>
    <p><strong>Pickup:</strong> {escape(str(booking.get("pickup_date", "")))}</p>
    <p><strong>Return:</strong> {escape(str(booking.get("return_date", "")))}</p>
    <p><strong>Location:</strong> {escape(str(booking.get("location", "")))}</p>
    <p><strong>Total amount:</strong> ₹{escape(str(booking.get("total_amount", "")))}</p>
    <p><strong>Booking ref:</strong> {escape(str(booking.get("booking_ref", "")))}</p>
    """
