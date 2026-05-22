from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo.errors import OperationFailure

from app.config import settings


_mongo_client: Optional[AsyncIOMotorClient] = None
_mongo_db: Optional[AsyncIOMotorDatabase] = None


async def connect_mongo() -> None:
    global _mongo_client, _mongo_db
    _mongo_client = AsyncIOMotorClient(settings.MONGODB_URL)
    _mongo_db = _mongo_client[settings.MONGODB_DB_NAME]
    await _mongo_client.admin.command("ping")
    await _create_indexes()


async def disconnect_mongo() -> None:
    global _mongo_client, _mongo_db
    if _mongo_client:
        _mongo_client.close()
    _mongo_client = None
    _mongo_db = None


def get_mongo_db() -> AsyncIOMotorDatabase:
    if _mongo_db is None:
        raise RuntimeError("MongoDB is not connected")
    return _mongo_db


async def _create_indexes() -> None:
    db = get_mongo_db()
    # notifications: fast lookup by user_id + is_read
    await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
    await db.notifications.create_index([("user_id", 1), ("is_read", 1)])
    # reviews: lookup by car_id, booking_id; one review per booking/review_type pair
    await db.reviews.create_index([("car_id", 1), ("created_at", -1)])
    try:
        review_indexes = await db.reviews.index_information()
        for name, details in review_indexes.items():
            if details.get("key") == [("booking_id", 1)] and details.get("unique"):
                await db.reviews.drop_index(name)
    except OperationFailure:
        pass
    await db.reviews.create_index([("booking_id", 1), ("review_type", 1)], unique=True)
    await db.reviews.create_index([("reviewer_id", 1)])
    # support_messages: by ticket_id
    await db.support_messages.create_index([("ticket_id", 1), ("created_at", 1)])
    # car_view_events: by car_id, by city, TTL 90 days
    await db.car_view_events.create_index("created_at", expireAfterSeconds=7776000)
    await db.car_view_events.create_index([("car_id", 1)])
    # activity_feed: TTL 180 days
    await db.activity_feed.create_index("created_at", expireAfterSeconds=15552000)
    await db.activity_feed.create_index([("actor_id", 1)])
    # search_logs: by user_id, TTL 30 days
    await db.search_logs.create_index("created_at", expireAfterSeconds=2592000)
    await db.search_logs.create_index([("user_id", 1)])
    # user_sessions: by user_id, TTL 30 days
    await db.user_sessions.create_index("created_at", expireAfterSeconds=2592000)
    await db.user_sessions.create_index([("user_id", 1)])
