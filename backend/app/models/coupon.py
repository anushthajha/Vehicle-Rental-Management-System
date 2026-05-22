from decimal import Decimal

from sqlalchemy import DECIMAL, Boolean, DateTime, Enum, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TimestampMixin, generate_uuid


class Coupon(TimestampMixin, Base):
    __tablename__ = "coupons"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    discount_type: Mapped[str] = mapped_column(
        Enum("percent", "flat", name="coupon_discount_type"),
        nullable=False,
    )
    discount_value: Mapped[Decimal] = mapped_column(DECIMAL(10, 2), nullable=False)
    max_discount: Mapped[Decimal | None] = mapped_column(DECIMAL(10, 2), nullable=True)
    min_booking_amount: Mapped[Decimal] = mapped_column(DECIMAL(10, 2), default=Decimal("0.00"), nullable=False)
    usage_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    used_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    valid_from: Mapped[DateTime] = mapped_column(DateTime, nullable=False)
    valid_until: Mapped[DateTime] = mapped_column(DateTime, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    applicable_for: Mapped[str] = mapped_column(
        Enum("all", "new_users", "specific_users", name="coupon_applicable_for"),
        default="all",
        nullable=False,
    )


class CouponUsage(Base):
    __tablename__ = "coupon_usages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    coupon_id: Mapped[str] = mapped_column(String(36), ForeignKey("coupons.id"), nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    booking_id: Mapped[str] = mapped_column(String(36), ForeignKey("bookings.id"), nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime, default=func.now(), nullable=False)
