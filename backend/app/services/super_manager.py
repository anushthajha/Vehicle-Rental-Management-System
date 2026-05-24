from datetime import datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking
from app.models.manager import ManagerProfile
from app.mongo_models.notification import create_notification


async def check_and_update_super_manager(manager_id: str, db: AsyncSession) -> bool:
    """
    SuperManager criteria:
    1. total completed trips >= 10
    2. average_rating >= 4.7
    3. acceptance_rate >= 85%
    4. no manager-initiated cancellations in the last 90 days
    """
    manager = await db.scalar(select(ManagerProfile).where(ManagerProfile.user_id == manager_id))
    if manager is None:
        return False

    completed_trips = await db.scalar(
        select(func.count()).select_from(Booking).where(Booking.manager_id == manager_id, Booking.status == "completed")
    ) or 0
    manager_cancellations_90d = await db.scalar(
        select(func.count())
        .select_from(Booking)
        .where(
            Booking.manager_id == manager_id,
            Booking.status == "cancelled",
            Booking.cancelled_by == manager_id,
            Booking.cancelled_at >= datetime.utcnow() - timedelta(days=90),
        )
    ) or 0

    qualifies = (
        completed_trips >= 10
        and Decimal(str(manager.average_rating)) >= Decimal("4.70")
        and Decimal(str(manager.acceptance_rate)) >= Decimal("85.00")
        and manager_cancellations_90d == 0
    )
    if qualifies == manager.is_super_manager:
        return False

    manager.is_super_manager = qualifies
    await create_notification(
        manager_id,
        "SuperManager status updated",
        "You're now a SuperManager!" if qualifies else "Your SuperManager badge is paused until all criteria are met again.",
        "manager",
        action_url="/manager/profile",
        meta={
            "completed_trips": completed_trips,
            "average_rating": float(manager.average_rating or 0),
            "acceptance_rate": float(manager.acceptance_rate or 0),
            "manager_cancellations_90d": manager_cancellations_90d,
        },
    )
    return True
