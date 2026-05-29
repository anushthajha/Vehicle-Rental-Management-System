from decimal import Decimal

from sqlalchemy import DECIMAL, Boolean, DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TimestampMixin, generate_uuid


class Booking(TimestampMixin, Base):
    __tablename__ = "bookings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    booking_ref: Mapped[str] = mapped_column(String(12), unique=True, index=True, nullable=False)
    vehicle_id: Mapped[str] = mapped_column(String(36), ForeignKey("vehicles.id"), nullable=False)
    customer_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    manager_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    status: Mapped[str] = mapped_column(
        Enum("pending", "confirmed", "active", "completed", "cancelled", "rejected", name="booking_status"),
        nullable=False,
    )
    pickup_datetime: Mapped[DateTime] = mapped_column(DateTime, nullable=False)
    return_datetime: Mapped[DateTime] = mapped_column(DateTime, nullable=False)
    actual_pickup_time: Mapped[DateTime | None] = mapped_column(DateTime, nullable=True)
    actual_return_time: Mapped[DateTime | None] = mapped_column(DateTime, nullable=True)
    pickup_location: Mapped[str | None] = mapped_column(Text, nullable=True)
    drop_location: Mapped[str | None] = mapped_column(Text, nullable=True)
    total_hours: Mapped[Decimal] = mapped_column(DECIMAL(8, 2), nullable=False)
    base_amount: Mapped[Decimal] = mapped_column(DECIMAL(10, 2), nullable=False)
    discount_amount: Mapped[Decimal] = mapped_column(DECIMAL(10, 2), default=Decimal("0.00"), nullable=False)
    coupon_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    insurance_amount: Mapped[Decimal] = mapped_column(DECIMAL(10, 2), default=Decimal("0.00"), nullable=False)
    insurance_plan: Mapped[str | None] = mapped_column(
        Enum("basic", "standard", "platinum", name="insurance_plan"),
        nullable=True,
    )
    security_deposit_amount: Mapped[Decimal] = mapped_column(DECIMAL(10, 2), default=Decimal("0.00"), nullable=False)
    with_chauffeur: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    chauffeur_fee: Mapped[Decimal] = mapped_column(DECIMAL(10, 2), default=Decimal("0.00"), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(DECIMAL(10, 2), nullable=False)
    platform_fee: Mapped[Decimal] = mapped_column(DECIMAL(10, 2), default=Decimal("0.00"), nullable=False)
    manager_earnings: Mapped[Decimal] = mapped_column(DECIMAL(10, 2), default=Decimal("0.00"), nullable=False)
    extra_km_charged: Mapped[Decimal] = mapped_column(DECIMAL(10, 2), default=Decimal("0.00"), nullable=False)
    odometer_start: Mapped[int | None] = mapped_column(Integer, nullable=True)
    odometer_end: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cancellation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    cancelled_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    cancelled_at: Mapped[DateTime | None] = mapped_column(DateTime, nullable=True)
    refund_amount: Mapped[Decimal] = mapped_column(DECIMAL(10, 2), default=Decimal("0.00"), nullable=False)
    refund_status: Mapped[str] = mapped_column(
        Enum("not_applicable", "pending", "processed", name="refund_status"),
        default="not_applicable",
        nullable=False,
    )
    manager_accepted_at: Mapped[DateTime | None] = mapped_column(DateTime, nullable=True)
    customer_notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class BookingExtension(Base):
    __tablename__ = "booking_extensions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    booking_id: Mapped[str] = mapped_column(String(36), ForeignKey("bookings.id"), nullable=False)
    extended_return_datetime: Mapped[DateTime] = mapped_column(DateTime, nullable=False)
    additional_amount: Mapped[Decimal] = mapped_column(DECIMAL(10, 2), nullable=False)
    status: Mapped[str] = mapped_column(
        Enum("pending", "approved", "rejected", name="booking_extension_status"),
        default="pending",
        nullable=False,
    )
    requested_at: Mapped[DateTime] = mapped_column(DateTime, default=func.now(), nullable=False)
    responded_at: Mapped[DateTime | None] = mapped_column(DateTime, nullable=True)
