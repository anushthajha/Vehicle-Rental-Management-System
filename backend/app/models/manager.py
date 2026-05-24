from decimal import Decimal

from sqlalchemy import DECIMAL, Boolean, DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import generate_uuid


class ManagerProfile(Base):
    __tablename__ = "manager_profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), unique=True, nullable=False)
    assigned_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    department: Mapped[str | None] = mapped_column(String(100), nullable=True)
    assigned_at: Mapped[DateTime] = mapped_column(DateTime, default=func.now(), nullable=False)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    total_vehicles: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_bookings_handled: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_revenue_generated: Mapped[Decimal] = mapped_column(DECIMAL(12, 2), default=Decimal("0.00"), nullable=False)
    average_vehicle_rating: Mapped[Decimal] = mapped_column(DECIMAL(3, 2), default=Decimal("0.00"), nullable=False)
    acceptance_rate: Mapped[Decimal] = mapped_column(DECIMAL(5, 2), default=Decimal("0.00"), nullable=False)
    response_time_avg_hours: Mapped[Decimal | None] = mapped_column(DECIMAL(5, 2), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    total_reviews: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_super_manager: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    payout_bank_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    payout_account_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    payout_ifsc: Mapped[str | None] = mapped_column(String(20), nullable=True)
    payout_account_holder: Mapped[str | None] = mapped_column(String(200), nullable=True)

    @property
    def response_time(self) -> str | None:
        if self.response_time_avg_hours is None:
            return None
        hours = float(self.response_time_avg_hours)
        if hours <= 1:
            return "Within 1 hour"
        if hours <= 24:
            return f"Within {int(round(hours))} hours"
        return "Within a day"

    @response_time.setter
    def response_time(self, value: str | None) -> None:
        if not value:
            self.response_time_avg_hours = None
            return
        lowered = value.lower()
        if "1 hour" in lowered:
            self.response_time_avg_hours = Decimal("1.00")
        elif "day" in lowered:
            self.response_time_avg_hours = Decimal("24.00")
        else:
            self.response_time_avg_hours = Decimal("4.00")

    @property
    def total_listings(self) -> int:
        return self.total_vehicles

    @total_listings.setter
    def total_listings(self, value: int) -> None:
        self.total_vehicles = value

    @property
    def average_rating(self) -> Decimal:
        return self.average_vehicle_rating

    @average_rating.setter
    def average_rating(self, value: Decimal) -> None:
        self.average_vehicle_rating = value

class ManagerPayoutRequest(Base):
    __tablename__ = "manager_payout_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    manager_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(DECIMAL(10, 2), nullable=False)
    status: Mapped[str] = mapped_column(
        Enum("pending", "processing", "paid", "failed", name="manager_payout_status"),
        default="pending",
        nullable=False,
    )
    requested_at: Mapped[DateTime] = mapped_column(DateTime, default=func.now(), nullable=False)
    processed_at: Mapped[DateTime | None] = mapped_column(DateTime, nullable=True)

    @property
    def managerId(self) -> str:
        return self.manager_id

    @managerId.setter
    def managerId(self, value: str) -> None:
        self.manager_id = value
