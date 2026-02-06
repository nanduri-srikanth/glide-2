"""Authentication router."""
import logging
from datetime import datetime
from typing import Annotated, Optional
from uuid import UUID
import secrets

from fastapi import APIRouter, Depends, Request
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from jose import JWTError

from app.database import get_db
from app.models.user import User
from app.schemas.user_schemas import (
    UserCreate,
    UserResponse,
    UserUpdate,
    Token,
    PasswordChange,
)
from app.utils.auth import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    verify_token,
)
from app.utils.apple import verify_apple_identity_token
from app.config import get_settings
from app.core.errors import (
    ErrorCode,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    ConflictError,
    ExternalServiceError,
)
from app.core.responses import MessageResponse
from app.core.middleware import get_request_id

logger = logging.getLogger(__name__)


class AppleSignInRequest(BaseModel):
    """Apple Sign-In request data."""
    identity_token: str
    authorization_code: str
    user_id: str
    email: Optional[str] = None
    full_name: Optional[str] = None


class RefreshTokenRequest(BaseModel):
    """Refresh token request data."""
    refresh_token: str

router = APIRouter()
settings = get_settings()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: AsyncSession = Depends(get_db)
) -> User:
    """Get current authenticated user from JWT token."""
    payload = verify_token(token, token_type="access")
    if payload is None:
        raise AuthenticationError(
            message="Invalid or expired access token",
            code=ErrorCode.AUTH_INVALID_TOKEN,
        )

    user_id = payload.get("sub")
    if user_id is None:
        raise AuthenticationError(
            message="Invalid token payload",
            code=ErrorCode.AUTH_INVALID_TOKEN,
        )

    result = await db.execute(
        select(User).where(User.id == UUID(user_id))
    )
    user = result.scalar_one_or_none()

    if user is None:
        raise AuthenticationError(
            message="User not found",
            code=ErrorCode.AUTH_INVALID_TOKEN,
        )

    if not user.is_active:
        raise AuthorizationError(
            message="User account is disabled",
            code=ErrorCode.PERMISSION_ACCOUNT_INACTIVE,
        )

    return user


@router.post("/register", response_model=UserResponse, status_code=201)
async def register(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db)
):
    """Register a new user."""
    # Check if email already exists
    result = await db.execute(
        select(User).where(User.email == user_data.email)
    )
    if result.scalar_one_or_none():
        raise ConflictError(
            message="Email already registered",
            code=ErrorCode.CONFLICT_EMAIL_EXISTS,
            param="email",
        )

    # Create user
    user = User(
        email=user_data.email,
        hashed_password=get_password_hash(user_data.password),
        full_name=user_data.full_name,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return user


@router.post("/login", response_model=Token)
async def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: AsyncSession = Depends(get_db)
):
    """Login and get access token."""
    # Find user by email
    result = await db.execute(
        select(User).where(User.email == form_data.username)
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise ValidationError(
            message="Incorrect email or password",
            code=ErrorCode.VALIDATION_INVALID_CREDENTIALS,
        )

    if not user.is_active:
        raise AuthorizationError(
            message="User account is disabled",
            code=ErrorCode.PERMISSION_ACCOUNT_INACTIVE,
        )

    # Create tokens
    access_token = create_access_token(subject=str(user.id))
    refresh_token = create_refresh_token(subject=str(user.id))

    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=settings.access_token_expire_minutes * 60,
    )


@router.post("/refresh", response_model=Token)
async def refresh_token_endpoint(
    request: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db)
):
    """Get a new access token using refresh token."""
    payload = verify_token(request.refresh_token, token_type="refresh")
    if payload is None:
        raise AuthenticationError(
            message="Invalid or expired refresh token",
            code=ErrorCode.AUTH_INVALID_REFRESH_TOKEN,
        )

    user_id = payload.get("sub")
    result = await db.execute(
        select(User).where(User.id == UUID(user_id))
    )
    user = result.scalar_one_or_none()

    if not user:
        raise AuthenticationError(
            message="User not found",
            code=ErrorCode.AUTH_INVALID_REFRESH_TOKEN,
        )

    if not user.is_active:
        raise AuthorizationError(
            message="User account is disabled",
            code=ErrorCode.PERMISSION_ACCOUNT_INACTIVE,
        )

    # Create new tokens
    new_access_token = create_access_token(subject=str(user.id))
    new_refresh_token = create_refresh_token(subject=str(user.id))

    return Token(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        token_type="bearer",
        expires_in=settings.access_token_expire_minutes * 60,
    )


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: Annotated[User, Depends(get_current_user)]
):
    """Get current user profile."""
    # Add integration status
    response = UserResponse.model_validate(current_user)
    response.google_connected = bool(current_user.google_access_token)
    response.apple_connected = bool(current_user.apple_caldav_password)
    return response


@router.patch("/me", response_model=UserResponse)
async def update_me(
    user_data: UserUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db)
):
    """Update current user profile."""
    update_data = user_data.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(current_user, field, value)

    current_user.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(current_user)

    return current_user


@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    password_data: PasswordChange,
    current_user: Annotated[User, Depends(get_current_user)],
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Change user password."""
    if not verify_password(password_data.current_password, current_user.hashed_password):
        raise ValidationError(
            message="Incorrect current password",
            code=ErrorCode.VALIDATION_INVALID_CREDENTIALS,
            param="current_password",
        )

    current_user.hashed_password = get_password_hash(password_data.new_password)
    current_user.updated_at = datetime.utcnow()
    await db.commit()

    return MessageResponse(
        message="Password changed successfully",
        request_id=get_request_id(request),
    )


@router.post("/logout", response_model=MessageResponse)
async def logout(
    current_user: Annotated[User, Depends(get_current_user)],
    request: Request,
):
    """Logout user (client should discard tokens)."""
    # In a more complete implementation, you might:
    # - Add the token to a blacklist
    # - Invalidate refresh tokens in database
    return MessageResponse(
        message="Successfully logged out",
        request_id=get_request_id(request),
    )


@router.post("/apple", response_model=Token)
async def apple_sign_in(
    apple_data: AppleSignInRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Handle Apple Sign-In.
    Verifies the identity token with Apple's public keys and creates/retrieves user.
    """
    try:
        # Verify the identity token with Apple's public keys
        # This validates: signature, issuer, audience, and expiration
        token_payload = await verify_apple_identity_token(apple_data.identity_token)

        apple_user_id = token_payload.user_id
        email = token_payload.email or apple_data.email

        if not apple_user_id:
            raise AuthenticationError(
                message="Invalid Apple identity token: missing user ID",
                code=ErrorCode.AUTH_INVALID_APPLE_TOKEN,
            )

        # Try to find existing user by email
        user = None
        if email:
            result = await db.execute(
                select(User).where(User.email == email)
            )
            user = result.scalar_one_or_none()

        if not user:
            # Create a new user
            # Generate a random password since they're using Apple Sign-In
            random_password = secrets.token_urlsafe(32)

            user = User(
                email=email or f"apple_{apple_user_id}@privaterelay.appleid.com",
                hashed_password=get_password_hash(random_password),
                full_name=apple_data.full_name,
                is_verified=token_payload.email_verified,
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)

        # Create tokens
        access_token = create_access_token(subject=str(user.id))
        refresh_token = create_refresh_token(subject=str(user.id))

        logger.info(f"Apple Sign-In successful for user: {user.id}")

        return Token(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            expires_in=settings.access_token_expire_minutes * 60,
        )

    except JWTError as e:
        logger.warning(f"Apple Sign-In failed: {e}")
        raise AuthenticationError(
            message="Invalid Apple identity token",
            code=ErrorCode.AUTH_INVALID_APPLE_TOKEN,
        )
    except Exception as e:
        logger.exception(f"Apple Sign-In unexpected error: {e}")
        raise ExternalServiceError(
            service="apple",
            message="Apple Sign-In service temporarily unavailable",
        )
