"""Folders router."""
import logging
from datetime import datetime
from typing import Annotated, List
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.note import Note, Folder
from app.routers.auth import get_current_user
from app.schemas.note_schemas import FolderCreate, FolderUpdate, FolderResponse, FolderBulkReorder
from app.core.errors import NotFoundError, ConflictError, ValidationError, ErrorCode
from app.core.responses import MessageResponse
from app.core.middleware import get_request_id

logger = logging.getLogger(__name__)

router = APIRouter()


def build_folder_tree(folders: List[Folder], counts: dict, total_count: int) -> List[FolderResponse]:
    """Build hierarchical tree structure from flat folder list."""
    # Create a dict for quick lookup
    folder_map = {}
    for folder in folders:
        folder_response = FolderResponse(
            id=folder.id,
            name=folder.name,
            icon=folder.icon,
            color=folder.color,
            is_system=folder.is_system,
            sort_order=folder.sort_order,
            parent_id=folder.parent_id,
            depth=folder.depth,
            children=[],
            created_at=folder.created_at,
            note_count=0,
        )
        # For "All Notes" system folder, show total count
        if folder.name == "All Notes" and folder.is_system:
            folder_response.note_count = total_count
        else:
            folder_response.note_count = counts.get(folder.id, 0)
        folder_map[folder.id] = folder_response

    # Build tree structure
    root_folders = []
    for folder in folders:
        folder_response = folder_map[folder.id]
        if folder.parent_id and folder.parent_id in folder_map:
            # Add to parent's children
            folder_map[folder.parent_id].children.append(folder_response)
        else:
            # Root level folder
            root_folders.append(folder_response)

    # Sort children by sort_order
    for folder_response in folder_map.values():
        folder_response.children.sort(key=lambda f: (f.sort_order, f.name))

    # Sort root folders by sort_order
    root_folders.sort(key=lambda f: (f.sort_order, f.name))

    return root_folders


@router.get("", response_model=List[FolderResponse])
async def list_folders(
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """List all folders with note counts in hierarchical tree structure."""
    # Get folders
    result = await db.execute(
        select(Folder)
        .where(Folder.user_id == current_user.id)
        .order_by(Folder.depth, Folder.sort_order, Folder.name)
    )
    folders = result.scalars().all()

    # Get note counts per folder (direct notes only, not recursive)
    count_result = await db.execute(
        select(Note.folder_id, func.count(Note.id))
        .where(Note.user_id == current_user.id)
        .where(Note.is_deleted == False)
        .group_by(Note.folder_id)
    )
    counts = dict(count_result.all())

    # Get total note count for "All Notes" folder
    total_result = await db.execute(
        select(func.count(Note.id))
        .where(Note.user_id == current_user.id)
        .where(Note.is_deleted == False)
    )
    total_count = total_result.scalar() or 0

    # Build and return hierarchical tree
    return build_folder_tree(list(folders), counts, total_count)


@router.get("/{folder_id}", response_model=FolderResponse)
async def get_folder(
    folder_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """Get a single folder."""
    result = await db.execute(
        select(Folder)
        .where(Folder.id == folder_id)
        .where(Folder.user_id == current_user.id)
    )
    folder = result.scalar_one_or_none()

    if not folder:
        raise NotFoundError(resource="folder", identifier=str(folder_id))

    # Get note count
    count_result = await db.execute(
        select(func.count(Note.id))
        .where(Note.folder_id == folder_id)
        .where(Note.is_deleted == False)
    )
    note_count = count_result.scalar() or 0

    response = FolderResponse.model_validate(folder)
    response.note_count = note_count
    return response


@router.post("", response_model=FolderResponse, status_code=201)
async def create_folder(
    folder_data: FolderCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """Create a new folder."""
    # Check for duplicate name
    result = await db.execute(
        select(Folder)
        .where(Folder.user_id == current_user.id)
        .where(Folder.name == folder_data.name)
    )
    if result.scalar_one_or_none():
        raise ConflictError(
            message="Folder with this name already exists",
            code=ErrorCode.CONFLICT_FOLDER_EXISTS,
            param="name",
        )

    # Calculate depth if parent_id is provided
    depth = 0
    parent_id = folder_data.parent_id
    if parent_id:
        result = await db.execute(
            select(Folder)
            .where(Folder.id == parent_id)
            .where(Folder.user_id == current_user.id)
        )
        parent = result.scalar_one_or_none()
        if not parent:
            raise NotFoundError(resource="folder", identifier=str(parent_id))
        if parent.is_system:
            raise ValidationError(
                message="Cannot nest folders under system folders",
                code=ErrorCode.VALIDATION_FAILED,
                param="parent_id",
            )
        if parent.depth >= 2:
            raise ValidationError(
                message="Maximum folder nesting depth (2) exceeded",
                code=ErrorCode.VALIDATION_FAILED,
                param="parent_id",
            )
        depth = parent.depth + 1

    folder = Folder(
        user_id=current_user.id,
        name=folder_data.name,
        icon=folder_data.icon,
        color=folder_data.color,
        parent_id=parent_id,
        depth=depth,
    )
    db.add(folder)
    await db.commit()
    await db.refresh(folder)

    # Return response without lazy-loading children (new folder has no children)
    return FolderResponse(
        id=folder.id,
        name=folder.name,
        icon=folder.icon,
        color=folder.color,
        is_system=folder.is_system,
        note_count=0,
        sort_order=folder.sort_order,
        parent_id=folder.parent_id,
        depth=folder.depth,
        children=[],
        created_at=folder.created_at,
    )


async def get_folder_max_child_depth(db: AsyncSession, folder_id: UUID) -> int:
    """Get the maximum depth of descendants for a folder."""
    result = await db.execute(
        select(func.max(Folder.depth))
        .where(Folder.parent_id == folder_id)
    )
    max_child_depth = result.scalar()
    if max_child_depth is None:
        return 0
    # Recursively check children
    children_result = await db.execute(
        select(Folder.id).where(Folder.parent_id == folder_id)
    )
    children_ids = [r[0] for r in children_result.all()]
    for child_id in children_ids:
        child_max = await get_folder_max_child_depth(db, child_id)
        max_child_depth = max(max_child_depth, child_max)
    return max_child_depth


async def update_children_depth(db: AsyncSession, folder_id: UUID, new_depth: int):
    """Recursively update depth of all children when parent moves."""
    result = await db.execute(
        select(Folder).where(Folder.parent_id == folder_id)
    )
    children = result.scalars().all()
    for child in children:
        child.depth = new_depth + 1
        await update_children_depth(db, child.id, child.depth)


@router.patch("/{folder_id}", response_model=FolderResponse)
async def update_folder(
    folder_id: UUID,
    folder_data: FolderUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """Update a folder."""
    result = await db.execute(
        select(Folder)
        .where(Folder.id == folder_id)
        .where(Folder.user_id == current_user.id)
    )
    folder = result.scalar_one_or_none()

    if not folder:
        raise NotFoundError(resource="folder", identifier=str(folder_id))

    if folder.is_system:
        raise ValidationError(
            message="Cannot modify system folders",
            code=ErrorCode.VALIDATION_FAILED,
            param="folder_id",
        )

    # Check for duplicate name if changing
    if folder_data.name and folder_data.name != folder.name:
        result = await db.execute(
            select(Folder)
            .where(Folder.user_id == current_user.id)
            .where(Folder.name == folder_data.name)
            .where(Folder.id != folder_id)
        )
        if result.scalar_one_or_none():
            raise ConflictError(
                message="Folder with this name already exists",
                code=ErrorCode.CONFLICT_FOLDER_EXISTS,
                param="name",
            )

    # Handle parent_id change (nesting)
    update_data = folder_data.model_dump(exclude_unset=True)
    if 'parent_id' in update_data:
        new_parent_id = update_data['parent_id']
        if new_parent_id:
            # Validate new parent exists and belongs to user
            result = await db.execute(
                select(Folder)
                .where(Folder.id == new_parent_id)
                .where(Folder.user_id == current_user.id)
            )
            new_parent = result.scalar_one_or_none()
            if not new_parent:
                raise NotFoundError(resource="folder", identifier=str(new_parent_id))
            if new_parent.is_system:
                raise ValidationError(
                    message="Cannot nest folders under system folders",
                    code=ErrorCode.VALIDATION_FAILED,
                    param="parent_id",
                )
            # Prevent circular nesting (can't nest into self or descendants)
            if new_parent_id == folder_id:
                raise ValidationError(
                    message="Cannot nest a folder into itself",
                    code=ErrorCode.VALIDATION_FAILED,
                    param="parent_id",
                )
            # Check if new_parent is a descendant of folder
            check_parent = new_parent
            while check_parent.parent_id:
                if check_parent.parent_id == folder_id:
                    raise ValidationError(
                        message="Cannot nest a folder into its own descendant",
                        code=ErrorCode.VALIDATION_FAILED,
                        param="parent_id",
                    )
                result = await db.execute(
                    select(Folder).where(Folder.id == check_parent.parent_id)
                )
                check_parent = result.scalar_one_or_none()
                if not check_parent:
                    break
            # Calculate new depth
            new_depth = new_parent.depth + 1
            # Check max depth with children
            max_child_depth = await get_folder_max_child_depth(db, folder_id)
            child_depth_offset = max_child_depth - folder.depth if max_child_depth > 0 else 0
            if new_depth + child_depth_offset > 2:
                raise ValidationError(
                    message="Maximum folder nesting depth (2) exceeded",
                    code=ErrorCode.VALIDATION_FAILED,
                    param="parent_id",
                )
            update_data['depth'] = new_depth
            # Update children depths
            await update_children_depth(db, folder_id, new_depth)
        else:
            # Moving to root level
            old_depth = folder.depth
            update_data['depth'] = 0
            # Update children depths
            depth_change = -old_depth
            await update_children_depth(db, folder_id, 0)

    for field, value in update_data.items():
        setattr(folder, field, value)

    folder.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(folder)

    # Get note count for response
    count_result = await db.execute(
        select(func.count(Note.id))
        .where(Note.folder_id == folder_id)
        .where(Note.is_deleted == False)
    )
    note_count = count_result.scalar() or 0

    # Return response without lazy-loading children
    return FolderResponse(
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
    )


@router.post("/reorder")
async def reorder_folders(
    reorder_data: FolderBulkReorder,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """
    Bulk update folder sort_order and parent_id for drag-and-drop reordering.
    System folders cannot be reordered.
    """
    # Get all user's folders
    result = await db.execute(
        select(Folder).where(Folder.user_id == current_user.id)
    )
    user_folders = {f.id: f for f in result.scalars().all()}

    # Validate and update each folder
    for item in reorder_data.folders:
        if item.id not in user_folders:
            raise NotFoundError(resource="folder", identifier=str(item.id))

        folder = user_folders[item.id]

        # System folders cannot be reordered or nested
        if folder.is_system:
            continue

        # Validate parent_id
        new_depth = 0
        if item.parent_id:
            if item.parent_id not in user_folders:
                raise NotFoundError(resource="folder", identifier=str(item.parent_id))
            parent = user_folders[item.parent_id]
            if parent.is_system:
                raise ValidationError(
                    message="Cannot nest folders under system folders",
                    code=ErrorCode.VALIDATION_FAILED,
                    param="parent_id",
                )
            # Prevent circular nesting
            if item.parent_id == item.id:
                raise ValidationError(
                    message="Cannot nest a folder into itself",
                    code=ErrorCode.VALIDATION_FAILED,
                    param="parent_id",
                )
            new_depth = parent.depth + 1
            if new_depth > 2:
                raise ValidationError(
                    message="Maximum folder nesting depth (2) exceeded",
                    code=ErrorCode.VALIDATION_FAILED,
                    param="parent_id",
                )

        # Update folder
        folder.sort_order = item.sort_order
        if item.parent_id != folder.parent_id:
            folder.parent_id = item.parent_id
            folder.depth = new_depth
            # Update children depths recursively
            await update_children_depth(db, folder.id, new_depth)

        folder.updated_at = datetime.utcnow()

    await db.commit()

    return {"message": "Folders reordered successfully"}


@router.delete("/{folder_id}", status_code=204)
async def delete_folder(
    folder_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
    move_notes_to: UUID = None,
):
    """
    Delete a folder.
    Notes can be moved to another folder or will be unassigned.
    """
    result = await db.execute(
        select(Folder)
        .where(Folder.id == folder_id)
        .where(Folder.user_id == current_user.id)
    )
    folder = result.scalar_one_or_none()

    if not folder:
        raise NotFoundError(resource="folder", identifier=str(folder_id))

    if folder.is_system:
        raise ValidationError(
            message="Cannot delete system folders",
            code=ErrorCode.VALIDATION_FAILED,
            param="folder_id",
        )

    # Move notes to another folder or unassign
    if move_notes_to:
        # Verify target folder exists
        result = await db.execute(
            select(Folder)
            .where(Folder.id == move_notes_to)
            .where(Folder.user_id == current_user.id)
        )
        if not result.scalar_one_or_none():
            raise NotFoundError(resource="folder", identifier=str(move_notes_to))

    # Update notes - move to target folder or unassign
    await db.execute(
        update(Note)
        .where(Note.folder_id == folder_id)
        .values(folder_id=move_notes_to)
    )

    await db.delete(folder)
    await db.commit()


@router.post("/setup-defaults")
async def setup_default_folders(
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """
    Create default folders for a new user.
    Called during onboarding. Always ensures "All Notes" exists.
    """
    # Check if "All Notes" folder exists
    result = await db.execute(
        select(Folder)
        .where(Folder.user_id == current_user.id)
        .where(Folder.name == "All Notes")
    )
    all_notes_exists = result.scalar_one_or_none() is not None

    # Check total folder count
    count_result = await db.execute(
        select(func.count(Folder.id))
        .where(Folder.user_id == current_user.id)
    )
    count = count_result.scalar() or 0

    created = 0

    # Always ensure "All Notes" exists
    if not all_notes_exists:
        all_notes = Folder(
            user_id=current_user.id,
            name="All Notes",
            icon="folder",
            is_system=True,
            sort_order=0,
        )
        db.add(all_notes)
        created += 1

    # Only create other defaults if no folders exist
    if count == 0 or (count == 1 and not all_notes_exists):
        default_folders = [
            {"name": "Work", "icon": "briefcase", "sort_order": 1},
            {"name": "Personal", "icon": "person", "sort_order": 2},
            {"name": "Ideas", "icon": "lightbulb", "sort_order": 3},
        ]

        for folder_data in default_folders:
            folder = Folder(
                user_id=current_user.id,
                name=folder_data["name"],
                icon=folder_data["icon"],
                is_system=False,
                sort_order=folder_data["sort_order"],
            )
            db.add(folder)
            created += 1

    if created > 0:
        await db.commit()

    return {"message": f"Folders setup complete", "created": created}
