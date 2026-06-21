"""
Redis client with graceful degradation.

When REDIS_URL is not set (e.g. Render free tier without an add-on),
get_redis() returns a _NoopRedis instance that silently no-ops every
call. This means:
  - Rate limiting is skipped
  - Caches always miss (fresh DB reads every time)
  - OTP / token-blacklist operations fall back to always-miss / no-store
    (functionally safe; security is lower without Redis but the app still runs)

Set REDIS_URL to a real Redis URL to restore full behaviour.
"""

from typing import Any, Optional

from redis.asyncio import Redis

from app.config import settings


class _NoopRedis:
    """Drop-in Redis stub that silently ignores all commands."""

    async def get(self, *_: Any, **__: Any) -> None:
        return None

    async def set(self, *_: Any, **__: Any) -> None:
        return None

    async def setex(self, *_: Any, **__: Any) -> None:
        return None

    async def delete(self, *_: Any, **__: Any) -> int:
        return 0

    async def incr(self, *_: Any, **__: Any) -> int:
        return 0

    async def expire(self, *_: Any, **__: Any) -> None:
        return None

    async def ttl(self, *_: Any, **__: Any) -> int:
        return -1

    async def scan_iter(self, *_: Any, **__: Any):
        # async generator that yields nothing
        return
        yield  # makes this an async generator


_redis_client: Optional[Redis] = None
_noop = _NoopRedis()


def get_redis() -> Redis | _NoopRedis:
    """
    Return the real Redis client when REDIS_URL is configured,
    otherwise return the no-op stub.
    """
    global _redis_client
    if not settings.REDIS_URL:
        return _noop
    if _redis_client is None:
        _redis_client = Redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis_client


async def close_redis() -> None:
    global _redis_client
    if _redis_client is not None:
        await _redis_client.aclose()
        _redis_client = None
