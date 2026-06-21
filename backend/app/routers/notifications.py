from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.models.user import User
from app.mongodb import get_mongo_db
from app.mongo_models.notification import delete_notification, get_unread_count, get_user_notifications, mark_all_read, mark_notification_read
from app.utils.auth import get_current_active_user


router = APIRouter(prefix="/notifications", tags=["notifications"])

VALID_TYPES = {"booking", "payment", "review", "kyc", "promotion", "system", "manager"}


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
    unread_count = await get_unread_count(current_user.id)
    return {
        "notifications": items,
        "total": total,
        "total_unread": unread_count,
        "page": page,
        "pages": pages,
        "has_next": page < pages,
        "has_more": page < pages,
        "unread_count": unread_count,
    }


@router.get("/unread-count")
async def unread_count(current_user: User = Depends(get_current_active_user)):
    count = await get_unread_count(current_user.id)
    return {"count": count}


async def _mark_read(notification_id: str, current_user: User) -> dict:
    exists = await get_mongo_db().notifications.find_one({"_id": _object_id(notification_id), "user_id": current_user.id})
    if exists is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    await mark_notification_read(notification_id)
    return {"is_read": True}


@router.patch("/{notification_id}/read")
async def mark_read(notification_id: str, current_user: User = Depends(get_current_active_user)):
    return await _mark_read(notification_id, current_user)


@router.post("/{notification_id}/read")
async def mark_read_legacy(notification_id: str, current_user: User = Depends(get_current_active_user)):
    return await _mark_read(notification_id, current_user)


@router.patch("/mark-all-read")
async def mark_all_notifications_read(current_user: User = Depends(get_current_active_user)):
    await mark_all_read(current_user.id)
    return {"message": "All notifications marked as read", "unread_count": 0}


@router.post("/mark-all-read")
async def mark_all_notifications_read_legacy(current_user: User = Depends(get_current_active_user)):
    return await mark_all_notifications_read(current_user)


@router.delete("/all")
async def delete_all_notifications(current_user: User = Depends(get_current_active_user)):
    """Delete all notifications for the current user."""
    result = await get_mongo_db().notifications.delete_many({"user_id": current_user.id})
    return {"message": f"Deleted {result.deleted_count} notifications"}


@router.delete("/{notification_id}")
async def delete_user_notification(notification_id: str, current_user: User = Depends(get_current_active_user)):
    exists = await get_mongo_db().notifications.find_one({"_id": _object_id(notification_id), "user_id": current_user.id})
    if exists is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    await delete_notification(notification_id)
    return {"message": "Notification deleted"}
