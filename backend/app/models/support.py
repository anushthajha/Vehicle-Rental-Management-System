from sqlalchemy import DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TimestampMixin, generate_uuid


class SupportTicket(TimestampMixin, Base):
    __tablename__ = "support_tickets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    booking_ref: Mapped[str | None] = mapped_column(String(12), nullable=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    subject: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(
        Enum("booking", "payment", "car_issue", "account", "other", name="support_ticket_category"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        Enum("open", "in_progress", "resolved", "closed", name="support_ticket_status"),
        default="open",
        nullable=False,
    )
    priority: Mapped[str] = mapped_column(
        Enum("low", "medium", "high", name="support_ticket_priority"),
        default="medium",
        nullable=False,
    )
