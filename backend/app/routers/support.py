from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.support import SupportTicket
from app.models.user import User
from app.mongo_models.notification import create_notification
from app.mongo_models.support_message import add_support_message, get_ticket_messages
from app.utils.auth import get_current_active_user, verify_token
from app.utils.validators import validate_phone


router = APIRouter(prefix="/support", tags=["support"])
optional_oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

PRIORITY_BY_CATEGORY = {"payment": "high", "car_issue": "high", "booking": "medium", "account": "low", "other": "low"}


class TicketCreateRequest(BaseModel):
    booking_ref: str | None = Field(default=None, max_length=12)
    subject: str = Field(min_length=3, max_length=500)
    description: str = Field(min_length=20, max_length=4000)
    category: str = Field(pattern="^(booking|payment|car_issue|account|other)$")
    email: EmailStr | None = None
    name: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=20)

    @field_validator("phone")
    @classmethod
    def phone_is_valid(cls, value: str | None) -> str | None:
        return validate_phone(value) if value else value


class ContactRequest(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=20)
    category: str = Field(pattern="^(booking|payment|car_issue|account|other)$")
    message: str = Field(min_length=20, max_length=4000)

    @field_validator("phone")
    @classmethod
    def phone_is_valid(cls, value: str | None) -> str | None:
        return validate_phone(value) if value else value


class MessageRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


def _dt(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


async def _optional_user(
    token: str | None = Depends(optional_oauth2),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    if not token:
        return None
    payload = await verify_token(token)
    if payload.get("type") != "access":
        return None
    user = await db.scalar(select(User).where(User.id == payload.get("sub"), User.is_active.is_(True)))
    return user


async def _notify_admins(db: AsyncSession, ticket: SupportTicket, title: str, message: str) -> None:
    admins = (await db.execute(select(User).where(User.role == "admin", User.is_active.is_(True)))).scalars().all()
    for admin in admins:
        await create_notification(admin.id, title, message, "system", action_url="/admin/support", meta={"ticket_id": ticket.id})


async def _save_attachment(ticket_id: str, upload: UploadFile | None) -> str | None:
    if upload is None:
        return None
    data = await upload.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Attachment must be 5MB or smaller")
    suffix = Path(upload.filename or "").suffix[:12] or ".bin"
    directory = Path(settings.UPLOAD_DIR) / "support" / ticket_id
    directory.mkdir(parents=True, exist_ok=True)
    file_path = directory / f"{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}{suffix}"
    file_path.write_bytes(data)
    return f"/uploads/support/{ticket_id}/{file_path.name}"


def _ticket_payload(ticket: SupportTicket, latest: dict | None = None) -> dict:
    return {
        "id": ticket.id,
        "booking_ref": ticket.booking_ref,
        "user_id": ticket.user_id,
        "contact_name": ticket.contact_name,
        "contact_email": ticket.contact_email,
        "contact_phone": ticket.contact_phone,
        "subject": ticket.subject,
        "description": ticket.description,
        "category": ticket.category,
        "status": ticket.status,
        "priority": ticket.priority,
        "assigned_admin_id": ticket.assigned_admin_id,
        "created_at": _dt(ticket.created_at),
        "updated_at": _dt(ticket.updated_at),
        "latest_message": latest,
    }


async def _ticket_with_access(ticket_id: str, current_user: User, db: AsyncSession) -> SupportTicket:
    ticket = await db.scalar(select(SupportTicket).where(SupportTicket.id == ticket_id))
    if ticket is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    # Admin and vehicle managers can access all tickets; customers only their own
    if current_user.role not in ("admin", "vehicle_manager") and ticket.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed to access this ticket")
    return ticket


async def _create_ticket(db: AsyncSession, payload: TicketCreateRequest, user: User | None) -> SupportTicket:
    if user is None and not payload.email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is required for anonymous support tickets")
    ticket = SupportTicket(
        booking_ref=payload.booking_ref,
        user_id=user.id if user else None,
        contact_name=user.full_name if user else payload.name,
        contact_email=user.email if user else str(payload.email),
        contact_phone=user.phone if user else payload.phone,
        subject=payload.subject,
        description=payload.description,
        category=payload.category,
        priority=PRIORITY_BY_CATEGORY.get(payload.category, "low"),
        status="open",
    )
    db.add(ticket)
    await db.flush()
    await add_support_message(ticket.id, user.id if user else "anonymous", user.full_name if user else (payload.name or str(payload.email)), "user", payload.description)
    await _notify_admins(db, ticket, "New support ticket", f"{ticket.subject} needs review.")
    return ticket


@router.post("/tickets", status_code=status.HTTP_201_CREATED)
async def create_ticket(
    payload: TicketCreateRequest,
    current_user: User | None = Depends(_optional_user),
    db: AsyncSession = Depends(get_db),
):
    ticket = await _create_ticket(db, payload, current_user)
    await db.commit()
    return {"ticket_id": ticket.id, "message": f"Ticket #{ticket.id[:8]} created. We'll respond within 24 hours."}


@router.get("/tickets")
async def list_tickets(current_user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    # Admin and vehicle managers see all tickets; customers see only their own
    conditions = [] if current_user.role in ("admin", "vehicle_manager") else [SupportTicket.user_id == current_user.id]
    tickets = (await db.execute(select(SupportTicket).where(*conditions).order_by(SupportTicket.updated_at.desc()))).scalars().all()
    items = []
    for ticket in tickets:
        messages = await get_ticket_messages(ticket.id)
        items.append(_ticket_payload(ticket, messages[-1] if messages else None))
    return {"tickets": items}


@router.get("/tickets/{ticket_id}")
async def get_ticket(ticket_id: str, current_user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    ticket = await _ticket_with_access(ticket_id, current_user, db)
    return {"ticket": _ticket_payload(ticket), "messages": await get_ticket_messages(ticket.id)}


@router.post("/tickets/{ticket_id}/messages", status_code=status.HTTP_201_CREATED)
async def add_ticket_message(
    ticket_id: str,
    message: str = Form(...),
    attachment: UploadFile | None = File(default=None),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    ticket = await _ticket_with_access(ticket_id, current_user, db)
    attachment_url = await _save_attachment(ticket.id, attachment)
    # Admin and vehicle managers reply as staff; customers reply as user
    is_staff = current_user.role in ("admin", "vehicle_manager")
    sender_role = "admin" if is_staff else "user"
    await add_support_message(ticket.id, current_user.id, current_user.full_name, sender_role, message, attachment_url)
    ticket.updated_at = datetime.utcnow()
    if not is_staff:
        ticket.status = "in_progress"
        await _notify_admins(db, ticket, "Support ticket updated", f"{current_user.full_name} replied to {ticket.subject}.")
    elif ticket.user_id:
        await create_notification(ticket.user_id, "Support replied", f"SigFleet Support replied to {ticket.subject}.", "system", action_url="/dashboard/support", meta={"ticket_id": ticket.id})
    await db.commit()
    return {"message": "Message sent", "attachment_url": attachment_url}


@router.patch("/tickets/{ticket_id}/close")
async def close_ticket(ticket_id: str, current_user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    ticket = await _ticket_with_access(ticket_id, current_user, db)
    if ticket.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the ticket owner can close this ticket")
    if ticket.status != "resolved":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ticket can only be closed after staff marks it as resolved")
    ticket.status = "closed"
    ticket.updated_at = datetime.utcnow()
    await add_support_message(ticket.id, "system", "SigFleet Support", "system", "Customer marked as satisfied. Ticket closed.")
    await db.commit()
    return {"status": "closed"}


@router.post("/contact", status_code=status.HTTP_201_CREATED)
async def contact_support(payload: ContactRequest, db: AsyncSession = Depends(get_db)):
    ticket_payload = TicketCreateRequest(
        subject=f"Contact request: {payload.category.replace('_', ' ')}",
        description=payload.message,
        category=payload.category,
        email=payload.email,
        name=payload.name,
        phone=payload.phone,
    )
    await _create_ticket(db, ticket_payload, None)
    await db.commit()
    return {"message": "Thank you. We'll get back to you within 24 hours."}
