import calendar
import math
from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking
from app.models.vehicle import Vehicle, VehicleAvailabilityBlock
from app.models.user import User


BLOCKING_BOOKING_STATUSES = ("pending", "confirmed", "active")


class AvailabilityService:
    @staticmethod
    async def check_vehicle_available(
        vehicle_id: str,
        pickup_date: datetime,
        return_date: datetime,
        db: AsyncSession,
        exclude_booking_id: str | None = None,
    ) -> tuple[bool, str]:
        vehicle = await db.scalar(select(Vehicle).where(Vehicle.id == vehicle_id))
        if vehicle is None or not vehicle.is_available:
            return False, "Vehicle not available"
        if not vehicle.is_approved:
            return False, "Vehicle pending approval"

        booking_query = select(Booking.id).where(
            Booking.vehicle_id == vehicle_id,
            Booking.status.in_(BLOCKING_BOOKING_STATUSES),
            Booking.pickup_datetime < return_date,
            Booking.return_datetime > pickup_date,
        )
        if exclude_booking_id:
            booking_query = booking_query.where(Booking.id != exclude_booking_id)
        if await db.scalar(booking_query.limit(1)):
            return False, "Vehicle is booked during this period"

        block = await db.scalar(
            select(VehicleAvailabilityBlock.id)
            .where(
                VehicleAvailabilityBlock.vehicle_id == vehicle_id,
                VehicleAvailabilityBlock.blocked_from < return_date,
                VehicleAvailabilityBlock.blocked_to > pickup_date,
            )
            .limit(1)
        )
        if block:
            return False, "Vehicle blocked during this period"
        return True, "Available"

    @staticmethod
    async def get_vehicle_availability_calendar(vehicle_id: str, year: int, month: int, db: AsyncSession) -> list[dict]:
        days_in_month = calendar.monthrange(year, month)[1]
        month_start = datetime.combine(date(year, month, 1), time.min)
        month_end = datetime.combine(date(year, month, days_in_month), time.max)

        blocks = (
            await db.execute(
                select(VehicleAvailabilityBlock).where(
                    VehicleAvailabilityBlock.vehicle_id == vehicle_id,
                    VehicleAvailabilityBlock.blocked_from < month_end,
                    VehicleAvailabilityBlock.blocked_to > month_start,
                )
            )
        ).scalars().all()
        bookings = (
            await db.execute(
                select(Booking, User.full_name)
                .join(User, User.id == Booking.customer_id)
                .where(
                    Booking.vehicle_id == vehicle_id,
                    Booking.status.in_(BLOCKING_BOOKING_STATUSES),
                    Booking.pickup_datetime < month_end,
                    Booking.return_datetime > month_start,
                )
            )
        ).all()

        days = []
        today = date.today()
        for day_number in range(1, days_in_month + 1):
            current = date(year, month, day_number)
            status = "available"
            booking_id = None
            booking_ref = None
            customer_name = None
            if current < today:
                status = "blocked"
            for block in blocks:
                if block.blocked_from.date() <= current <= block.blocked_to.date():
                    status = "blocked"
                    break
            for booking, customer_name in bookings:
                if booking.pickup_datetime.date() <= current <= booking.return_datetime.date():
                    status = "pending" if booking.status == "pending" else "booked"
                    booking_id = booking.id
                    booking_ref = booking.booking_ref
                    customer_name = customer_name
                    break
            days.append({"date": current.isoformat(), "status": status, "booking_id": booking_id, "booking_ref": booking_ref, "customer_name": customer_name})
        return days

    @staticmethod
    def calculate_rental_duration(pickup_date: datetime, return_date: datetime) -> dict:
        total_hours = max((return_date - pickup_date).total_seconds() / 3600, 0)
        full_days = int(total_hours // 24)
        remaining_hours = round(total_hours - (full_days * 24), 2)
        total_days = math.ceil(total_hours / 24) if total_hours else 0
        parts = []
        if full_days:
            parts.append(f"{full_days} day{'s' if full_days != 1 else ''}")
        if remaining_hours:
            hour_label = int(remaining_hours) if remaining_hours.is_integer() else remaining_hours
            parts.append(f"{hour_label} hour{'s' if remaining_hours != 1 else ''}")
        return {
            "total_hours": round(total_hours, 2),
            "total_days": total_days,
            "full_days": full_days,
            "remaining_hours": remaining_hours,
            "duration_label": " ".join(parts) if parts else "0 hours",
        }

    @staticmethod
    async def get_next_available_date(vehicle_id: str, from_date: datetime, db: AsyncSession) -> datetime:
        cursor = from_date
        conflicts = (
            await db.execute(
                select(Booking.pickup_datetime, Booking.return_datetime)
                .where(Booking.vehicle_id == vehicle_id, Booking.status.in_(BLOCKING_BOOKING_STATUSES), Booking.return_datetime > from_date)
                .order_by(Booking.pickup_datetime.asc())
            )
        ).all()
        blocks = (
            await db.execute(
                select(VehicleAvailabilityBlock.blocked_from, VehicleAvailabilityBlock.blocked_to)
                .where(VehicleAvailabilityBlock.vehicle_id == vehicle_id, VehicleAvailabilityBlock.blocked_to > from_date)
                .order_by(VehicleAvailabilityBlock.blocked_from.asc())
            )
        ).all()
        intervals = sorted([(start, end) for start, end in conflicts + blocks], key=lambda item: item[0])
        for start, end in intervals:
            if cursor < start:
                return cursor
            if start <= cursor < end:
                cursor = end + timedelta(hours=1)
        return cursor

    @staticmethod
    async def get_vehicle_unavailable_dates(vehicle_id: str, months_ahead: int = 3, db: AsyncSession = None) -> list[str]:
        if db is None:
            raise ValueError("db is required")
        start = datetime.utcnow()
        end = start + timedelta(days=months_ahead * 31)
        unavailable: set[str] = set()
        bookings = (
            await db.execute(
                select(Booking.pickup_datetime, Booking.return_datetime).where(
                    Booking.vehicle_id == vehicle_id,
                    Booking.status.in_(BLOCKING_BOOKING_STATUSES),
                    Booking.pickup_datetime < end,
                    Booking.return_datetime > start,
                )
            )
        ).all()
        blocks = (
            await db.execute(
                select(VehicleAvailabilityBlock.blocked_from, VehicleAvailabilityBlock.blocked_to).where(
                    VehicleAvailabilityBlock.vehicle_id == vehicle_id,
                    VehicleAvailabilityBlock.blocked_from < end,
                    VehicleAvailabilityBlock.blocked_to > start,
                )
            )
        ).all()
        for interval_start, interval_end in bookings + blocks:
            current = max(interval_start.date(), start.date())
            last = min(interval_end.date(), end.date())
            while current <= last:
                unavailable.add(current.isoformat())
                current += timedelta(days=1)
        return sorted(unavailable)
