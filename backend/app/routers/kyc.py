import re
from datetime import datetime
from io import BytesIO
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.user import User, UserKYC
from app.mongo_models.analytics import log_activity
from app.mongo_models.notification import create_notification
from app.tasks.email_tasks import send_kyc_approved_email, send_kyc_rejected_email, send_kyc_submission_confirmation
from app.utils.auth import get_current_active_user, require_admin
from app.utils.validators import validate_aadhar


router = APIRouter(prefix="/kyc", tags=["kyc"])
admin_router = APIRouter(prefix="/admin/kyc", tags=["admin-kyc"])

ALLOWED_KYC_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "application/pdf": ".pdf"}
MAX_KYC_BYTES = 5 * 1024 * 1024


class KYCRejectRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=1000)


def _dt(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _mask_number(value: str | None, groups: bool = False) -> str | None:
    if not value:
        return value
    digits = re.sub(r"\D", "", value)
    if len(digits) <= 4:
        return digits
    if groups:
        return f"XXXX-XXXX-{digits[-4:]}"
    return f"{'X' * max(len(digits) - 4, 0)}{digits[-4:]}"


def _kyc_payload(kyc: UserKYC | None) -> dict:
    if kyc is None:
        return {"status": "not_submitted", "record": None}
    return {
        "status": kyc.kyc_status,
        "record": {
            "id": kyc.id,
            "user_id": kyc.user_id,
            "dl_number": _mask_number(kyc.dl_number),
            "aadhar_number": _mask_number(kyc.aadhar_number, groups=True),
            "dl_front_image": kyc.dl_front_image,
            "dl_back_image": kyc.dl_back_image,
            "aadhar_front_image": kyc.aadhar_front_image,
            "aadhar_back_image": kyc.aadhar_back_image,
            "rejection_reason": kyc.rejection_reason,
            "submitted_at": _dt(kyc.submitted_at),
            "reviewed_at": _dt(kyc.reviewed_at),
            "reviewed_by": kyc.reviewed_by,
        },
    }


async def _save_kyc_file(user_id: str, upload: UploadFile, name: str) -> str:
    if upload.content_type not in ALLOWED_KYC_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{name} must be a JPG, PNG, or PDF")
    data = await upload.read()
    if len(data) > MAX_KYC_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{name} must be 5MB or smaller")

    directory = Path(settings.UPLOAD_DIR) / "kyc" / user_id
    directory.mkdir(parents=True, exist_ok=True)

    if upload.content_type == "application/pdf":
        file_path = directory / f"{name}.pdf"
        file_path.write_bytes(data)
        return f"/uploads/kyc/{user_id}/{name}.pdf"

    try:
        image = Image.open(BytesIO(data)).convert("RGB")
    except UnidentifiedImageError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{name} is not a valid image") from exc
    image.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
    file_path = directory / f"{name}.jpg"
    image.save(file_path, "JPEG", quality=82, optimize=True)
    return f"/uploads/kyc/{user_id}/{name}.jpg"


async def _upsert_kyc(
    db: AsyncSession,
    current_user: User,
    dl_number: str,
    aadhar_number: str,
    dl_front: UploadFile,
    dl_back: UploadFile,
    aadhar_front: UploadFile,
    aadhar_back: UploadFile,
) -> UserKYC:
    digits = validate_aadhar(aadhar_number)
    if len(dl_number.strip()) < 6:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Driver's license number looks too short")

    kyc = await db.scalar(select(UserKYC).where(UserKYC.user_id == current_user.id))
    if kyc is None:
        kyc = UserKYC(user_id=current_user.id)
        db.add(kyc)

    kyc.dl_number = dl_number.strip()
    kyc.aadhar_number = _mask_number(digits, groups=True)
    kyc.dl_front_image = await _save_kyc_file(current_user.id, dl_front, "dl_front")
    kyc.dl_back_image = await _save_kyc_file(current_user.id, dl_back, "dl_back")
    kyc.aadhar_front_image = await _save_kyc_file(current_user.id, aadhar_front, "aadhar_front")
    kyc.aadhar_back_image = await _save_kyc_file(current_user.id, aadhar_back, "aadhar_back")
    kyc.kyc_status = "under_review"
    kyc.rejection_reason = None
    kyc.submitted_at = datetime.utcnow()
    kyc.reviewed_at = None
    kyc.reviewed_by = None
    await db.flush()
    return kyc


async def _notify_admins(db: AsyncSession, user: User, kyc: UserKYC) -> None:
    admins = (await db.execute(select(User).where(User.role == "admin", User.is_active.is_(True)))).scalars().all()
    for admin in admins:
        await create_notification(
            admin.id,
            "KYC submitted",
            f"{user.full_name} submitted documents for review.",
            "kyc",
            action_url="/admin/kyc",
            meta={"kyc_id": kyc.id, "user_id": user.id},
        )


@router.get("/status")
async def get_kyc_status(current_user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    kyc = await db.scalar(select(UserKYC).where(UserKYC.user_id == current_user.id))
    return _kyc_payload(kyc)


@router.post("/submit")
async def submit_kyc(
    dl_number: str = Form(...),
    aadhar_number: str = Form(...),
    dl_front: UploadFile = File(...),
    dl_back: UploadFile = File(...),
    aadhar_front: UploadFile = File(...),
    aadhar_back: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    kyc = await _upsert_kyc(db, current_user, dl_number, aadhar_number, dl_front, dl_back, aadhar_front, aadhar_back)
    await db.commit()
    await _notify_admins(db, current_user, kyc)
    try:
        send_kyc_submission_confirmation.delay(current_user.email, current_user.full_name)
    except Exception:
        pass
    return {"message": "KYC submitted successfully. We'll review within 24 hours.", "status": "under_review"}


@router.post("/resubmit")
async def resubmit_kyc(
    dl_number: str = Form(...),
    aadhar_number: str = Form(...),
    dl_front: UploadFile = File(...),
    dl_back: UploadFile = File(...),
    aadhar_front: UploadFile = File(...),
    aadhar_back: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.scalar(select(UserKYC).where(UserKYC.user_id == current_user.id))
    if existing is None or existing.kyc_status != "rejected":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only rejected KYC records can be resubmitted")
    kyc = await _upsert_kyc(db, current_user, dl_number, aadhar_number, dl_front, dl_back, aadhar_front, aadhar_back)
    await db.commit()
    await _notify_admins(db, current_user, kyc)
    try:
        send_kyc_submission_confirmation.delay(current_user.email, current_user.full_name)
    except Exception:
        pass
    return {"message": "KYC submitted successfully. We'll review within 24 hours.", "status": "under_review"}


@admin_router.get("")
async def list_admin_kyc(
    status_filter: str | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    conditions = []
    if status_filter:
        conditions.append(UserKYC.kyc_status == status_filter)
    total = await db.scalar(select(func.count()).select_from(UserKYC).where(*conditions)) or 0
    rows = (
        await db.execute(
            select(UserKYC, User)
            .join(User, User.id == UserKYC.user_id)
            .where(*conditions)
            .order_by(UserKYC.submitted_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
    ).all()
    return {
        "items": [
            _kyc_payload(kyc)["record"]
            | {
                "status": kyc.kyc_status,
                "user": {"id": user.id, "full_name": user.full_name, "email": user.email, "phone": user.phone},
            }
            for kyc, user in rows
        ],
        "total": total,
        "page": page,
        "pages": (total + limit - 1) // limit if total else 0,
    }


@admin_router.post("/{kyc_id}/approve")
async def approve_kyc(
    kyc_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    kyc = await db.scalar(select(UserKYC).where(UserKYC.id == kyc_id))
    if kyc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KYC record not found")
    user = await db.scalar(select(User).where(User.id == kyc.user_id))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    kyc.kyc_status = "approved"
    kyc.reviewed_at = datetime.utcnow()
    kyc.reviewed_by = admin.id
    kyc.rejection_reason = None
    user.is_verified = True
    await db.commit()
    try:
        send_kyc_approved_email.delay(user.email, user.full_name)
    except Exception:
        pass
    await create_notification(user.id, "KYC verified", "Your documents are approved. You can now book vehicles.", "kyc", action_url="/dashboard/kyc", meta={"kyc_id": kyc.id})
    await log_activity(admin.id, "kyc_approved", "user_kyc", kyc.id)
    return {"status": "approved"}


@admin_router.post("/{kyc_id}/reject")
async def reject_kyc(
    kyc_id: str,
    payload: KYCRejectRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    kyc = await db.scalar(select(UserKYC).where(UserKYC.id == kyc_id))
    if kyc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KYC record not found")
    user = await db.scalar(select(User).where(User.id == kyc.user_id))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    kyc.kyc_status = "rejected"
    kyc.rejection_reason = payload.reason
    kyc.reviewed_at = datetime.utcnow()
    kyc.reviewed_by = admin.id
    await db.commit()
    try:
        send_kyc_rejected_email.delay(user.email, user.full_name, payload.reason)
    except Exception:
        pass
    await create_notification(user.id, "KYC rejected", payload.reason, "kyc", action_url="/dashboard/kyc", meta={"kyc_id": kyc.id})
    return {"status": "rejected"}
