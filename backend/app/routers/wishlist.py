from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Depends, HTTPException, status

from app.database import get_db
from app.models.vehicle import Vehicle, VehicleImage
from app.models.user import User
from app.models.vehicle_category import VehicleCategory
from app.models.wishlist import Wishlist
from app.utils.auth import get_current_active_user


router = APIRouter(prefix="/wishlist", tags=["wishlist"])


class WishlistRequest(BaseModel):
    vehicle_id: str


def _money(value) -> float:
    return float(value or 0)


async def _wishlist_car_payload(car: Vehicle, image_url: str | None, category: VehicleCategory | None = None) -> dict:
    return {
        "id": car.id,
        "title": car.title,
        "make": car.make,
        "car_model": car.car_model,
        "year": car.year,
        "category": category.slug if category else None,
        "category_id": car.category_id,
        "category_name": category.name if category else None,
        "transmission": car.transmission,
        "fuel_type": car.fuel_type,
        "seats": car.seats,
        "location_city": car.location_city,
        "location_area": car.location_area,
        "location_lat": _money(car.location_lat) if car.location_lat is not None else None,
        "location_lng": _money(car.location_lng) if car.location_lng is not None else None,
        "price_per_hour": _money(car.price_per_hour),
        "price_per_day": _money(car.price_per_day),
        "average_rating": _money(car.average_rating),
        "total_trips": car.total_trips,
        "primary_image_url": image_url,
        "features": [
            key
            for key, enabled in {
                "ac": car.has_ac,
                "music": car.has_music_system,
                "gps": car.has_gps_tracker,
                "keyless": car.has_keyless_entry,
                "sunroof": car.has_sunroof,
                "child_seat": car.has_child_seat,
                "luggage_carrier": car.has_luggage_carrier,
            }.items()
            if enabled
        ],
        "manager_id": car.manager_id,
        "is_saved": True,
    }


@router.get("/")
async def get_wishlist(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    primary_image = (
        select(VehicleImage.image_url)
        .where(VehicleImage.vehicle_id == Vehicle.id)
        .order_by(VehicleImage.is_primary.desc(), VehicleImage.order_index.asc())
        .limit(1)
        .scalar_subquery()
    )
    result = await db.execute(
        select(Vehicle, primary_image.label("primary_image_url"), VehicleCategory)
        .join(Wishlist, Wishlist.vehicle_id == Vehicle.id)
        .outerjoin(VehicleCategory, VehicleCategory.id == Vehicle.category_id)
        .where(Wishlist.user_id == current_user.id)
        .order_by(Wishlist.created_at.desc())
    )
    return {"vehicles": [await _wishlist_car_payload(row[0], row[1], row[2]) for row in result.all()]}


@router.post("/", status_code=status.HTTP_201_CREATED)
async def add_wishlist_item(
    payload: WishlistRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    car = await db.scalar(select(Vehicle).where(Vehicle.id == payload.vehicle_id, Vehicle.is_approved.is_(True)))
    if car is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found")
    existing = await db.scalar(select(Wishlist).where(Wishlist.user_id == current_user.id, Wishlist.vehicle_id == payload.vehicle_id))
    if existing is None:
        db.add(Wishlist(user_id=current_user.id, vehicle_id=payload.vehicle_id))
        await db.commit()
    return {"vehicle_id": payload.vehicle_id, "is_saved": True}


@router.delete("/{vehicle_id}")
async def remove_wishlist_item(
    vehicle_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    item = await db.scalar(select(Wishlist).where(Wishlist.user_id == current_user.id, Wishlist.vehicle_id == vehicle_id))
    if item is not None:
        await db.delete(item)
        await db.commit()
    return {"vehicle_id": vehicle_id, "is_saved": False}
