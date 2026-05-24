from datetime import datetime
from typing import Literal, Optional

from bson import ObjectId
from pydantic import BaseModel, Field

from app.mongodb import get_mongo_db


class NotificationDoc(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    user_id: str
    title: str
    message: str
    notification_type: Literal["booking", "payment", "review", "kyc", "promotion", "system", "manager"]
    is_read: bool = False
    action_url: Optional[str] = None
    meta: dict = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True


def _serialize_id(doc: dict) -> dict:
    doc["_id"] = str(doc["_id"])
    return doc


async def create_notification(
    user_id: str,
    title: str,
    message: str,
    notification_type: str,
    action_url: str | None = None,
    meta: dict | None = None,
) -> str:
    db = get_mongo_db()
    doc = NotificationDoc(
        user_id=user_id,
        title=title,
        message=message,
        notification_type=notification_type,
        action_url=action_url,
        meta=meta or {},
    )
    result = await db.notifications.insert_one(doc.model_dump(exclude={"id"}))
    return str(result.inserted_id)


async def get_user_notifications(user_id: str, page: int = 1, limit: int = 20) -> list[dict]:
    db = get_mongo_db()
    skip = max(page - 1, 0) * limit
    cursor = db.notifications.find({"user_id": user_id}).sort("created_at", -1).skip(skip).limit(limit)
    docs = await cursor.to_list(length=limit)
    return [_serialize_id(doc) for doc in docs]


async def get_unread_count(user_id: str) -> int:
    return await get_mongo_db().notifications.count_documents({"user_id": user_id, "is_read": False})


async def mark_notification_read(notification_id: str) -> bool:
    result = await get_mongo_db().notifications.update_one(
        {"_id": ObjectId(notification_id)},
        {"$set": {"is_read": True}},
    )
    return result.modified_count > 0


async def mark_all_read(user_id: str) -> None:
    await get_mongo_db().notifications.update_many(
        {"user_id": user_id, "is_read": False},
        {"$set": {"is_read": True}},
    )


async def delete_notification(notification_id: str) -> None:
    await get_mongo_db().notifications.delete_one({"_id": ObjectId(notification_id)})
