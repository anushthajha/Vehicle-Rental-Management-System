from datetime import datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking
from app.models.host import HostProfile
from app.mongo_models.notification import create_notification


async def check_and_update_superhost(host_id: str, db: AsyncSession) -> bool:
    """
    Superhost criteria:
    1. total completed trips >= 10
    2. average_rating >= 4.7
    3. acceptance_rate >= 85%
    4. no host-initiated cancellations in the last 90 days
    """
    host = await db.scalar(select(HostProfile).where(HostProfile.user_id == host_id))
    if host is None:
        return False

    completed_trips = await db.scalar(
        select(func.count()).select_from(Booking).where(Booking.host_id == host_id, Booking.status == "completed")
    ) or 0
    host_cancellations_90d = await db.scalar(
        select(func.count())
        .select_from(Booking)
        .where(
            Booking.host_id == host_id,
            Booking.status == "cancelled",
            Booking.cancelled_by == host_id,
            Booking.cancelled_at >= datetime.utcnow() - timedelta(days=90),
        )
    ) or 0

    qualifies = (
        completed_trips >= 10
        and Decimal(str(host.average_rating)) >= Decimal("4.70")
        and Decimal(str(host.acceptance_rate)) >= Decimal("85.00")
        and host_cancellations_90d == 0
    )
    if qualifies == host.is_superhost:
        return False

    host.is_superhost = qualifies
    await create_notification(
        host_id,
        "Superhost status updated",
        "You're now a Superhost!" if qualifies else "Your Superhost badge is paused until all criteria are met again.",
        "host",
        action_url="/manager/profile",
        meta={
            "completed_trips": completed_trips,
            "average_rating": float(host.average_rating or 0),
            "acceptance_rate": float(host.acceptance_rate or 0),
            "host_cancellations_90d": host_cancellations_90d,
        },
    )
    return True
