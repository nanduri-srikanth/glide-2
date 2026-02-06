"""External integrations router (Google, Apple)."""
import logging
from datetime import datetime
from typing import Annotated
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials

from app.database import get_db
from app.models.user import User
from app.routers.auth import get_current_user
from app.config import get_settings
from app.utils import encrypt_token, decrypt_token
from app.core.errors import NotFoundError, ValidationError, ExternalServiceError, ErrorCode
from app.core.responses import MessageResponse
from app.core.middleware import get_request_id

logger = logging.getLogger(__name__)

router = APIRouter()
settings = get_settings()

# Google OAuth scopes
GOOGLE_SCOPES = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.modify",
]


@router.get("/status")
async def get_integration_status(
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Get status of all integrations."""
    return {
        "google": {
            "connected": bool(current_user.google_access_token),
            "services": ["calendar", "gmail"] if current_user.google_access_token else [],
            "expires": current_user.google_token_expiry,
        },
        "apple": {
            "connected": bool(current_user.apple_caldav_password),
            "services": ["calendar", "reminders"] if current_user.apple_caldav_password else [],
        },
    }


# ============ Google OAuth ============

@router.get("/google/connect")
async def google_connect(
    current_user: Annotated[User, Depends(get_current_user)],
):
    """
    Start Google OAuth flow.
    Returns URL to redirect user to Google consent screen.
    """
    if not settings.google_client_id or not settings.google_client_secret:
        raise ValidationError(
            message="Google integration not configured",
            code=ErrorCode.EXTERNAL_GOOGLE_FAILED,
        )

    # Build OAuth URL
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": " ".join(GOOGLE_SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "state": str(current_user.id),  # Pass user ID in state
    }

    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"

    return {"auth_url": auth_url}


@router.get("/google/callback")
async def google_callback(
    code: str,
    state: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Handle Google OAuth callback.
    Exchange code for tokens and store them.
    """
    from google.oauth2 import id_token
    from google.auth.transport import requests as google_requests
    import httpx

    try:
        # Exchange code for tokens
        token_url = "https://oauth2.googleapis.com/token"
        async with httpx.AsyncClient() as client:
            response = await client.post(
                token_url,
                data={
                    "code": code,
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "redirect_uri": settings.google_redirect_uri,
                    "grant_type": "authorization_code",
                },
            )

        if response.status_code != 200:
            raise ExternalServiceError(
                service="google",
                message="Failed to exchange code for tokens",
            )

        tokens = response.json()

        # Get user from state
        from sqlalchemy import select
        from uuid import UUID
        result = await db.execute(
            select(User).where(User.id == UUID(state))
        )
        user = result.scalar_one_or_none()

        if not user:
            raise NotFoundError(resource="user", identifier=state)

        # Store tokens (encrypted)
        user.google_access_token = encrypt_token(tokens.get("access_token"))
        user.google_refresh_token = encrypt_token(tokens.get("refresh_token"))

        # Calculate expiry
        expires_in = tokens.get("expires_in", 3600)
        from datetime import timedelta
        user.google_token_expiry = datetime.utcnow() + timedelta(seconds=expires_in)

        await db.commit()

        # Redirect to app (or success page)
        return RedirectResponse(url="/integrations/success?service=google")

    except Exception as e:
        logger.exception(f"Google OAuth callback failed: {e}")
        raise ExternalServiceError(
            service="google",
            message="OAuth callback failed. Please try again.",
        )


@router.delete("/google")
async def disconnect_google(
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """Disconnect Google integration."""
    current_user.google_access_token = None
    current_user.google_refresh_token = None
    current_user.google_token_expiry = None
    await db.commit()

    return {"message": "Google disconnected successfully"}


# ============ Apple CalDAV ============

@router.post("/apple/connect")
async def apple_connect(
    current_user: Annotated[User, Depends(get_current_user)],
    username: str,
    app_password: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Connect Apple Calendar/Reminders using CalDAV.
    Requires Apple ID and app-specific password.
    """
    # Validate credentials by attempting connection
    try:
        from app.services.apple_services import AppleCalendarService

        service = AppleCalendarService(
            username=username,
            app_password=app_password,
        )

        # Try to get calendars to verify connection
        calendars = service.calendars
        if not calendars:
            raise ValueError("No calendars found")

        # Store credentials (encrypted)
        current_user.apple_caldav_username = username
        current_user.apple_caldav_password = encrypt_token(app_password)
        await db.commit()

        return {
            "message": "Apple connected successfully",
            "calendars": [c.name for c in calendars[:5]],
        }

    except Exception as e:
        logger.exception(f"Failed to connect to Apple: {e}")
        raise ExternalServiceError(
            service="apple",
            message=f"Failed to connect to Apple: {str(e)}",
        )


@router.delete("/apple")
async def disconnect_apple(
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """Disconnect Apple integration."""
    current_user.apple_caldav_username = None
    current_user.apple_caldav_password = None
    await db.commit()

    return {"message": "Apple disconnected successfully"}


# ============ Test endpoints ============

@router.get("/google/test")
async def test_google_connection(
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Test Google connection by listing upcoming events."""
    if not current_user.google_access_token:
        raise ValidationError(
            message="Google not connected",
            code=ErrorCode.NOT_FOUND_INTEGRATION,
        )

    try:
        from app.services.google_services import GoogleCalendarService

        service = GoogleCalendarService(
            access_token=decrypt_token(current_user.google_access_token),
            refresh_token=decrypt_token(current_user.google_refresh_token),
        )

        events = await service.list_events(max_results=5)

        return {
            "status": "connected",
            "upcoming_events": len(events),
            "events": [
                {"summary": e.get("summary"), "start": e.get("start")}
                for e in events
            ],
        }

    except Exception as e:
        logger.exception(f"Google connection test failed: {e}")
        raise ExternalServiceError(
            service="google",
            message="Connection test failed. Please try reconnecting.",
        )


@router.get("/apple/test")
async def test_apple_connection(
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Test Apple connection by listing calendars."""
    if not current_user.apple_caldav_password:
        raise ValidationError(
            message="Apple not connected",
            code=ErrorCode.NOT_FOUND_INTEGRATION,
        )

    try:
        from app.services.apple_services import AppleCalendarService

        service = AppleCalendarService(
            username=current_user.apple_caldav_username,
            app_password=decrypt_token(current_user.apple_caldav_password),
        )

        calendars = service.calendars

        return {
            "status": "connected",
            "calendars": [c.name for c in calendars],
        }

    except Exception as e:
        logger.exception(f"Apple connection test failed: {e}")
        raise ExternalServiceError(
            service="apple",
            message="Connection test failed. Please try reconnecting.",
        )
