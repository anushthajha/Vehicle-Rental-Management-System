import re
from datetime import datetime, timedelta


PHONE_RE = re.compile(r"^\d{10}$")
REGISTRATION_RE = re.compile(r"^[A-Z]{2}\d{2}[A-Z]{1,2}\d{4}$")
IFSC_RE = re.compile(r"^[A-Z]{4}0[A-Z0-9]{6}$")


def validate_phone(phone: str) -> str:
    normalized = phone.strip().replace(" ", "").replace("-", "")
    if normalized.startswith("+91"):
        normalized = normalized[3:]
    if not PHONE_RE.match(normalized):
        raise ValueError("Phone must be a 10 digit Indian mobile number")
    return normalized


def validate_registration_number(reg: str) -> str:
    normalized = re.sub(r"[\s-]+", "", reg or "").upper()
    if not REGISTRATION_RE.match(normalized):
        raise ValueError("Registration number must match Indian format, e.g. KA01MN1234")
    return normalized


def validate_ifsc(ifsc: str) -> str:
    normalized = (ifsc or "").strip().upper()
    if not IFSC_RE.match(normalized):
        raise ValueError("IFSC must be 11 characters: first 4 letters, 0, then 6 alphanumeric characters")
    return normalized


def validate_aadhar(aadhar: str) -> str:
    normalized = re.sub(r"\s+", "", aadhar or "")
    if not normalized.isdigit() or len(normalized) != 12:
        raise ValueError("Aadhaar number must be exactly 12 digits")
    return normalized


def validate_booking_dates(pickup: datetime, return_dt: datetime) -> None:
    if pickup.tzinfo is not None:
        from datetime import timezone
        pickup = pickup.astimezone(timezone.utc).replace(tzinfo=None)
    if return_dt.tzinfo is not None:
        from datetime import timezone
        return_dt = return_dt.astimezone(timezone.utc).replace(tzinfo=None)
    if return_dt <= pickup:
        raise ValueError("Return date must be after pickup date")
    if pickup < datetime.utcnow() + timedelta(hours=1):
        raise ValueError("Pickup must be at least 1 hour from now")
    if return_dt - pickup > timedelta(days=30):
        raise ValueError("Rental duration cannot exceed 30 days")
