from datetime import datetime, timedelta
from typing import Optional

from pydantic import BaseModel, Field

from app.mongodb import get_mongo_db


class CarViewEventDoc(BaseModel):
    car_id: str
    user_id: Optional[str] = None
    city: str
    source: str = "search"
    created_at: datetime = Field(default_factory=datetime.utcnow)


class SearchLogDoc(BaseModel):
    user_id: Optional[str] = None
    city: str
    filters: dict = Field(default_factory=dict)
    results_count: int
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ActivityFeedDoc(BaseModel):
    actor_id: str
    action: str
    entity_type: str
    entity_id: str
    payload: dict = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)


def _serialize_id(doc: dict) -> dict:
    doc["_id"] = str(doc["_id"])
    return doc


async def log_car_view(car_id: str, user_id: Optional[str], city: str, source: str = "search") -> None:
    """Log every car detail page view. Used for popularity ranking."""
    db = get_mongo_db()
    doc = CarViewEventDoc(car_id=car_id, user_id=user_id, city=city, source=source)
    await db.car_view_events.insert_one(doc.model_dump())


async def get_car_view_count(car_id: str, days: int = 30) -> int:
    since = datetime.utcnow() - timedelta(days=days)
    return await get_mongo_db().car_view_events.count_documents(
        {"car_id": car_id, "created_at": {"$gte": since}},
    )


async def log_search(user_id: Optional[str], city: str, filters: dict, results_count: int) -> None:
    doc = SearchLogDoc(user_id=user_id, city=city, filters=filters, results_count=results_count)
    await get_mongo_db().search_logs.insert_one(doc.model_dump())


async def log_activity(
    actor_id: str,
    action: str,
    entity_type: str,
    entity_id: str,
    payload: dict | None = None,
) -> None:
    """Admin activity feed: who did what."""
    doc = ActivityFeedDoc(
        actor_id=actor_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        payload=payload or {},
    )
    await get_mongo_db().activity_feed.insert_one(doc.model_dump())


async def get_admin_activity_feed(page: int = 1, limit: int = 50) -> list[dict]:
    skip = max(page - 1, 0) * limit
    cursor = get_mongo_db().activity_feed.find().sort("created_at", -1).skip(skip).limit(limit)
    docs = await cursor.to_list(length=limit)
    return [_serialize_id(doc) for doc in docs]


async def get_city_search_trends(days: int = 30) -> list[dict]:
    """Top searched cities."""
    since = datetime.utcnow() - timedelta(days=days)
    pipeline = [
        {"$match": {"created_at": {"$gte": since}}},
        {"$group": {"_id": "$city", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
    ]
    return await get_mongo_db().search_logs.aggregate(pipeline).to_list(length=10)
