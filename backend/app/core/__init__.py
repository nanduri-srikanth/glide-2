"""Core utilities and shared components."""
from app.core.errors import (
    ErrorCode,
    APIError,
    ValidationError,
    NotFoundError,
    ConflictError,
    AuthenticationError,
    AuthorizationError,
    RateLimitError,
    ExternalServiceError,
    InternalError,
)
from app.core.responses import (
    ErrorResponse,
    ErrorDetail,
    SuccessResponse,
    MessageResponse,
    PaginatedResponse,
)

__all__ = [
    # Error codes and exceptions
    "ErrorCode",
    "APIError",
    "ValidationError",
    "NotFoundError",
    "ConflictError",
    "AuthenticationError",
    "AuthorizationError",
    "RateLimitError",
    "ExternalServiceError",
    "InternalError",
    # Response schemas
    "ErrorResponse",
    "ErrorDetail",
    "SuccessResponse",
    "MessageResponse",
    "PaginatedResponse",
]
