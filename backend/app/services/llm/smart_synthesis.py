"""Smart synthesis -- AI-decided append vs. resynthesize."""
import logging
from typing import Optional

from app.core.errors import ExternalServiceError
from app.services.llm.prompts import (
    INJECTION_DEFENSE_INSTRUCTION,
    FIELD_DEFINITIONS_FULL,
    INTENT_CLASSIFICATION_BLOCK,
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


def should_force_resynthesize(
    existing_narrative: str,
    new_content: str,
    input_history: list,
) -> tuple[bool, str | None]:
    """Heuristic pre-checks to determine if we should force a full resynthesize."""
    existing_len = len(existing_narrative.split())
    new_len = len(new_content.split())

    # Force resynthesize if new content is >50% of existing length
    if existing_len > 0 and new_len > existing_len * 0.5:
        return True, "New content is substantial relative to existing note"

    # Force resynthesize if we have 5+ fragmented inputs
    if len(input_history) >= 5:
        return True, "Multiple fragmented inputs benefit from full synthesis"

    # Force resynthesize if existing note is very short (<50 words)
    if existing_len < 50:
        return True, "Short note benefits from full synthesis"

    return False, None


async def smart_synthesize(
    client,
    model: str,
    new_content: str,
    existing_narrative: str,
    existing_title: str,
    existing_summary: str | None,
    input_history: list,
    user_context: Optional[dict] = None,
) -> dict:
    """Intelligently decide whether to append or resynthesize, then do it.

    Note: force-resynthesize and mock cases are handled by the service coordinator.
    This function only handles the LLM-based decision path.
    """
    check_injection_patterns(new_content)
    check_injection_patterns(existing_narrative, source="existing_narrative")
    new_content = validate_input_length(new_content, "new_content")
    existing_narrative = validate_input_length(existing_narrative, "existing_narrative")
    folders_list = resolve_folders(user_context)

    json_schema = build_json_schema(
        folders_list,
        include_narrative=True,
        include_format_signals=True,
        include_entities=True,
        include_decision=True,
    )

    system_content = "\n\n".join([
        INJECTION_DEFENSE_INSTRUCTION,
        "You are updating an existing note with new content. "
        "First decide: APPEND (purely additive, same topic) or "
        "RESYNTHESIZE (contradicts, corrects, or shifts topic).",
        FIELD_DEFINITIONS_FULL,
        INTENT_CLASSIFICATION_BLOCK,
        f"Return ONLY valid JSON with this exact structure:\n{json_schema}",
        "IMPORTANT:\n"
        "- If appending, the narrative should seamlessly integrate the new content\n"
        "- If resynthesizing, create a completely fresh narrative from all information\n"
        "- Always return the COMPLETE narrative, not just changes\n"
        "- Only extract Calendar, Email, and Reminder actions --- nothing else",
    ])

    context_str = build_user_context_string(user_context, folders_list)
    user_content = (
        wrap_user_content(existing_narrative, label="existing_note")
        + "\n\n"
        + wrap_user_content(new_content, label="new_content")
        + f"\n\nExisting title: {existing_title}"
        + f"\nExisting summary: {existing_summary or 'None'}"
        + "\n" + context_str
    )

    try:
        response = client.chat.completions.create(
            model=model,
            max_tokens=4000,
            response_format={"type": "json_object"},
            messages=build_messages(system_content, user_content),
        )
    except Exception as e:
        raise ExternalServiceError(service="llm", message=f"Groq LLM request failed: {e}") from e

    data = parse_json_response(response.choices[0].message.content)

    if data is None:
        return {
            "decision": {
                "update_type": "append",
                "confidence": 0.5,
                "reason": "JSON parse failed, defaulting to append",
            },
            "result": {
                "narrative": existing_narrative + "\n\n" + new_content,
                "title": existing_title,
                "folder": "Personal",
                "tags": [],
                "summary": existing_summary,
                "calendar": [],
                "email": [],
                "reminders": [],
                "next_steps": [],
            },
        }

    # The LLM may return a flat structure with decision at top level,
    # or a nested structure with decision + result. Handle both.
    decision = data.get("decision", {
        "update_type": "append",
        "confidence": 0.5,
        "reason": "Default decision",
    })

    result_data = data.get("result", data)
    result_data = validate_llm_output(result_data, folders_list)

    return {
        "decision": decision,
        "result": {
            "narrative": result_data.get("narrative", existing_narrative + "\n\n" + new_content),
            "title": result_data.get("title", existing_title),
            "folder": result_data.get("folder", "Personal"),
            "tags": result_data.get("tags", [])[:5],
            "summary": result_data.get("summary", existing_summary),
            "format_composition": extract_format_composition(result_data),
            "related_entities": result_data.get("related_entities"),
            "open_loops": result_data.get("open_loops", []),
            "calendar": result_data.get("calendar", []),
            "email": result_data.get("email", []),
            "reminders": result_data.get("reminders", []),
            "next_steps": [],
        },
    }
