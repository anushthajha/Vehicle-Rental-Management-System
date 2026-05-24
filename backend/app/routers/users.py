from datetime import datetime
from decimal import Decimal
from io import BytesIO
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.booking import Booking
from app.models.vehicle import Vehicle
from app.models.manager import ManagerProfile
from app.models.payment import UserWallet
from app.models.user import User, UserKYC
from app.models.wishlist import Wishlist
from app.mongo_models.notification import get_unread_count
from app.mongo_models.review import get_user_reviews
from app.services.booking_flow import money
from app.utils.auth import get_current_active_user
from app.utils.validators import validate_phone


router = APIRouter(prefix="/users", tags=["users"])

AVATAR_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_AVATAR_BYTES = 2 * 1024 * 1024


class ProfileUpdateRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=200)
    phone: str | None = Field(default=None, max_length=10)

    @field_validator("phone")
    @classmethod
    def valid_phone(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        return validate_phone(value)


def _dt(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _user_payload(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "phone": user.phone,
        "profile_picture": user.profile_picture,
        "is_active": user.is_active,
        "is_verified": user.is_verified,
        "is_vehicle_manager": user.role == "vehicle_manager",
        "role": user.role,
        "created_at": _dt(user.created_at),
    }


async def _profile_summary(db: AsyncSession, user_id: str) -> dict:
    kyc = await db.scalar(select(UserKYC).where(UserKYC.user_id == user_id))
    wallet = await db.scalar(select(UserWallet).where(UserWallet.user_id == user_id))
    now = datetime.utcnow()
    total_trips = await db.scalar(select(func.count()).select_from(Booking).where(Booking.customer_id == user_id)) or 0
    upcoming = await db.scalar(
        select(func.count())
        .select_from(Booking)
        .where(
            Booking.customer_id == user_id,
            Booking.status.in_(("pending", "confirmed")),
            Booking.pickup_datetime >= now,
        )
    ) or 0
    total_spent = await db.scalar(
        select(func.coalesce(func.sum(Booking.total_amount), 0))
        .select_from(Booking)
        .where(Booking.customer_id == user_id, Booking.status.in_(("confirmed", "active", "completed")))
    ) or Decimal("0.00")
    saved_cars = await db.scalar(select(func.count()).select_from(Wishlist).where(Wishlist.user_id == user_id)) or 0
    return {
        "kyc_status": kyc.kyc_status if kyc else "not_submitted",
        "wallet_balance": money(wallet.balance if wallet else 0),
        "total_trips_as_customer": total_trips,
        "upcoming_trips_count": upcoming,
        "total_spent": money(total_spent),
        "saved_cars_count": saved_cars,
        "unread_notifications_count": await get_unread_count(user_id),
    }


@router.get("/profile")
async def get_profile(current_user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    return {
        "user": _user_payload(current_user),
        "member_since": _dt(current_user.created_at),
        **await _profile_summary(db, current_user.id),
    }


@router.patch("/profile")
async def update_profile(
    payload: ProfileUpdateRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    current_user.full_name = payload.full_name.strip()
    current_user.phone = payload.phone
    await db.commit()
    await db.refresh(current_user)
    return {"user": _user_payload(current_user), **await _profile_summary(db, current_user.id)}


@router.post("/profile/avatar")
async def upload_avatar(
    avatar: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    if avatar.content_type not in AVATAR_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Avatar must be a JPG, PNG, or WebP image")
    data = await avatar.read()
    if len(data) > MAX_AVATAR_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Avatar must be 2MB or smaller")
    try:
        image = Image.open(BytesIO(data)).convert("RGB")
    except UnidentifiedImageError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid image file") from exc

    side = min(image.size)
    left = (image.width - side) // 2
    top = (image.height - side) // 2
    image = image.crop((left, top, left + side, top + side)).resize((400, 400), Image.Resampling.LANCZOS)

    avatar_dir = Path(settings.UPLOAD_DIR) / "avatars"
    avatar_dir.mkdir(parents=True, exist_ok=True)
    file_path = avatar_dir / f"{current_user.id}.webp"
    image.save(file_path, "WEBP", quality=86, method=6)

    current_user.profile_picture = f"/uploads/avatars/{current_user.id}.webp"
    await db.commit()
    await db.refresh(current_user)
    return {"profile_picture": current_user.profile_picture, "user": _user_payload(current_user)}


@router.get("/{user_id}/public")
async def get_public_user(user_id: str, db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.id == user_id, User.is_active.is_(True)))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    total_trips = await db.scalar(select(func.count()).select_from(Booking).where(Booking.customer_id == user.id, Booking.status == "completed")) or 0
    reviews = await get_user_reviews(user.id, "received")
    customer_reviews = [review for review in reviews if review.get("reviewee_id") == user.id]
    rating = sum(float(review.get("rating", 0)) for review in customer_reviews) / len(customer_reviews) if customer_reviews else 0
    payload = {
        "full_name": user.full_name,
        "profile_picture": user.profile_picture,
        "member_since": _dt(user.created_at),
        "rating_as_customer": round(rating, 2),
        "total_trips": total_trips,
    }
    if user.role == "vehicle_manager":
        profile = await db.scalar(select(ManagerProfile).where(ManagerProfile.user_id == user.id))
        total_listings = await db.scalar(select(func.count()).select_from(Vehicle).where(Vehicle.manager_id == user.id)) or 0
        payload.update(
            {
                "manager_rating": money(profile.average_rating) if profile else 0,
                "total_listings": profile.total_listings if profile else total_listings,
                "is_super_manager": profile.is_super_manager if profile else False,
                "manager_bio": profile.bio if profile else None,
            }
        )
    return payload
