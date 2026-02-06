"""Action model for calendar events, emails, reminders."""
import uuid
from datetime import datetime
from enum import Enum
from sqlalchemy import Column, String, Boolean, DateTime, Text, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.database import Base


class ActionType(str, Enum):
    """Types of actions that can be extracted from notes."""
    CALENDAR = "calendar"
    EMAIL = "email"
    REMINDER = "reminder"
    NEXT_STEP = "next_step"


class ActionStatus(str, Enum):
    """Status of an action."""
    PENDING = "pending"
    CREATED = "created"
    EXECUTED = "executed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ActionPriority(str, Enum):
    """Priority levels for actions."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class Action(Base):
    """Action model for tasks extracted from voice memos."""

    __tablename__ = "actions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    note_id = Column(UUID(as_uuid=True), ForeignKey("notes.id", ondelete="CASCADE"), nullable=False, index=True)

    # Action details
    action_type = Column(SQLEnum(ActionType), nullable=False, index=True)
    status = Column(SQLEnum(ActionStatus), default=ActionStatus.PENDING)
    priority = Column(SQLEnum(ActionPriority), default=ActionPriority.MEDIUM)

    # Content
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    details = Column(JSONB, default={})  # Flexible storage for action-specific data

    # Scheduling (for calendar/reminders)
    scheduled_date = Column(DateTime, nullable=True, index=True)
    scheduled_end_date = Column(DateTime, nullable=True)
    location = Column(String(500), nullable=True)
    attendees = Column(JSONB, default=[])  # List of attendees

    # Email specific
    email_to = Column(String(500), nullable=True)
    email_subject = Column(String(500), nullable=True)
    email_body = Column(Text, nullable=True)

    # External service reference
    external_id = Column(String(255), nullable=True)  # Google/Apple event ID
    external_service = Column(String(50), nullable=True)  # "google", "apple"
    external_url = Column(String(500), nullable=True)  # Link to external resource

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    executed_at = Column(DateTime, nullable=True)

    # Relationships
    note = relationship("Note", back_populates="actions")

    def __repr__(self):
        return f"<Action {self.action_type.value}: {self.title[:50]}>"
