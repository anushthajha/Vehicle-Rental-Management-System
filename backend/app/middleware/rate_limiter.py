import hashlib
from collections.abc import Callable

from fastapi import HTTPException, Request, status

from app.redis import get_redis


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",", 1)[0].strip()
    return request.client.host if request.client else "unknown"


async def _email_identifier(request: Request) -> str:
    try:
        body = await request.json()
    except Exception:
        body = {}
    email = str(body.get("email") or "").strip().lower()
    if not email:
        email = _client_ip(request)
    return hashlib.sha256(email.encode("utf-8")).hexdigest()


async def _user_or_ip_identifier(request: Request) -> str:
    user = getattr(request.state, "user", None)
    if isinstance(user, dict) and user.get("id"):
        return user["id"]
    return _client_ip(request)


def _ip_identifier(request: Request) -> str:
    return _client_ip(request)


async def _enforce(endpoint_identifier: str, identifier: str, limit: int, window_seconds: int) -> None:
    redis = get_redis()
    key = f"rate:{endpoint_identifier}:{identifier}"
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, window_seconds)
    ttl = await redis.ttl(key)
    retry_after = ttl if ttl and ttl > 0 else window_seconds
    if count > limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again later.",
            headers={"Retry-After": str(retry_after)},
        )


def rate_limit(
    endpoint_identifier: str,
    limit: int,
    window_seconds: int,
    identifier: str | Callable[[Request], str] | Callable[[Request], object] = "user_or_ip",
):
    async def dependency(request: Request) -> None:
        if identifier == "ip":
            resolved = _ip_identifier(request)
        elif identifier == "email":
            resolved = await _email_identifier(request)
        elif identifier == "user_or_ip":
            resolved = await _user_or_ip_identifier(request)
        elif callable(identifier):
            maybe_value = identifier(request)
            resolved = await maybe_value if hasattr(maybe_value, "__await__") else maybe_value
        else:
            resolved = await _user_or_ip_identifier(request)
        await _enforce(endpoint_identifier, str(resolved), limit, window_seconds)

    return dependency
