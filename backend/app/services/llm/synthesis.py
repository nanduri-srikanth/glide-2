"""Content synthesis -- merging text and audio into cohesive narratives."""
import logging
from typing import Optional, Callable

from app.core.errors import ExternalServiceError
from app.services.llm.prompts import (
    INJECTION_DEFENSE_INSTRUCTION,
    FIELD_DEFINITIONS_FULL,
    FORMAT_SIGNALS_BLOCK,
    FORMAT_FEWSHOT_EXAMPLES,
    MATH_NOTATION_BLOCK,
    TECHNICAL_PRESERVATION_BLOCK,
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


def _combine_inputs(text_input: str, audio_transcript: str) -> str:
    """Combine text and audio inputs into a single string."""
    if text_input and audio_transcript:
        return f"TYPED TEXT:\n{text_input}\n\nSPOKEN AUDIO:\n{audio_transcript}"
    elif text_input:
        return text_input
    elif audio_transcript:
        return audio_transcript
    return ""


def _empty_synthesis_result() -> dict:
    """Return an empty synthesis result for when no content is provided."""
    return {
        "narrative": "",
        "title": "Empty Note",
        "folder": "Personal",
        "tags": [],
        "summary": None,
        "calendar": [],
        "email": [],
        "reminders": [],
        "next_steps": [],
    }


async def synthesize_content(
    client,
    model: str,
    text_input: str = "",
    audio_transcript: str = "",
    user_context: Optional[dict] = None,
) -> dict:
    """Synthesize text input and audio transcription into a cohesive narrative."""
    combined_content = _combine_inputs(text_input, audio_transcript)
    if not combined_content:
        return _empty_synthesis_result()

    check_injection_patterns(combined_content)
    combined_content = validate_input_length(combined_content)
    folders_list = resolve_folders(user_context)

    json_schema = build_json_schema(
        folders_list,
        include_narrative=True,
        include_format_signals=True,
        include_entities=True,
    )

    system_content = "\n\n".join([
        INJECTION_DEFENSE_INSTRUCTION,
        "You synthesize a user's thoughts into a cohesive note. "
        "The user may have provided typed text and/or spoken audio. "
        "Merge into ONE coherent narrative that flows naturally.",
        FIELD_DEFINITIONS_FULL,
        FORMAT_SIGNALS_BLOCK,
        FORMAT_FEWSHOT_EXAMPLES,
        VOICE_AND_TONE_BLOCK,
        MATH_NOTATION_BLOCK,
        TECHNICAL_PRESERVATION_BLOCK,
        INTENT_CLASSIFICATION_BLOCK,
        f"Return ONLY valid JSON with this exact structure:\n{json_schema}",
        "Rules:\n"
        "1. Create a single, cohesive narrative that integrates all inputs naturally.\n"
        "2. Do NOT separate typed vs spoken --- merge them into one flowing text.\n"
        "3. Fix grammar, remove filler words, but PRESERVE the user's voice and intent.",
        OUTPUT_RULES,
    ])

    context_str = build_user_context_string(user_context, folders_list)
    user_content = wrap_user_content(combined_content) + "\n" + context_str

    # Scale token budget with input size — technical content needs more room
    input_words = len(combined_content.split())
    max_tokens = min(8000, max(3000, input_words * 3))

    try:
        response = client.chat.completions.create(
            model=model,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
            messages=build_messages(system_content, user_content),
        )
    except Exception as e:
        raise ExternalServiceError(service="llm", message=f"Groq LLM request failed: {e}") from e

    data = parse_json_response(response.choices[0].message.content)

    if data is None:
        return {
            "narrative": combined_content,
            "title": "Voice Note",
            "folder": "Personal",
            "tags": [],
            "summary": combined_content[:200] + "..." if len(combined_content) > 200 else combined_content,
            "type_detection": None,
            "format_composition": None,
            "related_entities": None,
            "open_loops": [],
            "calendar": [],
            "email": [],
            "reminders": [],
            "next_steps": [],
        }

    data = validate_llm_output(data, folders_list)

    return {
        "narrative": data.get("narrative", combined_content),
        "title": data.get("title", "Voice Note"),
        "folder": data.get("folder", "Personal"),
        "tags": data.get("tags", [])[:5],
        "summary": data.get("summary"),
        "type_detection": data.get("type_detection"),
        "format_composition": extract_format_composition(data),
        "related_entities": data.get("related_entities"),
        "open_loops": data.get("open_loops", []),
        "calendar": data.get("calendar", []),
        "email": data.get("email", []),
        "reminders": data.get("reminders", []),
        "next_steps": [],
    }


async def comprehensive_synthesize(
    client,
    model: str,
    text_input: str,
    audio_transcript: str,
    input_history: list,
    user_context: Optional[dict] = None,
) -> dict:
    """Create a COMPREHENSIVE synthesis that preserves ALL information."""
    combined_content = _combine_inputs(text_input, audio_transcript)
    if not combined_content:
        return _empty_synthesis_result()

    check_injection_patterns(combined_content)
    combined_content = validate_input_length(combined_content)
    folders_list = resolve_folders(user_context)

    input_count = len(input_history)
    total_words = len(combined_content.split())

    json_schema = build_json_schema(
        folders_list,
        include_narrative=True,
        include_format_signals=True,
        include_entities=True,
    )

    system_content = "\n\n".join([
        INJECTION_DEFENSE_INSTRUCTION,
        f"You are re-synthesizing a note from {input_count} separate inputs ({total_words} words total). "
        "PRESERVE ALL INFORMATION --- every detail, name, number, date, formula, and idea. "
        "Organize by theme, maintain chronology, capture nuance.",
        FIELD_DEFINITIONS_FULL,
        FORMAT_SIGNALS_BLOCK,
        VOICE_AND_TONE_BLOCK,
        MATH_NOTATION_BLOCK,
        TECHNICAL_PRESERVATION_BLOCK,
        INTENT_CLASSIFICATION_BLOCK,
        f"Return ONLY valid JSON with this exact structure:\n{json_schema}",
        "CRITICAL PRESERVATION RULES:\n"
        "1. The narrative must be comprehensive --- LONGER or equal to the combined inputs.\n"
        "2. If 5 items were discussed, all 5 must appear. If reasoning was given, include the reasoning.\n"
        "3. DO NOT summarize away details. DO NOT paraphrase formulas into prose.\n"
        "4. Every equation, derivation step, definition, and aside must be preserved.\n"
        "5. When in doubt, include MORE content, not less.",
    ])

    context_str = build_user_context_string(user_context, folders_list)
    user_content = (
        wrap_user_content(combined_content)
        + f"\n\nInput count: {input_count}\nTotal words: {total_words}"
        + "\n" + context_str
    )

    # Scale token budget generously — comprehensive mode must not truncate content
    # Technical content expands when formatted (headers, math delimiters, structure)
    max_tokens = min(8000, max(4000, total_words * 4))

    try:
        response = client.chat.completions.create(
            model=model,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
            messages=build_messages(system_content, user_content),
        )
    except Exception as e:
        raise ExternalServiceError(service="llm", message=f"Groq LLM request failed: {e}") from e

    data = parse_json_response(response.choices[0].message.content)

    if data is None:
        return {
            "narrative": combined_content,
            "title": "Voice Note",
            "folder": "Personal",
            "tags": [],
            "summary": combined_content,
            "type_detection": None,
            "format_composition": None,
            "related_entities": None,
            "open_loops": [],
            "calendar": [],
            "email": [],
            "reminders": [],
        }

    data = validate_llm_output(data, folders_list)

    return {
        "narrative": data.get("narrative", combined_content),
        "title": data.get("title", "Voice Note"),
        "folder": data.get("folder", "Personal"),
        "tags": data.get("tags", [])[:5],
        "summary": data.get("summary", data.get("narrative", combined_content)),
        "type_detection": data.get("type_detection"),
        "format_composition": extract_format_composition(data),
        "related_entities": data.get("related_entities"),
        "open_loops": data.get("open_loops", []),
        "calendar": data.get("calendar", []),
        "email": data.get("email", []),
        "reminders": data.get("reminders", []),
    }


async def resynthesize_content(
    client,
    model: str,
    input_history: list,
    user_context: Optional[dict] = None,
    comprehensive: bool = True,
    mock_synthesis_fn: Optional[Callable] = None,
) -> dict:
    """Re-synthesize content from a history of inputs."""
    text_parts = []
    audio_parts = []

    for entry in input_history:
        if entry.get("type") == "text":
            text_parts.append(entry.get("content", ""))
        elif entry.get("type") == "audio":
            audio_parts.append(entry.get("content", ""))

    text_input = "\n\n".join(text_parts) if text_parts else ""
    audio_transcript = "\n\n".join(audio_parts) if audio_parts else ""

    if comprehensive:
        if client is None and mock_synthesis_fn:
            combined = _combine_inputs(text_input, audio_transcript)
            return mock_synthesis_fn(combined, text_input, audio_transcript)
        return await comprehensive_synthesize(client, model, text_input, audio_transcript, input_history, user_context)
    else:
        if client is None and mock_synthesis_fn:
            combined = _combine_inputs(text_input, audio_transcript)
            return mock_synthesis_fn(combined, text_input, audio_transcript)
        return await synthesize_content(client, model, text_input, audio_transcript, user_context)
