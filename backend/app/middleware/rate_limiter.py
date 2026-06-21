"""
Rate limiting has been disabled (Redis removed).
All rate_limit() calls return a no-op dependency so existing route
decorators continue to work without any changes.
"""
from collections.abc import Callable
from fastapi import Request


def rate_limit(
    endpoint_identifier: str,
    limit: int,
    window_seconds: int,
    identifier: str | Callable[[Request], str] | Callable[[Request], object] = "user_or_ip",
):
    """No-op rate limiter — always allows the request through."""
    async def dependency(request: Request) -> None:
        pass
    return dependency
