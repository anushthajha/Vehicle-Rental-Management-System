import json
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.booking import Booking
from app.models.user import User
from app.models.vehicle import Vehicle
from app.redis import get_redis
from app.services.availability import AvailabilityService
from app.services.pricing import calculate_booking_price
from app.utils.auth import verify_token

router = APIRouter(prefix="/vehicles", tags=["availability"])
optional_oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)
BLOCKING_STATUSES = ("confirmed", "active", "pending")


def _parse_iso(value: str) -> datetime:
    try:
      return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError as exc:
      raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ISO8601 datetime") from exc


async def _optional_user(
    token: str | None = Depends(optional_oauth2),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    if not token:
        return None
    try:
        payload = await verify_token(token)
    except HTTPException:
        return None
    if payload.get("type") != "access":
        return None
    return await db.scalar(select(User).where(User.id == payload.get("sub"), User.is_active.is_(True)))


@router.get("/{vehicle_id}/availability")
async def vehicle_availability(vehicle_id: str, year: int = Query(...), month: int = Query(..., ge=1, le=12), db: AsyncSession = Depends(get_db)):
    cache_key = f"availability:{vehicle_id}:{year}:{month}"
    redis = get_redis()
    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)
    days = await AvailabilityService.get_vehicle_availability_calendar(vehicle_id, year, month, db)
    payload = {"vehicle_id": vehicle_id, "year": year, "month": month, "days": days}
    await redis.set(cache_key, json.dumps(payload), ex=60)
    return payload


@router.get("/{vehicle_id}/availability/check")
async def check_availability(
    vehicle_id: str,
    pickup_date: str,
    return_date: str,
    insurance_plan: str = "standard",
    current_user: User | None = Depends(_optional_user),
    db: AsyncSession = Depends(get_db),
):
    pickup = _parse_iso(pickup_date)
    return_at = _parse_iso(return_date)
    if return_at <= pickup:
        return {"available": False, "reason": "Return date must be after pickup date"}
    car = await db.scalar(select(Vehicle).where(Vehicle.id == vehicle_id))
    if not car:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found")
    duration = AvailabilityService.calculate_rental_duration(pickup, return_at)
    min_trip_hours = car.min_trip_hours if car.min_trip_hours and car.min_trip_hours > 0 else 4
    max_trip_days = car.max_trip_days if car.max_trip_days and car.max_trip_days > 0 else 30
    if duration["total_hours"] < min_trip_hours:
        return {"available": False, "reason": f"Trip must be at least {min_trip_hours} hours"}
    if duration["total_hours"] / 24 > max_trip_days:
        return {"available": False, "reason": f"Trip cannot exceed {max_trip_days} day{'s' if max_trip_days != 1 else ''}"}
    available, reason = await AvailabilityService.check_vehicle_available(vehicle_id, pickup, return_at, db)
    if available and current_user and current_user.role == "customer":
        customer_conflict = await db.scalar(
            select(func.count()).select_from(Booking).where(
                Booking.customer_id == current_user.id,
                Booking.status.in_(BLOCKING_STATUSES),
                Booking.pickup_datetime < return_at,
                Booking.return_datetime > pickup,
            )
        )
        if customer_conflict:
            available = False
            reason = "You already have a booking during this time"
    response = {"available": available, "reason": reason}
    if available:
        breakdown = calculate_booking_price(car, pickup, return_at, insurance_plan)
        breakdown["duration"] = duration
        response["price_breakdown"] = breakdown
    else:
        response["next_available_date"] = (await AvailabilityService.get_next_available_date(vehicle_id, return_at, db)).isoformat()
    return response


@router.get("/{vehicle_id}/availability/next-available")
async def next_available(vehicle_id: str, from_date: str | None = None, db: AsyncSession = Depends(get_db)):
    start = _parse_iso(from_date) if from_date else datetime.utcnow()
    next_date = await AvailabilityService.get_next_available_date(vehicle_id, start, db)
    return {"next_available_date": next_date.isoformat(), "message": f"Next available from {next_date.strftime('%d %b %Y, %I:%M %p')}"}


@router.get("/{vehicle_id}/unavailable-dates")
async def unavailable_dates(vehicle_id: str, from_date: str | None = None, to_date: str | None = None, db: AsyncSession = Depends(get_db)):
    start = _parse_iso(from_date) if from_date else datetime.utcnow()
    end = _parse_iso(to_date) if to_date else start + timedelta(days=90)
    months = max(1, int((end - start).days / 31) + 1)
    dates = await AvailabilityService.get_vehicle_unavailable_dates(vehicle_id, months, db)
    dates = [item for item in dates if start.date().isoformat() <= item <= end.date().isoformat()]
    return {"unavailable_dates": dates}
