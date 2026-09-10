"""Error shapes. Every failure leaves the API as the same JSON envelope."""
from __future__ import annotations

from fastapi import HTTPException, Request, status
from fastapi.responses import ORJSONResponse


class ApiError(HTTPException):
    def __init__(self, status_code: int, code: str, message: str, **extra):
        super().__init__(status_code=status_code, detail=message)
        self.code = code
        self.extra = extra


def bad_request(message: str, code: str = "bad_request", **extra) -> ApiError:
    return ApiError(status.HTTP_400_BAD_REQUEST, code, message, **extra)


def unauthorized(message: str = "Authentication required") -> ApiError:
    return ApiError(status.HTTP_401_UNAUTHORIZED, "unauthorized", message)


def forbidden(message: str = "Not permitted") -> ApiError:
    return ApiError(status.HTTP_403_FORBIDDEN, "forbidden", message)


def not_found(what: str = "Record") -> ApiError:
    return ApiError(status.HTTP_404_NOT_FOUND, "not_found", f"{what} not found")


def conflict(message: str, code: str = "conflict", **extra) -> ApiError:
    """`code` is nameable for the same reason bad_request's is: a client that
    has to branch on which conflict this was should read a stable string, not
    the message text."""
    return ApiError(status.HTTP_409_CONFLICT, code, message, **extra)


def unprocessable(message: str, **extra) -> ApiError:
    return ApiError(status.HTTP_422_UNPROCESSABLE_ENTITY, "unprocessable", message, **extra)


async def api_error_handler(request: Request, exc: ApiError) -> ORJSONResponse:
    body = {"error": {"code": exc.code, "message": exc.detail}}
    if exc.extra:
        body["error"]["details"] = exc.extra
    return ORJSONResponse(status_code=exc.status_code, content=body)


async def http_error_handler(request: Request, exc: HTTPException) -> ORJSONResponse:
    return ORJSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": "http_error", "message": str(exc.detail)}},
    )
