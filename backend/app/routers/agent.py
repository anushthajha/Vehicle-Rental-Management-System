from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.daily_brief_agent import get_ist_today, get_or_generate_daily_brief
from app.database import get_db
from app.models.user import User
from app.mongodb import get_mongo_db
from app.utils.auth import get_current_active_user

router = APIRouter(prefix="/agent", tags=["agent"])


@router.get("/daily-brief")
async def get_daily_brief(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    brief = await get_or_generate_daily_brief(current_user, db)
    if brief is None:
        return {"summary": None}
    return brief


@router.post("/daily-brief/seen")
async def mark_brief_seen(current_user: User = Depends(get_current_active_user)):
    await get_mongo_db().agent_daily_briefs.update_one(
        {"user_id": str(current_user.id), "date": get_ist_today()},
        {
            "$set": {
                "seen": True,
                "seen_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )
    return {"success": True}
