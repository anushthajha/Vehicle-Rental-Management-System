from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.booking import Booking
from app.models.inspection import VehicleInspection
from app.models.payment import UserWallet, WalletTransaction
from app.models.user import User
from app.models.vehicle import Vehicle
from app.mongo_models.notification import create_notification
from app.services.booking_flow import add_wallet_transaction, get_or_create_wallet, money
from app.tasks.email_tasks import send_damage_penalty_email
from app.utils import email as email_utils
from app.utils.auth import get_current_active_user, require_admin, require_vehicle_manager


router = APIRouter(prefix="/inspections", tags=["inspections"])
admin_router = APIRouter(prefix="/admin", tags=["admin inspections"])


class InspectionRequest(BaseModel):
    booking_id: str
    condition: str = Field(pattern="^(good|minor_damage|major_damage|total_loss)$")
    damage_notes: str | None = Field(default=None, max_length=2000)
    damage_images: list[str] | None = None
    custom_penalty_amount: float | None = Field(default=None, ge=0)
    penalty_reason: str | None = Field(default=None, max_length=1000)


def _dt(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _inspection_payload(inspection: VehicleInspection, booking: Booking | None = None, car: Vehicle | None = None, customer: User | None = None) -> dict:
    return {
        "id": inspection.id,
        "booking_id": inspection.booking_id,
        "inspected_by": inspection.inspected_by,
        "inspection_time": _dt(inspection.inspection_time),
        "condition": inspection.condition,
        "damage_notes": inspection.damage_notes,
        "damage_images": inspection.damage_images or [],
        "penalty_amount": money(inspection.penalty_amount),
        "penalty_charged": inspection.penalty_charged,
        "penalty_reason": inspection.penalty_reason,
        "created_at": _dt(inspection.created_at),
        "booking": None if booking is None else {"id": booking.id, "booking_ref": booking.booking_ref, "status": booking.status},
        "vehicle": None if car is None else {"id": car.id, "title": car.title},
        "customer": None if customer is None else {"id": customer.id, "full_name": customer.full_name, "email": customer.email},
    }


def _penalty_for(condition: str, override: float | None = None) -> Decimal:
    if override is not None:
        return Decimal(str(override)).quantize(Decimal("0.01"))
    return Decimal(
        {
            "good": 0,
            "minor_damage": settings.MINOR_DAMAGE_FEE,
            "major_damage": settings.MAJOR_DAMAGE_FEE,
            "total_loss": settings.TOTAL_LOSS_FEE,
        }[condition]
    ).quantize(Decimal("0.01"))


async def _booking_triplet(db: AsyncSession, booking_id: str):
    row = (
        await db.execute(
            select(Booking, Vehicle, User)
            .join(Vehicle, Vehicle.id == Booking.vehicle_id)
            .join(User, User.id == Booking.customer_id)
            .where(Booking.id == booking_id)
        )
    ).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    return row


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_inspection(payload: InspectionRequest, current_user: User = Depends(require_vehicle_manager), db: AsyncSession = Depends(get_db)):
    booking, car, customer = await _booking_triplet(db, payload.booking_id)
    if car.manager_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the owning manager can inspect this booking")
    if booking.status not in {"active", "completed"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only active or completed bookings can be inspected")
    existing = await db.scalar(select(VehicleInspection).where(VehicleInspection.booking_id == booking.id))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Inspection already exists for this booking")

    penalty = _penalty_for(payload.condition, payload.custom_penalty_amount)
    charged = False
    if penalty > 0:
        wallet = await get_or_create_wallet(db, booking.customer_id)
        if Decimal(str(wallet.balance)) >= penalty:
            wallet.balance = Decimal(str(wallet.balance)) - penalty
            add_wallet_transaction(db, booking.customer_id, "debit", penalty, wallet.balance, f"Damage penalty for {booking.booking_ref}", booking.id)
            charged = True

    inspection = VehicleInspection(
        booking_id=booking.id,
        inspected_by=current_user.id,
        inspection_time=datetime.utcnow(),
        condition=payload.condition,
        damage_notes=payload.damage_notes,
        damage_images=payload.damage_images or [],
        penalty_amount=penalty,
        penalty_charged=charged,
        penalty_reason=payload.penalty_reason,
    )
    db.add(inspection)
    booking.status = "completed"
    booking.actual_return_time = booking.actual_return_time or datetime.utcnow()
    await db.commit()
    await db.refresh(inspection)

    if penalty > 0:
        message = f"A damage penalty of ₹{money(penalty):,.0f} has been {'charged' if charged else 'recorded for payment'} for booking {booking.booking_ref}."
        await create_notification(customer.id, "Damage penalty recorded", message, "payment", action_url=f"/customer/bookings/{booking.id}", meta={"booking_id": booking.id, "inspection_id": inspection.id})
        penalty_payload = {
            "booking_id": booking.id,
            "booking_ref": booking.booking_ref,
            "vehicle_name": car.title,
            "damage_description": payload.damage_notes or payload.penalty_reason or payload.condition.replace("_", " "),
            "penalty_amount": money(penalty),
        }
        try:
            send_damage_penalty_email.delay(customer.email, penalty_payload)
        except Exception:
            await email_utils.send_damage_penalty_email(customer.email, penalty_payload)

    return {"inspection": _inspection_payload(inspection, booking, car, customer), "penalty_charged": charged}


@router.get("/booking/{booking_id}")
async def inspection_for_booking(booking_id: str, current_user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    booking, car, customer = await _booking_triplet(db, booking_id)
    if current_user.role != "admin" and current_user.id not in {booking.customer_id, car.manager_id}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed to view this inspection")
    inspection = await db.scalar(select(VehicleInspection).where(VehicleInspection.booking_id == booking_id))
    if inspection is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inspection not found")
    return {"inspection": _inspection_payload(inspection, booking, car, customer)}


@admin_router.get("/inspections")
async def admin_inspections(
    condition: str | None = None,
    penalty_charged: bool | None = None,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    filters = []
    if condition:
        filters.append(VehicleInspection.condition == condition)
    if penalty_charged is not None:
        filters.append(VehicleInspection.penalty_charged.is_(penalty_charged))
    rows = (
        await db.execute(
            select(VehicleInspection, Booking, Vehicle, User)
            .join(Booking, Booking.id == VehicleInspection.booking_id)
            .join(Vehicle, Vehicle.id == Booking.vehicle_id)
            .join(User, User.id == Booking.customer_id)
            .where(and_(*filters) if filters else True)
            .order_by(VehicleInspection.created_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
    ).all()
    return {"items": [_inspection_payload(inspection, booking, car, customer) for inspection, booking, car, customer in rows], "page": page, "limit": limit}
