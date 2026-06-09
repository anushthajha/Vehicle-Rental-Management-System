from decimal import Decimal

from sqlalchemy import DECIMAL, Boolean, DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, generate_uuid


class Vehicle(TimestampMixin, Base):
    __tablename__ = "vehicles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    manager_id: Mapped[str] = mapped_column(
        "manager_id",
        String(36),
        ForeignKey("users.id"),
        index=True,
        nullable=False,
        comment="Application layer requires users.role='vehicle_manager'.",
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    make: Mapped[str] = mapped_column(String(100), nullable=False)
    car_model: Mapped[str] = mapped_column("model", String(100), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    color: Mapped[str | None] = mapped_column(String(50), nullable=True)
    transmission: Mapped[str] = mapped_column(
        Enum("manual", "automatic", name="car_transmission"),
        nullable=False,
    )
    fuel_type: Mapped[str] = mapped_column(
        Enum("petrol", "diesel", "electric", "hybrid", "cng", name="car_fuel_type"),
        nullable=False,
    )
    seats: Mapped[int] = mapped_column(Integer, nullable=False)
    category_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("vehicle_categories.id"), index=True, nullable=True)
    vehicle_type_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("vehicle_types.id"), index=True, nullable=True)
    category = relationship("VehicleCategory", back_populates="vehicles")
    vehicle_type = relationship("VehicleType", back_populates="vehicles")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    registration_number: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    rc_document_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    insurance_document_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    location_city: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    location_area: Mapped[str | None] = mapped_column(String(200), nullable=True)
    location_lat: Mapped[Decimal | None] = mapped_column(DECIMAL(9, 6), nullable=True)
    location_lng: Mapped[Decimal | None] = mapped_column(DECIMAL(9, 6), nullable=True)
    location_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    price_per_hour: Mapped[Decimal] = mapped_column(DECIMAL(10, 2), nullable=False)
    price_per_day: Mapped[Decimal] = mapped_column(DECIMAL(10, 2), nullable=False)
    min_trip_hours: Mapped[int] = mapped_column(Integer, default=4, nullable=False)
    max_trip_days: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    security_deposit: Mapped[Decimal] = mapped_column(DECIMAL(10, 2), default=Decimal("0.00"), nullable=False)
    extra_km_charge: Mapped[Decimal] = mapped_column(DECIMAL(10, 2), default=Decimal("0.00"), nullable=False)
    included_km_per_day: Mapped[int] = mapped_column(Integer, default=300, nullable=False)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_approved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    has_gps_tracker: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    has_keyless_entry: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    has_ac: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    has_music_system: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    has_sunroof: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    has_child_seat: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    has_luggage_carrier: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    minimum_customer_rating: Mapped[Decimal | None] = mapped_column(DECIMAL(3, 2), nullable=True)
    auto_accept_bookings: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    average_rating: Mapped[Decimal] = mapped_column(DECIMAL(3, 2), default=Decimal("0.00"), nullable=False)
    total_trips: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_units: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    total_earnings: Mapped[Decimal] = mapped_column(DECIMAL(12, 2), default=Decimal("0.00"), nullable=False)


class VehicleImage(Base):
    __tablename__ = "car_images"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    vehicle_id: Mapped[str] = mapped_column(String(36), ForeignKey("vehicles.id"), index=True, nullable=False)
    image_url: Mapped[str] = mapped_column(String(500), nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime, default=func.now(), nullable=False)


class VehicleAvailabilityBlock(Base):
    __tablename__ = "car_availability_blocks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    vehicle_id: Mapped[str] = mapped_column(String(36), ForeignKey("vehicles.id"), nullable=False)
    blocked_from: Mapped[DateTime] = mapped_column(DateTime, nullable=False)
    blocked_to: Mapped[DateTime] = mapped_column(DateTime, nullable=False)
    reason: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime, default=func.now(), nullable=False)


class VehiclePricingRule(Base):
    __tablename__ = "car_pricing_rules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    vehicle_id: Mapped[str] = mapped_column(String(36), ForeignKey("vehicles.id"), nullable=False)
    rule_type: Mapped[str] = mapped_column(
        Enum("weekend_discount", "long_trip_discount", "peak_surcharge", name="car_pricing_rule_type"),
        nullable=False,
    )
    discount_percent: Mapped[Decimal | None] = mapped_column(DECIMAL(5, 2), nullable=True)
    surcharge_percent: Mapped[Decimal | None] = mapped_column(DECIMAL(5, 2), nullable=True)
    min_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    applies_on: Mapped[str | None] = mapped_column(String(100), nullable=True)
