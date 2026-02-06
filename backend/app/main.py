"""FastAPI Application Entry Point."""
import logging
from datetime import datetime
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError as PydanticValidationError

from app.config import get_settings
from app.database import init_db, close_db
from app.routers import auth, notes, voice, integrations, actions, folders
from app.core.errors import APIError, ErrorCode, InternalError
from app.core.middleware import RequestContextMiddleware, get_request_id

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    logger.info("Starting Glide API...")

    # Create database tables
    if settings.debug:
        await init_db()
        logger.info("Database tables created")

    yield

    # Shutdown
    logger.info("Shutting down Glide API...")
    await close_db()


app = FastAPI(
    title="Glide API",
    description="Voice memo to action - AI-powered note taking",
    version="1.0.0",
    lifespan=lifespan,
)

# Add request context middleware (must be added before CORS)
app.add_middleware(RequestContextMiddleware)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins if not settings.debug else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "X-Response-Time"],
)


# =============================================================================
# Exception Handlers - Standardized Error Responses
# =============================================================================

@app.exception_handler(APIError)
async def api_error_handler(request: Request, exc: APIError) -> JSONResponse:
    """
    Handle custom API errors with standardized response format.

    Returns:
        {
            "error": {
                "code": "error_code",
                "message": "Human readable message",
                "param": "field_name" (optional),
                "details": [...] (optional)
            },
            "request_id": "req_xxx",
            "timestamp": "2024-01-15T10:30:00Z"
        }
    """
    request_id = get_request_id(request)

    # Log error for debugging
    logger.warning(
        f"[{request_id}] API Error: {exc.code.value} - {exc.message}"
    )

    response_content = {
        "error": exc.to_dict(),
        "request_id": request_id,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }

    return JSONResponse(
        status_code=exc.status_code,
        content=response_content,
        headers=exc.headers,
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """
    Handle Pydantic/FastAPI validation errors with standardized format.

    Converts FastAPI's default validation error format to our standard format.
    """
    request_id = get_request_id(request)

    # Extract validation error details
    errors = exc.errors()
    details = []
    param = None

    for error in errors:
        loc = " -> ".join(str(l) for l in error.get("loc", []))
        msg = error.get("msg", "Invalid value")
        details.append(f"{loc}: {msg}")
        if param is None and error.get("loc"):
            # Get the first field name as the main param
            param = str(error["loc"][-1]) if error["loc"] else None

    logger.warning(
        f"[{request_id}] Validation Error: {details}"
    )

    response_content = {
        "error": {
            "code": ErrorCode.VALIDATION_FAILED.value,
            "message": "Request validation failed",
            "param": param,
            "details": details,
        },
        "request_id": request_id,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=response_content,
    )


@app.exception_handler(PydanticValidationError)
async def pydantic_validation_error_handler(
    request: Request, exc: PydanticValidationError
) -> JSONResponse:
    """Handle Pydantic validation errors."""
    request_id = get_request_id(request)

    details = [f"{e['loc']}: {e['msg']}" for e in exc.errors()]

    logger.warning(
        f"[{request_id}] Pydantic Validation Error: {details}"
    )

    response_content = {
        "error": {
            "code": ErrorCode.VALIDATION_FAILED.value,
            "message": "Data validation failed",
            "details": details,
        },
        "request_id": request_id,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=response_content,
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Global exception handler for unexpected errors.

    IMPORTANT: Never expose internal error details in production.
    """
    request_id = get_request_id(request)

    # Log full error for debugging (with stack trace)
    logger.exception(
        f"[{request_id}] Unhandled Exception: {type(exc).__name__}: {str(exc)}"
    )

    # In debug mode, include more details (but still safe for client)
    if settings.debug:
        message = f"Internal error: {type(exc).__name__}"
        details = [str(exc)]
    else:
        message = "An internal error occurred. Please try again later."
        details = None

    response_content = {
        "error": {
            "code": ErrorCode.INTERNAL_ERROR.value,
            "message": message,
        },
        "request_id": request_id,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }

    if details:
        response_content["error"]["details"] = details

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=response_content,
    )


# =============================================================================
# Routers
# =============================================================================

app.include_router(
    auth.router,
    prefix="/api/v1/auth",
    tags=["Authentication"]
)

app.include_router(
    notes.router,
    prefix="/api/v1/notes",
    tags=["Notes"]
)

app.include_router(
    folders.router,
    prefix="/api/v1/folders",
    tags=["Folders"]
)

app.include_router(
    voice.router,
    prefix="/api/v1/voice",
    tags=["Voice Processing"]
)

app.include_router(
    actions.router,
    prefix="/api/v1/actions",
    tags=["Actions"]
)

app.include_router(
    integrations.router,
    prefix="/api/v1/integrations",
    tags=["Integrations"]
)


# =============================================================================
# Health & Status Endpoints
# =============================================================================

@app.get("/")
async def root(request: Request):
    """API root endpoint."""
    return {
        "name": "Glide API",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs",
        "request_id": get_request_id(request),
    }


@app.get("/health")
async def health_check(request: Request):
    """Health check endpoint for monitoring."""
    return {
        "status": "healthy",
        "database": "connected",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "request_id": get_request_id(request),
    }
