from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

from app.mongodb import get_mongo_db


class SupportMessageDoc(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    ticket_id: str
    sender_id: str
    sender_name: str
    sender_role: Literal["user", "admin", "staff"]
    message: str
    attachment_url: Optional[str] = None
    is_staff_reply: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True


def _serialize_id(doc: dict) -> dict:
    doc["_id"] = str(doc["_id"])
    return doc


async def add_support_message(
    ticket_id: str,
    sender_id: str,
    sender_name: str,
    sender_role: str,
    message: str,
    attachment_url: str | None = None,
) -> str:
    db = get_mongo_db()
    doc = SupportMessageDoc(
        ticket_id=ticket_id,
        sender_id=sender_id,
        sender_name=sender_name,
        sender_role=sender_role,
        message=message,
        attachment_url=attachment_url,
        is_staff_reply=sender_role in {"admin", "staff"},
    )
    result = await db.support_messages.insert_one(doc.model_dump(exclude={"id"}))
    return str(result.inserted_id)


async def get_ticket_messages(ticket_id: str) -> list[dict]:
    cursor = get_mongo_db().support_messages.find({"ticket_id": ticket_id}).sort("created_at", 1)
    docs = await cursor.to_list(length=None)
    return [_serialize_id(doc) for doc in docs]
