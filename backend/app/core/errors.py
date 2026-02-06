"""
Standardized Error Codes and Custom Exceptions

Following industry standards from Google, Microsoft, and Stripe APIs:
- Machine-readable error codes for programmatic handling
- Human-readable messages for debugging
- Consistent HTTP status code mapping
- Support for error details and parameters
"""

from enum import Enum
from typing import Optional, Any, Dict, List
from fastapi import HTTPException, status


class ErrorCode(str, Enum):
    """
    Machine-readable error codes following industry standards.

    Categories:
    - VALIDATION_*: Input validation errors (400)
    - AUTH_*: Authentication errors (401)
    - PERMISSION_*: Authorization errors (403)
    - NOT_FOUND_*: Resource not found errors (404)
    - CONFLICT_*: Resource conflict errors (409)
    - RATE_*: Rate limiting errors (429)
    - EXTERNAL_*: External service errors (502/503)
    - INTERNAL_*: Internal server errors (500)
    """

    # Validation Errors (400)
    VALIDATION_FAILED = "validation_failed"
    VALIDATION_INVALID_FORMAT = "invalid_format"
    VALIDATION_MISSING_FIELD = "missing_required_field"
    VALIDATION_INVALID_VALUE = "invalid_value"
    VALIDATION_INVALID_AUDIO_FORMAT = "invalid_audio_format"
    VALIDATION_INVALID_FILE_SIZE = "invalid_file_size"
    VALIDATION_INVALID_CREDENTIALS = "invalid_credentials"
    VALIDATION_WEAK_PASSWORD = "weak_password"
    VALIDATION_INVALID_TOKEN = "invalid_token"

    # Authentication Errors (401)
    AUTH_REQUIRED = "authentication_required"
    AUTH_INVALID_TOKEN = "invalid_auth_token"
    AUTH_EXPIRED_TOKEN = "expired_auth_token"
    AUTH_INVALID_REFRESH_TOKEN = "invalid_refresh_token"
    AUTH_INVALID_APPLE_TOKEN = "invalid_apple_token"

    # Authorization Errors (403)
    PERMISSION_DENIED = "permission_denied"
    PERMISSION_RESOURCE_ACCESS = "resource_access_denied"
    PERMISSION_INSUFFICIENT_SCOPE = "insufficient_scope"
    PERMISSION_ACCOUNT_INACTIVE = "account_inactive"

    # Not Found Errors (404)
    NOT_FOUND_RESOURCE = "resource_not_found"
    NOT_FOUND_USER = "user_not_found"
    NOT_FOUND_NOTE = "note_not_found"
    NOT_FOUND_FOLDER = "folder_not_found"
    NOT_FOUND_ACTION = "action_not_found"
    NOT_FOUND_INTEGRATION = "integration_not_found"

    # Conflict Errors (409)
    CONFLICT_RESOURCE_EXISTS = "resource_already_exists"
    CONFLICT_EMAIL_EXISTS = "email_already_registered"
    CONFLICT_FOLDER_EXISTS = "folder_already_exists"
    CONFLICT_ACTION_EXECUTED = "action_already_executed"

    # Rate Limiting Errors (429)
    RATE_LIMIT_EXCEEDED = "rate_limit_exceeded"
    RATE_LIMIT_API = "api_rate_limit_exceeded"
    RATE_LIMIT_UPLOAD = "upload_rate_limit_exceeded"

    # External Service Errors (502/503)
    EXTERNAL_SERVICE_ERROR = "external_service_error"
    EXTERNAL_TRANSCRIPTION_FAILED = "transcription_service_failed"
    EXTERNAL_LLM_FAILED = "llm_service_failed"
    EXTERNAL_STORAGE_FAILED = "storage_service_failed"
    EXTERNAL_GOOGLE_FAILED = "google_service_failed"
    EXTERNAL_APPLE_FAILED = "apple_service_failed"

    # Internal Errors (500)
    INTERNAL_ERROR = "internal_server_error"
    INTERNAL_DATABASE_ERROR = "database_error"
    INTERNAL_PROCESSING_ERROR = "processing_error"


# HTTP Status Code Mapping
ERROR_CODE_STATUS_MAP: Dict[ErrorCode, int] = {
    # Validation (400)
    ErrorCode.VALIDATION_FAILED: status.HTTP_400_BAD_REQUEST,
    ErrorCode.VALIDATION_INVALID_FORMAT: status.HTTP_400_BAD_REQUEST,
    ErrorCode.VALIDATION_MISSING_FIELD: status.HTTP_400_BAD_REQUEST,
    ErrorCode.VALIDATION_INVALID_VALUE: status.HTTP_400_BAD_REQUEST,
    ErrorCode.VALIDATION_INVALID_AUDIO_FORMAT: status.HTTP_400_BAD_REQUEST,
    ErrorCode.VALIDATION_INVALID_FILE_SIZE: status.HTTP_400_BAD_REQUEST,
    ErrorCode.VALIDATION_INVALID_CREDENTIALS: status.HTTP_400_BAD_REQUEST,
    ErrorCode.VALIDATION_WEAK_PASSWORD: status.HTTP_400_BAD_REQUEST,
    ErrorCode.VALIDATION_INVALID_TOKEN: status.HTTP_400_BAD_REQUEST,

    # Authentication (401)
    ErrorCode.AUTH_REQUIRED: status.HTTP_401_UNAUTHORIZED,
    ErrorCode.AUTH_INVALID_TOKEN: status.HTTP_401_UNAUTHORIZED,
    ErrorCode.AUTH_EXPIRED_TOKEN: status.HTTP_401_UNAUTHORIZED,
    ErrorCode.AUTH_INVALID_REFRESH_TOKEN: status.HTTP_401_UNAUTHORIZED,
    ErrorCode.AUTH_INVALID_APPLE_TOKEN: status.HTTP_401_UNAUTHORIZED,

    # Authorization (403)
    ErrorCode.PERMISSION_DENIED: status.HTTP_403_FORBIDDEN,
    ErrorCode.PERMISSION_RESOURCE_ACCESS: status.HTTP_403_FORBIDDEN,
    ErrorCode.PERMISSION_INSUFFICIENT_SCOPE: status.HTTP_403_FORBIDDEN,
    ErrorCode.PERMISSION_ACCOUNT_INACTIVE: status.HTTP_403_FORBIDDEN,

    # Not Found (404)
    ErrorCode.NOT_FOUND_RESOURCE: status.HTTP_404_NOT_FOUND,
    ErrorCode.NOT_FOUND_USER: status.HTTP_404_NOT_FOUND,
    ErrorCode.NOT_FOUND_NOTE: status.HTTP_404_NOT_FOUND,
    ErrorCode.NOT_FOUND_FOLDER: status.HTTP_404_NOT_FOUND,
    ErrorCode.NOT_FOUND_ACTION: status.HTTP_404_NOT_FOUND,
    ErrorCode.NOT_FOUND_INTEGRATION: status.HTTP_404_NOT_FOUND,

    # Conflict (409)
    ErrorCode.CONFLICT_RESOURCE_EXISTS: status.HTTP_409_CONFLICT,
    ErrorCode.CONFLICT_EMAIL_EXISTS: status.HTTP_409_CONFLICT,
    ErrorCode.CONFLICT_FOLDER_EXISTS: status.HTTP_409_CONFLICT,
    ErrorCode.CONFLICT_ACTION_EXECUTED: status.HTTP_409_CONFLICT,

    # Rate Limiting (429)
    ErrorCode.RATE_LIMIT_EXCEEDED: status.HTTP_429_TOO_MANY_REQUESTS,
    ErrorCode.RATE_LIMIT_API: status.HTTP_429_TOO_MANY_REQUESTS,
    ErrorCode.RATE_LIMIT_UPLOAD: status.HTTP_429_TOO_MANY_REQUESTS,

    # External Service (502/503)
    ErrorCode.EXTERNAL_SERVICE_ERROR: status.HTTP_502_BAD_GATEWAY,
    ErrorCode.EXTERNAL_TRANSCRIPTION_FAILED: status.HTTP_502_BAD_GATEWAY,
    ErrorCode.EXTERNAL_LLM_FAILED: status.HTTP_502_BAD_GATEWAY,
    ErrorCode.EXTERNAL_STORAGE_FAILED: status.HTTP_502_BAD_GATEWAY,
    ErrorCode.EXTERNAL_GOOGLE_FAILED: status.HTTP_502_BAD_GATEWAY,
    ErrorCode.EXTERNAL_APPLE_FAILED: status.HTTP_502_BAD_GATEWAY,

    # Internal (500)
    ErrorCode.INTERNAL_ERROR: status.HTTP_500_INTERNAL_SERVER_ERROR,
    ErrorCode.INTERNAL_DATABASE_ERROR: status.HTTP_500_INTERNAL_SERVER_ERROR,
    ErrorCode.INTERNAL_PROCESSING_ERROR: status.HTTP_500_INTERNAL_SERVER_ERROR,
}


class APIError(Exception):
    """
    Base exception for all API errors.

    Provides consistent error structure following industry standards:
    - code: Machine-readable error code
    - message: Human-readable error message
    - param: Parameter that caused the error (optional)
    - details: Additional error details (optional)

    Example:
        raise APIError(
            code=ErrorCode.VALIDATION_INVALID_FORMAT,
            message="Invalid email format",
            param="email"
        )
    """

    def __init__(
        self,
        code: ErrorCode,
        message: str,
        param: Optional[str] = None,
        details: Optional[List[str]] = None,
        headers: Optional[Dict[str, str]] = None,
    ):
        self.code = code
        self.message = message
        self.param = param
        self.details = details or []
        self.headers = headers or {}
        self.status_code = ERROR_CODE_STATUS_MAP.get(
            code, status.HTTP_500_INTERNAL_SERVER_ERROR
        )
        super().__init__(message)

    def to_dict(self) -> Dict[str, Any]:
        """Convert error to dictionary for JSON response."""
        error_dict = {
            "code": self.code.value,
            "message": self.message,
        }
        if self.param:
            error_dict["param"] = self.param
        if self.details:
            error_dict["details"] = self.details
        return error_dict


# Convenience exception classes for common error types

class ValidationError(APIError):
    """Raised when input validation fails."""

    def __init__(
        self,
        message: str,
        param: Optional[str] = None,
        code: ErrorCode = ErrorCode.VALIDATION_FAILED,
        details: Optional[List[str]] = None,
    ):
        super().__init__(code=code, message=message, param=param, details=details)


class NotFoundError(APIError):
    """Raised when a requested resource is not found."""

    def __init__(
        self,
        resource: str,
        identifier: Optional[str] = None,
        code: Optional[ErrorCode] = None,
    ):
        # Auto-detect error code based on resource type
        if code is None:
            code_map = {
                "user": ErrorCode.NOT_FOUND_USER,
                "note": ErrorCode.NOT_FOUND_NOTE,
                "folder": ErrorCode.NOT_FOUND_FOLDER,
                "action": ErrorCode.NOT_FOUND_ACTION,
                "integration": ErrorCode.NOT_FOUND_INTEGRATION,
            }
            code = code_map.get(resource.lower(), ErrorCode.NOT_FOUND_RESOURCE)

        message = f"{resource.capitalize()} not found"
        if identifier:
            message = f"{resource.capitalize()} with ID '{identifier}' not found"

        super().__init__(code=code, message=message, param=f"{resource.lower()}_id")


class ConflictError(APIError):
    """Raised when there's a resource conflict (e.g., duplicate)."""

    def __init__(
        self,
        message: str,
        code: ErrorCode = ErrorCode.CONFLICT_RESOURCE_EXISTS,
        param: Optional[str] = None,
    ):
        super().__init__(code=code, message=message, param=param)


class AuthenticationError(APIError):
    """Raised when authentication fails."""

    def __init__(
        self,
        message: str = "Authentication required",
        code: ErrorCode = ErrorCode.AUTH_REQUIRED,
    ):
        super().__init__(code=code, message=message)


class AuthorizationError(APIError):
    """Raised when user lacks permission for an action."""

    def __init__(
        self,
        message: str = "Permission denied",
        code: ErrorCode = ErrorCode.PERMISSION_DENIED,
        resource: Optional[str] = None,
    ):
        param = f"{resource}_id" if resource else None
        super().__init__(code=code, message=message, param=param)


class RateLimitError(APIError):
    """Raised when rate limit is exceeded."""

    def __init__(
        self,
        message: str = "Rate limit exceeded. Please try again later.",
        retry_after: Optional[int] = None,
        code: ErrorCode = ErrorCode.RATE_LIMIT_EXCEEDED,
    ):
        headers = {}
        if retry_after:
            headers["Retry-After"] = str(retry_after)
        super().__init__(code=code, message=message, headers=headers)


class ExternalServiceError(APIError):
    """Raised when an external service fails."""

    def __init__(
        self,
        service: str,
        message: Optional[str] = None,
        code: Optional[ErrorCode] = None,
    ):
        # Auto-detect error code based on service
        if code is None:
            code_map = {
                "transcription": ErrorCode.EXTERNAL_TRANSCRIPTION_FAILED,
                "llm": ErrorCode.EXTERNAL_LLM_FAILED,
                "storage": ErrorCode.EXTERNAL_STORAGE_FAILED,
                "google": ErrorCode.EXTERNAL_GOOGLE_FAILED,
                "apple": ErrorCode.EXTERNAL_APPLE_FAILED,
            }
            code = code_map.get(service.lower(), ErrorCode.EXTERNAL_SERVICE_ERROR)

        if message is None:
            message = f"{service.capitalize()} service temporarily unavailable"

        super().__init__(code=code, message=message)


class InternalError(APIError):
    """Raised for internal server errors. Never expose details to clients."""

    def __init__(
        self,
        message: str = "An internal error occurred. Please try again later.",
        code: ErrorCode = ErrorCode.INTERNAL_ERROR,
        log_message: Optional[str] = None,
    ):
        self.log_message = log_message  # For internal logging only
        super().__init__(code=code, message=message)
