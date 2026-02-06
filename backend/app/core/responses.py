"""
Standardized Response Schemas

Following industry standards from Google, Microsoft, and Stripe APIs:
- Consistent error response structure
- Consistent success response structure
- Pagination metadata
- Request tracking
"""

from datetime import datetime
from typing import Optional, List, Any, Generic, TypeVar
from pydantic import BaseModel, Field

T = TypeVar("T")


class ErrorDetail(BaseModel):
    """
    Detailed error information following Stripe/Google patterns.

    Example:
        {
            "code": "validation_failed",
            "message": "Invalid email format",
            "param": "email",
            "details": ["Must contain @ symbol"]
        }
    """
    code: str = Field(..., description="Machine-readable error code")
    message: str = Field(..., description="Human-readable error message")
    param: Optional[str] = Field(None, description="Parameter that caused the error")
    details: Optional[List[str]] = Field(None, description="Additional error details")


class ErrorResponse(BaseModel):
    """
    Standard error response structure.

    Example:
        {
            "error": {
                "code": "resource_not_found",
                "message": "Note with ID 'xyz' not found",
                "param": "note_id"
            },
            "request_id": "req_abc123",
            "timestamp": "2024-01-15T10:30:00Z"
        }
    """
    error: ErrorDetail
    request_id: str = Field(..., description="Unique request identifier for debugging")
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "error": {
                    "code": "resource_not_found",
                    "message": "Note with ID 'abc123' not found",
                    "param": "note_id"
                },
                "request_id": "req_xyz789",
                "timestamp": "2024-01-15T10:30:00Z"
            }
        }


class MessageResponse(BaseModel):
    """
    Simple success response with message.

    Use for operations that don't return data (e.g., logout, password change).

    Example:
        {
            "message": "Password changed successfully",
            "request_id": "req_abc123"
        }
    """
    message: str
    request_id: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "message": "Operation completed successfully",
                "request_id": "req_xyz789"
            }
        }


class SuccessResponse(BaseModel, Generic[T]):
    """
    Generic success response wrapper.

    Use for operations that return data.

    Example:
        {
            "data": {...},
            "request_id": "req_abc123",
            "timestamp": "2024-01-15T10:30:00Z"
        }
    """
    data: Any
    request_id: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class PaginationMeta(BaseModel):
    """Pagination metadata."""
    page: int = Field(..., ge=1, description="Current page number")
    per_page: int = Field(..., ge=1, le=100, description="Items per page")
    total: int = Field(..., ge=0, description="Total number of items")
    total_pages: int = Field(..., ge=0, description="Total number of pages")
    has_next: bool = Field(..., description="Whether there are more pages")
    has_prev: bool = Field(..., description="Whether there are previous pages")


class PaginatedResponse(BaseModel, Generic[T]):
    """
    Paginated list response following industry standards.

    Example:
        {
            "data": [...],
            "pagination": {
                "page": 1,
                "per_page": 20,
                "total": 100,
                "total_pages": 5,
                "has_next": true,
                "has_prev": false
            },
            "request_id": "req_abc123"
        }
    """
    data: List[Any]
    pagination: PaginationMeta
    request_id: Optional[str] = None

    @classmethod
    def create(
        cls,
        items: List[Any],
        total: int,
        page: int,
        per_page: int,
        request_id: Optional[str] = None,
    ) -> "PaginatedResponse":
        """Factory method to create paginated response."""
        total_pages = (total + per_page - 1) // per_page if per_page > 0 else 0
        return cls(
            data=items,
            pagination=PaginationMeta(
                page=page,
                per_page=per_page,
                total=total,
                total_pages=total_pages,
                has_next=page < total_pages,
                has_prev=page > 1,
            ),
            request_id=request_id,
        )


# Common response messages
class ResponseMessages:
    """Standard response messages for consistency."""

    # Auth
    PASSWORD_CHANGED = "Password changed successfully"
    LOGGED_OUT = "Successfully logged out"
    EMAIL_VERIFIED = "Email verified successfully"

    # Resources
    CREATED = "{resource} created successfully"
    UPDATED = "{resource} updated successfully"
    DELETED = "{resource} deleted successfully"

    # Operations
    REORDER_SUCCESS = "{resource} reordered successfully"
    SYNC_SUCCESS = "Sync completed successfully"
    EXPORT_SUCCESS = "Export completed successfully"

    # Integrations
    CONNECTED = "{service} connected successfully"
    DISCONNECTED = "{service} disconnected successfully"
