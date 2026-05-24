import calendar
import json
import math
import os
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from io import BytesIO
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from PIL import Image
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import case, distinct, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.booking import Booking
from app.models.vehicle import Vehicle, VehicleAvailabilityBlock, VehicleImage, VehiclePricingRule
from app.models.manager import ManagerProfile
from app.models.user import User
from app.models.vehicle_category import VehicleCategory, VehicleType
from app.mongo_models.analytics import log_activity, log_car_view, log_search
from app.mongo_models.notification import create_notification
from app.mongo_models.review import get_car_reviews
from app.redis import get_redis
from app.utils.auth import get_current_active_user, require_vehicle_manager, require_kyc_user, verify_token


router = APIRouter(prefix="/vehicles", tags=["vehicles"])
vehicles_router = APIRouter(prefix="/vehicles", tags=["vehicles"])

BOOKING_BLOCKING_STATUSES = ("confirmed", "active", "pending")
FEATURE_MAP = {
    "ac": Vehicle.has_ac,
    "music": Vehicle.has_music_system,
    "gps": Vehicle.has_gps_tracker,
    "keyless": Vehicle.has_keyless_entry,
    "sunroof": Vehicle.has_sunroof,
    "child_seat": Vehicle.has_child_seat,
    "luggage_carrier": Vehicle.has_luggage_carrier,
}
VEHICLE_UPDATE_FIELDS = {
    "title",
    "make",
    "car_model",
    "year",
    "color",
    "category_id",
    "vehicle_type_id",
    "transmission",
    "fuel_type",
    "seats",
    "description",
    "registration_number",
    "location_city",
    "location_area",
    "location_lat",
    "location_lng",
    "location_address",
    "price_per_hour",
    "price_per_day",
    "min_trip_hours",
    "max_trip_days",
    "security_deposit",
    "extra_km_charge",
    "included_km_per_day",
    "has_gps_tracker",
    "has_keyless_entry",
    "has_ac",
    "has_music_system",
    "has_sunroof",
    "has_child_seat",
    "has_luggage_carrier",
    "minimum_customer_rating",
    "auto_accept_bookings",
}


class VehicleCreate(BaseModel):
    title: str | None = None
    make: str
    car_model: str
    year: int = Field(ge=2010, le=2026)
    color: str | None = None
    transmission: str
    fuel_type: str
    seats: int = Field(ge=2, le=12)
    category_id: str | None = None
    category: str | None = None
    vehicle_type_id: str | None = None
    description: str | None = Field(default=None, max_length=1000)
    registration_number: str
    location_city: str
    location_area: str | None = None
    location_lat: Decimal | None = None
    location_lng: Decimal | None = None
    location_address: str | None = None
    price_per_hour: Decimal = Field(gt=0)
    price_per_day: Decimal = Field(gt=0)
    min_trip_hours: int = Field(default=4, ge=2, le=24)
    max_trip_days: int = Field(default=30, ge=1, le=30)
    security_deposit: Decimal = Field(default=Decimal("0.00"), ge=0)
    extra_km_charge: Decimal = Field(default=Decimal("0.00"), ge=0)
    included_km_per_day: int = Field(default=300, ge=0)
    has_gps_tracker: bool = False
    has_keyless_entry: bool = False
    has_ac: bool = True
    has_music_system: bool = True
    has_sunroof: bool = False
    has_child_seat: bool = False
    has_luggage_carrier: bool = False
    minimum_customer_rating: Decimal | None = None
    auto_accept_bookings: bool = False

    @field_validator("registration_number")
    @classmethod
    def normalize_registration(cls, value: str) -> str:
        return value.replace(" ", "").upper()

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str | None) -> str | None:
        return value.strip() if value else value


class VehicleUpdate(BaseModel):
    title: str | None = None
    make: str | None = None
    car_model: str | None = None
    year: int | None = Field(default=None, ge=2010, le=2026)
    color: str | None = None
    transmission: str | None = None
    fuel_type: str | None = None
    seats: int | None = Field(default=None, ge=2, le=12)
    category_id: str | None = None
    category: str | None = None
    vehicle_type_id: str | None = None
    description: str | None = Field(default=None, max_length=1000)
    registration_number: str | None = None
    location_city: str | None = None
    location_area: str | None = None
    location_lat: Decimal | None = None
    location_lng: Decimal | None = None
    location_address: str | None = None
    price_per_hour: Decimal | None = Field(default=None, gt=0)
    price_per_day: Decimal | None = Field(default=None, gt=0)
    min_trip_hours: int | None = Field(default=None, ge=2, le=24)
    max_trip_days: int | None = Field(default=None, ge=1, le=30)
    security_deposit: Decimal | None = Field(default=None, ge=0)
    extra_km_charge: Decimal | None = Field(default=None, ge=0)
    included_km_per_day: int | None = Field(default=None, ge=0)
    has_gps_tracker: bool | None = None
    has_keyless_entry: bool | None = None
    has_ac: bool | None = None
    has_music_system: bool | None = None
    has_sunroof: bool | None = None
    has_child_seat: bool | None = None
    has_luggage_carrier: bool | None = None
    minimum_customer_rating: Decimal | None = None
    auto_accept_bookings: bool | None = None

    @field_validator("registration_number")
    @classmethod
    def normalize_registration(cls, value: str | None) -> str | None:
        return value.replace(" ", "").upper() if value else value


class ImageReorderItem(BaseModel):
    image_id: str
    order_index: int = Field(ge=0)


class DateBlockRequest(BaseModel):
    blocked_from: datetime
    blocked_to: datetime
    reason: str | None = Field(default=None, max_length=200)
    note: str | None = Field(default=None, max_length=500)


class PricingRuleRequest(BaseModel):
    rule_type: str
    discount_percent: Decimal | None = Field(default=None, ge=0, le=100)
    surcharge_percent: Decimal | None = Field(default=None, ge=0, le=100)
    min_days: int | None = Field(default=None, ge=1)
    applies_on: str | None = Field(default=None, max_length=100)


def _money(value) -> float:
    return float(value or 0)


def _dt(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _features(car: Vehicle) -> list[str]:
    features = []
    if car.has_ac:
        features.append("ac")
    if car.has_music_system:
        features.append("music")
    if car.has_gps_tracker:
        features.append("gps")
    if car.has_keyless_entry:
        features.append("keyless")
    if car.has_sunroof:
        features.append("sunroof")
    if car.has_child_seat:
        features.append("child_seat")
    if car.has_luggage_carrier:
        features.append("luggage_carrier")
    return features


BRANDS_CACHE_KEY = "vehicles:brands:approved"
BRANDS_CACHE_TTL_SECONDS = 300


def _csv_values(value: str | None) -> list[str]:
    return [item.strip() for item in (value or "").split(",") if item.strip()]


def _csv_int_values(value: str | None) -> list[int]:
    values = []
    for item in _csv_values(value):
        try:
            values.append(int(item))
        except ValueError:
            continue
    return values


def _car_payload(
    car: Vehicle,
    manager_name: str | None = None,
    primary_image_url: str | None = None,
    distance_km=None,
    category: VehicleCategory | None = None,
    vehicle_type: VehicleType | None = None,
) -> dict:
    category_slug = category.slug if category else None
    category_name = category.name if category else None
    type_slug = vehicle_type.slug if vehicle_type else None
    type_name = vehicle_type.name if vehicle_type else None
    return {
        "id": car.id,
        "title": car.title,
        "make": car.make,
        "car_model": car.car_model,
        "year": car.year,
        "color": car.color,
        "category": category_slug,
        "category_id": car.category_id,
        "category_name": category_name,
        "vehicle_type": type_slug,
        "vehicle_type_id": car.vehicle_type_id,
        "vehicle_type_name": type_name,
        "transmission": car.transmission,
        "fuel_type": car.fuel_type,
        "seats": car.seats,
        "description": car.description,
        "location_city": car.location_city,
        "location_area": car.location_area,
        "location_lat": _money(car.location_lat) if car.location_lat is not None else None,
        "location_lng": _money(car.location_lng) if car.location_lng is not None else None,
        "price_per_hour": _money(car.price_per_hour),
        "price_per_day": _money(car.price_per_day),
        "average_rating": _money(car.average_rating),
        "total_trips": car.total_trips,
        "primary_image_url": primary_image_url,
        "features": _features(car),
        "manager_name": manager_name,
        "manager_id": car.manager_id,
        "is_featured": car.is_featured,
        "is_available": car.is_available,
        "is_approved": car.is_approved,
        "created_at": _dt(car.created_at),
        "distance_km": round(float(distance_km), 2) if distance_km is not None else None,
    }


def _image_payload(image: VehicleImage) -> dict:
    return {
        "id": image.id,
        "image_url": image.image_url,
        "thumb_url": image.image_url.replace(".webp", "_thumb.webp"),
        "is_primary": image.is_primary,
        "order_index": image.order_index,
    }


def _block_payload(block: VehicleAvailabilityBlock) -> dict:
    return {
        "id": block.id,
        "blocked_from": _dt(block.blocked_from),
        "blocked_to": _dt(block.blocked_to),
        "reason": block.reason,
    }


def _rule_payload(rule: VehiclePricingRule) -> dict:
    return {
        "id": rule.id,
        "rule_type": rule.rule_type,
        "discount_percent": _money(rule.discount_percent),
        "surcharge_percent": _money(rule.surcharge_percent),
        "min_days": rule.min_days,
        "applies_on": rule.applies_on,
    }


async def _optional_user_id(request: Request) -> str | None:
    authorization = request.headers.get("authorization", "")
    if not authorization.lower().startswith("bearer "):
        return None
    try:
        payload = await verify_token(authorization.split(" ", 1)[1])
    except HTTPException:
        return None
    return payload.get("sub")


async def _get_owned_car(vehicle_id: str, manager_id: str, db: AsyncSession) -> Vehicle:
    result = await db.execute(select(Vehicle).where(Vehicle.id == vehicle_id, Vehicle.manager_id == manager_id))
    car = result.scalar_one_or_none()
    if car is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found")
    return car


async def _clear_availability_cache(vehicle_id: str) -> None:
    redis = get_redis()
    async for key in redis.scan_iter(f"availability:{vehicle_id}:*"):
        await redis.delete(key)


async def _resolve_category_id(db: AsyncSession, category_id: str | None, legacy_category: str | None = None) -> str | None:
    value = category_id or legacy_category
    if not value:
        return None
    category = await db.scalar(select(VehicleCategory).where((VehicleCategory.id == value) | (VehicleCategory.slug == value), VehicleCategory.is_active.is_(True)))
    if category is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vehicle category not found or inactive")
    return category.id


async def _resolve_vehicle_type_id(db: AsyncSession, vehicle_type_id: str | None) -> str | None:
    if not vehicle_type_id:
        default_type = await db.scalar(select(VehicleType).where(VehicleType.slug == "car", VehicleType.is_active.is_(True)))
        return default_type.id if default_type else None
    vehicle_type = await db.scalar(select(VehicleType).where((VehicleType.id == vehicle_type_id) | (VehicleType.slug == vehicle_type_id), VehicleType.is_active.is_(True)))
    if vehicle_type is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vehicle type not found or inactive")
    return vehicle_type.id


def _overlap_conditions(start_dt: datetime, end_dt: datetime):
    return (
        Booking.pickup_datetime < end_dt,
        Booking.return_datetime > start_dt,
        Booking.status.in_(BOOKING_BLOCKING_STATUSES),
    )


def _distance_expression(lat: float, lng: float):
    lat_rad = math.radians(lat)
    return 6371 * func.acos(
        func.least(
            1,
            func.greatest(
                -1,
                (func.cos(lat_rad) * func.cos(func.radians(Vehicle.location_lat)) * func.cos(func.radians(Vehicle.location_lng) - math.radians(lng)))
                + (func.sin(lat_rad) * func.sin(func.radians(Vehicle.location_lat))),
            ),
        )
    )


async def _list_rows(db: AsyncSession, conditions: list, sort_by: str, page: int, limit: int, distance_expr=None):
    primary_image = (
        select(VehicleImage.image_url)
        .where(VehicleImage.vehicle_id == Vehicle.id)
        .order_by(VehicleImage.is_primary.desc(), VehicleImage.order_index.asc())
        .limit(1)
        .scalar_subquery()
    )
    columns = [Vehicle, User.full_name, primary_image.label("primary_image_url"), VehicleCategory, VehicleType]
    if distance_expr is not None:
        columns.append(distance_expr.label("distance_km"))

    query = (
        select(*columns)
        .join(User, User.id == Vehicle.manager_id)
        .outerjoin(VehicleCategory, VehicleCategory.id == Vehicle.category_id)
        .outerjoin(VehicleType, VehicleType.id == Vehicle.vehicle_type_id)
        .where(*conditions)
    )
    if sort_by == "price_asc":
        query = query.order_by(Vehicle.price_per_day.asc())
    elif sort_by == "price_desc":
        query = query.order_by(Vehicle.price_per_day.desc())
    elif sort_by == "rating":
        query = query.order_by(Vehicle.average_rating.desc(), Vehicle.total_trips.desc())
    elif sort_by == "most_booked":
        query = query.order_by(Vehicle.total_trips.desc(), Vehicle.average_rating.desc())
    elif sort_by == "newest":
        query = query.order_by(Vehicle.created_at.desc())
    else:
        score = (Vehicle.average_rating * 0.4) + (Vehicle.total_trips * 0.3) + (case((Vehicle.is_featured.is_(True), 1), else_=0) * 0.3)
        query = query.order_by(score.desc(), Vehicle.created_at.desc())

    query = query.offset((page - 1) * limit).limit(limit)
    result = await db.execute(query)
    return result.all()


async def _search_facets(db: AsyncSession, conditions: list) -> dict:
    brand_rows = (
        await db.execute(
            select(Vehicle.make, func.count(Vehicle.id))
            .where(*conditions)
            .group_by(Vehicle.make)
            .order_by(Vehicle.make.asc())
        )
    ).all()
    price_row = (
        await db.execute(
            select(func.min(Vehicle.price_per_day), func.max(Vehicle.price_per_day))
            .where(*conditions)
        )
    ).one()
    return {
        "brands_available": [brand for brand, _ in brand_rows if brand],
        "filter_counts": {"brands": {brand: count for brand, count in brand_rows if brand}},
        "price_range": {
            "min": _money(price_row[0]) if price_row[0] is not None else 0,
            "max": _money(price_row[1]) if price_row[1] is not None else 0,
        },
    }


@vehicles_router.get("/brands")
async def list_vehicle_brands(db: AsyncSession = Depends(get_db)):
    redis = get_redis()
    try:
        cached = await redis.get(BRANDS_CACHE_KEY)
        if cached:
            return json.loads(cached)
    except Exception:
        pass

    brands = (
        await db.execute(
            select(distinct(Vehicle.make))
            .where(Vehicle.is_approved.is_(True), Vehicle.make.is_not(None), Vehicle.make != "")
            .order_by(Vehicle.make.asc())
        )
    ).scalars().all()
    payload = {"brands": list(brands)}
    try:
        await redis.setex(BRANDS_CACHE_KEY, BRANDS_CACHE_TTL_SECONDS, json.dumps(payload))
    except Exception:
        pass
    return payload


@vehicles_router.get("/")
@router.get("/")
async def search_cars(
    request: Request,
    city: str | None = None,
    category: str | None = None,
    category_id: str | None = None,
    vehicle_type: str | None = None,
    vehicle_type_id: str | None = None,
    brand: str | None = None,
    q: str | None = None,
    transmission: str | None = None,
    fuel_type: str | None = None,
    availability: bool | None = None,
    seats: str | None = None,
    min_price: float | None = None,
    max_price: float | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    pickup_date: datetime | None = None,
    return_date: datetime | None = None,
    lat: float | None = None,
    lng: float | None = None,
    radius_km: float = 10,
    rating_min: float | None = Query(default=None, ge=0, le=5),
    min_rating: float | None = Query(default=None, ge=0, le=5),
    manager_id: str | None = None,
    exclude: str | None = None,
    sort_by: str = "recommended",
    features: str | None = None,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=12, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    conditions = [Vehicle.is_approved.is_(True)]
    active_pickup = pickup_date or start_date
    active_return = return_date or end_date
    if availability is True:
        conditions.append(Vehicle.is_available.is_(True))
    if active_pickup and active_return:
        booking_overlap = select(Booking.id).where(Booking.vehicle_id == Vehicle.id, *_overlap_conditions(active_pickup, active_return)).exists()
        block_overlap = (
            select(VehicleAvailabilityBlock.id)
            .where(
                VehicleAvailabilityBlock.vehicle_id == Vehicle.id,
                VehicleAvailabilityBlock.blocked_from < active_return,
                VehicleAvailabilityBlock.blocked_to > active_pickup,
            )
            .exists()
        )
        conditions.append(~booking_overlap)
        conditions.append(~block_overlap)
    if city:
        conditions.append(func.lower(Vehicle.location_city) == city.lower())
    category_values = _csv_values(category_id)
    if not category_values and category:
        legacy_values = _csv_values(category)
        if legacy_values:
            category_rows = (await db.execute(select(VehicleCategory.id).where(VehicleCategory.slug.in_(legacy_values)))).scalars().all()
            category_values = list(category_rows)
    type_values = _csv_values(vehicle_type or vehicle_type_id)
    brand_values = [item.lower() for item in _csv_values(brand)]
    transmission_values = _csv_values(transmission)
    fuel_values = _csv_values(fuel_type)
    seat_values = _csv_int_values(seats)
    if category_values:
        conditions.append(Vehicle.category_id.in_(category_values))
    if type_values:
        conditions.append(Vehicle.vehicle_type_id.in_(type_values))
    if brand_values:
        conditions.append(func.lower(Vehicle.make).in_(brand_values))
    if q:
        needle = f"%{q.strip()}%"
        conditions.append(
            (Vehicle.title.ilike(needle))
            | (Vehicle.make.ilike(needle))
            | (Vehicle.car_model.ilike(needle))
            | (Vehicle.description.ilike(needle))
        )
    if transmission_values:
        conditions.append(Vehicle.transmission.in_(transmission_values))
    if fuel_values:
        conditions.append(Vehicle.fuel_type.in_(fuel_values))
    if seat_values:
        exact_seats = [value for value in seat_values if value < 8]
        seat_conditions = []
        if exact_seats:
            seat_conditions.append(Vehicle.seats.in_(exact_seats))
        if any(value >= 8 for value in seat_values):
            seat_conditions.append(Vehicle.seats >= 8)
        if seat_conditions:
            conditions.append(seat_conditions[0] if len(seat_conditions) == 1 else seat_conditions[0] | seat_conditions[1])
    active_rating = rating_min if rating_min is not None else min_rating
    if active_rating is not None:
        conditions.append(Vehicle.average_rating >= active_rating)
    if manager_id:
        conditions.append(Vehicle.manager_id == manager_id)
    if exclude:
        conditions.append(Vehicle.id != exclude)
    if min_price is not None:
        conditions.append(Vehicle.price_per_day >= min_price)
    if max_price is not None:
        conditions.append(Vehicle.price_per_day <= max_price)

    requested_features = _csv_values(features)
    for feature in requested_features:
        column = FEATURE_MAP.get(feature)
        if column is not None:
            conditions.append(column.is_(True))

    distance_expr = None
    if lat is not None and lng is not None:
        distance_expr = _distance_expression(lat, lng)
        conditions.extend([Vehicle.location_lat.is_not(None), Vehicle.location_lng.is_not(None), distance_expr <= radius_km])

    total = await db.scalar(select(func.count()).select_from(Vehicle).where(*conditions)) or 0
    facets = await _search_facets(db, conditions)
    rows = await _list_rows(db, conditions, sort_by, page, limit, distance_expr)
    vehicles = [_car_payload(row[0], row[1], row[2], row[5] if distance_expr is not None else None, row[3], row[4]) for row in rows]
    pages = math.ceil(total / limit) if total else 0

    filters_dict = {
        "city": city,
        "category": category,
        "category_id": category_id,
        "vehicle_type": vehicle_type,
        "vehicle_type_id": vehicle_type_id,
        "brand": brand_values,
        "q": q,
        "transmission": transmission_values,
        "fuel_type": fuel_values,
        "availability": availability,
        "seats": seat_values,
        "min_price": min_price,
        "max_price": max_price,
        "pickup_date": _dt(active_pickup),
        "return_date": _dt(active_return),
        "lat": lat,
        "lng": lng,
        "radius_km": radius_km,
        "rating_min": active_rating,
        "manager_id": manager_id,
        "exclude": exclude,
        "features": requested_features,
        "sort_by": sort_by,
    }
    applied_filters = {
        key: value
        for key, value in filters_dict.items()
        if value not in (None, "", [], {})
    }
    await log_search(await _optional_user_id(request), city or "", filters_dict, total)
    return {
        "vehicles": vehicles,
        "vehicles": vehicles,
        "total": total,
        "page": page,
        "pages": pages,
        "has_next": page < pages,
        "has_prev": page > 1,
        "applied_filters": applied_filters,
        "brands_available": facets["brands_available"],
        "price_range": facets["price_range"],
        "filter_counts": facets["filter_counts"],
    }


@router.get("/featured")
async def featured_cars(db: AsyncSession = Depends(get_db)):
    rows = await _list_rows(db, [Vehicle.is_featured.is_(True), Vehicle.is_approved.is_(True), Vehicle.is_available.is_(True)], "rating", 1, 6)
    return {"vehicles": [_car_payload(row[0], row[1], row[2], category=row[3], vehicle_type=row[4]) for row in rows]}


@router.get("/city/{city}")
async def city_cars(city: str, db: AsyncSession = Depends(get_db)):
    rows = await _list_rows(
        db,
        [func.lower(Vehicle.location_city) == city.lower(), Vehicle.is_approved.is_(True), Vehicle.is_available.is_(True)],
        "rating",
        1,
        20,
    )
    return {"vehicles": [_car_payload(row[0], row[1], row[2], category=row[3], vehicle_type=row[4]) for row in rows]}


@vehicles_router.get("/manager/vehicles")
@router.get("/manager/my-vehicles")
async def manager_my_vehicles(current_user: User = Depends(require_vehicle_manager), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Vehicle).where(Vehicle.manager_id == current_user.id).order_by(Vehicle.created_at.desc()))
    vehicles = result.scalars().all()
    response = []
    for car in vehicles:
        image = await db.scalar(
            select(VehicleImage.image_url).where(VehicleImage.vehicle_id == car.id).order_by(VehicleImage.is_primary.desc(), VehicleImage.order_index.asc()).limit(1)
        )
        total_bookings = await db.scalar(select(func.count()).select_from(Booking).where(Booking.vehicle_id == car.id)) or 0
        total_earnings = await db.scalar(select(func.coalesce(func.sum(Booking.manager_earnings), 0)).where(Booking.vehicle_id == car.id)) or 0
        pending_bookings = await db.scalar(select(func.count()).select_from(Booking).where(Booking.vehicle_id == car.id, Booking.status == "pending")) or 0
        category = await db.scalar(select(VehicleCategory).where(VehicleCategory.id == car.category_id)) if car.category_id else None
        vehicle_type = await db.scalar(select(VehicleType).where(VehicleType.id == car.vehicle_type_id)) if car.vehicle_type_id else None
        item = _car_payload(car, current_user.full_name, image, category=category, vehicle_type=vehicle_type)
        item.update(
            {
                "total_bookings": total_bookings,
                "total_earnings": _money(total_earnings),
                "pending_bookings_count": pending_bookings,
            }
        )
        response.append(item)
    return {"vehicles": response}


@vehicles_router.patch("/manager/{vehicle_id}/toggle-availability")
@router.patch("/manager/{vehicle_id}/toggle-availability")
async def toggle_availability(vehicle_id: str, current_user: User = Depends(require_vehicle_manager), db: AsyncSession = Depends(get_db)):
    car = await _get_owned_car(vehicle_id, current_user.id, db)
    car.is_available = not car.is_available
    await db.commit()
    await _clear_availability_cache(vehicle_id)
    return {"is_available": car.is_available}


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_car(payload: VehicleCreate, current_user: User = Depends(require_kyc_user), db: AsyncSession = Depends(get_db)):
    if current_user.role != "vehicle_manager":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Vehicle Manager access required")

    manager_profile = await db.scalar(select(ManagerProfile).where(ManagerProfile.user_id == current_user.id))
    if manager_profile is None:
        manager_profile = ManagerProfile(user_id=current_user.id)
        db.add(manager_profile)

    data = payload.model_dump()
    title = data.pop("title") or f"{payload.year} {payload.make} {payload.car_model}"
    legacy_category = data.pop("category", None)
    data["category_id"] = await _resolve_category_id(db, data.get("category_id"), legacy_category)
    data["vehicle_type_id"] = await _resolve_vehicle_type_id(db, data.get("vehicle_type_id"))
    car = Vehicle(manager_id=current_user.id, title=title, is_approved=False, is_available=True, **data)
    db.add(car)
    await db.flush()
    manager_profile.total_listings += 1
    await db.commit()

    admins = (await db.execute(select(User).where(User.role == "admin", User.is_active.is_(True)))).scalars().all()
    for admin in admins:
        await create_notification(
            admin.id,
            "New car listing pending review",
            f"{current_user.full_name} listed {car.title} in {car.location_city}.",
            "manager",
            action_url=f"/admin/vehicles/{car.id}",
            meta={"vehicle_id": car.id, "title": car.title, "city": car.location_city},
        )
    await log_activity(current_user.id, "car_listed", "car", car.id, {"title": car.title, "city": car.location_city})
    return {"vehicle_id": car.id, "message": "Listing submitted for review. You'll be notified within 24 hours."}


@vehicles_router.get("/{vehicle_id}")
@router.get("/{vehicle_id}")
async def get_car_detail(vehicle_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Vehicle, User, ManagerProfile, VehicleCategory, VehicleType)
        .join(User, User.id == Vehicle.manager_id)
        .outerjoin(ManagerProfile, ManagerProfile.user_id == Vehicle.manager_id)
        .outerjoin(VehicleCategory, VehicleCategory.id == Vehicle.category_id)
        .outerjoin(VehicleType, VehicleType.id == Vehicle.vehicle_type_id)
        .where(Vehicle.id == vehicle_id)
    )
    row = result.one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found")
    car, manager, manager_profile, category, vehicle_type = row

    images = (await db.execute(select(VehicleImage).where(VehicleImage.vehicle_id == vehicle_id).order_by(VehicleImage.order_index.asc()))).scalars().all()
    rules = (await db.execute(select(VehiclePricingRule).where(VehiclePricingRule.vehicle_id == vehicle_id))).scalars().all()
    blocks = (
        await db.execute(
            select(VehicleAvailabilityBlock)
            .where(VehicleAvailabilityBlock.vehicle_id == vehicle_id, VehicleAvailabilityBlock.blocked_from <= datetime.utcnow() + timedelta(days=90))
            .order_by(VehicleAvailabilityBlock.blocked_from.asc())
        )
    ).scalars().all()
    review_data = await get_car_reviews(vehicle_id, page=1, limit=5)
    await log_car_view(vehicle_id, await _optional_user_id(request), car.location_city)
    await get_redis().incr(f"car_views:{vehicle_id}")

    payload = _car_payload(car, manager.full_name, images[0].image_url if images else None, category=category, vehicle_type=vehicle_type)
    payload.update(
        {
            "description": car.description,
            "registration_number": car.registration_number,
            "location_address": car.location_address,
            "min_trip_hours": car.min_trip_hours,
            "max_trip_days": car.max_trip_days,
            "security_deposit": _money(car.security_deposit),
            "extra_km_charge": _money(car.extra_km_charge),
            "included_km_per_day": car.included_km_per_day,
            "auto_accept_bookings": car.auto_accept_bookings,
            "images": [_image_payload(image) for image in images],
            "manager_profile": {
                "name": manager.full_name,
                "photo": manager.profile_picture,
                "rating": _money(manager_profile.average_rating) if manager_profile else 0,
                "response_time": manager_profile.response_time if manager_profile else None,
                "is_super_manager": manager_profile.is_super_manager if manager_profile else False,
                "joined_date": _dt(manager_profile.assigned_at) if manager_profile else None,
                "total_reviews": manager_profile.total_reviews if manager_profile else 0,
            },
            "car_pricing_rules": [_rule_payload(rule) for rule in rules],
            "availability_blocks": [_block_payload(block) for block in blocks],
            "reviews": review_data["reviews"],
            "review_stats": {
                "avg_rating": review_data["avg_rating"],
                "rating_breakdown": review_data["rating_breakdown"],
                "total": review_data["total"],
            },
        }
    )
    return payload


@vehicles_router.patch("/{vehicle_id}")
@router.patch("/{vehicle_id}")
async def update_car(vehicle_id: str, payload: VehicleUpdate, current_user: User = Depends(require_vehicle_manager), db: AsyncSession = Depends(get_db)):
    car = await _get_owned_car(vehicle_id, current_user.id, db)
    changes = payload.model_dump(exclude_unset=True)
    if "category" in changes or "category_id" in changes:
        changes["category_id"] = await _resolve_category_id(db, changes.get("category_id"), changes.pop("category", None))
    if "vehicle_type_id" in changes:
        changes["vehicle_type_id"] = await _resolve_vehicle_type_id(db, changes.get("vehicle_type_id"))
    price_changed = any(field in changes for field in ("price_per_hour", "price_per_day"))
    for field, value in changes.items():
        if field in VEHICLE_UPDATE_FIELDS:
            setattr(car, field, value)
    await db.commit()

    if price_changed:
        customer_ids = (
            await db.execute(select(distinct(Booking.customer_id)).where(Booking.vehicle_id == car.id, Booking.status == "pending"))
        ).scalars().all()
        for customer_id in customer_ids:
            await create_notification(
                customer_id,
                "Price updated for your pending booking",
                f"The manager updated pricing for {car.title}.",
                "booking",
                meta={"vehicle_id": car.id, "title": car.title},
            )
    return {"message": "Vehicle updated successfully"}


@router.delete("/{vehicle_id}")
async def delete_car(vehicle_id: str, current_user: User = Depends(require_vehicle_manager), db: AsyncSession = Depends(get_db)):
    car = await _get_owned_car(vehicle_id, current_user.id, db)
    active_count = await db.scalar(
        select(func.count()).select_from(Booking).where(Booking.vehicle_id == car.id, Booking.status.in_(("confirmed", "active")))
    )
    if active_count:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete a car with active or confirmed bookings")
    car.is_available = False
    await db.commit()
    return {"message": "Vehicle removed from availability"}


@router.post("/{vehicle_id}/images")
async def upload_car_image(
    vehicle_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(require_vehicle_manager),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_car(vehicle_id, current_user.id, db)
    existing_count = await db.scalar(select(func.count()).select_from(VehicleImage).where(VehicleImage.vehicle_id == vehicle_id)) or 0
    if existing_count >= 10:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A car can have at most 10 images")
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only jpg, png, and webp files are allowed")

    raw = await file.read()
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Image must be 5MB or smaller")

    try:
        image = Image.open(BytesIO(raw)).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid image file") from exc

    upload_dir = os.path.join(settings.UPLOAD_DIR, "vehicles", vehicle_id)
    os.makedirs(upload_dir, exist_ok=True)
    image_id = str(uuid4())
    image_filename = f"{image_id}.webp"
    thumb_filename = f"{image_id}_thumb.webp"

    image.thumbnail((1920, 1080))
    image.save(os.path.join(upload_dir, image_filename), "WEBP", quality=85)
    thumb = image.copy()
    thumb.thumbnail((400, 300))
    thumb.save(os.path.join(upload_dir, thumb_filename), "WEBP", quality=75)

    image_url = f"/uploads/vehicles/{vehicle_id}/{image_filename}"
    is_primary = existing_count == 0
    record = VehicleImage(vehicle_id=vehicle_id, image_url=image_url, is_primary=is_primary, order_index=existing_count)
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return {"image_id": record.id, "image_url": image_url, "thumb_url": f"/uploads/vehicles/{vehicle_id}/{thumb_filename}"}


@router.delete("/{vehicle_id}/images/{image_id}")
async def delete_car_image(vehicle_id: str, image_id: str, current_user: User = Depends(require_vehicle_manager), db: AsyncSession = Depends(get_db)):
    await _get_owned_car(vehicle_id, current_user.id, db)
    image = await db.scalar(select(VehicleImage).where(VehicleImage.id == image_id, VehicleImage.vehicle_id == vehicle_id))
    if image is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")
    await db.delete(image)
    await db.commit()
    return {"message": "Image deleted"}


@router.post("/{vehicle_id}/images/{image_id}/set-primary")
async def set_primary_image(vehicle_id: str, image_id: str, current_user: User = Depends(require_vehicle_manager), db: AsyncSession = Depends(get_db)):
    await _get_owned_car(vehicle_id, current_user.id, db)
    image = await db.scalar(select(VehicleImage).where(VehicleImage.id == image_id, VehicleImage.vehicle_id == vehicle_id))
    if image is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")
    await db.execute(update(VehicleImage).where(VehicleImage.vehicle_id == vehicle_id).values(is_primary=False))
    image.is_primary = True
    await db.commit()
    return {"message": "Primary image updated"}


@router.patch("/{vehicle_id}/images/reorder")
async def reorder_images(vehicle_id: str, payload: list[ImageReorderItem], current_user: User = Depends(require_vehicle_manager), db: AsyncSession = Depends(get_db)):
    await _get_owned_car(vehicle_id, current_user.id, db)
    for item in payload:
        await db.execute(update(VehicleImage).where(VehicleImage.id == item.image_id, VehicleImage.vehicle_id == vehicle_id).values(order_index=item.order_index))
    await db.commit()
    return {"message": "Images reordered"}


@vehicles_router.post("/{vehicle_id}/block-dates", status_code=status.HTTP_201_CREATED)
@router.post("/{vehicle_id}/block-dates", status_code=status.HTTP_201_CREATED)
async def block_dates(vehicle_id: str, payload: DateBlockRequest, current_user: User = Depends(require_vehicle_manager), db: AsyncSession = Depends(get_db)):
    await _get_owned_car(vehicle_id, current_user.id, db)
    if payload.blocked_to <= payload.blocked_from:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="blocked_to must be after blocked_from")
    reason = payload.reason if not payload.note else f"{payload.reason or 'Other'}: {payload.note}"
    block = VehicleAvailabilityBlock(vehicle_id=vehicle_id, blocked_from=payload.blocked_from, blocked_to=payload.blocked_to, reason=reason)
    db.add(block)
    await db.commit()
    await _clear_availability_cache(vehicle_id)
    await db.refresh(block)
    return _block_payload(block)


@vehicles_router.delete("/{vehicle_id}/block-dates/{block_id}")
@router.delete("/{vehicle_id}/block-dates/{block_id}")
async def delete_block(vehicle_id: str, block_id: str, current_user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    if current_user.role != "admin":
        await _get_owned_car(vehicle_id, current_user.id, db)
    block = await db.scalar(select(VehicleAvailabilityBlock).where(VehicleAvailabilityBlock.id == block_id, VehicleAvailabilityBlock.vehicle_id == vehicle_id))
    if block is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Block not found")
    await db.delete(block)
    await db.commit()
    await _clear_availability_cache(vehicle_id)
    return {"message": "Date block removed"}


@router.get("/{vehicle_id}/availability")
async def get_availability(vehicle_id: str, month: str, db: AsyncSession = Depends(get_db)):
    try:
        year, month_number = [int(part) for part in month.split("-", 1)]
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="month must be YYYY-MM") from exc
    days_in_month = calendar.monthrange(year, month_number)[1]
    month_start = datetime.combine(date(year, month_number, 1), time.min)
    month_end = datetime.combine(date(year, month_number, days_in_month), time.max)

    blocks = (
        await db.execute(
            select(VehicleAvailabilityBlock).where(
                VehicleAvailabilityBlock.vehicle_id == vehicle_id,
                VehicleAvailabilityBlock.blocked_from <= month_end,
                VehicleAvailabilityBlock.blocked_to >= month_start,
            )
        )
    ).scalars().all()
    bookings = (
        await db.execute(
            select(Booking).where(
                Booking.vehicle_id == vehicle_id,
                Booking.status.in_(BOOKING_BLOCKING_STATUSES),
                Booking.pickup_datetime <= month_end,
                Booking.return_datetime >= month_start,
            )
        )
    ).scalars().all()

    availability = []
    for day in range(1, days_in_month + 1):
        current = date(year, month_number, day)
        status_value = "available"
        if any(block.blocked_from.date() <= current <= block.blocked_to.date() for block in blocks):
            status_value = "unavailable"
        if any(booking.pickup_datetime.date() <= current <= booking.return_datetime.date() for booking in bookings):
            status_value = "booked"
        availability.append({"date": current.isoformat(), "status": status_value})
    return availability


@router.post("/{vehicle_id}/pricing-rules", status_code=status.HTTP_201_CREATED)
async def create_pricing_rule(vehicle_id: str, payload: PricingRuleRequest, current_user: User = Depends(require_vehicle_manager), db: AsyncSession = Depends(get_db)):
    await _get_owned_car(vehicle_id, current_user.id, db)
    rule = VehiclePricingRule(vehicle_id=vehicle_id, **payload.model_dump())
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return _rule_payload(rule)


@router.delete("/{vehicle_id}/pricing-rules/{rule_id}")
async def delete_pricing_rule(vehicle_id: str, rule_id: str, current_user: User = Depends(require_vehicle_manager), db: AsyncSession = Depends(get_db)):
    await _get_owned_car(vehicle_id, current_user.id, db)
    rule = await db.scalar(select(VehiclePricingRule).where(VehiclePricingRule.id == rule_id, VehiclePricingRule.vehicle_id == vehicle_id))
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pricing rule not found")
    await db.delete(rule)
    await db.commit()
    return {"message": "Pricing rule deleted"}
