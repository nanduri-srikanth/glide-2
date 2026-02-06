"""
Request Middleware for tracking and error handling.

Provides:
- Request ID generation and tracking
- Request timing
- Structured logging context
"""

import time
import uuid
import logging
from typing import Callable
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)


class RequestContextMiddleware(BaseHTTPMiddleware):
    """
    Middleware to add request context (ID, timing) to all requests.

    Adds headers:
    - X-Request-ID: Unique identifier for request tracing
    - X-Response-Time: Processing time in milliseconds
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Generate or use existing request ID
        request_id = request.headers.get("X-Request-ID")
        if not request_id:
            request_id = f"req_{uuid.uuid4().hex[:16]}"

        # Store in request state for access in route handlers
        request.state.request_id = request_id

        # Track request timing
        start_time = time.perf_counter()

        # Process request
        response = await call_next(request)

        # Calculate processing time
        process_time = (time.perf_counter() - start_time) * 1000  # ms

        # Add headers to response
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Response-Time"] = f"{process_time:.2f}ms"

        # Log request (in production, use structured logging)
        logger.info(
            f"[{request_id}] {request.method} {request.url.path} "
            f"- {response.status_code} ({process_time:.2f}ms)"
        )

        return response


def get_request_id(request: Request) -> str:
    """Get request ID from request state."""
    return getattr(request.state, "request_id", f"req_{uuid.uuid4().hex[:16]}")
