"""Action extraction from transcripts."""
import logging
from typing import Optional

from app.core.errors import ExternalServiceError
from app.schemas.voice_schemas import ActionExtractionResult
from app.services.llm.prompts import (
    INJECTION_DEFENSE_INSTRUCTION,
    FIELD_DEFINITIONS_SUMMARY_ONLY,
    FORMAT_SIGNALS_BLOCK,
    FORMAT_FEWSHOT_EXAMPLES,
    VOICE_AND_TONE_BLOCK,
    INTENT_CLASSIFICATION_BLOCK,
    OUTPUT_RULES,
)
from app.services.llm.validation import (
    check_injection_patterns,
    validate_input_length,
    resolve_folders,
    validate_llm_output,
    parse_json_response,
    wrap_user_content,
    extract_format_composition,
)
from app.services.llm.schema_builder import (
    build_json_schema,
    build_user_context_string,
    build_messages,
)

logger = logging.getLogger(__name__)


async def extract_actions(
    client,
    model: str,
    transcript: str,
    user_context: Optional[dict] = None,
) -> ActionExtractionResult:
    """Analyze transcript and extract actionable items using Groq LLM."""
    check_injection_patterns(transcript)
    transcript = validate_input_length(transcript)
    folders_list = resolve_folders(user_context)

    json_schema = build_json_schema(
        folders_list,
        include_narrative=False,
        include_format_signals=True,
        include_entities=True,
    )

    system_content = "\n\n".join([
        INJECTION_DEFENSE_INSTRUCTION,
        "You analyze voice memo transcripts and extract actionable items. "
        "This is the user's OWN note --- write summaries as a refined version of their own thoughts.",
        FIELD_DEFINITIONS_SUMMARY_ONLY,
        FORMAT_SIGNALS_BLOCK,
        FORMAT_FEWSHOT_EXAMPLES,
        VOICE_AND_TONE_BLOCK,
        INTENT_CLASSIFICATION_BLOCK,
        f"Return ONLY valid JSON with this exact structure:\n{json_schema}",
        OUTPUT_RULES,
    ])

    context_str = build_user_context_string(user_context, folders_list)
    user_content = wrap_user_content(transcript) + "\n" + context_str

    try:
        response = client.chat.completions.create(
            model=model,
            max_tokens=2000,
            response_format={"type": "json_object"},
            messages=build_messages(system_content, user_content),
        )
    except Exception as e:
        raise ExternalServiceError(service="llm", message=f"Groq LLM request failed: {e}") from e

    data = parse_json_response(response.choices[0].message.content)

    if data is None:
        return ActionExtractionResult(
            title="Voice Note",
            folder="Personal",
            tags=[],
            summary=transcript[:200] + "..." if len(transcript) > 200 else transcript,
            calendar=[],
            email=[],
            reminders=[],
            next_steps=[],
        )

    data = validate_llm_output(data, folders_list)

    return ActionExtractionResult(
        title=data.get("title", "Voice Note"),
        folder=data.get("folder", "Personal"),
        tags=data.get("tags", [])[:5],
        summary=data.get("summary"),
        type_detection=data.get("type_detection"),
        format_composition=extract_format_composition(data),
        related_entities=data.get("related_entities"),
        open_loops=data.get("open_loops", []),
        calendar=data.get("calendar", []),
        email=data.get("email", []),
        reminders=data.get("reminders", []),
        next_steps=[],
    )


async def extract_actions_for_append(
    client,
    model: str,
    new_transcript: str,
    existing_transcript: str,
    existing_title: str,
    user_context: Optional[dict] = None,
) -> ActionExtractionResult:
    """Extract actions from new audio appended to an existing note.

    Designed to avoid duplicating actions already captured in the original note.
    """
    check_injection_patterns(new_transcript)
    check_injection_patterns(existing_transcript, source="existing_transcript")
    new_transcript = validate_input_length(new_transcript, "new_transcript")
    existing_transcript = validate_input_length(existing_transcript, "existing_transcript")
    folders_list = resolve_folders(user_context)

    json_schema = build_json_schema(
        folders_list,
        include_narrative=False,
        include_format_signals=True,
        include_entities=True,
    )

    system_content = "\n\n".join([
        INJECTION_DEFENSE_INSTRUCTION,
        "You are analyzing ADDITIONAL audio appended to an existing note. "
        "Extract ONLY NEW actionable items not already covered.",
        INTENT_CLASSIFICATION_BLOCK,
        "IMPORTANT: Only extract actions from the NEW transcript that are genuinely new. "
        "Do NOT duplicate existing actions. If the new audio is just a continuation "
        "of the same thought with no new actions, return empty arrays.",
        f"Return ONLY valid JSON with this exact structure:\n{json_schema}",
        OUTPUT_RULES,
    ])

    context_str = build_user_context_string(user_context, folders_list)
    user_content = (
        f"EXISTING NOTE TITLE: {existing_title}\n\n"
        + wrap_user_content(existing_transcript, label="existing_transcript")
        + "\n\n---\n\n"
        + wrap_user_content(new_transcript, label="new_transcript")
        + "\n" + context_str
    )

    try:
        response = client.chat.completions.create(
            model=model,
            max_tokens=2000,
            response_format={"type": "json_object"},
            messages=build_messages(system_content, user_content),
        )
    except Exception as e:
        raise ExternalServiceError(service="llm", message=f"Groq LLM request failed: {e}") from e

    data = parse_json_response(response.choices[0].message.content)

    if data is None:
        return ActionExtractionResult(
            title=existing_title,
            folder="Personal",
            tags=[],
            summary=f"Added: {new_transcript[:100]}..." if len(new_transcript) > 100 else f"Added: {new_transcript}",
            calendar=[],
            email=[],
            reminders=[],
            next_steps=[],
        )

    data = validate_llm_output(data, folders_list)

    return ActionExtractionResult(
        title=data.get("title", existing_title),
        folder=data.get("folder", "Personal"),
        tags=data.get("tags", [])[:5],
        summary=data.get("summary"),
        type_detection=data.get("type_detection"),
        format_composition=extract_format_composition(data),
        related_entities=data.get("related_entities"),
        open_loops=data.get("open_loops", []),
        calendar=data.get("calendar", []),
        email=data.get("email", []),
        reminders=data.get("reminders", []),
        next_steps=[],
    )
