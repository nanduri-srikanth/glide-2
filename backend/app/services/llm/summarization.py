"""Note summarization -- standalone and new-content summaries."""
import logging
from typing import Optional

from app.core.errors import ExternalServiceError
from app.services.llm.prompts import (
    INJECTION_DEFENSE_INSTRUCTION,
    FORMAT_SIGNALS_BLOCK,
    VOICE_AND_TONE_BLOCK,
    INTENT_CLASSIFICATION_BLOCK,
)
from app.services.llm.validation import (
    check_injection_patterns,
    validate_input_length,
    resolve_folders,
    parse_json_response,
    wrap_user_content,
)
from app.services.llm.schema_builder import (
    build_user_context_string,
    build_messages,
)

logger = logging.getLogger(__name__)


async def summarize_note(
    client,
    model: str,
    transcript: str,
    duration_seconds: int = 0,
) -> str:
    """Generate a concise summary of a note."""
    check_injection_patterns(transcript)
    transcript = validate_input_length(transcript)

    # Duration-based length guidance
    if duration_seconds < 60:
        length_guidance = "3-5 sentences capturing the complete thought."
    elif duration_seconds < 300:
        length_guidance = "2-3 substantial paragraphs preserving the full reasoning and context."
    else:
        length_guidance = (
            "4-6 paragraphs with natural sections. Capture everything important --- "
            "this is a longer note and deserves a comprehensive summary."
        )

    system_content = "\n\n".join([
        INJECTION_DEFENSE_INSTRUCTION,
        "You write refined, well-structured notes from voice transcripts. "
        "This is the user's OWN note.",
        FORMAT_SIGNALS_BLOCK,
        VOICE_AND_TONE_BLOCK,
    ])

    user_content = (
        wrap_user_content(transcript)
        + f"\n\n## Length\n{length_guidance}\n\n"
        + "Return only the formatted note text (with markdown headers/bullets as appropriate)."
    )

    try:
        response = client.chat.completions.create(
            model=model,
            max_tokens=1000,
            messages=build_messages(system_content, user_content),
        )
    except Exception as e:
        raise ExternalServiceError(service="llm", message=f"Groq LLM request failed: {e}") from e

    return response.choices[0].message.content.strip()


async def summarize_new_content(
    client,
    model: str,
    new_transcript: str,
    existing_title: str,
    user_context: Optional[dict] = None,
) -> dict:
    """Summarize new content in isolation for appending to an existing note."""
    check_injection_patterns(new_transcript)
    new_transcript = validate_input_length(new_transcript)
    folders_list = resolve_folders(user_context)

    # Word-count-based length guidance
    word_count = len(new_transcript.split())
    if word_count < 30:
        length_guidance = "2-4 sentences"
    elif word_count < 150:
        length_guidance = "1-2 paragraphs with bullets if needed"
    else:
        length_guidance = "Multiple paragraphs, use headers if topics shift"

    system_content = "\n\n".join([
        INJECTION_DEFENSE_INSTRUCTION,
        "You are summarizing NEW CONTENT being added to an existing note.",
        VOICE_AND_TONE_BLOCK,
        INTENT_CLASSIFICATION_BLOCK,
    ])

    json_schema_str = (
        "{\n"
        '  "summary": "Well-structured summary of the new content - comprehensive but focused",\n'
        '  "tags": ["new", "relevant", "tags"],\n'
        '  "calendar": [\n'
        "    {\n"
        '      "title": "Event name",\n'
        '      "date": "YYYY-MM-DD",\n'
        '      "time": "HH:MM (optional)",\n'
        '      "location": "optional",\n'
        '      "attendees": []\n'
        "    }\n"
        "  ],\n"
        '  "email": [\n'
        "    {\n"
        '      "to": "recipient",\n'
        '      "subject": "Subject",\n'
        '      "body": "Draft body"\n'
        "    }\n"
        "  ],\n"
        '  "reminders": [\n'
        "    {\n"
        '      "title": "Task description WITH CONTEXT",\n'
        '      "due_date": "YYYY-MM-DD",\n'
        '      "due_time": "HH:MM (optional)",\n'
        '      "priority": "low|medium|high",\n'
        '      "intent_source": "COMMITMENT_TO_SELF|COMMITMENT_TO_OTHER|TIME_BINDING|DELEGATION"\n'
        "    }\n"
        "  ]\n"
        "}"
    )

    context_str = build_user_context_string(user_context, folders_list)
    user_content = (
        f'This is an addition/update to the note titled: "{existing_title}"\n\n'
        + wrap_user_content(new_transcript, label="new_transcript")
        + "\n" + context_str
        + f"\n\nLength guidance: {length_guidance}\n\n"
        + f"Return ONLY valid JSON:\n{json_schema_str}"
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
        return {
            "summary": new_transcript[:300] + "..." if len(new_transcript) > 300 else new_transcript,
            "tags": [],
            "calendar": [],
            "email": [],
            "reminders": [],
        }

    return {
        "summary": data.get("summary", new_transcript),
        "tags": data.get("tags", [])[:5],
        "calendar": data.get("calendar", []),
        "email": data.get("email", []),
        "reminders": data.get("reminders", []),
    }
