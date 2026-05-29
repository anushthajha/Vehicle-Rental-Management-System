from datetime import datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.booking import Booking
from app.models.vehicle import Vehicle, VehicleImage
from app.models.manager import ManagerProfile
from app.models.user import User
from app.mongo_models.analytics import log_activity
from app.mongo_models.notification import create_notification
from app.mongo_models.review import add_manager_reply, create_review, get_booking_reviews, get_car_reviews, get_user_reviews, update_car_avg_rating
from app.mongodb import get_mongo_db
from app.services.booking_flow import money
from app.utils.auth import get_current_active_user, require_verified_user


router = APIRouter(prefix="/reviews", tags=["reviews"])
REVIEW_WINDOW_DAYS = 14


def _serialize_id(doc: dict) -> dict:
    if "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc


class ReviewCreateRequest(BaseModel):
    booking_id: str
    rating: int = Field(ge=1, le=5)
    title: str | None = Field(default=None, max_length=100)
    body: str = Field(min_length=30, max_length=2000)
    review_type: str = Field(pattern="^(customer_to_vehicle|customer_to_manager|manager_to_customer)$")


class ManagerReplyRequest(BaseModel):
    reply: str = Field(min_length=2, max_length=1000)


async def _booking_or_404(db: AsyncSession, booking_id: str) -> Booking:
    booking = await db.scalar(select(Booking).where(Booking.id == booking_id))
    if booking is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    return booking


async def _car_or_404(db: AsyncSession, vehicle_id: str) -> Vehicle:
    car = await db.scalar(select(Vehicle).where(Vehicle.id == vehicle_id))
    if car is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found")
    return car


async def _primary_image(db: AsyncSession, vehicle_id: str) -> str | None:
    return await db.scalar(
        select(VehicleImage.image_url)
        .where(VehicleImage.vehicle_id == vehicle_id)
        .order_by(VehicleImage.is_primary.desc(), VehicleImage.order_index.asc())
        .limit(1)
    )


def _completed_at(booking: Booking) -> datetime | None:
    return booking.actual_return_time or booking.updated_at


def _review_payload(review: dict) -> dict:
    review["id"] = review.get("_id", review.get("id"))
    return review


async def _ensure_review_access(booking: Booking, user: User, review_type: str) -> None:
    if booking.status != "completed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only completed bookings can be reviewed")
    completed_at = _completed_at(booking)
    if completed_at is None or completed_at < datetime.utcnow() - timedelta(days=REVIEW_WINDOW_DAYS):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Review window has closed")
    if user.id == booking.customer_id and review_type not in {"customer_to_vehicle", "customer_to_manager"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Customers can review the car or manager only")
    if user.id == booking.manager_id and review_type != "manager_to_customer":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Vehicle Managers can review the customer only")
    if user.id not in {booking.customer_id, booking.manager_id}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not part of this booking")


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_booking_review(
    payload: ReviewCreateRequest,
    current_user: User = Depends(require_verified_user),
    db: AsyncSession = Depends(get_db),
):
    booking = await _booking_or_404(db, payload.booking_id)
    await _ensure_review_access(booking, current_user, payload.review_type)
    existing = await get_booking_reviews(booking.id)
    if any(review.get("review_type") == payload.review_type for review in existing):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Review already exists for this booking")

    car = await _car_or_404(db, booking.vehicle_id)
    image = await _primary_image(db, car.id)
    reviewee_id = booking.manager_id if payload.review_type in {"customer_to_vehicle", "customer_to_manager"} else booking.customer_id
    review_doc = {
        "booking_id": booking.id,
        "reviewer_id": current_user.id,
        "reviewer_name": current_user.full_name,
        "reviewer_photo": current_user.profile_picture,
        "reviewee_id": reviewee_id,
        "vehicle_id": car.id,
        "rating": payload.rating,
        "title": payload.title,
        "body": payload.body,
        "review_type": payload.review_type,
        "car_snapshot": {
            "title": car.title,
            "make": car.make,
            "model": car.car_model,
            "year": car.year,
            "primary_image": image,
        },
        "trip_snapshot": {
            "pickup_date": booking.pickup_datetime.isoformat(),
            "return_date": booking.return_datetime.isoformat(),
            "booking_ref": booking.booking_ref,
        },
    }
    review_id = await create_review(review_doc)

    car.average_rating = Decimal(str(await update_car_avg_rating(car.id)))
    if len(existing) == 0:
        completed_count = await db.scalar(select(func.count()).select_from(Booking).where(Booking.vehicle_id == car.id, Booking.status == "completed")) or 0
        car.total_trips = max(car.total_trips, completed_count)
    if payload.review_type == "customer_to_manager":
        profile = await db.scalar(select(ManagerProfile).where(ManagerProfile.user_id == booking.manager_id))
        if profile:
            manager_reviews = await get_user_reviews(booking.manager_id, "received")
            manager_ratings = [float(review.get("rating", 0)) for review in manager_reviews if review.get("review_type") == "customer_to_manager"]
            profile.average_rating = Decimal(str(round(sum(manager_ratings) / len(manager_ratings), 2))) if manager_ratings else profile.average_rating
            profile.total_reviews = len(manager_ratings)
    await db.commit()

    await create_notification(
        reviewee_id,
        "New review received",
        f"{current_user.full_name} left a {payload.rating}-star review.",
        "review",
        action_url="/dashboard/reviews",
        meta={"booking_id": booking.id, "review_id": review_id, "review_type": payload.review_type},
    )
    await log_activity(current_user.id, "review_created", "review", review_id, {"booking_id": booking.id, "review_type": payload.review_type})
    return {"review_id": review_id, "message": "Review submitted successfully"}


@router.post("/{booking_id}/manager-reply")
async def reply_to_review(
    booking_id: str,
    payload: ManagerReplyRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    booking = await _booking_or_404(db, booking_id)
    if booking.manager_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the manager can reply")
    car = await _car_or_404(db, booking.vehicle_id)
    if car.manager_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Vehicle does not belong to this manager")
    reviews = [review for review in await get_booking_reviews(booking.id) if review.get("review_type") in {"customer_to_vehicle", "customer_to_manager"}]
    if not reviews:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No customer review found for this booking")
    updated = await add_manager_reply(booking.id, payload.reply, current_user.id)
    if not updated:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unable to add reply")
    for review in reviews:
        await create_notification(
            review["reviewer_id"],
            "Vehicle Manager replied to your review",
            f"{current_user.full_name} responded to your review for {car.title}.",
            "review",
            action_url=f"/dashboard/bookings/{booking.id}",
            meta={"booking_id": booking.id, "review_id": str(review.get("_id"))},
        )
    return {"message": "Reply posted successfully"}


@router.get("/recent")
async def list_recent_reviews(
    limit: int = Query(default=20, ge=1, le=50),
):
    """Public endpoint — returns the most recent published customer_to_vehicle reviews for the homepage."""
    db_mongo = get_mongo_db()
    cursor = db_mongo.reviews.find(
        {"review_type": "customer_to_vehicle", "is_published": True}
    ).sort("created_at", -1).limit(limit)
    docs = await cursor.to_list(length=limit)
    return {"reviews": [_review_payload(_serialize_id(doc)) for doc in docs]}


@router.get("/car/{vehicle_id}")
async def list_car_reviews(
    vehicle_id: str,
    rating_filter: int | None = Query(default=None, ge=1, le=5),
    rating: int | None = Query(default=None, ge=1, le=5),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=5, ge=1, le=20),
    sort: str = Query(default="recent", pattern="^(recent|oldest|rating_high|rating_low)$"),
):
    return await get_car_reviews(vehicle_id, page=page, limit=limit, sort=sort, rating=rating_filter or rating)


@router.get("/user/{user_id}")
async def list_user_reviews(
    user_id: str,
    review_type: str = Query(default="received", alias="type"),
    _: User = Depends(get_current_active_user),
):
    return {"reviews": [_review_payload(review) for review in await get_user_reviews(user_id, review_type)]}


@router.get("/my/given")
async def list_my_given_reviews(current_user: User = Depends(get_current_active_user)):
    return {"reviews": [_review_payload(review) for review in await get_user_reviews(current_user.id, "given")]}


@router.get("/booking/{booking_id}")
async def list_booking_reviews(
    booking_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    booking = await _booking_or_404(db, booking_id)
    if current_user.id not in {booking.customer_id, booking.manager_id} and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed to view these reviews")
    return {"reviews": [_review_payload(review) for review in await get_booking_reviews(booking_id)]}
