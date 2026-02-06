"""Note and Folder Pydantic schemas."""
from datetime import datetime
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel, Field

from app.schemas.action_schemas import ActionResponse


class FolderCreate(BaseModel):
    """Schema for creating a folder."""
    name: str = Field(..., max_length=255)
    icon: str = Field(default="folder.fill", max_length=50)
    color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    parent_id: Optional[UUID] = None
    client_id: Optional[UUID] = None


class FolderUpdate(BaseModel):
    """Schema for updating a folder."""
    name: Optional[str] = Field(None, max_length=255)
    icon: Optional[str] = Field(None, max_length=50)
    color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    sort_order: Optional[int] = None
    parent_id: Optional[UUID] = None


class FolderResponse(BaseModel):
    """Schema for folder response."""
    id: UUID
    name: str
    icon: str
    color: Optional[str]
    is_system: bool
    note_count: int = 0
    sort_order: int = 0
    parent_id: Optional[UUID] = None
    depth: int = 0
    children: List["FolderResponse"] = []
    created_at: datetime

    model_config = {"from_attributes": True}


class FolderReorderItem(BaseModel):
    """Schema for a single folder reorder item."""
    id: UUID
    sort_order: int
    parent_id: Optional[UUID] = None


class FolderBulkReorder(BaseModel):
    """Schema for bulk folder reorder."""
    folders: List[FolderReorderItem]


class NoteCreate(BaseModel):
    """Schema for creating a note (manual, non-voice)."""
    title: str = Field(..., max_length=500)
    transcript: str
    folder_id: Optional[UUID] = None
    tags: List[str] = Field(default=[])
    client_id: Optional[UUID] = None


class NoteUpdate(BaseModel):
    """Schema for updating a note."""
    title: Optional[str] = Field(None, max_length=500)
    transcript: Optional[str] = None
    folder_id: Optional[UUID] = None
    tags: Optional[List[str]] = None
    is_pinned: Optional[bool] = None
    is_archived: Optional[bool] = None


class NoteResponse(BaseModel):
    """Schema for single note response."""
    id: UUID
    title: str
    transcript: str
    summary: Optional[str]
    duration: Optional[int]
    audio_url: Optional[str]
    folder_id: Optional[UUID]
    folder_name: Optional[str] = None
    tags: List[str]
    is_pinned: bool
    is_archived: bool
    ai_processed: bool
    actions: List[ActionResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class NoteListItem(BaseModel):
    """Schema for note in list view (minimal data)."""
    id: UUID
    title: str
    preview: str  # First 100 chars of transcript
    duration: Optional[int]
    folder_id: Optional[UUID]
    tags: List[str]
    is_pinned: bool
    action_count: int = 0
    calendar_count: int = 0
    email_count: int = 0
    reminder_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class NoteListResponse(BaseModel):
    """Schema for paginated note list response."""
    items: List[NoteListItem]
    total: int
    page: int
    per_page: int
    pages: int


class NoteSearchParams(BaseModel):
    """Schema for note search parameters."""
    q: Optional[str] = None
    folder_id: Optional[UUID] = None
    tags: Optional[List[str]] = None
    is_pinned: Optional[bool] = None
    is_archived: Optional[bool] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=20, ge=1, le=100)


class UnifiedSearchResponse(BaseModel):
    """Schema for unified search response (folders + notes)."""
    folders: List[FolderResponse]
    notes: List[NoteListItem]


# Resolve forward references for recursive FolderResponse
FolderResponse.model_rebuild()
