from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TimestampMixin, generate_uuid


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    profile_picture: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_vehicle_manager: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    role: Mapped[str] = mapped_column(
        Enum("customer", "vehicle_manager", "admin", name="user_role"),
        default="customer",
        nullable=False,
    )
    last_login: Mapped[DateTime | None] = mapped_column(DateTime, nullable=True)

    @property
    def phoneNumber(self) -> str | None:
        return self.phone

    @phoneNumber.setter
    def phoneNumber(self, value: str | None) -> None:
        self.phone = value


class UserKYC(Base):
    __tablename__ = "user_kyc"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), unique=True, nullable=False)
    dl_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    dl_front_image: Mapped[str | None] = mapped_column(String(500), nullable=True)
    dl_back_image: Mapped[str | None] = mapped_column(String(500), nullable=True)
    aadhar_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    aadhar_front_image: Mapped[str | None] = mapped_column(String(500), nullable=True)
    aadhar_back_image: Mapped[str | None] = mapped_column(String(500), nullable=True)
    kyc_status: Mapped[str] = mapped_column(
        Enum("pending", "under_review", "approved", "rejected", name="kyc_status"),
        default="pending",
        nullable=False,
    )
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    submitted_at: Mapped[DateTime | None] = mapped_column(DateTime, nullable=True)
    reviewed_at: Mapped[DateTime | None] = mapped_column(DateTime, nullable=True)
    reviewed_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)


class EmailVerification(Base):
    __tablename__ = "email_verifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    token: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    expires_at: Mapped[DateTime] = mapped_column(DateTime, nullable=False)
    is_used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime, default=func.now(), nullable=False)


class PasswordReset(Base):
    __tablename__ = "password_resets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    token: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    expires_at: Mapped[DateTime] = mapped_column(DateTime, nullable=False)
    is_used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime, default=func.now(), nullable=False)
