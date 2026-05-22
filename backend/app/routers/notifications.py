from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.models.user import User
from app.mongodb import get_mongo_db
from app.mongo_models.notification import get_unread_count, get_user_notifications, mark_all_read
from app.utils.auth import get_current_active_user


router = APIRouter(prefix="/notifications", tags=["notifications"])

VALID_TYPES = {"booking", "payment", "review", "kyc", "promotion", "system", "host"}


def _object_id(notification_id: str) -> ObjectId:
    try:
        return ObjectId(notification_id)
    except InvalidId as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found") from exc


@router.get("")
async def list_notifications(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=50),
    filter_type: str = Query(default="all", alias="type"),
    current_user: User = Depends(get_current_active_user),
):
    if filter_type == "all":
        items = await get_user_notifications(current_user.id, page, limit)
        total = await get_mongo_db().notifications.count_documents({"user_id": current_user.id})
    else:
        query = {"user_id": current_user.id}
        if filter_type == "unread":
            query["is_read"] = False
        elif filter_type in VALID_TYPES:
            query["notification_type"] = filter_type
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid notification filter")
        skip = (page - 1) * limit
        cursor = get_mongo_db().notifications.find(query).sort("created_at", -1).skip(skip).limit(limit)
        items = await cursor.to_list(length=limit)
        for item in items:
            item["_id"] = str(item["_id"])
        total = await get_mongo_db().notifications.count_documents(query)
    pages = (total + limit - 1) // limit if total else 0
    return {
        "notifications": items,
        "total": total,
        "page": page,
        "pages": pages,
        "has_next": page < pages,
        "unread_count": await get_unread_count(current_user.id),
    }


@router.post("/{notification_id}/read")
async def mark_read(notification_id: str, current_user: User = Depends(get_current_active_user)):
    result = await get_mongo_db().notifications.update_one(
        {"_id": _object_id(notification_id), "user_id": current_user.id},
        {"$set": {"is_read": True}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    return {"is_read": True}


@router.post("/mark-all-read")
async def mark_all_notifications_read(current_user: User = Depends(get_current_active_user)):
    await mark_all_read(current_user.id)
    return {"message": "All notifications marked as read", "unread_count": 0}
