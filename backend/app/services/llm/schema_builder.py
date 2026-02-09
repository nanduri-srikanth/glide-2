"""JSON schema and message construction for LLM prompts."""
from typing import Optional


def build_user_context_string(user_context: Optional[dict], folders_list: list[str]) -> str:
    """Build the formatted timezone/date/folders context block."""
    if not user_context:
        return ""
    return (
        f"\nUser context:\n"
        f"- Timezone: {user_context.get('timezone', 'America/Chicago')}\n"
        f"- Current date: {user_context.get('current_date', 'today')}\n"
        f"- Your folders: {', '.join(folders_list)}\n"
    )


def build_messages(system_content: str, user_content: str) -> list[dict]:
    """Build the chat messages list with system and user roles."""
    return [
        {"role": "system", "content": system_content},
        {"role": "user", "content": user_content},
    ]


def build_json_schema(
    folders_list: list[str],
    include_narrative: bool = False,
    include_format_signals: bool = True,
    include_entities: bool = True,
    include_decision: bool = False,
) -> str:
    """Dynamically build the JSON output schema description string."""
    folders_str = ", ".join(folders_list)
    parts: list[str] = []
    parts.append("{")

    if include_decision:
        parts.append('  "decision": {')
        parts.append('    "update_type": "append or resynthesize",')
        parts.append('    "confidence": 0.0-1.0,')
        parts.append('    "reason": "Brief explanation"')
        parts.append("  },")

    if include_format_signals:
        parts.append('  "format_signals": {')
        parts.append('    "has_discrete_items": true|false,')
        parts.append('    "has_sequential_steps": true|false,')
        parts.append('    "has_action_items": true|false,')
        parts.append('    "is_reflective": true|false,')
        parts.append('    "topic_count": integer,')
        parts.append('    "tone": "casual|professional|urgent|reflective|excited|frustrated"')
        parts.append("  },")
        parts.append('  "format_recipe": "e.g. prose_paragraph + checklist",')

    if include_narrative:
        parts.append('  "narrative": "The complete formatted note content - preserve user voice",')

    parts.append('  "title": "Brief descriptive title for this note (5-10 words max)",')
    parts.append(f'  "folder": "Choose exactly one from: {folders_str}",')
    parts.append('  "tags": ["relevant", "tags", "max5"],')
    parts.append('  "summary": "2-4 sentence card preview - match user tone",')

    if include_entities:
        parts.append('  "related_entities": {')
        parts.append('    "people": ["names mentioned"],')
        parts.append('    "projects": ["project names"],')
        parts.append('    "companies": ["company names"],')
        parts.append('    "concepts": ["key concepts"]')
        parts.append("  },")
        parts.append('  "open_loops": [')
        parts.append("    {")
        parts.append('      "item": "Description of unresolved item",')
        parts.append('      "status": "unresolved|question|blocked|deferred",')
        parts.append('      "context": "Why this is unresolved"')
        parts.append("    }")
        parts.append("  ],")

    parts.append('  "calendar": [')
    parts.append("    {")
    parts.append('      "title": "Event name",')
    parts.append('      "date": "YYYY-MM-DD",')
    parts.append('      "time": "HH:MM (24hr, optional)",')
    parts.append('      "location": "optional location",')
    parts.append('      "attendees": ["optional", "attendees"]')
    parts.append("    }")
    parts.append("  ],")
    parts.append('  "email": [')
    parts.append("    {")
    parts.append('      "to": "email@example.com or descriptive name",')
    parts.append('      "subject": "Email subject line",')
    parts.append('      "body": "Draft email body content - be professional and complete"')
    parts.append("    }")
    parts.append("  ],")
    parts.append('  "reminders": [')
    parts.append("    {")
    parts.append('      "title": "Clear, actionable reminder text WITH CONTEXT",')
    parts.append('      "due_date": "YYYY-MM-DD",')
    parts.append('      "due_time": "HH:MM (optional)",')
    parts.append('      "priority": "low|medium|high",')
    parts.append('      "intent_source": "COMMITMENT_TO_SELF|COMMITMENT_TO_OTHER|TIME_BINDING|DELEGATION"')
    parts.append("    }")
    parts.append("  ]")
    parts.append("}")
    return "\n".join(parts)
