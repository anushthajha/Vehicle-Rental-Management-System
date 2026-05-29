from decimal import Decimal

from sqlalchemy import DECIMAL, Boolean, DateTime, Enum, ForeignKey, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import generate_uuid


class VehicleInspection(Base):
    __tablename__ = "vehicle_inspections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    booking_id: Mapped[str] = mapped_column(String(36), ForeignKey("bookings.id"), unique=True, index=True, nullable=False)
    inspected_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    inspection_time: Mapped[DateTime] = mapped_column(DateTime, default=func.now(), nullable=False)
    condition: Mapped[str] = mapped_column(
        Enum("good", "minor_damage", "major_damage", "total_loss", name="vehicle_inspection_condition"),
        nullable=False,
    )
    damage_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    damage_images: Mapped[list | None] = mapped_column(JSON, nullable=True)
    penalty_amount: Mapped[Decimal] = mapped_column(DECIMAL(10, 2), default=Decimal("0.00"), nullable=False)
    penalty_charged: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    penalty_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime, default=func.now(), nullable=False)
