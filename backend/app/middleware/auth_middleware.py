from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.utils.auth import verify_token


class OptionalAuthMiddleware(BaseHTTPMiddleware):
    """
    Attach minimal JWT user claims to request.state.user when a valid bearer
    token is present. Invalid or missing tokens are treated as anonymous.
    """

    async def dispatch(self, request: Request, call_next):
        auth_header = request.headers.get("Authorization", "")
        token = auth_header.replace("Bearer ", "", 1).strip()
        request.state.user = None

        if token:
            try:
                payload = await verify_token(token)
                request.state.user = {
                    "id": payload.get("sub"),
                    "role": payload.get("role"),
                    "email": payload.get("email"),
                }
            except Exception:
                request.state.user = None

        return await call_next(request)
