import logging
import traceback
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError


logger = logging.getLogger("app.errors")


HTTP_ERROR_CODES = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    429: "TOO_MANY_REQUESTS",
}


def _request_id(request: Request) -> str:
    existing = getattr(request.state, "request_id", None)
    if existing:
        return existing
    generated = str(uuid4())
    request.state.request_id = generated
    return generated


def _user_id(request: Request) -> str | None:
    user = getattr(request.state, "user", None)
    if isinstance(user, dict):
        return user.get("id")
    return getattr(user, "id", None)


def _response(status_code: int, code: str, message: str, request_id: str, details: dict | list | None = None, headers: dict | None = None) -> JSONResponse:
    error = {"code": code, "message": message}
    if details is not None:
        error["details"] = details
    return JSONResponse(
        status_code=status_code,
        content={"success": False, "error": error, "request_id": request_id},
        headers=headers,
    )


def _log_5xx(request: Request, request_id: str, exc: Exception) -> None:
    logger.error(
        "Unhandled server error",
        extra={
            "request_id": request_id,
            "path": request.url.path,
            "method": request.method,
            "user_id": _user_id(request),
            "error_type": type(exc).__name__,
            "traceback": traceback.format_exc(),
        },
    )


def _message(detail) -> str:
    if isinstance(detail, dict):
        return str(detail.get("message") or detail.get("detail") or "Request failed")
    if isinstance(detail, list):
        return "Request validation failed"
    return str(detail or "Request failed")


def _validation_details(exc: RequestValidationError) -> list[dict]:
    return [
        {
            "field": ".".join(str(part) for part in error.get("loc", []) if part != "body"),
            "message": error.get("msg"),
            "type": error.get("type"),
        }
        for error in exc.errors()
    ]


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def request_validation_handler(request: Request, exc: RequestValidationError):
        return _response(
            422,
            "VALIDATION_ERROR",
            "Request validation failed",
            _request_id(request),
            {"fields": _validation_details(exc)},
        )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        code = HTTP_ERROR_CODES.get(exc.status_code, "HTTP_ERROR")
        return _response(exc.status_code, code, _message(exc.detail), _request_id(request), headers=exc.headers)

    @app.exception_handler(ValueError)
    async def value_error_handler(request: Request, exc: ValueError):
        return _response(400, "VALIDATION_ERROR", str(exc), _request_id(request))

    @app.exception_handler(SQLAlchemyError)
    async def sqlalchemy_error_handler(request: Request, exc: SQLAlchemyError):
        request_id = _request_id(request)
        _log_5xx(request, request_id, exc)
        return _response(500, "DATABASE_ERROR", "A database error occurred. Please try again later.", request_id)

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        request_id = _request_id(request)
        _log_5xx(request, request_id, exc)
        return _response(500, "INTERNAL_ERROR", "An unexpected error occurred. Please try again later.", request_id)
