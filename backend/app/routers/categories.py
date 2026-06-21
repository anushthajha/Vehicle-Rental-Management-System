import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.vehicle import Vehicle, VehicleImage
from app.models.user import User
from app.models.vehicle_category import VehicleCategory, VehicleType
from app.services.booking_flow import money
from app.utils.auth import require_admin


router = APIRouter(tags=["vehicle categories"])
CATEGORY_CACHE_KEY = "vehicle_categories:active"
TYPE_CACHE_KEY = "vehicle_types:active"
CACHE_TTL_SECONDS = 600


class CategoryRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    slug: str | None = Field(default=None, min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    icon_name: str | None = Field(default=None, max_length=100)
    display_order: int | None = Field(default=None, ge=0)
    is_active: bool | None = None


class CategoryCreateRequest(CategoryRequest):
    name: str = Field(min_length=2, max_length=100)
    display_order: int = Field(default=0, ge=0)


class ReorderItem(BaseModel):
    category_id: str
    display_order: int = Field(ge=0)


class TypeRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    slug: str | None = Field(default=None, min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    is_active: bool | None = None


class TypeCreateRequest(TypeRequest):
    name: str = Field(min_length=2, max_length=100)


def _dt(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or "vehicle-category"


def _category_payload(category: VehicleCategory, vehicle_count: int = 0) -> dict:
    return {
        "id": category.id,
        "name": category.name,
        "slug": category.slug,
        "description": category.description,
        "icon_name": category.icon_name,
        "display_order": category.display_order,
        "is_active": category.is_active,
        "vehicle_count": vehicle_count,
        "created_at": _dt(category.created_at),
        "updated_at": _dt(category.updated_at),
    }


def _type_payload(vehicle_type: VehicleType, vehicle_count: int = 0) -> dict:
    return {
        "id": vehicle_type.id,
        "name": vehicle_type.name,
        "slug": vehicle_type.slug,
        "description": vehicle_type.description,
        "is_active": vehicle_type.is_active,
        "vehicle_count": vehicle_count,
        "created_at": _dt(vehicle_type.created_at),
    }


async def _clear_cache() -> None:
    pass  # Redis removed — no cache to clear


async def _ensure_unique_slug(db: AsyncSession, model, slug: str, current_id: str | None = None) -> None:
    conditions = [model.slug == slug]
    if current_id:
        conditions.append(model.id != current_id)
    exists = await db.scalar(select(func.count()).select_from(model).where(*conditions)) or 0
    if exists:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Slug already exists")


async def _primary_image(db: AsyncSession, vehicle_id: str) -> str | None:
    return await db.scalar(
        select(VehicleImage.image_url)
        .where(VehicleImage.vehicle_id == vehicle_id)
        .order_by(VehicleImage.is_primary.desc(), VehicleImage.order_index.asc())
        .limit(1)
    )


@router.get("/categories")
async def list_categories(db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            select(VehicleCategory, func.count(Vehicle.id))
            .outerjoin(Vehicle, Vehicle.category_id == VehicleCategory.id)
            .where(VehicleCategory.is_active.is_(True))
            .group_by(VehicleCategory.id)
            .order_by(VehicleCategory.display_order.asc(), VehicleCategory.name.asc())
        )
    ).all()
    payload = {"categories": [_category_payload(category, count) for category, count in rows]}
    return payload


@router.get("/categories/{category_id}")
async def get_category(
    category_id: str,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=12, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    category = await db.scalar(select(VehicleCategory).where(VehicleCategory.id == category_id))
    if category is None:
        category = await db.scalar(select(VehicleCategory).where(VehicleCategory.slug == category_id))
    if category is None or not category.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    conditions = [Vehicle.category_id == category.id, Vehicle.is_approved.is_(True), Vehicle.is_available.is_(True)]
    total = await db.scalar(select(func.count()).select_from(Vehicle).where(*conditions)) or 0
    vehicles = (
        await db.execute(
            select(Vehicle)
            .where(*conditions)
            .order_by(Vehicle.created_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
    ).scalars().all()
    items = []
    for car in vehicles:
        items.append(
            {
                "id": car.id,
                "title": car.title,
                "make": car.make,
                "car_model": car.car_model,
                "year": car.year,
                "category": category.slug,
                "category_id": category.id,
                "category_name": category.name,
                "price_per_day": money(car.price_per_day),
                "average_rating": money(car.average_rating),
                "total_trips": car.total_trips,
                "primary_image_url": await _primary_image(db, car.id),
            }
        )
    pages = (total + limit - 1) // limit if total else 0
    return {"category": _category_payload(category, total), "vehicles": items, "total": total, "page": page, "pages": pages}


@router.post("/admin/categories", status_code=status.HTTP_201_CREATED)
async def create_category(payload: CategoryCreateRequest, _: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    slug = slugify(payload.slug or payload.name)
    await _ensure_unique_slug(db, VehicleCategory, slug)
    if await db.scalar(select(func.count()).select_from(VehicleCategory).where(VehicleCategory.name == payload.name)) or 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Category name already exists")
    category = VehicleCategory(
        name=payload.name.strip(),
        slug=slug,
        description=payload.description,
        icon_name=payload.icon_name,
        display_order=payload.display_order,
        is_active=True if payload.is_active is None else payload.is_active,
    )
    db.add(category)
    await db.commit()
    await db.refresh(category)
    await _clear_cache()
    return _category_payload(category)


@router.get("/admin/categories")
async def admin_list_categories(_: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            select(VehicleCategory, func.count(Vehicle.id))
            .outerjoin(Vehicle, Vehicle.category_id == VehicleCategory.id)
            .group_by(VehicleCategory.id)
            .order_by(VehicleCategory.display_order.asc(), VehicleCategory.name.asc())
        )
    ).all()
    return {"categories": [_category_payload(category, count) for category, count in rows]}


@router.patch("/admin/categories/reorder")
async def reorder_categories(payload: list[ReorderItem], _: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    for item in payload:
        await db.execute(update(VehicleCategory).where(VehicleCategory.id == item.category_id).values(display_order=item.display_order))
    await db.commit()
    await _clear_cache()
    return {"message": "Categories reordered"}


@router.patch("/admin/categories/{category_id}")
async def update_category(category_id: str, payload: CategoryRequest, _: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    category = await db.scalar(select(VehicleCategory).where(VehicleCategory.id == category_id))
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("is_active") is False and category.is_active:
        vehicles = (
            await db.execute(
                select(Vehicle.id, Vehicle.title)
                .where(Vehicle.category_id == category.id, Vehicle.is_approved.is_(True), Vehicle.is_available.is_(True))
                .limit(10)
            )
        ).all()
        if vehicles:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"message": "Cannot deactivate category while active vehicles use it.", "vehicles": [{"id": row[0], "title": row[1]} for row in vehicles]},
            )
    if "name" in changes and changes["name"]:
        category.name = changes["name"].strip()
        if "slug" not in changes:
            changes["slug"] = category.name
    if "slug" in changes and changes["slug"]:
        slug = slugify(changes["slug"])
        await _ensure_unique_slug(db, VehicleCategory, slug, category.id)
        category.slug = slug
    for field in ("description", "icon_name", "display_order", "is_active"):
        if field in changes:
            setattr(category, field, changes[field])
    await db.commit()
    await db.refresh(category)
    await _clear_cache()
    count = await db.scalar(select(func.count()).select_from(Vehicle).where(Vehicle.category_id == category.id)) or 0
    return _category_payload(category, count)


@router.delete("/admin/categories/{category_id}")
async def delete_category(
    category_id: str,
    reassign_to_category_id: str | None = Query(default=None),
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    category = await db.scalar(select(VehicleCategory).where(VehicleCategory.id == category_id))
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    count = await db.scalar(select(func.count()).select_from(Vehicle).where(Vehicle.category_id == category.id)) or 0
    if count and not reassign_to_category_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Cannot delete — {count} vehicles use this category. Reassign first.")
    if count:
        replacement = await db.scalar(select(VehicleCategory).where(VehicleCategory.id == reassign_to_category_id, VehicleCategory.id != category.id))
        if replacement is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Replacement category not found")
        await db.execute(update(Vehicle).where(Vehicle.category_id == category.id).values(category_id=replacement.id))
    await db.delete(category)
    await db.commit()
    await _clear_cache()
    return {"message": "Category deleted"}


@router.get("/vehicle-types")
async def list_vehicle_types(db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            select(VehicleType, func.count(Vehicle.id))
            .outerjoin(Vehicle, Vehicle.vehicle_type_id == VehicleType.id)
            .where(VehicleType.is_active.is_(True))
            .group_by(VehicleType.id)
            .order_by(VehicleType.name.asc())
        )
    ).all()
    payload = {"vehicle_types": [_type_payload(vehicle_type, count) for vehicle_type, count in rows]}
    return payload


@router.post("/admin/vehicle-types", status_code=status.HTTP_201_CREATED)
async def create_vehicle_type(payload: TypeCreateRequest, _: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    slug = slugify(payload.slug or payload.name)
    await _ensure_unique_slug(db, VehicleType, slug)
    if await db.scalar(select(func.count()).select_from(VehicleType).where(VehicleType.name == payload.name)) or 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vehicle type name already exists")
    vehicle_type = VehicleType(name=payload.name.strip(), slug=slug, description=payload.description, is_active=True if payload.is_active is None else payload.is_active)
    db.add(vehicle_type)
    await db.commit()
    await db.refresh(vehicle_type)
    await _clear_cache()
    return _type_payload(vehicle_type)


@router.get("/admin/vehicle-types")
async def admin_list_vehicle_types(_: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            select(VehicleType, func.count(Vehicle.id))
            .outerjoin(Vehicle, Vehicle.vehicle_type_id == VehicleType.id)
            .group_by(VehicleType.id)
            .order_by(VehicleType.name.asc())
        )
    ).all()
    return {"vehicle_types": [_type_payload(vehicle_type, count) for vehicle_type, count in rows]}


@router.patch("/admin/vehicle-types/{type_id}")
async def update_vehicle_type(type_id: str, payload: TypeRequest, _: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    vehicle_type = await db.scalar(select(VehicleType).where(VehicleType.id == type_id))
    if vehicle_type is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle type not found")
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("is_active") is False and vehicle_type.is_active:
        vehicles = (
            await db.execute(
                select(Vehicle.id, Vehicle.title)
                .where(Vehicle.vehicle_type_id == vehicle_type.id, Vehicle.is_approved.is_(True), Vehicle.is_available.is_(True))
                .limit(10)
            )
        ).all()
        if vehicles:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"message": "Cannot deactivate type while active vehicles use it.", "vehicles": [{"id": row[0], "title": row[1]} for row in vehicles]})
    if "name" in changes and changes["name"]:
        vehicle_type.name = changes["name"].strip()
        if "slug" not in changes:
            changes["slug"] = vehicle_type.name
    if "slug" in changes and changes["slug"]:
        slug = slugify(changes["slug"])
        await _ensure_unique_slug(db, VehicleType, slug, vehicle_type.id)
        vehicle_type.slug = slug
    for field in ("description", "is_active"):
        if field in changes:
            setattr(vehicle_type, field, changes[field])
    await db.commit()
    await db.refresh(vehicle_type)
    await _clear_cache()
    count = await db.scalar(select(func.count()).select_from(Vehicle).where(Vehicle.vehicle_type_id == vehicle_type.id)) or 0
    return _type_payload(vehicle_type, count)


@router.delete("/admin/vehicle-types/{type_id}")
async def delete_vehicle_type(type_id: str, _: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    vehicle_type = await db.scalar(select(VehicleType).where(VehicleType.id == type_id))
    if vehicle_type is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle type not found")
    count = await db.scalar(select(func.count()).select_from(Vehicle).where(Vehicle.vehicle_type_id == vehicle_type.id)) or 0
    if count:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Cannot delete — {count} vehicles use this type. Reassign first.")
    await db.delete(vehicle_type)
    await db.commit()
    await _clear_cache()
    return {"message": "Vehicle type deleted"}
