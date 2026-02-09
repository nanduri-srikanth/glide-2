"""Input validation, injection detection, output sanitization, and JSON parsing."""
import json
import logging
import re
from typing import Optional

from app.services.llm.prompts import INJECTION_PATTERNS, MAX_TRANSCRIPT_LENGTH

logger = logging.getLogger(__name__)


def wrap_user_content(content: str, label: str = "user_transcript") -> str:
    """Wrap user-provided content in XML boundary tags."""
    return f"<{label}>\n{content}\n</{label}>"


def check_injection_patterns(text: str, source: str = "transcript") -> None:
    """Log a warning if the text contains common prompt-injection patterns."""
    text_lower = text.lower()
    for pattern in INJECTION_PATTERNS:
        if re.search(pattern, text_lower):
            logger.warning(
                "Potential prompt injection detected in %s: matched pattern %r",
                source,
                pattern,
            )
            break


def validate_input_length(text: str, field_name: str = "transcript") -> str:
    """Truncate text if it exceeds the maximum allowed length."""
    if len(text) > MAX_TRANSCRIPT_LENGTH:
        logger.warning(
            "%s exceeds max length (%d > %d), truncating",
            field_name,
            len(text),
            MAX_TRANSCRIPT_LENGTH,
        )
        return text[:MAX_TRANSCRIPT_LENGTH]
    return text


def validate_llm_output(data: dict, allowed_folders: list[str]) -> dict:
    """Validate and sanitize LLM output fields."""
    # Folder must be in allowed list
    if data.get("folder") not in allowed_folders:
        data["folder"] = allowed_folders[0] if allowed_folders else "Personal"

    # Tags capped at 5
    if isinstance(data.get("tags"), list):
        data["tags"] = data["tags"][:5]

    # Reminder priority validation
    valid_priorities = {"low", "medium", "high"}
    for reminder in data.get("reminders", []):
        if isinstance(reminder, dict) and reminder.get("priority") not in valid_priorities:
            reminder["priority"] = "medium"

    # Basic email "to" format check
    for email_item in data.get("email", []):
        if isinstance(email_item, dict) and not email_item.get("to"):
            email_item["to"] = "recipient"

    return data


def parse_json_response(response_text: str) -> dict | None:
    """Parse a JSON response, handling optional markdown code-block wrapping."""
    text = response_text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        logger.warning("Failed to parse LLM JSON response")
        return None


def resolve_folders(user_context: Optional[dict]) -> list[str]:
    """Extract folder list from user_context or return defaults."""
    if user_context and user_context.get("folders"):
        return user_context["folders"]
    return ["Work", "Personal", "Ideas", "Meetings", "Projects"]


def extract_format_composition(data: dict) -> dict | None:
    """Extract format_composition dict from LLM response data."""
    if data.get("format_signals") and data.get("format_recipe"):
        return {
            "format_signals": data["format_signals"],
            "format_recipe": data["format_recipe"],
        }
    return None
