from decimal import Decimal

from sqlalchemy import DECIMAL, Boolean, DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import generate_uuid


class HostProfile(Base):
    __tablename__ = "host_profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), unique=True, nullable=False)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    response_time: Mapped[str | None] = mapped_column(String(100), nullable=True)
    acceptance_rate: Mapped[Decimal] = mapped_column(DECIMAL(5, 2), default=Decimal("0.00"), nullable=False)
    total_listings: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    average_rating: Mapped[Decimal] = mapped_column(DECIMAL(3, 2), default=Decimal("0.00"), nullable=False)
    total_reviews: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_superhost: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    joined_as_host_at: Mapped[DateTime] = mapped_column(DateTime, default=func.now(), nullable=False)
    payout_bank_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    payout_account_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    payout_ifsc: Mapped[str | None] = mapped_column(String(20), nullable=True)
    payout_account_holder: Mapped[str | None] = mapped_column(String(200), nullable=True)


class HostPayoutRequest(Base):
    __tablename__ = "host_payout_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    host_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(DECIMAL(10, 2), nullable=False)
    status: Mapped[str] = mapped_column(
        Enum("pending", "processing", "paid", "failed", name="host_payout_status"),
        default="pending",
        nullable=False,
    )
    requested_at: Mapped[DateTime] = mapped_column(DateTime, default=func.now(), nullable=False)
    processed_at: Mapped[DateTime | None] = mapped_column(DateTime, nullable=True)
