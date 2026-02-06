"""Actions router for executing calendar, email, and reminder actions."""
import logging
from datetime import datetime
from typing import Annotated, Optional, List
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.action import Action, ActionType, ActionStatus
from app.routers.auth import get_current_user
from app.services.google_services import GoogleCalendarService, GmailService
from app.services.apple_services import AppleCalendarService, AppleRemindersService
from app.utils import decrypt_token
from app.schemas.action_schemas import (
    ActionResponse,
    ActionUpdate,
    ActionExecuteRequest,
    ActionExecuteResponse,
)
from app.core.errors import NotFoundError, ConflictError, ValidationError, ErrorCode, ExternalServiceError

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("", response_model=List[ActionResponse])
async def list_actions(
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
    note_id: Optional[UUID] = None,
    action_type: Optional[ActionType] = None,
    status_filter: Optional[ActionStatus] = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=100),
):
    """List actions with optional filters."""
    query = (
        select(Action)
        .join(Action.note)
        .where(Action.note.has(user_id=current_user.id))
    )

    if note_id:
        query = query.where(Action.note_id == note_id)

    if action_type:
        query = query.where(Action.action_type == action_type)

    if status_filter:
        query = query.where(Action.status == status_filter)

    query = query.order_by(Action.created_at.desc()).limit(limit)

    result = await db.execute(query)
    actions = result.scalars().all()

    return [ActionResponse.model_validate(a) for a in actions]


@router.get("/{action_id}", response_model=ActionResponse)
async def get_action(
    action_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """Get a single action by ID."""
    result = await db.execute(
        select(Action)
        .join(Action.note)
        .where(Action.id == action_id)
        .where(Action.note.has(user_id=current_user.id))
    )
    action = result.scalar_one_or_none()

    if not action:
        raise NotFoundError(resource="action", identifier=str(action_id))

    return ActionResponse.model_validate(action)


@router.patch("/{action_id}", response_model=ActionResponse)
async def update_action(
    action_id: UUID,
    action_data: ActionUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """Update an action."""
    result = await db.execute(
        select(Action)
        .join(Action.note)
        .where(Action.id == action_id)
        .where(Action.note.has(user_id=current_user.id))
    )
    action = result.scalar_one_or_none()

    if not action:
        raise NotFoundError(resource="action", identifier=str(action_id))

    update_data = action_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(action, field, value)

    action.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(action)

    return ActionResponse.model_validate(action)


@router.delete("/{action_id}", status_code=204)
async def delete_action(
    action_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """Delete an action."""
    result = await db.execute(
        select(Action)
        .join(Action.note)
        .where(Action.id == action_id)
        .where(Action.note.has(user_id=current_user.id))
    )
    action = result.scalar_one_or_none()

    if not action:
        raise NotFoundError(resource="action", identifier=str(action_id))

    await db.delete(action)
    await db.commit()


@router.post("/{action_id}/execute", response_model=ActionExecuteResponse)
async def execute_action(
    action_id: UUID,
    request: ActionExecuteRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """
    Execute an action (create calendar event, email draft, reminder).
    """
    result = await db.execute(
        select(Action)
        .join(Action.note)
        .where(Action.id == action_id)
        .where(Action.note.has(user_id=current_user.id))
    )
    action = result.scalar_one_or_none()

    if not action:
        raise NotFoundError(resource="action", identifier=str(action_id))

    if action.status == ActionStatus.EXECUTED:
        raise ConflictError(
            message="Action already executed",
            code=ErrorCode.CONFLICT_ACTION_EXECUTED,
            param="action_id",
        )

    service = request.service.lower()

    try:
        if action.action_type == ActionType.CALENDAR:
            result = await _execute_calendar_action(action, current_user, service)
        elif action.action_type == ActionType.EMAIL:
            result = await _execute_email_action(action, current_user, service)
        elif action.action_type == ActionType.REMINDER:
            result = await _execute_reminder_action(action, current_user, service)
        else:
            raise ValidationError(
                message=f"Cannot execute action type: {action.action_type}",
                code=ErrorCode.VALIDATION_INVALID_VALUE,
                param="action_type",
            )

        # Update action status
        action.status = ActionStatus.EXECUTED
        action.external_id = result.get("id") or result.get("uid")
        action.external_service = service
        action.external_url = result.get("html_link") or result.get("url")
        action.executed_at = datetime.utcnow()

        await db.commit()

        return ActionExecuteResponse(
            action_id=action.id,
            status=action.status,
            external_id=action.external_id,
            external_url=action.external_url,
            message=f"Successfully created {action.action_type.value} in {service}",
        )

    except Exception as e:
        action.status = ActionStatus.FAILED
        action.details = {**(action.details or {}), "error": str(e)}
        await db.commit()

        logger.exception(f"Failed to execute action {action_id}: {e}")
        raise ExternalServiceError(
            service=service,
            message=f"Failed to execute action: {str(e)}",
        )


async def _execute_calendar_action(action: Action, user: User, service: str) -> dict:
    """Execute a calendar action."""
    if service == "google":
        if not user.google_access_token:
            raise ValueError("Google Calendar not connected")

        calendar_service = GoogleCalendarService(
            access_token=decrypt_token(user.google_access_token),
            refresh_token=decrypt_token(user.google_refresh_token),
        )

        return await calendar_service.create_event(
            title=action.title,
            start_datetime=action.scheduled_date,
            end_datetime=action.scheduled_end_date,
            location=action.location,
            description=action.description,
            attendees=action.attendees,
            timezone=user.timezone,
        )

    elif service == "apple":
        if not user.apple_caldav_username or not user.apple_caldav_password:
            raise ValueError("Apple Calendar not connected")

        calendar_service = AppleCalendarService(
            username=user.apple_caldav_username,
            app_password=decrypt_token(user.apple_caldav_password),
        )

        return await calendar_service.create_event(
            title=action.title,
            start_datetime=action.scheduled_date,
            end_datetime=action.scheduled_end_date,
            location=action.location,
            description=action.description,
        )

    else:
        raise ValueError(f"Unsupported service: {service}")


async def _execute_email_action(action: Action, user: User, service: str) -> dict:
    """Execute an email action (create draft)."""
    if service != "google":
        raise ValueError("Only Google Gmail is supported for email")

    if not user.google_access_token:
        raise ValueError("Gmail not connected")

    gmail_service = GmailService(
        access_token=decrypt_token(user.google_access_token),
        refresh_token=decrypt_token(user.google_refresh_token),
    )

    return await gmail_service.create_draft(
        to=action.email_to,
        subject=action.email_subject,
        body=action.email_body,
    )


async def _execute_reminder_action(action: Action, user: User, service: str) -> dict:
    """Execute a reminder action."""
    if service == "apple":
        if not user.apple_caldav_username or not user.apple_caldav_password:
            raise ValueError("Apple Reminders not connected")

        reminders_service = AppleRemindersService(
            username=user.apple_caldav_username,
            app_password=decrypt_token(user.apple_caldav_password),
        )

        priority = 5  # medium
        if action.priority.value == "high":
            priority = 1
        elif action.priority.value == "low":
            priority = 9

        return await reminders_service.create_reminder(
            title=action.title,
            due_date=action.scheduled_date,
            notes=action.description,
            priority=priority,
        )

    else:
        raise ValueError(f"Reminders not supported for service: {service}")


@router.post("/{action_id}/complete", response_model=ActionResponse)
async def complete_action(
    action_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """Mark an action as complete (for next_steps and reminders)."""
    result = await db.execute(
        select(Action)
        .join(Action.note)
        .where(Action.id == action_id)
        .where(Action.note.has(user_id=current_user.id))
    )
    action = result.scalar_one_or_none()

    if not action:
        raise NotFoundError(resource="action", identifier=str(action_id))

    action.status = ActionStatus.EXECUTED
    action.executed_at = datetime.utcnow()
    await db.commit()
    await db.refresh(action)

    return ActionResponse.model_validate(action)
