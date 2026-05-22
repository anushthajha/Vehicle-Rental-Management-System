from datetime import datetime

from pydantic import BaseModel, Field

from app.mongodb import get_mongo_db


class UserSessionDoc(BaseModel):
    user_id: str
    device_info: str
    ip: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


def _serialize_id(doc: dict) -> dict:
    doc["_id"] = str(doc["_id"])
    return doc


async def create_session(user_id: str, device_info: str, ip: str) -> str:
    doc = UserSessionDoc(user_id=user_id, device_info=device_info, ip=ip)
    result = await get_mongo_db().user_sessions.insert_one(doc.model_dump())
    return str(result.inserted_id)


async def get_user_sessions(user_id: str) -> list[dict]:
    cursor = get_mongo_db().user_sessions.find({"user_id": user_id}).sort("created_at", -1).limit(10)
    docs = await cursor.to_list(length=10)
    return [_serialize_id(doc) for doc in docs]
