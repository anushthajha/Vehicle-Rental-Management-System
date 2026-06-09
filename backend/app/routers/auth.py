from datetime import datetime, timedelta
from decimal import Decimal
import json
import re
import secrets
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.agents.registration_agent import notify_admins_new_manager_registered
from app.middleware.rate_limiter import rate_limit
from app.models.payment import UserWallet
from app.models.manager import ManagerProfile
from app.models.user import PasswordReset, User, UserKYC
from app.mongo_models.analytics import log_activity
from app.mongo_models.session import create_session
from app.redis import get_redis
from app.utils import email as email_utils
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
from app.utils.validators import validate_phone


router = APIRouter(prefix="/auth", tags=["auth"])

NAME_RE = re.compile(r"^[A-Za-z][A-Za-z .'-]*$")


def _refresh_cookie_kwargs() -> dict:
    return {
        "httponly": True,
        "secure": settings.COOKIE_SECURE,
        "samesite": settings.COOKIE_SAMESITE,
        "max_age": 30 * 24 * 3600,
        "path": "/api/auth",
    }

# ---------------------------------------------------------------------------
# OTP helpers
# ---------------------------------------------------------------------------

OTP_TTL = 600          # 10 minutes
OTP_MAX_ATTEMPTS = 5
RESEND_COOLDOWN = 60   # seconds


def _generate_otp() -> str:
    """Return a cryptographically random 6-digit OTP string."""
    return str(secrets.randbelow(900000) + 100000)


async def _store_otp(email: str, otp: str) -> None:
    redis = get_redis()
    data = json.dumps({"otp": otp, "attempts": 0, "sent_at": int(datetime.utcnow().timestamp())})
    await redis.setex(f"email_otp:{email.lower()}", OTP_TTL, data)


async def _verify_otp(email: str, entered_otp: str) -> dict:
    redis = get_redis()
    raw = await redis.get(f"email_otp:{email.lower()}")
    if not raw:
        return {"valid": False, "reason": "OTP expired or not found. Please request a new one."}
    data = json.loads(raw)
    if data["attempts"] >= OTP_MAX_ATTEMPTS:
        await redis.delete(f"email_otp:{email.lower()}")
        return {"valid": False, "reason": "Too many incorrect attempts. Please request a new OTP."}
    if data["otp"] != entered_otp:
        data["attempts"] += 1
        await redis.setex(f"email_otp:{email.lower()}", OTP_TTL, json.dumps(data))
        remaining = OTP_MAX_ATTEMPTS - data["attempts"]
        return {"valid": False, "reason": f"Incorrect code. {remaining} attempt{'s' if remaining != 1 else ''} left."}
    await redis.delete(f"email_otp:{email.lower()}")
    return {"valid": True}


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    confirm_password: str
    full_name: str = Field(min_length=4, max_length=200)
    phone: str | None = None
    phoneNumber: str | None = None
    role: str = Field(default="customer", pattern="^(customer|vehicle_manager)$")

    @field_validator("password")
    @classmethod
    def password_is_strong(cls, value: str) -> str:
        if not validate_password_strength(value):
            raise ValueError(
                "Password must be at least 8 characters and include lowercase, uppercase, number, and special character"
            )
        return value

    @field_validator("full_name")
    @classmethod
    def full_name_is_valid(cls, value: str) -> str:
        normalized = " ".join(value.strip().split())
        if len(normalized) < 4:
            raise ValueError("Name must be greater than 3 letters")
        if normalized.isdigit():
            raise ValueError("Name cannot be only numbers")
        if not any(ch.isalpha() for ch in normalized):
            raise ValueError("Name must contain letters")
        if not NAME_RE.match(normalized):
            raise ValueError("Name can contain only letters, spaces, dot, apostrophe, or hyphen")
        return normalized

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
        return validate_phone(value)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class EmailRequest(BaseModel):
    email: EmailStr


class OtpVerifyRequest(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


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
            raise ValueError(
                "Password must be at least 8 characters and include lowercase, uppercase, number, and special character"
            )
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
            raise ValueError(
                "Password must be at least 8 characters and include lowercase, uppercase, number, and special character"
            )
        return value

    @field_validator("confirm_new_password")
    @classmethod
    def passwords_match(cls, value: str, info) -> str:
        if value != info.data.get("new_password"):
            raise ValueError("Passwords do not match")
        return value


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

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
        "is_vehicle_manager": user.role == "vehicle_manager",
        "profile_picture": user.profile_picture,
        "kyc_status": kyc_status,
        "is_kyc_verified": kyc_status == "approved",
        "wallet_balance": float(wallet_balance),
        "last_login": user.last_login.isoformat() if user.last_login else None,
    }


async def _find_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email.lower()))
    return result.scalar_one_or_none()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit("auth_register", 3, 60, "ip"))],
)
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
        role=payload.role,
        is_vehicle_manager=payload.role == "vehicle_manager",
        is_active=payload.role != "vehicle_manager",
        is_verified=False,
    )
    db.add(user)
    await db.flush()

    db.add(UserWallet(user_id=user.id))
    if payload.role == "vehicle_manager":
        db.add(ManagerProfile(user_id=user.id, is_active=False, bio="Pending admin approval."))
    await db.commit()

    if payload.role == "vehicle_manager":
        try:
            await notify_admins_new_manager_registered(user, db)
        except Exception as exc:
            print(f"[AUTH] Manager notification error: {exc}")
        # Managers don't need email OTP — they await admin approval
        await log_activity(user.id, "register", "user", user.id)
        return {"message": "Registration successful! Awaiting admin approval.", "pending_approval": True}

    # Generate and send OTP for customer accounts
    otp = _generate_otp()
    await _store_otp(user.email, otp)

    # Development: print OTP to console for easy testing
    print(f"[DEV OTP] {user.email}: {otp}")

    try:
        await email_utils.send_otp_email(user.email, user.full_name, otp)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Account created, but OTP email failed: {exc}",
        ) from exc

    await log_activity(user.id, "register", "user", user.id)
    return {"message": "OTP sent to your email.", "email": user.email}


@router.post("/verify-otp")
async def verify_otp_endpoint(payload: OtpVerifyRequest, request: Request, db: AsyncSession = Depends(get_db)):
    from fastapi.responses import JSONResponse
    email = payload.email.lower()
    result = await _verify_otp(email, payload.otp)
    if not result["valid"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=result["reason"])

    user = await _find_user_by_email(db, email)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.is_verified = True
    user.last_login = datetime.utcnow()
    await db.commit()

    access_token = create_access_token(_token_subject(user))
    refresh_token = create_refresh_token(_token_subject(user))

    client_ip = request.client.host if request.client else ""
    await create_session(user.id, request.headers.get("user-agent", ""), client_ip)
    await log_activity(user.id, "verify_otp", "user", user.id)

    response = JSONResponse(content={
        "access_token": access_token,
        "token_type": "bearer",
        "user": await _serialize_user(db, user),
    })
    response.set_cookie(
        key="sf_refresh_token",
        value=refresh_token,
        **_refresh_cookie_kwargs(),
    )
    return response


@router.post(
    "/resend-otp",
    dependencies=[Depends(rate_limit("auth_resend_otp", 3, 60, "ip"))],
)
async def resend_otp(payload: EmailRequest, db: AsyncSession = Depends(get_db)):
    email = payload.email.lower()
    user = await _find_user_by_email(db, email)
    if user is None:
        # Don't reveal whether the email exists
        return {"message": "If that email is registered and unverified, a new OTP has been sent."}
    if user.is_verified:
        return {"message": "This email is already verified. Please log in."}

    # Enforce 60-second cooldown using the sent_at field stored in Redis
    redis = get_redis()
    raw = await redis.get(f"email_otp:{email}")
    if raw:
        data = json.loads(raw)
        sent_at = data.get("sent_at", 0)
        elapsed = int(datetime.utcnow().timestamp()) - sent_at
        if elapsed < RESEND_COOLDOWN:
            wait = RESEND_COOLDOWN - elapsed
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Please wait {wait} seconds before requesting a new OTP.",
            )

    otp = _generate_otp()
    await _store_otp(email, otp)

    print(f"[DEV OTP] {email}: {otp}")

    try:
        await email_utils.send_otp_email(user.email, user.full_name, otp)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"OTP email failed: {exc}",
        ) from exc

    return {"message": "New OTP sent to your email."}


@router.post("/login", dependencies=[Depends(rate_limit("auth_login", 5, 60, "ip"))])
async def login(payload: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    from fastapi.responses import JSONResponse
    user = await _find_user_by_email(db, payload.email)
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account suspended")
    if not user.is_verified:
        otp = _generate_otp()
        await _store_otp(user.email, otp)
        print(f"[DEV OTP] {user.email}: {otp}")
        try:
            await email_utils.send_otp_email(user.email, user.full_name, otp)
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "detail": "Email not verified. A new OTP has been sent.",
                "requires_otp": True,
                "email": user.email,
            },
        )

    access_token = create_access_token(_token_subject(user))
    refresh_token = create_refresh_token(_token_subject(user))
    user.last_login = datetime.utcnow()
    await db.commit()

    client_ip = request.client.host if request.client else ""
    await create_session(user.id, request.headers.get("user-agent", ""), client_ip)

    response = JSONResponse(content={
        "access_token": access_token,
        "token_type": "bearer",
        "user": await _serialize_user(db, user),
    })
    # Set refresh token as HttpOnly cookie — never accessible to JS
    response.set_cookie(
        key="sf_refresh_token",
        value=refresh_token,
        **_refresh_cookie_kwargs(),
    )
    return response


@router.post("/refresh")
async def refresh(request: Request, db: AsyncSession = Depends(get_db)):
    from fastapi.responses import JSONResponse
    # Read refresh token from HttpOnly cookie (preferred) or body (fallback for old clients)
    cookie_token = request.cookies.get("sf_refresh_token")
    body_token = None
    try:
        body = await request.json()
        body_token = body.get("refresh_token")
    except Exception:
        pass
    token_str = cookie_token or body_token
    if not token_str:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token provided")

    token_payload = await verify_token(token_str)
    if token_payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    result = await db.execute(select(User).where(User.id == token_payload["sub"]))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    access_token = create_access_token(_token_subject(user))
    # Rotate refresh token on each use
    new_refresh_token = create_refresh_token(_token_subject(user))

    response = JSONResponse(content={"access_token": access_token, "token_type": "bearer"})
    response.set_cookie(
        key="sf_refresh_token",
        value=new_refresh_token,
        **_refresh_cookie_kwargs(),
    )
    return response


@router.post("/logout")
async def logout(request: Request, token: str = Depends(oauth2_scheme)):
    from fastapi.responses import JSONResponse
    payload = await verify_token(token)
    ttl = get_token_ttl_seconds(payload)
    if ttl > 0:
        await get_redis().set(f"blacklist:{payload['jti']}", "1", ex=ttl)
    response = JSONResponse(content={"message": "Logged out successfully."})
    # Clear the refresh token cookie
    response.delete_cookie(key="sf_refresh_token", path="/api/auth", secure=settings.COOKIE_SECURE, samesite=settings.COOKIE_SAMESITE)
    return response


@router.post(
    "/forgot-password",
    dependencies=[Depends(rate_limit("auth_forgot_password", 2, 300, "email"))],
)
async def forgot_password(payload: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    email = payload.email.lower()
    user = await _find_user_by_email(db, email)
    if user:
        token = str(uuid4())
        db.add(
            PasswordReset(
                user_id=user.id,
                token=token,
                expires_at=datetime.utcnow() + timedelta(hours=1),
            )
        )
        await db.commit()
        try:
            await email_utils.send_password_reset_email(user.email, user.full_name, token)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Password reset email failed: {exc}",
            ) from exc

    return {"message": "If that email exists, a password reset link has been sent."}


# ---------------------------------------------------------------------------
# OTP-based password reset (3-step: email → OTP → new password)
# ---------------------------------------------------------------------------

class PasswordResetOtpRequest(BaseModel):
    email: EmailStr


class PasswordResetOtpVerifyRequest(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class PasswordResetNewPasswordRequest(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")
    new_password: str
    confirm_password: str

    @field_validator("new_password")
    @classmethod
    def password_is_strong(cls, value: str) -> str:
        if not validate_password_strength(value):
            raise ValueError(
                "Password must be at least 8 characters and include lowercase, uppercase, number, and special character"
            )
        return value

    @field_validator("confirm_password")
    @classmethod
    def passwords_match(cls, value: str, info) -> str:
        if value != info.data.get("new_password"):
            raise ValueError("Passwords do not match")
        return value


RESET_OTP_PREFIX = "pwd_reset_otp:"


@router.post(
    "/forgot-password-otp",
    dependencies=[Depends(rate_limit("auth_forgot_password_otp", 3, 120, "ip"))],
)
async def forgot_password_otp(payload: PasswordResetOtpRequest, db: AsyncSession = Depends(get_db)):
    """Step 1: Send a 6-digit OTP to the user's email for password reset."""
    email = payload.email.lower()
    user = await _find_user_by_email(db, email)
    # Always return success to avoid email enumeration
    if user and user.is_active:
        otp = _generate_otp()
        redis = get_redis()
        data = json.dumps({"otp": otp, "attempts": 0, "sent_at": int(datetime.utcnow().timestamp())})
        await redis.setex(f"{RESET_OTP_PREFIX}{email}", OTP_TTL, data)
        print(f"[DEV RESET OTP] {email}: {otp}")
        try:
            await email_utils.send_otp_email(user.email, user.full_name, otp)
        except Exception:
            pass
    return {"message": "If that email is registered, a 6-digit OTP has been sent."}


@router.post("/forgot-password-otp/verify")
async def verify_reset_otp(payload: PasswordResetOtpVerifyRequest):
    """Step 2: Verify the OTP (without changing the password yet)."""
    email = payload.email.lower()
    redis = get_redis()
    raw = await redis.get(f"{RESET_OTP_PREFIX}{email}")
    if not raw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OTP expired or not found. Please request a new one.")
    data = json.loads(raw)
    if data["attempts"] >= OTP_MAX_ATTEMPTS:
        await redis.delete(f"{RESET_OTP_PREFIX}{email}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Too many incorrect attempts. Please request a new OTP.")
    if data["otp"] != payload.otp:
        data["attempts"] += 1
        await redis.setex(f"{RESET_OTP_PREFIX}{email}", OTP_TTL, json.dumps(data))
        remaining = OTP_MAX_ATTEMPTS - data["attempts"]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Incorrect code. {remaining} attempt{'s' if remaining != 1 else ''} left.",
        )
    # Mark OTP as verified (keep it so step 3 can confirm it's the same session)
    data["verified"] = True
    await redis.setex(f"{RESET_OTP_PREFIX}{email}", 600, json.dumps(data))
    return {"message": "OTP verified. You can now set a new password."}


@router.post("/forgot-password-otp/reset")
async def reset_password_with_otp(payload: PasswordResetNewPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Step 3: Set new password after OTP has been verified."""
    email = payload.email.lower()
    redis = get_redis()
    raw = await redis.get(f"{RESET_OTP_PREFIX}{email}")
    if not raw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Session expired. Please start over.")
    data = json.loads(raw)
    # Must be verified AND OTP must still match
    if not data.get("verified") or data["otp"] != payload.otp:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired session. Please start over.")

    user = await _find_user_by_email(db, email)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Account not found.")

    user.hashed_password = get_password_hash(payload.new_password)
    await db.commit()
    # Delete the OTP so it can't be reused
    await redis.delete(f"{RESET_OTP_PREFIX}{email}")
    # Force logout all existing sessions
    await redis.set(f"force_logout:{user.id}", int(datetime.utcnow().timestamp()), ex=60 * 60 * 24 * 31)
    return {"message": "Password reset successfully. You can now log in."}


@router.post("/reset-password")
async def reset_password(payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PasswordReset).where(PasswordReset.token == payload.token))
    reset = result.scalar_one_or_none()
    if reset is None or reset.is_used or reset.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset token",
        )

    result = await db.execute(select(User).where(User.id == reset.user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid password reset token",
        )

    user.hashed_password = get_password_hash(payload.new_password)
    reset.is_used = True
    await db.commit()
    await get_redis().set(
        f"force_logout:{user.id}",
        int(datetime.utcnow().timestamp()),
        ex=60 * 60 * 24 * 31,
    )
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
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    current_user.hashed_password = get_password_hash(payload.new_password)
    await db.commit()
    await get_redis().set(
        f"force_logout:{current_user.id}",
        int(datetime.utcnow().timestamp()),
        ex=60 * 60 * 24 * 31,
    )
    return {"message": "Password changed successfully. Please log in again."}
