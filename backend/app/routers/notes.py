"""Notes CRUD router."""
import logging
from datetime import datetime
from typing import Annotated, Optional, List
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.user import User
from app.models.note import Note, Folder
from app.models.action import ActionType
from app.routers.auth import get_current_user
from app.services.llm import LLMService
from app.schemas.note_schemas import (
    NoteCreate,
    NoteUpdate,
    NoteResponse,
    NoteListItem,
    NoteListResponse,
    FolderResponse,
    UnifiedSearchResponse,
)
from app.core.errors import NotFoundError, ExternalServiceError, ConflictError, ErrorCode

logger = logging.getLogger(__name__)

router = APIRouter()


def build_note_list_item(note: Note) -> NoteListItem:
    """
    Build a NoteListItem from a Note object with eagerly-loaded actions.

    Args:
        note: A Note object with actions eagerly loaded via selectinload(Note.actions)

    Returns:
        A NoteListItem with action counts and preview text populated
    """
    # Count actions by type
    calendar_count = sum(1 for a in note.actions if a.action_type == ActionType.CALENDAR)
    email_count = sum(1 for a in note.actions if a.action_type == ActionType.EMAIL)
    reminder_count = sum(1 for a in note.actions if a.action_type == ActionType.REMINDER)

    # Handle preview: truncate transcript if needed, handle empty transcript
    transcript = note.transcript or ""
    preview = transcript[:100] + "..." if len(transcript) > 100 else transcript

    return NoteListItem(
        id=note.id,
        title=note.title,
        preview=preview,
        duration=note.duration,
        folder_id=note.folder_id,
        tags=note.tags or [],
        is_pinned=note.is_pinned,
        action_count=len(note.actions),
        calendar_count=calendar_count,
        email_count=email_count,
        reminder_count=reminder_count,
        created_at=note.created_at,
    )


@router.get("", response_model=NoteListResponse)
async def list_notes(
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
    folder_id: Optional[UUID] = None,
    q: Optional[str] = None,
    tags: Optional[List[str]] = Query(None),
    is_pinned: Optional[bool] = None,
    is_archived: Optional[bool] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List all notes with filtering and pagination."""
    # Base query
    query = (
        select(Note)
        .where(Note.user_id == current_user.id)
        .where(Note.is_deleted == False)
    )

    # Apply filters
    if folder_id:
        query = query.where(Note.folder_id == folder_id)

    if q:
        search_term = f"%{q}%"
        query = query.where(
            or_(
                Note.title.ilike(search_term),
                Note.transcript.ilike(search_term),
            )
        )

    if tags:
        query = query.where(Note.tags.overlap(tags))

    if is_pinned is not None:
        query = query.where(Note.is_pinned == is_pinned)

    if is_archived is not None:
        query = query.where(Note.is_archived == is_archived)
    else:
        # Default: don't show archived
        query = query.where(Note.is_archived == False)

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Apply pagination and ordering
    query = (
        query
        .options(selectinload(Note.actions))
        .order_by(Note.is_pinned.desc(), Note.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )

    result = await db.execute(query)
    notes = result.scalars().all()

    # Transform to list items using helper function
    items = [build_note_list_item(note) for note in notes]

    return NoteListResponse(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        pages=(total + per_page - 1) // per_page,
    )


@router.get("/search", response_model=NoteListResponse)
async def search_notes(
    q: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """Full-text search notes."""
    search_term = f"%{q}%"

    query = (
        select(Note)
        .where(Note.user_id == current_user.id)
        .where(Note.is_deleted == False)
        .where(
            or_(
                Note.title.ilike(search_term),
                Note.transcript.ilike(search_term),
                Note.tags.overlap([q]),
            )
        )
    )

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Apply pagination
    query = (
        query
        .options(selectinload(Note.actions))
        .order_by(Note.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )

    result = await db.execute(query)
    notes = result.scalars().all()

    # Transform to list items using helper function
    items = [build_note_list_item(note) for note in notes]

    return NoteListResponse(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        pages=(total + per_page - 1) // per_page,
    )


@router.get("/search/all", response_model=UnifiedSearchResponse)
async def unified_search(
    q: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """Search both folders and notes, returning combined results."""
    search_term = f"%{q}%"

    # Search folders by name
    folder_query = (
        select(Folder)
        .where(Folder.user_id == current_user.id)
        .where(Folder.name.ilike(search_term))
        .order_by(Folder.sort_order)
        .limit(10)
    )
    folder_result = await db.execute(folder_query)
    folders = folder_result.scalars().all()

    # Count notes per folder for the response
    folder_responses = []
    for folder in folders:
        note_count_query = select(func.count()).where(
            Note.folder_id == folder.id,
            Note.is_deleted == False
        )
        count_result = await db.execute(note_count_query)
        note_count = count_result.scalar() or 0

        folder_responses.append(FolderResponse(
            id=folder.id,
            name=folder.name,
            icon=folder.icon,
            color=folder.color,
            is_system=folder.is_system,
            note_count=note_count,
            sort_order=folder.sort_order,
            parent_id=folder.parent_id,
            depth=folder.depth,
            children=[],
            created_at=folder.created_at,
        ))

    # Search notes by title or transcript
    note_query = (
        select(Note)
        .where(Note.user_id == current_user.id)
        .where(Note.is_deleted == False)
        .where(Note.is_archived == False)
        .where(
            or_(
                Note.title.ilike(search_term),
                Note.transcript.ilike(search_term),
            )
        )
        .options(selectinload(Note.actions))
        .order_by(Note.created_at.desc())
        .limit(20)
    )
    note_result = await db.execute(note_query)
    notes = note_result.scalars().all()

    # Transform to list items using helper function
    note_items = [build_note_list_item(note) for note in notes]

    return UnifiedSearchResponse(
        folders=folder_responses,
        notes=note_items,
    )


@router.get("/all", response_model=NoteListResponse)
async def list_all_notes(
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """
    Get all non-deleted, non-archived notes for the current user.

    This is the dedicated endpoint for "all notes" queries, used when no folder filter is applied.
    """
    # Base query - all non-deleted, non-archived notes for this user
    query = (
        select(Note)
        .where(Note.user_id == current_user.id)
        .where(Note.is_deleted == False)
        .where(Note.is_archived == False)
    )

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Apply pagination and ordering
    query = (
        query
        .options(selectinload(Note.actions))
        .order_by(Note.is_pinned.desc(), Note.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )

    result = await db.execute(query)
    notes = result.scalars().all()

    # Transform to list items using helper function
    items = [build_note_list_item(note) for note in notes]

    return NoteListResponse(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        pages=(total + per_page - 1) // per_page,
    )


@router.get("/{note_id}", response_model=NoteResponse)
async def get_note(
    note_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """Get a single note by ID."""
    result = await db.execute(
        select(Note)
        .options(selectinload(Note.actions), selectinload(Note.folder))
        .where(Note.id == note_id)
        .where(Note.user_id == current_user.id)
        .where(Note.is_deleted == False)
    )
    note = result.scalar_one_or_none()

    if not note:
        raise NotFoundError(resource="note", identifier=str(note_id))

    response = NoteResponse.model_validate(note)
    if note.folder:
        response.folder_name = note.folder.name

    return response


@router.post("", response_model=NoteResponse, status_code=201)
async def create_note(
    note_data: NoteCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """Create a new note manually (non-voice)."""
    # Idempotency for offline-created notes
    if note_data.client_id:
        existing = await db.execute(
            select(Note)
            .options(selectinload(Note.actions), selectinload(Note.folder))
            .where(Note.id == note_data.client_id)
        )
        existing_note = existing.scalar_one_or_none()
        if existing_note:
            if existing_note.user_id != current_user.id:
                raise ConflictError(
                    message="Note ID already exists",
                    code=ErrorCode.CONFLICT_RESOURCE_EXISTS,
                    param="client_id",
                )
            response = NoteResponse.model_validate(existing_note)
            if existing_note.folder:
                response.folder_name = existing_note.folder.name
            return response

    # Verify folder exists if provided
    if note_data.folder_id:
        result = await db.execute(
            select(Folder)
            .where(Folder.id == note_data.folder_id)
            .where(Folder.user_id == current_user.id)
        )
        if not result.scalar_one_or_none():
            raise NotFoundError(resource="folder", identifier=str(note_data.folder_id))

    note = Note(
        user_id=current_user.id,
        title=note_data.title,
        transcript=note_data.transcript,
        folder_id=note_data.folder_id,
        tags=note_data.tags or [],
    )
    if note_data.client_id:
        note.id = note_data.client_id
    db.add(note)
    await db.commit()
    await db.refresh(note)

    # Return response without lazy-loading actions (new note has no actions)
    return NoteResponse(
        id=note.id,
        title=note.title,
        transcript=note.transcript,
        summary=note.summary,
        duration=note.duration,
        audio_url=note.audio_url,
        folder_id=note.folder_id,
        folder_name=None,
        tags=note.tags or [],
        is_pinned=note.is_pinned,
        is_archived=note.is_archived,
        ai_processed=note.ai_processed,
        actions=[],
        created_at=note.created_at,
        updated_at=note.updated_at,
    )


@router.patch("/{note_id}", response_model=NoteResponse)
async def update_note(
    note_id: UUID,
    note_data: NoteUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """Update a note."""
    result = await db.execute(
        select(Note)
        .options(selectinload(Note.actions))
        .where(Note.id == note_id)
        .where(Note.user_id == current_user.id)
        .where(Note.is_deleted == False)
    )
    note = result.scalar_one_or_none()

    if not note:
        raise NotFoundError(resource="note", identifier=str(note_id))

    # Verify folder exists if changing
    if note_data.folder_id:
        result = await db.execute(
            select(Folder)
            .where(Folder.id == note_data.folder_id)
            .where(Folder.user_id == current_user.id)
        )
        if not result.scalar_one_or_none():
            raise NotFoundError(resource="folder", identifier=str(note_data.folder_id))

    update_data = note_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(note, field, value)

    note.updated_at = datetime.utcnow()
    await db.commit()

    # Re-fetch with relationships loaded
    result = await db.execute(
        select(Note)
        .options(selectinload(Note.actions), selectinload(Note.folder))
        .where(Note.id == note.id)
    )
    note = result.scalar_one()

    response = NoteResponse.model_validate(note)
    if note.folder:
        response.folder_name = note.folder.name
    return response


@router.delete("/{note_id}", status_code=204)
async def delete_note(
    note_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
    permanent: bool = False,
):
    """Delete a note (soft delete by default)."""
    result = await db.execute(
        select(Note)
        .where(Note.id == note_id)
        .where(Note.user_id == current_user.id)
    )
    note = result.scalar_one_or_none()

    if not note:
        raise NotFoundError(resource="note", identifier=str(note_id))

    if permanent:
        await db.delete(note)
    else:
        note.is_deleted = True
        note.deleted_at = datetime.utcnow()

    await db.commit()


@router.post("/{note_id}/restore", response_model=NoteResponse)
async def restore_note(
    note_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """Restore a deleted note."""
    result = await db.execute(
        select(Note)
        .where(Note.id == note_id)
        .where(Note.user_id == current_user.id)
        .where(Note.is_deleted == True)
    )
    note = result.scalar_one_or_none()

    if not note:
        raise NotFoundError(resource="note", identifier=str(note_id))

    note.is_deleted = False
    note.deleted_at = None
    note.updated_at = datetime.utcnow()
    await db.commit()

    # Re-fetch with relationships loaded
    result = await db.execute(
        select(Note)
        .options(selectinload(Note.actions), selectinload(Note.folder))
        .where(Note.id == note.id)
    )
    note = result.scalar_one()

    response = NoteResponse.model_validate(note)
    if note.folder:
        response.folder_name = note.folder.name
    return response


@router.post("/{note_id}/auto-sort", response_model=NoteResponse)
async def auto_sort_note(
    note_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """
    Auto-sort a note using AI to determine the best folder.

    This analyzes the note's content and moves it to the most appropriate folder
    based on the user's existing folders.
    """
    # Get the note
    result = await db.execute(
        select(Note)
        .options(selectinload(Note.actions))
        .where(Note.id == note_id)
        .where(Note.user_id == current_user.id)
        .where(Note.is_deleted == False)
    )
    note = result.scalar_one_or_none()

    if not note:
        raise NotFoundError(resource="note", identifier=str(note_id))

    try:
        # Fetch user's folders for smart categorization
        folders_result = await db.execute(
            select(Folder.name)
            .where(Folder.user_id == current_user.id)
            .where(Folder.is_system == False)
            .order_by(Folder.sort_order)
        )
        user_folders = [row[0] for row in folders_result.fetchall()]
        if not user_folders:
            user_folders = ['Work', 'Personal', 'Ideas']

        # Use LLM to suggest folder
        llm_service = LLMService()
        user_context = {
            "timezone": current_user.timezone,
            "current_date": datetime.utcnow().strftime("%Y-%m-%d"),
            "folders": user_folders,
        }

        extraction = await llm_service.extract_actions(
            transcript=note.transcript or note.title,
            user_context=user_context,
        )

        # Find or create the suggested folder
        suggested_folder = extraction.folder
        result = await db.execute(
            select(Folder)
            .where(Folder.user_id == current_user.id)
            .where(Folder.name == suggested_folder)
        )
        folder = result.scalar_one_or_none()

        if not folder:
            # Create the folder if it doesn't exist
            folder = Folder(
                user_id=current_user.id,
                name=suggested_folder,
                icon="folder.fill",
            )
            db.add(folder)
            await db.flush()

        # Move the note to the suggested folder
        note.folder_id = folder.id
        note.updated_at = datetime.utcnow()

        await db.commit()

        # Re-fetch with folder relationship
        result = await db.execute(
            select(Note)
            .options(selectinload(Note.actions), selectinload(Note.folder))
            .where(Note.id == note.id)
        )
        note = result.scalar_one()

        response = NoteResponse.model_validate(note)
        if note.folder:
            response.folder_name = note.folder.name
        return response

    except Exception as e:
        await db.rollback()
        logger.exception(f"Failed to auto-sort note {note_id}: {e}")
        raise ExternalServiceError(
            service="llm",
            message="Failed to auto-sort note. Please try again.",
        )
