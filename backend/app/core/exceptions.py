"""Application exceptions.

Domain exceptions with HTTP status codes for the hybrid approach.
These exceptions are caught by exception handlers and converted to proper HTTP responses.
"""

from typing import Any


class AppException(Exception):
    """Base exception for all application errors.

    Attributes:
        message: Human-readable error message.
        code: Machine-readable error code for clients.
        status_code: HTTP status code to return.
        details: Additional error details (e.g., field names, IDs). ``None`` when not provided.
    """

    message: str = "An error occurred"
    code: str = "APP_ERROR"
    status_code: int = 500

    def __init__(
        self,
        message: str | None = None,
        code: str | None = None,
        details: dict[str, Any] | None = None,
    ):
        self.message = message or self.__class__.message
        self.code = code or self.__class__.code
        self.details = details
        super().__init__(self.message)

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(message={self.message!r}, code={self.code!r})"


class NotFoundError(AppException):
    """资源未找到 (404)."""

    message = "资源未找到"
    code = "NOT_FOUND"
    status_code = 404


class AlreadyExistsError(AppException):
    """资源已存在 (409)."""

    message = "资源已存在"
    code = "ALREADY_EXISTS"
    status_code = 409


class ValidationError(AppException):
    """校验错误 (422)."""

    message = "数据校验错误"
    code = "VALIDATION_ERROR"
    status_code = 422


class AuthenticationError(AppException):
    """认证失败 (401)."""

    message = "认证失败"
    code = "AUTHENTICATION_ERROR"
    status_code = 401


class AuthorizationError(AppException):
    """权限不足 (403)."""

    message = "权限不足"
    code = "AUTHORIZATION_ERROR"
    status_code = 403


class RateLimitError(AppException):
    """请求频率超限 (429)."""

    message = "请求频率超限"
    code = "RATE_LIMIT_EXCEEDED"
    status_code = 429


class BadRequestError(AppException):
    """请求参数错误 (400)."""

    message = "请求参数错误"
    code = "BAD_REQUEST"
    status_code = 400


class PaymentRequiredError(AppException):
    """需要付费 (402)."""

    message = "需要付费"
    code = "PAYMENT_REQUIRED"
    status_code = 402


class ExternalServiceError(AppException):
    """外部服务不可用 (503)."""

    message = "外部服务不可用"
    code = "EXTERNAL_SERVICE_ERROR"
    status_code = 503


class DatabaseError(AppException):
    """数据库错误 (500)."""

    message = "数据库错误"
    code = "DATABASE_ERROR"
    status_code = 500


class InternalError(AppException):
    """服务器内部错误 (500)."""

    message = "服务器内部错误"
    code = "INTERNAL_ERROR"
    status_code = 500
