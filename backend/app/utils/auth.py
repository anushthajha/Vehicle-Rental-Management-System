import re
from datetime import datetime, timedelta
from uuid import uuid4

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.user import User, UserKYC
from app.redis import get_redis


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
PASSWORD_REGEX = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{8,}$")


def validate_password_strength(password: str) -> bool:
    return bool(PASSWORD_REGEX.match(password))


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def _create_token(data: dict, expires_delta: timedelta, token_type: str) -> str:
    now = datetime.utcnow()
    payload = data.copy()
    payload.update(
        {
            "jti": str(uuid4()),
            "type": token_type,
            "iat": int(now.timestamp()),
            "exp": now + expires_delta,
        }
    )
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_access_token(data: dict) -> str:
    expires_delta = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return _create_token(data, expires_delta, "access")


def create_refresh_token(data: dict) -> str:
    expires_delta = timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    return _create_token(data, expires_delta, "refresh")


async def verify_token(token: str) -> dict:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError as exc:
        raise credentials_exception from exc

    jti = payload.get("jti")
    user_id = payload.get("sub")
    if not jti or not user_id:
        raise credentials_exception

    redis = get_redis()
    if await redis.exists(f"blacklist:{jti}"):
        raise credentials_exception

    force_logout_at = await redis.get(f"force_logout:{user_id}")
    issued_at = payload.get("iat")
    if force_logout_at and issued_at and int(issued_at) < int(force_logout_at):
        raise credentials_exception

    return payload


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload = await verify_token(token)
    if payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid access token")
    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive user")
    return user


async def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account suspended")
    return current_user


async def require_verified_user(current_user: User = Depends(get_current_active_user)) -> User:
    if not current_user.is_verified:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Email verification required")
    return current_user


async def require_kyc_user(
    current_user: User = Depends(require_verified_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    result = await db.execute(select(UserKYC).where(UserKYC.user_id == current_user.id))
    kyc = result.scalar_one_or_none()
    if kyc is None or kyc.kyc_status != "approved":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="KYC approval required")
    return current_user


async def require_customer(current_user: User = Depends(get_current_active_user)) -> User:
    """Allows only role='customer'. Used for booking actions."""
    if current_user.role not in ("customer", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Customer access required.")
    return current_user


async def require_vehicle_manager(current_user: User = Depends(get_current_active_user)) -> User:
    """Allows only role='vehicle_manager'."""
    if current_user.role not in ("vehicle_manager", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Vehicle Manager access required.")
    return current_user


async def require_admin(current_user: User = Depends(get_current_active_user)) -> User:
    """Allows only role='admin'."""
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required.")
    return current_user


async def require_any_authenticated(current_user: User = Depends(get_current_active_user)) -> User:
    """Any logged-in user, any role."""
    return current_user


def get_token_ttl_seconds(payload: dict) -> int:
    exp = payload.get("exp")
    if exp is None:
        return 0
    return max(int(exp - datetime.utcnow().timestamp()), 0)
