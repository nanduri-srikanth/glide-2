"""Voice processing router - the core of Glide."""
import logging
from datetime import datetime
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, UploadFile, File, Form
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.note import Note, Folder
from app.models.action import Action, ActionType, ActionStatus, ActionPriority
from app.routers.auth import get_current_user
from app.services.transcription import TranscriptionService
from app.services.llm import LLMService
from app.services.storage import StorageService
from app.schemas.voice_schemas import (
    VoiceProcessingResponse,
    ActionExtractionResult,
    SynthesisResponse,
    SmartSynthesisResponse,
    InputHistoryEntry,
    UpdateDecision,
)
from app.core.errors import (
    ErrorCode,
    ValidationError,
    NotFoundError,
    ExternalServiceError,
    APIError,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/process", response_model=VoiceProcessingResponse)
async def process_voice_memo(
    current_user: Annotated[User, Depends(get_current_user)],
    audio_file: UploadFile = File(...),
    folder_id: Optional[UUID] = Form(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Process a voice memo:
    1. Upload audio to storage
    2. Transcribe using Whisper
    3. Extract actions using Claude
    4. Create note and actions in database
    5. Return structured response
    """
    # Validate file type
    allowed_types = ["audio/mpeg", "audio/mp3", "audio/m4a", "audio/wav", "audio/x-m4a", "audio/mp4"]
    if audio_file.content_type not in allowed_types:
        raise ValidationError(
            message="Invalid audio format. Allowed: mp3, m4a, wav",
            code=ErrorCode.VALIDATION_INVALID_AUDIO_FORMAT,
            param="audio_file",
        )

    try:
        # 1. Upload audio to storage
        storage_service = StorageService()
        audio_file.file.seek(0)
        upload_result = await storage_service.upload_audio(
            file=audio_file.file,
            user_id=str(current_user.id),
            filename=audio_file.filename or "recording.mp3",
            content_type=audio_file.content_type,
        )

        # 2. Transcribe audio
        transcription_service = TranscriptionService()
        audio_file.file.seek(0)
        transcription = await transcription_service.transcribe(
            audio_file=audio_file.file,
            filename=audio_file.filename or "recording.mp3",
        )

        # 3. Fetch user's folders for smart categorization
        folders_result = await db.execute(
            select(Folder.name)
            .where(Folder.user_id == current_user.id)
            .where(Folder.is_system == False)
            .order_by(Folder.sort_order)
        )
        user_folders = [row[0] for row in folders_result.fetchall()]
        if not user_folders:
            user_folders = ['Work', 'Personal', 'Ideas']

        # 4. Extract actions using LLM with user's folders
        llm_service = LLMService()
        user_context = {
            "timezone": current_user.timezone,
            "current_date": datetime.utcnow().strftime("%Y-%m-%d"),
            "folders": user_folders,
        }
        extraction = await llm_service.extract_actions(
            transcript=transcription.text,
            user_context=user_context,
        )

        # 4. Find or create folder
        folder_name = extraction.folder
        if folder_id:
            # Use specified folder
            result = await db.execute(
                select(Folder)
                .where(Folder.id == folder_id)
                .where(Folder.user_id == current_user.id)
            )
            folder = result.scalar_one_or_none()
            if folder:
                folder_name = folder.name
        else:
            # Find or create folder based on AI suggestion
            result = await db.execute(
                select(Folder)
                .where(Folder.user_id == current_user.id)
                .where(Folder.name == extraction.folder)
            )
            folder = result.scalar_one_or_none()

            if not folder:
                # Create the folder
                folder = Folder(
                    user_id=current_user.id,
                    name=extraction.folder,
                    icon="folder.fill",
                )
                db.add(folder)
                await db.flush()

            folder_id = folder.id

        # 5. Create note
        note = Note(
            user_id=current_user.id,
            folder_id=folder_id,
            title=extraction.title,
            transcript=transcription.text,
            summary=extraction.summary,
            duration=transcription.duration,
            audio_url=upload_result.get("key"),
            tags=extraction.tags,
            ai_processed=True,
            ai_metadata={
                "language": transcription.language,
                "extraction_model": "claude-sonnet-4-20250514",
            },
        )
        db.add(note)
        await db.flush()

        # 6. Create actions
        actions_created = []

        # Calendar events
        for cal_action in extraction.calendar:
            action = Action(
                note_id=note.id,
                action_type=ActionType.CALENDAR,
                status=ActionStatus.PENDING,
                title=cal_action.title,
                scheduled_date=_parse_datetime(cal_action.date, cal_action.time),
                location=cal_action.location,
                attendees=cal_action.attendees,
                details={"original": cal_action.model_dump()},
            )
            db.add(action)
            actions_created.append(action)

        # Email drafts
        for email_action in extraction.email:
            action = Action(
                note_id=note.id,
                action_type=ActionType.EMAIL,
                status=ActionStatus.PENDING,
                title=f"Email to {email_action.to}",
                email_to=email_action.to,
                email_subject=email_action.subject,
                email_body=email_action.body,
                details={"original": email_action.model_dump()},
            )
            db.add(action)
            actions_created.append(action)

        # Reminders
        for reminder in extraction.reminders:
            priority = ActionPriority.MEDIUM
            if reminder.priority == "high":
                priority = ActionPriority.HIGH
            elif reminder.priority == "low":
                priority = ActionPriority.LOW

            action = Action(
                note_id=note.id,
                action_type=ActionType.REMINDER,
                status=ActionStatus.PENDING,
                priority=priority,
                title=reminder.title,
                scheduled_date=_parse_datetime(reminder.due_date, reminder.due_time),
                details={"original": reminder.model_dump()},
            )
            db.add(action)
            actions_created.append(action)

        # Next steps
        for step in extraction.next_steps:
            action = Action(
                note_id=note.id,
                action_type=ActionType.NEXT_STEP,
                status=ActionStatus.PENDING,
                title=step,
            )
            db.add(action)
            actions_created.append(action)

        await db.commit()
        await db.refresh(note)

        # 7. Return response
        return VoiceProcessingResponse(
            note_id=note.id,
            title=note.title,
            transcript=note.transcript,
            summary=note.summary,
            duration=note.duration or 0,
            folder_id=folder_id,
            folder_name=folder_name,
            tags=note.tags or [],
            actions=extraction,
            created_at=note.created_at,
        )

    except Exception as e:
        await db.rollback()
        logger.exception(f"Failed to process voice memo: {e}")
        raise ExternalServiceError(
            service="transcription",
            message="Failed to process voice memo. Please try again.",
        )


@router.post("/synthesize", response_model=SynthesisResponse)
async def synthesize_note(
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
    text_input: Optional[str] = Form(None),
    audio_file: Optional[UploadFile] = File(None),
    folder_id: Optional[UUID] = Form(None),
):
    """
    Synthesize a note from text input and/or audio recording.

    This endpoint accepts both typed text and audio recording (either or both),
    synthesizes them into a cohesive narrative, and extracts actionable items.

    At least one of text_input or audio_file must be provided.
    """
    # Validate that at least one input is provided
    if not text_input and not audio_file:
        raise ValidationError(
            message="At least one of text_input or audio_file must be provided",
            code=ErrorCode.VALIDATION_MISSING_FIELD,
        )

    # Validate audio file type if provided
    allowed_types = ["audio/mpeg", "audio/mp3", "audio/m4a", "audio/wav", "audio/x-m4a", "audio/mp4"]
    if audio_file and audio_file.content_type not in allowed_types:
        raise ValidationError(
            message="Invalid audio format. Allowed: mp3, m4a, wav",
            code=ErrorCode.VALIDATION_INVALID_AUDIO_FORMAT,
            param="audio_file",
        )

    try:
        now = datetime.utcnow()
        input_history = []
        audio_transcript = ""
        total_duration = 0
        audio_key = None

        # Process audio if provided - run upload and transcription in parallel
        if audio_file:
            import asyncio
            from io import BytesIO

            # Read file content once for parallel operations
            audio_file.file.seek(0)
            file_content = audio_file.file.read()
            filename = audio_file.filename or "recording.mp3"
            content_type = audio_file.content_type

            storage_service = StorageService()
            transcription_service = TranscriptionService()

            # Create async tasks for parallel execution
            async def upload_task():
                return await storage_service.upload_audio(
                    file=BytesIO(file_content),
                    user_id=str(current_user.id),
                    filename=filename,
                    content_type=content_type,
                )

            async def transcribe_task():
                return await transcription_service.transcribe(
                    audio_file=BytesIO(file_content),
                    filename=filename,
                )

            # Run both in parallel
            upload_result, transcription = await asyncio.gather(
                upload_task(),
                transcribe_task(),
            )

            audio_key = upload_result.get("key")
            audio_transcript = transcription.text
            total_duration = transcription.duration

            # Add audio input to history
            input_history.append({
                "type": "audio",
                "content": audio_transcript,
                "timestamp": now.isoformat(),
                "duration": transcription.duration,
                "audio_key": audio_key,
            })

        # Process text if provided
        if text_input and text_input.strip():
            input_history.append({
                "type": "text",
                "content": text_input.strip(),
                "timestamp": now.isoformat(),
                "duration": None,
                "audio_key": None,
            })

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

        # Synthesize content using LLM
        llm_service = LLMService()
        user_context = {
            "timezone": current_user.timezone,
            "current_date": now.strftime("%Y-%m-%d"),
            "folders": user_folders,
        }
        synthesis = await llm_service.synthesize_content(
            text_input=text_input or "",
            audio_transcript=audio_transcript,
            user_context=user_context,
        )

        # Find or create folder
        folder_name = synthesis.get("folder", "Personal")
        if folder_id:
            result = await db.execute(
                select(Folder)
                .where(Folder.id == folder_id)
                .where(Folder.user_id == current_user.id)
            )
            folder = result.scalar_one_or_none()
            if folder:
                folder_name = folder.name
        else:
            result = await db.execute(
                select(Folder)
                .where(Folder.user_id == current_user.id)
                .where(Folder.name == synthesis.get("folder", "Personal"))
            )
            folder = result.scalar_one_or_none()

            if not folder:
                folder = Folder(
                    user_id=current_user.id,
                    name=synthesis.get("folder", "Personal"),
                    icon="folder.fill",
                )
                db.add(folder)
                await db.flush()

            folder_id = folder.id

        # Create note with synthesized content
        note = Note(
            user_id=current_user.id,
            folder_id=folder_id,
            title=synthesis.get("title", "New Note"),
            transcript=synthesis.get("narrative", ""),  # Store synthesized narrative as transcript
            summary=synthesis.get("summary"),
            duration=total_duration,
            audio_url=audio_key,
            tags=synthesis.get("tags", []),
            ai_processed=True,
            ai_metadata={
                "synthesis_model": "llama-3.3-70b-versatile",
                "input_history": input_history,
                "raw_inputs": {
                    "text": text_input or "",
                    "audio_transcript": audio_transcript,
                },
                "synthesized_at": now.isoformat(),
            },
        )
        db.add(note)
        await db.flush()

        # Create actions
        actions_created = []

        # Calendar events
        for cal_action in synthesis.get("calendar", []):
            action = Action(
                note_id=note.id,
                action_type=ActionType.CALENDAR,
                status=ActionStatus.PENDING,
                title=cal_action.get("title", ""),
                scheduled_date=_parse_datetime(cal_action.get("date", ""), cal_action.get("time")),
                location=cal_action.get("location"),
                attendees=cal_action.get("attendees", []),
                details={"original": cal_action},
            )
            db.add(action)
            actions_created.append(action)

        # Email drafts
        for email_action in synthesis.get("email", []):
            action = Action(
                note_id=note.id,
                action_type=ActionType.EMAIL,
                status=ActionStatus.PENDING,
                title=f"Email to {email_action.get('to', 'recipient')}",
                email_to=email_action.get("to"),
                email_subject=email_action.get("subject"),
                email_body=email_action.get("body"),
                details={"original": email_action},
            )
            db.add(action)
            actions_created.append(action)

        # Reminders
        for reminder in synthesis.get("reminders", []):
            priority = ActionPriority.MEDIUM
            if reminder.get("priority") == "high":
                priority = ActionPriority.HIGH
            elif reminder.get("priority") == "low":
                priority = ActionPriority.LOW

            action = Action(
                note_id=note.id,
                action_type=ActionType.REMINDER,
                status=ActionStatus.PENDING,
                priority=priority,
                title=reminder.get("title", ""),
                scheduled_date=_parse_datetime(reminder.get("due_date", ""), reminder.get("due_time")),
                details={"original": reminder},
            )
            db.add(action)
            actions_created.append(action)

        # Next steps
        for step in synthesis.get("next_steps", []):
            action = Action(
                note_id=note.id,
                action_type=ActionType.NEXT_STEP,
                status=ActionStatus.PENDING,
                title=step,
            )
            db.add(action)
            actions_created.append(action)

        await db.commit()
        await db.refresh(note)

        # Build response
        extraction = ActionExtractionResult(
            title=synthesis.get("title", "New Note"),
            folder=folder_name,
            tags=synthesis.get("tags", []),
            summary=synthesis.get("summary"),
            calendar=synthesis.get("calendar", []),
            email=synthesis.get("email", []),
            reminders=synthesis.get("reminders", []),
            next_steps=[],
        )

        # Convert input_history to InputHistoryEntry objects
        input_entries = [
            InputHistoryEntry(
                type=entry["type"],
                content=entry["content"],
                timestamp=datetime.fromisoformat(entry["timestamp"]),
                duration=entry.get("duration"),
                audio_key=entry.get("audio_key"),
            )
            for entry in input_history
        ]

        return SynthesisResponse(
            note_id=note.id,
            title=note.title,
            narrative=note.transcript,
            raw_inputs=input_entries,
            summary=note.summary,
            duration=note.duration or 0,
            folder_id=folder_id,
            folder_name=folder_name,
            tags=note.tags or [],
            actions=extraction,
            created_at=note.created_at,
            updated_at=note.updated_at or note.created_at,
        )

    except APIError:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception(f"Failed to synthesize note: {e}")
        raise ExternalServiceError(
            service="llm",
            message="Failed to synthesize note. Please try again.",
        )


@router.post("/synthesize/{note_id}", response_model=SmartSynthesisResponse)
async def add_to_synthesis(
    note_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
    text_input: Optional[str] = Form(None),
    audio_file: Optional[UploadFile] = File(None),
    resynthesize: Optional[bool] = Form(None),
    auto_decide: bool = Form(True),
):
    """
    Add new content to an existing note with smart synthesis.

    This endpoint allows adding more text or audio to an existing note.
    - If auto_decide=True (default): AI decides whether to append or resynthesize
    - If resynthesize=True: Force full re-synthesis from all inputs
    - If resynthesize=False: Just append without re-synthesizing

    Returns decision info explaining what action was taken.
    """
    # Validate that at least one input is provided
    if not text_input and not audio_file:
        raise ValidationError(
            message="At least one of text_input or audio_file must be provided",
            code=ErrorCode.VALIDATION_MISSING_FIELD,
        )

    # Validate audio file type if provided
    allowed_types = ["audio/mpeg", "audio/mp3", "audio/m4a", "audio/wav", "audio/x-m4a", "audio/mp4"]
    if audio_file and audio_file.content_type not in allowed_types:
        raise ValidationError(
            message="Invalid audio format. Allowed: mp3, m4a, wav",
            code=ErrorCode.VALIDATION_INVALID_AUDIO_FORMAT,
            param="audio_file",
        )

    # Verify note exists and belongs to user
    result = await db.execute(
        select(Note).where(Note.id == note_id).where(Note.user_id == current_user.id)
    )
    note = result.scalar_one_or_none()

    if not note:
        raise NotFoundError(resource="note", identifier=str(note_id))

    try:
        now = datetime.utcnow()
        ai_metadata = note.ai_metadata or {}
        input_history = ai_metadata.get("input_history", [])
        audio_transcript = ""
        new_duration = 0

        # Process audio if provided - run upload and transcription in parallel
        if audio_file:
            import asyncio
            from io import BytesIO

            # Read file content once for parallel operations
            audio_file.file.seek(0)
            file_content = audio_file.file.read()
            filename = audio_file.filename or "recording_add.mp3"
            content_type = audio_file.content_type

            storage_service = StorageService()
            transcription_service = TranscriptionService()

            # Create async tasks for parallel execution
            async def upload_task():
                return await storage_service.upload_audio(
                    file=BytesIO(file_content),
                    user_id=str(current_user.id),
                    filename=filename,
                    content_type=content_type,
                )

            async def transcribe_task():
                return await transcription_service.transcribe(
                    audio_file=BytesIO(file_content),
                    filename=filename,
                )

            # Run both in parallel
            upload_result, transcription = await asyncio.gather(
                upload_task(),
                transcribe_task(),
            )

            audio_key = upload_result.get("key")
            audio_transcript = transcription.text
            new_duration = transcription.duration

            input_history.append({
                "type": "audio",
                "content": audio_transcript,
                "timestamp": now.isoformat(),
                "duration": new_duration,
                "audio_key": audio_key,
            })

        # Process text if provided
        if text_input and text_input.strip():
            input_history.append({
                "type": "text",
                "content": text_input.strip(),
                "timestamp": now.isoformat(),
                "duration": None,
                "audio_key": None,
            })

        # Update ai_metadata with new input history
        ai_metadata["input_history"] = input_history
        ai_metadata["last_input_at"] = now.isoformat()

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

        llm_service = LLMService()
        user_context = {
            "timezone": current_user.timezone,
            "current_date": now.strftime("%Y-%m-%d"),
            "folders": user_folders,
        }

        # Track the decision made
        decision_info = None
        new_content = (text_input or "") + (" " if text_input and audio_transcript else "") + (audio_transcript or "")
        new_content = new_content.strip()

        # Determine update strategy
        if resynthesize is True:
            # Force COMPREHENSIVE re-synthesis - preserves all information
            synthesis = await llm_service.resynthesize_content(
                input_history=input_history,
                user_context=user_context,
                comprehensive=True,  # Use comprehensive mode to avoid info loss
            )
            note.transcript = synthesis.get("narrative", note.transcript)
            note.title = synthesis.get("title", note.title)
            note.summary = synthesis.get("summary", note.summary)
            note.tags = list(set(note.tags or []) | set(synthesis.get("tags", [])))[:10]
            ai_metadata["synthesized_at"] = now.isoformat()
            new_actions = synthesis
            decision_info = {
                "update_type": "resynthesize",
                "confidence": 1.0,
                "reason": "User requested comprehensive re-synthesis"
            }
        elif resynthesize is False:
            # Synthesize new content through full LLM pipeline (proper formatting)
            # Pass raw text/audio separately so synthesis can distinguish typed vs spoken
            synthesis = await llm_service.synthesize_content(
                text_input=text_input.strip() if text_input else "",
                audio_transcript=audio_transcript,
                user_context=user_context,
            )
            synthesized_narrative = synthesis.get("narrative", new_content)
            # Clean append — just paragraph spacing, no ugly separator
            if note.transcript:
                note.transcript = note.transcript + "\n\n" + synthesized_narrative
            else:
                note.transcript = synthesized_narrative
            # Preserve existing title — don't replace with synthesis title
            # Merge tags
            note.tags = list(set(note.tags or []) | set(synthesis.get("tags", [])))[:10]
            # Update summary
            new_summary = synthesis.get("summary")
            if note.summary and new_summary:
                note.summary = note.summary + "\n\n" + new_summary
            elif new_summary:
                note.summary = new_summary
            new_actions = {
                "calendar": synthesis.get("calendar", []),
                "email": synthesis.get("email", []),
                "reminders": synthesis.get("reminders", []),
                "next_steps": [],
            }
            decision_info = {
                "update_type": "append",
                "confidence": 1.0,
                "reason": "New content synthesized and appended"
            }
        elif auto_decide:
            # Use smart synthesis to decide
            smart_result = await llm_service.smart_synthesize(
                new_content=new_content,
                existing_narrative=note.transcript or "",
                existing_title=note.title,
                existing_summary=note.summary,
                input_history=input_history,
                user_context=user_context,
            )
            decision_info = smart_result.get("decision", {})
            synthesis = smart_result.get("result", {})

            note.transcript = synthesis.get("narrative", note.transcript)
            note.title = synthesis.get("title", note.title)
            note.summary = synthesis.get("summary", note.summary)
            note.tags = list(set(note.tags or []) | set(synthesis.get("tags", [])))[:10]

            if decision_info.get("update_type") == "resynthesize":
                ai_metadata["synthesized_at"] = now.isoformat()

            new_actions = synthesis
        else:
            # Default: synthesize new content through full LLM pipeline and append
            synthesis = await llm_service.synthesize_content(
                text_input=text_input.strip() if text_input else "",
                audio_transcript=audio_transcript,
                user_context=user_context,
            )
            synthesized_narrative = synthesis.get("narrative", new_content)
            if note.transcript:
                note.transcript = note.transcript + "\n\n" + synthesized_narrative
            else:
                note.transcript = synthesized_narrative
            note.tags = list(set(note.tags or []) | set(synthesis.get("tags", [])))[:10]
            new_summary = synthesis.get("summary")
            if note.summary and new_summary:
                note.summary = note.summary + "\n\n" + new_summary
            elif new_summary:
                note.summary = new_summary
            new_actions = {
                "calendar": synthesis.get("calendar", []),
                "email": synthesis.get("email", []),
                "reminders": synthesis.get("reminders", []),
                "next_steps": [],
            }
            decision_info = {
                "update_type": "append",
                "confidence": 1.0,
                "reason": "New content synthesized and appended"
            }

        # Update note
        note.duration = (note.duration or 0) + new_duration
        note.ai_metadata = ai_metadata

        # Create new actions if any
        for cal_action in new_actions.get("calendar", []):
            action = Action(
                note_id=note.id,
                action_type=ActionType.CALENDAR,
                status=ActionStatus.PENDING,
                title=cal_action.get("title", ""),
                scheduled_date=_parse_datetime(cal_action.get("date", ""), cal_action.get("time")),
                location=cal_action.get("location"),
                attendees=cal_action.get("attendees", []),
                details={"original": cal_action, "added_at": now.isoformat()},
            )
            db.add(action)

        for email_action in new_actions.get("email", []):
            action = Action(
                note_id=note.id,
                action_type=ActionType.EMAIL,
                status=ActionStatus.PENDING,
                title=f"Email to {email_action.get('to', 'recipient')}",
                email_to=email_action.get("to"),
                email_subject=email_action.get("subject"),
                email_body=email_action.get("body"),
                details={"original": email_action, "added_at": now.isoformat()},
            )
            db.add(action)

        for reminder in new_actions.get("reminders", []):
            priority = ActionPriority.MEDIUM
            if reminder.get("priority") == "high":
                priority = ActionPriority.HIGH
            elif reminder.get("priority") == "low":
                priority = ActionPriority.LOW

            action = Action(
                note_id=note.id,
                action_type=ActionType.REMINDER,
                status=ActionStatus.PENDING,
                priority=priority,
                title=reminder.get("title", ""),
                scheduled_date=_parse_datetime(reminder.get("due_date", ""), reminder.get("due_time")),
                details={"original": reminder, "added_at": now.isoformat()},
            )
            db.add(action)

        for step in new_actions.get("next_steps", []):
            action = Action(
                note_id=note.id,
                action_type=ActionType.NEXT_STEP,
                status=ActionStatus.PENDING,
                title=step,
                details={"added_at": now.isoformat()},
            )
            db.add(action)

        await db.commit()
        await db.refresh(note)

        # Get folder name
        folder_name = "Personal"
        if note.folder_id:
            folder_result = await db.execute(
                select(Folder).where(Folder.id == note.folder_id)
            )
            folder = folder_result.scalar_one_or_none()
            if folder:
                folder_name = folder.name

        # Build response
        extraction = ActionExtractionResult(
            title=note.title,
            folder=folder_name,
            tags=note.tags or [],
            summary=note.summary,
            calendar=new_actions.get("calendar", []),
            email=new_actions.get("email", []),
            reminders=new_actions.get("reminders", []),
            next_steps=[],
        )

        input_entries = [
            InputHistoryEntry(
                type=entry["type"],
                content=entry["content"],
                timestamp=datetime.fromisoformat(entry["timestamp"]),
                duration=entry.get("duration"),
                audio_key=entry.get("audio_key"),
            )
            for entry in input_history
        ]

        # Build update decision if we have one
        update_decision = None
        if decision_info:
            update_decision = UpdateDecision(
                update_type=decision_info.get("update_type", "append"),
                confidence=decision_info.get("confidence", 0.5),
                reason=decision_info.get("reason", "")
            )

        return SmartSynthesisResponse(
            note_id=note.id,
            title=note.title,
            narrative=note.transcript,
            raw_inputs=input_entries,
            summary=note.summary,
            duration=note.duration or 0,
            folder_id=note.folder_id,
            folder_name=folder_name,
            tags=note.tags or [],
            actions=extraction,
            created_at=note.created_at,
            updated_at=note.updated_at or note.created_at,
            decision=update_decision,
        )

    except Exception as e:
        await db.rollback()
        logger.exception(f"Failed to add to note {note_id}: {e}")
        raise ExternalServiceError(
            service="llm",
            message="Failed to add content to note. Please try again.",
        )


@router.post("/resynthesize/{note_id}", response_model=SynthesisResponse)
async def resynthesize_note(
    note_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """
    Re-synthesize an existing note from its input history.

    This endpoint takes all the raw inputs stored in the note's ai_metadata
    and re-runs the synthesis to create a fresh narrative.
    Useful when the user has edited the note and wants AI to re-process.
    """
    # Verify note exists and belongs to user
    result = await db.execute(
        select(Note).where(Note.id == note_id).where(Note.user_id == current_user.id)
    )
    note = result.scalar_one_or_none()

    if not note:
        raise NotFoundError(resource="note", identifier=str(note_id))

    try:
        now = datetime.utcnow()
        ai_metadata = note.ai_metadata or {}
        input_history = ai_metadata.get("input_history", [])

        if not input_history:
            # If no input history, use current transcript as text input
            input_history = [{
                "type": "text",
                "content": note.transcript or "",
                "timestamp": now.isoformat(),
                "duration": None,
                "audio_key": None,
            }]

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

        llm_service = LLMService()
        user_context = {
            "timezone": current_user.timezone,
            "current_date": now.strftime("%Y-%m-%d"),
            "folders": user_folders,
        }

        # Use COMPREHENSIVE synthesis to preserve all information
        synthesis = await llm_service.resynthesize_content(
            input_history=input_history,
            user_context=user_context,
            comprehensive=True,  # Avoid information loss
        )

        # Update note with new synthesis
        note.transcript = synthesis.get("narrative", note.transcript)
        note.title = synthesis.get("title", note.title)
        note.summary = synthesis.get("summary", note.summary)
        note.tags = synthesis.get("tags", [])[:10]

        # Update ai_metadata
        ai_metadata["synthesized_at"] = now.isoformat()
        ai_metadata["input_history"] = input_history
        note.ai_metadata = ai_metadata

        await db.commit()
        await db.refresh(note)

        # Get folder name
        folder_name = "Personal"
        if note.folder_id:
            folder_result = await db.execute(
                select(Folder).where(Folder.id == note.folder_id)
            )
            folder = folder_result.scalar_one_or_none()
            if folder:
                folder_name = folder.name

        extraction = ActionExtractionResult(
            title=note.title,
            folder=folder_name,
            tags=note.tags or [],
            summary=note.summary,
            calendar=synthesis.get("calendar", []),
            email=synthesis.get("email", []),
            reminders=synthesis.get("reminders", []),
            next_steps=[],
        )

        input_entries = [
            InputHistoryEntry(
                type=entry["type"],
                content=entry["content"],
                timestamp=datetime.fromisoformat(entry["timestamp"]),
                duration=entry.get("duration"),
                audio_key=entry.get("audio_key"),
            )
            for entry in input_history
        ]

        return SynthesisResponse(
            note_id=note.id,
            title=note.title,
            narrative=note.transcript,
            raw_inputs=input_entries,
            summary=note.summary,
            duration=note.duration or 0,
            folder_id=note.folder_id,
            folder_name=folder_name,
            tags=note.tags or [],
            actions=extraction,
            created_at=note.created_at,
            updated_at=note.updated_at or note.created_at,
        )

    except Exception as e:
        await db.rollback()
        logger.exception(f"Failed to resynthesize note {note_id}: {e}")
        raise ExternalServiceError(
            service="llm",
            message="Failed to resynthesize note. Please try again.",
        )


@router.delete("/notes/{note_id}/inputs/{input_index}", response_model=SynthesisResponse)
async def delete_input(
    note_id: UUID,
    input_index: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """
    Delete a specific input from the note's input history.

    This will remove the input at the specified index and trigger a re-synthesis
    of the note from the remaining inputs.

    If this is the last input, returns an error (use delete note instead).
    """
    # Verify note exists and belongs to user
    result = await db.execute(
        select(Note).where(Note.id == note_id).where(Note.user_id == current_user.id)
    )
    note = result.scalar_one_or_none()

    if not note:
        raise NotFoundError(resource="note", identifier=str(note_id))

    try:
        ai_metadata = note.ai_metadata or {}
        input_history = ai_metadata.get("input_history", [])

        # Validate index
        if input_index < 0 or input_index >= len(input_history):
            raise ValidationError(
                message=f"Invalid input index. Note has {len(input_history)} inputs (0-{len(input_history) - 1})",
                code=ErrorCode.VALIDATION_INVALID_VALUE,
                param="input_index",
            )

        # Check if this is the last input
        if len(input_history) <= 1:
            raise ValidationError(
                message="Cannot delete the last input. Use delete note instead.",
                code=ErrorCode.VALIDATION_FAILED,
                param="input_index",
            )

        # Remove the input
        deleted_input = input_history.pop(input_index)
        now = datetime.utcnow()

        # Update duration if it was an audio input
        if deleted_input.get("duration"):
            note.duration = max(0, (note.duration or 0) - deleted_input.get("duration", 0))

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

        # Re-synthesize from remaining inputs (comprehensive to preserve info)
        llm_service = LLMService()
        user_context = {
            "timezone": current_user.timezone,
            "current_date": now.strftime("%Y-%m-%d"),
            "folders": user_folders,
        }

        synthesis = await llm_service.resynthesize_content(
            input_history=input_history,
            user_context=user_context,
            comprehensive=True,  # Preserve remaining information
        )

        # Update note with new synthesis
        note.transcript = synthesis.get("narrative", note.transcript)
        note.title = synthesis.get("title", note.title)
        note.summary = synthesis.get("summary", note.summary)
        note.tags = synthesis.get("tags", [])[:10]

        # Update ai_metadata
        ai_metadata["input_history"] = input_history
        ai_metadata["synthesized_at"] = now.isoformat()
        ai_metadata["last_deleted_input"] = {
            "deleted_at": now.isoformat(),
            "input_type": deleted_input.get("type"),
        }
        note.ai_metadata = ai_metadata

        await db.commit()
        await db.refresh(note)

        # Get folder name
        folder_name = "Personal"
        if note.folder_id:
            folder_result = await db.execute(
                select(Folder).where(Folder.id == note.folder_id)
            )
            folder = folder_result.scalar_one_or_none()
            if folder:
                folder_name = folder.name

        extraction = ActionExtractionResult(
            title=note.title,
            folder=folder_name,
            tags=note.tags or [],
            summary=note.summary,
            calendar=synthesis.get("calendar", []),
            email=synthesis.get("email", []),
            reminders=synthesis.get("reminders", []),
            next_steps=[],
        )

        input_entries = [
            InputHistoryEntry(
                type=entry["type"],
                content=entry["content"],
                timestamp=datetime.fromisoformat(entry["timestamp"]),
                duration=entry.get("duration"),
                audio_key=entry.get("audio_key"),
            )
            for entry in input_history
        ]

        return SynthesisResponse(
            note_id=note.id,
            title=note.title,
            narrative=note.transcript,
            raw_inputs=input_entries,
            summary=note.summary,
            duration=note.duration or 0,
            folder_id=note.folder_id,
            folder_name=folder_name,
            tags=note.tags or [],
            actions=extraction,
            created_at=note.created_at,
            updated_at=note.updated_at or note.created_at,
        )

    except (ValidationError, NotFoundError):
        raise
    except Exception as e:
        await db.rollback()
        logger.exception(f"Failed to delete input {input_index} from note {note_id}: {e}")
        raise ExternalServiceError(
            service="llm",
            message="Failed to delete input. Please try again.",
        )


@router.post("/append/{note_id}", response_model=VoiceProcessingResponse)
async def append_to_note(
    note_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    audio_file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Append new audio recording to an existing note:
    1. Verify note exists and belongs to user
    2. Upload audio to storage
    3. Transcribe using Whisper
    4. Extract ONLY NEW actions using Claude (context-aware)
    5. Append transcript with timestamp separator
    6. Create new Action records
    7. Return updated note data
    """
    # Validate file type
    allowed_types = ["audio/mpeg", "audio/mp3", "audio/m4a", "audio/wav", "audio/x-m4a", "audio/mp4"]
    if audio_file.content_type not in allowed_types:
        raise ValidationError(
            message="Invalid audio format. Allowed: mp3, m4a, wav",
            code=ErrorCode.VALIDATION_INVALID_AUDIO_FORMAT,
            param="audio_file",
        )

    # 1. Verify note exists and belongs to user
    result = await db.execute(
        select(Note).where(Note.id == note_id).where(Note.user_id == current_user.id)
    )
    note = result.scalar_one_or_none()

    if not note:
        raise NotFoundError(resource="note", identifier=str(note_id))

    try:
        # 2. Upload audio to storage
        storage_service = StorageService()
        audio_file.file.seek(0)
        upload_result = await storage_service.upload_audio(
            file=audio_file.file,
            user_id=str(current_user.id),
            filename=audio_file.filename or "recording_append.mp3",
            content_type=audio_file.content_type,
        )

        # 3. Transcribe new audio
        transcription_service = TranscriptionService()
        audio_file.file.seek(0)
        transcription = await transcription_service.transcribe(
            audio_file=audio_file.file,
            filename=audio_file.filename or "recording_append.mp3",
        )

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

        # 4. Extract ONLY NEW actions using context-aware LLM method
        llm_service = LLMService()
        user_context = {
            "timezone": current_user.timezone,
            "current_date": datetime.utcnow().strftime("%Y-%m-%d"),
            "folders": user_folders,
        }
        extraction = await llm_service.extract_actions_for_append(
            new_transcript=transcription.text,
            existing_transcript=note.transcript or "",
            existing_title=note.title,
            user_context=user_context,
        )

        # 5. Append transcript with timestamp separator
        timestamp = datetime.utcnow().strftime("%b %d, %Y at %I:%M %p")
        separator = f"\n\n--- Added on {timestamp} ---\n\n"
        updated_transcript = (note.transcript or "") + separator + transcription.text

        # Update note
        note.transcript = updated_transcript
        note.duration = (note.duration or 0) + transcription.duration

        # Add any new tags (merge with existing, avoid duplicates)
        existing_tags = set(note.tags or [])
        new_tags = set(extraction.tags or [])
        note.tags = list(existing_tags | new_tags)[:10]  # Limit to 10 total tags

        # Update ai_metadata to track append
        ai_metadata = note.ai_metadata or {}
        appends = ai_metadata.get("appends", [])
        appends.append({
            "timestamp": timestamp,
            "duration": transcription.duration,
            "audio_key": upload_result.get("key"),
        })
        ai_metadata["appends"] = appends
        note.ai_metadata = ai_metadata

        # 6. Create new Action records
        actions_created = []

        # Calendar events
        for cal_action in extraction.calendar:
            action = Action(
                note_id=note.id,
                action_type=ActionType.CALENDAR,
                status=ActionStatus.PENDING,
                title=cal_action.title,
                scheduled_date=_parse_datetime(cal_action.date, cal_action.time),
                location=cal_action.location,
                attendees=cal_action.attendees,
                details={"original": cal_action.model_dump(), "from_append": True},
            )
            db.add(action)
            actions_created.append(action)

        # Email drafts
        for email_action in extraction.email:
            action = Action(
                note_id=note.id,
                action_type=ActionType.EMAIL,
                status=ActionStatus.PENDING,
                title=f"Email to {email_action.to}",
                email_to=email_action.to,
                email_subject=email_action.subject,
                email_body=email_action.body,
                details={"original": email_action.model_dump(), "from_append": True},
            )
            db.add(action)
            actions_created.append(action)

        # Reminders
        for reminder in extraction.reminders:
            priority = ActionPriority.MEDIUM
            if reminder.priority == "high":
                priority = ActionPriority.HIGH
            elif reminder.priority == "low":
                priority = ActionPriority.LOW

            action = Action(
                note_id=note.id,
                action_type=ActionType.REMINDER,
                status=ActionStatus.PENDING,
                priority=priority,
                title=reminder.title,
                scheduled_date=_parse_datetime(reminder.due_date, reminder.due_time),
                details={"original": reminder.model_dump(), "from_append": True},
            )
            db.add(action)
            actions_created.append(action)

        # Next steps
        for step in extraction.next_steps:
            action = Action(
                note_id=note.id,
                action_type=ActionType.NEXT_STEP,
                status=ActionStatus.PENDING,
                title=step,
                details={"from_append": True},
            )
            db.add(action)
            actions_created.append(action)

        await db.commit()
        await db.refresh(note)

        # Get folder name
        folder_name = "Personal"
        if note.folder_id:
            folder_result = await db.execute(
                select(Folder).where(Folder.id == note.folder_id)
            )
            folder = folder_result.scalar_one_or_none()
            if folder:
                folder_name = folder.name

        # 7. Return response
        return VoiceProcessingResponse(
            note_id=note.id,
            title=note.title,
            transcript=note.transcript,
            summary=extraction.summary or note.summary,
            duration=note.duration or 0,
            folder_id=note.folder_id,
            folder_name=folder_name,
            tags=note.tags or [],
            actions=extraction,
            created_at=note.created_at,
        )

    except Exception as e:
        await db.rollback()
        logger.exception(f"Failed to append to note {note_id}: {e}")
        raise ExternalServiceError(
            service="transcription",
            message="Failed to append to note. Please try again.",
        )


@router.post("/transcribe")
async def transcribe_only(
    current_user: Annotated[User, Depends(get_current_user)],
    audio_file: UploadFile = File(...),
):
    """
    Transcribe audio without creating a note (for preview).
    """
    allowed_types = ["audio/mpeg", "audio/mp3", "audio/m4a", "audio/wav", "audio/x-m4a", "audio/mp4"]
    if audio_file.content_type not in allowed_types:
        raise ValidationError(
            message="Invalid audio format. Allowed: mp3, m4a, wav",
            code=ErrorCode.VALIDATION_INVALID_AUDIO_FORMAT,
            param="audio_file",
        )

    try:
        transcription_service = TranscriptionService()
        audio_file.file.seek(0)
        result = await transcription_service.transcribe(
            audio_file=audio_file.file,
            filename=audio_file.filename or "recording.mp3",
        )

        return {
            "text": result.text,
            "language": result.language,
            "duration": result.duration,
        }

    except Exception as e:
        logger.exception(f"Transcription failed: {e}")
        raise ExternalServiceError(
            service="transcription",
            message="Transcription failed. Please try again.",
        )


@router.post("/analyze")
async def analyze_transcript(
    current_user: Annotated[User, Depends(get_current_user)],
    transcript: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Analyze a transcript and extract actions (for preview/re-analysis).
    """
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

        llm_service = LLMService()
        user_context = {
            "timezone": current_user.timezone,
            "current_date": datetime.utcnow().strftime("%Y-%m-%d"),
            "folders": user_folders,
        }

        extraction = await llm_service.extract_actions(
            transcript=transcript,
            user_context=user_context,
        )

        return extraction

    except Exception as e:
        logger.exception(f"Analysis failed: {e}")
        raise ExternalServiceError(
            service="llm",
            message="Analysis failed. Please try again.",
        )


@router.get("/upload-url")
async def get_upload_url(
    current_user: Annotated[User, Depends(get_current_user)],
    filename: str,
    content_type: str = "audio/mpeg",
):
    """
    Get a presigned URL for direct upload from mobile app.
    """
    try:
        storage_service = StorageService()
        result = await storage_service.get_upload_url(
            user_id=str(current_user.id),
            filename=filename,
            content_type=content_type,
        )

        return result

    except Exception as e:
        logger.exception(f"Failed to generate upload URL: {e}")
        raise ExternalServiceError(
            service="storage",
            message="Failed to generate upload URL. Please try again.",
        )


def _parse_datetime(date_str: str, time_str: Optional[str] = None) -> datetime:
    """Parse date and optional time strings into datetime."""
    try:
        if time_str:
            return datetime.fromisoformat(f"{date_str}T{time_str}")
        return datetime.fromisoformat(f"{date_str}T09:00:00")
    except ValueError:
        # Fallback: try to parse just the date
        try:
            return datetime.fromisoformat(date_str)
        except ValueError:
            return datetime.utcnow()
