from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html import escape
import smtplib

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


async def send_email(to: str, subject: str, html_body: str) -> None:
    message = MIMEMultipart("alternative")
    message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM}>"
    message["To"] = to
    message["Subject"] = subject
    message.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.SMTP_FROM, to, message.as_string())
        print(f"[EMAIL] Sent '{subject}' to {to}")
    except Exception as exc:
        print(f"[EMAIL ERROR] {exc} for {to}")
        raise


async def send_otp_email(to_email: str, full_name: str, otp: str) -> None:
    """Send a 6-digit OTP verification email with prominent styled digits."""
    otp_display = "  ".join(list(otp))  # space between digits for readability in plain text
    body = f"""
    <p>Hi {escape(full_name)}, welcome to SigFleet.</p>
    <p>Your email verification code is:</p>
    <div style="margin:24px 0;text-align:center;">
      <span style="display:inline-block;font-size:40px;font-weight:800;letter-spacing:12px;
                   color:{BRAND_RED};font-family:'Courier New',Courier,monospace;
                   background:#FFF5F5;padding:16px 32px;border-radius:8px;
                   border:2px solid #FECACA;">
        {escape(otp)}
      </span>
    </div>
    <p>Enter this code on the verification screen to complete your registration.</p>
    <p>⏱ This code expires in <strong>10 minutes</strong>.</p>
    <p>🔒 Never share this code with anyone.</p>
    <p style="color:#9CA3AF;font-size:14px;">If you didn't register for SigFleet, you can safely ignore this email.</p>
    """
    await send_email(
        to_email,
        f"Your SigFleet verification code: {otp}",
        _layout("Verify your email", body),
    )


async def send_verification_email(to_email: str, full_name: str, token: str) -> None:
    """Legacy link-based verification — kept for backward compatibility."""
    url = f"{settings.FRONTEND_URL}/auth/verify-email?token={token}"
    body = (
        f"<p>Hi {escape(full_name)}, welcome to SigFleet. Verify your email to finish setting up your account.</p>"
        f"{_button(url, 'Verify email')}"
        "<p>This verification link expires in 24 hours.</p>"
    )
    await send_email(to_email, "Verify your SigFleet account", _layout("Verify your account", body))


async def send_password_reset_email(to_email: str, full_name: str, token: str) -> None:
    url = f"{settings.FRONTEND_URL}/auth/reset-password?token={token}"
    body = (
        f"<p>Hi {escape(full_name)}, use the secure link below to reset your SigFleet password.</p>"
        f"{_button(url, 'Reset password')}"
        "<p>This link expires in 1 hour.</p>"
    )
    await send_email(to_email, "Reset your SigFleet password", _layout("Reset your password", body))


async def send_booking_confirmation_email(to_email: str, booking: dict) -> None:
    ref = booking.get("booking_ref", booking.get("booking_id", ""))
    body = _booking_details(booking)
    await send_email(to_email, "Booking Confirmed — SigFleet", _layout("Booking confirmed", body))


async def send_booking_request_to_manager_email(to_email: str, booking: dict) -> None:
    vehicle_name = booking.get("vehicle_name", "your vehicle")
    url = f"{settings.FRONTEND_URL}/manager/dashboard"
    body = (
        f"<p>You have a new booking request for <strong>{escape(vehicle_name)}</strong>.</p>"
        f"<p><strong>Customer:</strong> {escape(str(booking.get('customer_name', 'Customer')))}</p>"
        f"{_booking_details(booking)}"
        f"{_button(url, 'Open manager dashboard')}"
    )
    await send_email(to_email, f"New Booking Request — {vehicle_name}", _layout("New booking request", body))


async def send_booking_cancelled_email(to_email: str, booking: dict, refund_amount: float) -> None:
    ref = booking.get("booking_ref", "")
    body = _booking_details(booking) + f"<p><strong>Refund amount:</strong> ₹{refund_amount:,.2f}</p>"
    await send_email(to_email, f"Booking Cancelled — {ref}", _layout("Booking cancelled", body))


async def send_damage_penalty_email(to_email: str, booking: dict) -> None:
    body = _booking_details(booking)
    body += f"""
    <p><strong>Damage description:</strong> {escape(str(booking.get("damage_description", booking.get("damage_notes", ""))))}</p>
    <p><strong>Penalty amount:</strong> ₹{escape(str(booking.get("penalty_amount", "")))}</p>
    """
    await send_email(to_email, "Damage Penalty Charged — SigFleet", _layout("Damage penalty charged", body))


async def send_kyc_approved_email(to_email: str, full_name: str) -> None:
    body = f"<p>Hi {escape(full_name)}, your KYC is verified. You're ready to book your next SigFleet trip.</p>"
    await send_email(to_email, "KYC Verified — You're ready to book", _layout("KYC verified", body))


async def send_kyc_submission_confirmation(to_email: str, full_name: str) -> None:
    body = (
        f"<p>Hi {escape(full_name)}, we received your KYC documents.</p>"
        "<p>Our team will review them within 24 hours and notify you as soon as verification is complete.</p>"
    )
    await send_email(to_email, "KYC submitted — Review in progress", _layout("KYC under review", body))


async def send_kyc_rejected_email(to_email: str, full_name: str, reason: str) -> None:
    body = (
        f"<p>Hi {escape(full_name)}, we need a little more information to verify your KYC.</p>"
        f"<p><strong>Reason:</strong> {escape(reason)}</p>"
    )
    await send_email(to_email, "KYC Verification — Action Required", _layout("KYC action required", body))


async def send_trip_reminder_email(to_email: str, booking: dict) -> None:
    body = "<p>Your trip starts in 2 hours. Please keep your driving licence and booking details handy.</p>"
    body += _booking_details(booking)
    await send_email(to_email, "Your trip starts in 2 hours!", _layout("Trip reminder", body))


async def send_review_request_email(to_email: str, full_name: str, booking_ref: str) -> None:
    url = f"{settings.FRONTEND_URL}/bookings/{booking_ref}/review"
    body = (
        f"<p>Hi {escape(full_name)}, how was your SigFleet trip?</p>"
        f"{_button(url, 'Leave a review')}"
    )
    await send_email(to_email, "How was your SigFleet trip?", _layout("Share your trip feedback", body))


async def send_manager_payout_email(to_email: str, amount: float) -> None:
    body = f"<p>Your manager payout of <strong>₹{amount:,.2f}</strong> has been processed.</p>"
    await send_email(to_email, f"Payout Processed — ₹{amount:,.2f}", _layout("Payout processed", body))


async def send_manager_welcome_email(to_email: str, full_name: str, password: str) -> None:
    url = f"{settings.FRONTEND_URL}/auth/login"
    body = (
        f"<p>Hi {escape(full_name)}, an administrator created your SigFleet Vehicle Manager account.</p>"
        f"<p><strong>Email:</strong> {escape(to_email)}<br><strong>Temporary password:</strong> {escape(password)}</p>"
        f"{_button(url, 'Open manager dashboard')}"
        "<p>Please change this password after your first login.</p>"
    )
    await send_email(to_email, "Your SigFleet Vehicle Manager account", _layout("Welcome, Vehicle Manager", body))


async def send_manager_role_update_email(to_email: str, full_name: str, subject: str, message: str) -> None:
    body = f"<p>Hi {escape(full_name)},</p><p>{escape(message)}</p>"
    await send_email(to_email, subject, _layout("Vehicle Manager account update", body))


async def send_support_reply_email(to_email: str, full_name: str, subject: str, reply_message: str) -> None:
    url = f"{settings.FRONTEND_URL}/customer/support"
    body = (
        f"<p>Hi {escape(full_name)},</p>"
        f"<p>Our support team replied to your ticket:</p>"
        f"<blockquote style='border-left:3px solid {BRAND_RED};padding-left:12px;margin:16px 0;color:#374151;'>{escape(reply_message)}</blockquote>"
        f"{_button(url, 'View your tickets')}"
    )
    await send_email(to_email, f"SigFleet Support: Update on your ticket", _layout(f"Re: {escape(subject)}", body))


async def send_vehicle_approved_email(to_email: str, full_name: str, vehicle_title: str, city: str) -> None:
    url = f"{settings.FRONTEND_URL}/manager/vehicles"
    body = (
        f"<p>Hi {escape(full_name)},</p>"
        f"<p>Your vehicle <strong>{escape(vehicle_title)}</strong> in {escape(city)} has been approved and is now live for bookings.</p>"
        f"{_button(url, 'View your vehicles')}"
    )
    await send_email(to_email, f"Your vehicle is approved — SigFleet", _layout("Vehicle approved", body))


async def send_vehicle_rejected_email(to_email: str, full_name: str, vehicle_title: str, reason: str) -> None:
    url = f"{settings.FRONTEND_URL}/manager/vehicles"
    body = (
        f"<p>Hi {escape(full_name)},</p>"
        f"<p>Your vehicle <strong>{escape(vehicle_title)}</strong> was not approved.</p>"
        f"<p><strong>Reason:</strong> {escape(reason)}</p>"
        f"<p>Please update the listing and resubmit for review.</p>"
        f"{_button(url, 'Edit vehicle')}"
    )
    await send_email(to_email, f"Vehicle not approved — SigFleet", _layout("Vehicle rejected", body))


def _booking_details(booking: dict) -> str:
    return f"""
    <p><strong>Booking ID:</strong> {escape(str(booking.get("booking_ref", booking.get("booking_id", ""))))}</p>
    <p><strong>Vehicle:</strong> {escape(str(booking.get("vehicle_name", booking.get("car_name", ""))))}</p>
    <p><strong>Pickup:</strong> {escape(str(booking.get("pickup_date", booking.get("pickup_datetime", ""))))}</p>
    <p><strong>Return:</strong> {escape(str(booking.get("return_date", booking.get("return_datetime", ""))))}</p>
    <p><strong>Location:</strong> {escape(str(booking.get("location", "")))}</p>
    <p><strong>Total amount:</strong> ₹{escape(str(booking.get("total_amount", "")))}</p>
    <p><strong>Chauffeur:</strong> {escape("Yes" if booking.get("with_chauffeur") else "No")}</p>
    """
