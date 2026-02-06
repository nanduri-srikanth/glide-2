"""Action-related Pydantic schemas."""
from datetime import datetime
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field

from app.models.action import ActionType, ActionStatus, ActionPriority


class ActionCreate(BaseModel):
    """Base schema for creating an action."""
    action_type: ActionType
    title: str = Field(..., max_length=500)
    description: Optional[str] = None
    priority: ActionPriority = ActionPriority.MEDIUM


class CalendarActionCreate(ActionCreate):
    """Schema for creating a calendar action."""
    action_type: ActionType = ActionType.CALENDAR
    scheduled_date: datetime
    scheduled_end_date: Optional[datetime] = None
    location: Optional[str] = Field(None, max_length=500)
    attendees: List[str] = Field(default=[])


class EmailActionCreate(ActionCreate):
    """Schema for creating an email action."""
    action_type: ActionType = ActionType.EMAIL
    email_to: EmailStr
    email_subject: str = Field(..., max_length=500)
    email_body: str


class ReminderActionCreate(ActionCreate):
    """Schema for creating a reminder action."""
    action_type: ActionType = ActionType.REMINDER
    scheduled_date: datetime
    priority: ActionPriority = ActionPriority.MEDIUM


class NextStepCreate(ActionCreate):
    """Schema for creating a next step action."""
    action_type: ActionType = ActionType.NEXT_STEP


class ActionUpdate(BaseModel):
    """Schema for updating an action."""
    title: Optional[str] = Field(None, max_length=500)
    description: Optional[str] = None
    status: Optional[ActionStatus] = None
    priority: Optional[ActionPriority] = None
    scheduled_date: Optional[datetime] = None
    scheduled_end_date: Optional[datetime] = None


class ActionResponse(BaseModel):
    """Schema for action response."""
    id: UUID
    note_id: UUID
    action_type: ActionType
    status: ActionStatus
    priority: ActionPriority
    title: str
    description: Optional[str]
    scheduled_date: Optional[datetime]
    scheduled_end_date: Optional[datetime]
    location: Optional[str]
    attendees: List[str] = []
    email_to: Optional[str]
    email_subject: Optional[str]
    email_body: Optional[str]
    external_id: Optional[str]
    external_service: Optional[str]
    external_url: Optional[str]
    created_at: datetime
    executed_at: Optional[datetime]

    model_config = {"from_attributes": True}


class ActionExecuteRequest(BaseModel):
    """Schema for executing an action."""
    service: str = Field(..., description="Service to use: 'google' or 'apple'")


class ActionExecuteResponse(BaseModel):
    """Schema for action execution response."""
    action_id: UUID
    status: ActionStatus
    external_id: Optional[str]
    external_url: Optional[str]
    message: str
