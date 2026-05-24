from datetime import datetime, timedelta
from decimal import Decimal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.payment import UserWallet
from app.models.user import EmailVerification, PasswordReset, User, UserKYC
from app.mongo_models.analytics import log_activity
from app.mongo_models.session import create_session
from app.redis import get_redis
from app.tasks.email_tasks import send_password_reset_email, send_verification_email
from app.utils.auth import (
    create_access_token,
    create_refresh_token,
    get_current_user,
    get_password_hash,
    get_token_ttl_seconds,
    oauth2_scheme,
    validate_password_strength,
    verify_password,
    verify_token,
)


router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    confirm_password: str
    full_name: str = Field(min_length=2, max_length=200)
    phone: str | None = None
    phoneNumber: str | None = None

    @field_validator("password")
    @classmethod
    def password_is_strong(cls, value: str) -> str:
        if not validate_password_strength(value):
            raise ValueError("Password must be at least 8 characters and include uppercase, digit, and special character")
        return value

    @field_validator("confirm_password")
    @classmethod
    def passwords_match(cls, value: str, info) -> str:
        if value != info.data.get("password"):
            raise ValueError("Passwords do not match")
        return value

    @field_validator("phone", "phoneNumber")
    @classmethod
    def phone_is_indian_mobile(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().replace(" ", "").replace("-", "")
        if normalized.startswith("+91"):
            normalized = normalized[3:]
        if not normalized.isdigit() or len(normalized) != 10:
            raise ValueError("Phone must be a 10 digit Indian mobile number")
        return normalized


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class EmailRequest(BaseModel):
    email: EmailStr


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str
    confirm_password: str

    @field_validator("new_password")
    @classmethod
    def password_is_strong(cls, value: str) -> str:
        if not validate_password_strength(value):
            raise ValueError("Password must be at least 8 characters and include uppercase, digit, and special character")
        return value

    @field_validator("confirm_password")
    @classmethod
    def passwords_match(cls, value: str, info) -> str:
        if value != info.data.get("new_password"):
            raise ValueError("Passwords do not match")
        return value


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    confirm_new_password: str

    @field_validator("new_password")
    @classmethod
    def password_is_strong(cls, value: str) -> str:
        if not validate_password_strength(value):
            raise ValueError("Password must be at least 8 characters and include uppercase, digit, and special character")
        return value

    @field_validator("confirm_new_password")
    @classmethod
    def passwords_match(cls, value: str, info) -> str:
        if value != info.data.get("new_password"):
            raise ValueError("Passwords do not match")
        return value


def _token_subject(user: User) -> dict:
    return {"sub": user.id, "email": user.email, "role": user.role}


async def _get_wallet_balance(db: AsyncSession, user_id: str) -> Decimal:
    result = await db.execute(select(UserWallet).where(UserWallet.user_id == user_id))
    wallet = result.scalar_one_or_none()
    return wallet.balance if wallet else Decimal("0.00")


async def _get_kyc_status(db: AsyncSession, user_id: str) -> str:
    result = await db.execute(select(UserKYC).where(UserKYC.user_id == user_id))
    kyc = result.scalar_one_or_none()
    return kyc.kyc_status if kyc else "not_submitted"


async def _serialize_user(db: AsyncSession, user: User) -> dict:
    kyc_status = await _get_kyc_status(db, user.id)
    wallet_balance = await _get_wallet_balance(db, user.id)
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "phone": user.phone,
        "phoneNumber": user.phone,
        "role": user.role,
        "is_active": user.is_active,
        "is_verified": user.is_verified,
        "is_host": user.role == "vehicle_manager",
        "profile_picture": user.profile_picture,
        "kyc_status": kyc_status,
        "is_kyc_verified": kyc_status == "approved",
        "wallet_balance": float(wallet_balance),
        "last_login": user.last_login.isoformat() if user.last_login else None,
    }


async def _find_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email.lower()))
    return result.scalar_one_or_none()


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await _find_user_by_email(db, payload.email)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    phone_value = payload.phoneNumber or payload.phone
    if not phone_value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Phone number is required")

    user = User(
        email=payload.email.lower(),
        hashed_password=get_password_hash(payload.password),
        full_name=payload.full_name.strip(),
        phone=phone_value,
        role="customer",
    )
    db.add(user)
    await db.flush()

    db.add(UserWallet(user_id=user.id))
    token = str(uuid4())
    db.add(
        EmailVerification(
            user_id=user.id,
            token=token,
            expires_at=datetime.utcnow() + timedelta(hours=24),
        )
    )
    await db.commit()

    send_verification_email.delay(user.email, user.full_name, token)
    await log_activity(user.id, "register", "user", user.id)
    return {"message": "Account created. Please check your email to verify."}


@router.post("/verify-email")
async def verify_email(token: str = Query(...), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(EmailVerification).where(EmailVerification.token == token))
    verification = result.scalar_one_or_none()
    if verification is None or verification.is_used:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or already used token")
    if verification.expires_at < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Verification link expired. Please request a new one.")

    result = await db.execute(select(User).where(User.id == verification.user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid verification token")

    user.is_verified = True
    verification.is_used = True
    await db.commit()
    return {"message": "Email verified successfully. You can now log in."}


@router.post("/resend-verification")
async def resend_verification(payload: EmailRequest, db: AsyncSession = Depends(get_db)):
    email = payload.email.lower()
    redis = get_redis()
    created = await redis.set(f"resend:{email}", "1", ex=60, nx=True)
    if not created:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Please wait before requesting another link")

    user = await _find_user_by_email(db, email)
    if user and not user.is_verified:
        token = str(uuid4())
        db.add(
            EmailVerification(
                user_id=user.id,
                token=token,
                expires_at=datetime.utcnow() + timedelta(hours=24),
            )
        )
        await db.commit()
        send_verification_email.delay(user.email, user.full_name, token)

    return {"message": "If unverified, a new link has been sent."}


@router.post("/login")
async def login(payload: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    user = await _find_user_by_email(db, payload.email)
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account suspended")
    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"detail": "EMAIL_NOT_VERIFIED", "message": "Please verify your email first."},
        )

    access_token = create_access_token(_token_subject(user))
    refresh_token = create_refresh_token(_token_subject(user))
    user.last_login = datetime.utcnow()
    await db.commit()

    client_ip = request.client.host if request.client else ""
    await create_session(user.id, request.headers.get("user-agent", ""), client_ip)
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": await _serialize_user(db, user),
    }


@router.post("/refresh")
async def refresh(payload: RefreshRequest, db: AsyncSession = Depends(get_db)):
    token_payload = await verify_token(payload.refresh_token)
    if token_payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    result = await db.execute(select(User).where(User.id == token_payload["sub"]))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    access_token = create_access_token(_token_subject(user))
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/logout")
async def logout(token: str = Depends(oauth2_scheme)):
    payload = await verify_token(token)
    ttl = get_token_ttl_seconds(payload)
    if ttl > 0:
        await get_redis().set(f"blacklist:{payload['jti']}", "1", ex=ttl)
    return {"message": "Logged out successfully."}


@router.post("/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    email = payload.email.lower()
    created = await get_redis().set(f"forgot:{email}", "1", ex=300, nx=True)
    if not created:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Please wait before requesting another reset")

    user = await _find_user_by_email(db, email)
    if user:
        token = str(uuid4())
        db.add(
            PasswordReset(
                user_id=user.id,
                token=token,
                expires_at=datetime.utcnow() + timedelta(hours=2),
            )
        )
        await db.commit()
        send_password_reset_email.delay(user.email, user.full_name, token)

    return {"message": "If that email exists, a password reset link has been sent."}


@router.post("/reset-password")
async def reset_password(payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PasswordReset).where(PasswordReset.token == payload.token))
    reset = result.scalar_one_or_none()
    if reset is None or reset.is_used or reset.expires_at < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired password reset token")

    result = await db.execute(select(User).where(User.id == reset.user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid password reset token")

    user.hashed_password = get_password_hash(payload.new_password)
    reset.is_used = True
    await db.commit()
    await get_redis().set(f"force_logout:{user.id}", int(datetime.utcnow().timestamp()), ex=60 * 60 * 24 * 31)
    return {"message": "Password reset successfully. You can now log in."}


@router.get("/me")
async def me(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await _serialize_user(db, current_user)


@router.patch("/change-password")
async def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    current_user.hashed_password = get_password_hash(payload.new_password)
    await db.commit()
    await get_redis().set(f"force_logout:{current_user.id}", int(datetime.utcnow().timestamp()), ex=60 * 60 * 24 * 31)
    return {"message": "Password changed successfully. Please log in again."}
