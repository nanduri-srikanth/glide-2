"""Note and Folder models."""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, ARRAY, JSONB
from sqlalchemy.orm import relationship

from app.database import Base


class Folder(Base):
    """Folder model for organizing notes."""

    __tablename__ = "folders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    icon = Column(String(50), default="folder.fill")
    color = Column(String(7), nullable=True)  # Hex color
    is_system = Column(Boolean, default=False)  # For "All Notes", "Recently Deleted"
    sort_order = Column(Integer, default=0)

    # Nesting support
    parent_id = Column(UUID(as_uuid=True), ForeignKey("folders.id", ondelete="CASCADE"), nullable=True, index=True)
    depth = Column(Integer, default=0)  # 0 = root, 1 = child, 2 = grandchild (max)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="folders")
    notes = relationship("Note", back_populates="folder", cascade="all, delete-orphan")

    # Self-referential relationships for folder nesting
    parent = relationship("Folder", remote_side=[id], back_populates="children")
    children = relationship("Folder", back_populates="parent", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Folder {self.name}>"


class Note(Base):
    """Note model for voice memos and transcriptions."""

    __tablename__ = "notes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    folder_id = Column(UUID(as_uuid=True), ForeignKey("folders.id", ondelete="SET NULL"), nullable=True, index=True)

    # Content
    title = Column(String(500), nullable=False)
    transcript = Column(Text, nullable=False)
    summary = Column(Text, nullable=True)  # AI-generated summary

    # Audio metadata
    duration = Column(Integer, nullable=True)  # Duration in seconds
    audio_url = Column(String(500), nullable=True)  # S3/storage URL
    audio_format = Column(String(20), nullable=True)  # mp3, m4a, wav

    # Organization
    tags = Column(ARRAY(String), default=[])
    is_pinned = Column(Boolean, default=False)
    is_archived = Column(Boolean, default=False)
    is_deleted = Column(Boolean, default=False)
    deleted_at = Column(DateTime, nullable=True)

    # AI processing metadata
    ai_processed = Column(Boolean, default=False)
    ai_metadata = Column(JSONB, default={})  # Store AI processing details

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="notes")
    folder = relationship("Folder", back_populates="notes")
    actions = relationship("Action", back_populates="note", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Note {self.title[:50]}>"
