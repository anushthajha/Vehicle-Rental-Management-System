from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

from app.mongodb import get_mongo_db


class ReviewDoc(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    booking_id: str
    reviewer_id: str
    reviewer_name: str
    reviewer_photo: Optional[str] = None
    reviewee_id: Optional[str] = None
    vehicle_id: Optional[str] = None
    rating: int = Field(ge=1, le=5)
    title: Optional[str] = None
    body: Optional[str] = None
    review_type: Literal["customer_to_vehicle", "customer_to_manager", "manager_to_customer"]
    is_published: bool = True
    manager_reply: Optional[str] = None
    manager_replied_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    car_snapshot: dict = Field(default_factory=dict)
    trip_snapshot: dict = Field(default_factory=dict)

    class Config:
        populate_by_name = True


def _serialize_id(doc: dict) -> dict:
    doc["_id"] = str(doc["_id"])
    return doc


async def create_review(data: dict) -> str:
    db = get_mongo_db()
    doc = ReviewDoc(**data)
    existing = await db.reviews.find_one({"booking_id": doc.booking_id, "review_type": doc.review_type})
    if existing:
        raise ValueError("Review already exists for this booking and review type")

    result = await db.reviews.insert_one(doc.model_dump(exclude={"id"}))
    return str(result.inserted_id)


async def get_car_reviews(vehicle_id: str, page: int = 1, limit: int = 10, sort: str = "recent", rating: int | None = None) -> dict:
    db = get_mongo_db()
    query = {"vehicle_id": vehicle_id, "review_type": "customer_to_vehicle", "is_published": True}
    if rating:
        query["rating"] = rating
    skip = max(page - 1, 0) * limit

    sort_map = {
        "recent": ("created_at", -1),
        "oldest": ("created_at", 1),
        "rating_high": ("rating", -1),
        "rating_low": ("rating", 1),
    }
    sort_field, sort_direction = sort_map.get(sort, sort_map["recent"])

    total = await db.reviews.count_documents(query)
    cursor = db.reviews.find(query).sort(sort_field, sort_direction).skip(skip).limit(limit)
    reviews = [_serialize_id(doc) for doc in await cursor.to_list(length=limit)]

    breakdown = {5: 0, 4: 0, 3: 0, 2: 0, 1: 0}
    stats_query = {"vehicle_id": vehicle_id, "review_type": "customer_to_vehicle", "is_published": True}
    stats = await db.reviews.aggregate(
        [
            {"$match": stats_query},
            {"$group": {"_id": "$rating", "count": {"$sum": 1}}},
        ]
    ).to_list(length=5)

    for item in stats:
        rating = int(item["_id"])
        if rating in breakdown:
            breakdown[rating] = item["count"]

    avg_rating = 0.0
    if total:
        avg_rating = round(sum(rating * count for rating, count in breakdown.items()) / total, 2)

    return {
        "reviews": reviews,
        "total": total,
        "avg_rating": avg_rating,
        "rating_breakdown": breakdown,
        "has_more": skip + len(reviews) < total,
    }


async def get_user_reviews(user_id: str, review_type: str = "received") -> list[dict]:
    db = get_mongo_db()
    if review_type == "given":
        query = {"reviewer_id": user_id, "is_published": True}
    elif review_type == "received":
        query = {"reviewee_id": user_id, "is_published": True}
    elif review_type in {"customer_to_vehicle", "customer_to_manager", "manager_to_customer"}:
        query = {
            "review_type": review_type,
            "is_published": True,
            "$or": [{"reviewer_id": user_id}, {"reviewee_id": user_id}],
        }
    else:
        raise ValueError("review_type must be 'received', 'given', or a valid review type")

    cursor = db.reviews.find(query).sort("created_at", -1)
    docs = await cursor.to_list(length=None)
    return [_serialize_id(doc) for doc in docs]


async def add_manager_reply(booking_id: str, reply: str, manager_id: str) -> bool:
    db = get_mongo_db()
    result = await db.reviews.update_many(
        {
            "booking_id": booking_id,
            "review_type": {"$in": ["customer_to_vehicle", "customer_to_manager"]},
            "$or": [
                {"reviewee_id": manager_id},
                {"reviewee_id": None},
                {"reviewee_id": {"$exists": False}},
            ],
        },
        {"$set": {"manager_reply": reply, "manager_replied_at": datetime.utcnow()}},
    )
    return result.modified_count > 0


async def get_booking_reviews(booking_id: str) -> list[dict]:
    cursor = get_mongo_db().reviews.find({"booking_id": booking_id}).sort("created_at", 1)
    docs = await cursor.to_list(length=None)
    return [_serialize_id(doc) for doc in docs]


async def update_car_avg_rating(vehicle_id: str) -> float:
    pipeline = [
        {"$match": {"vehicle_id": vehicle_id, "review_type": "customer_to_vehicle", "is_published": True}},
        {"$group": {"_id": "$vehicle_id", "avg_rating": {"$avg": "$rating"}}},
    ]
    stats = await get_mongo_db().reviews.aggregate(pipeline).to_list(length=1)
    if not stats:
        return 0.0
    return round(float(stats[0]["avg_rating"]), 2)
