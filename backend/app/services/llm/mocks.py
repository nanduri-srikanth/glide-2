"""Mock responses for local development without API keys."""
from datetime import datetime

from app.schemas.voice_schemas import ActionExtractionResult


def mock_extraction(transcript: str) -> ActionExtractionResult:
    """Return mock extraction result for local dev (no API key)."""
    words = transcript.split()[:10]
    title = " ".join(words) + ("..." if len(transcript.split()) > 10 else "")
    if not title.strip():
        title = f"Voice Note - {datetime.utcnow().strftime('%b %d, %Y %I:%M %p')}"

    summary = transcript[:200] + ("..." if len(transcript) > 200 else "")

    return ActionExtractionResult(
        title=title,
        folder="Personal",
        tags=[],
        summary=summary if summary.strip() else None,
        calendar=[],
        email=[],
        reminders=[],
        next_steps=[],
    )


def mock_synthesis(combined: str, text: str, audio: str) -> dict:
    """Return mock synthesis result for local dev (no API key)."""
    narrative = combined
    if text and audio:
        narrative = f"{text}\n\n{audio}"
    elif text:
        narrative = text
    elif audio:
        narrative = audio

    words = narrative.split()[:10]
    title = " ".join(words) + ("..." if len(narrative.split()) > 10 else "")
    if not title.strip():
        title = f"Note - {datetime.utcnow().strftime('%b %d, %Y %I:%M %p')}"

    return {
        "narrative": narrative,
        "title": title,
        "folder": "Personal",
        "tags": [],
        "summary": narrative[:200] + "..." if len(narrative) > 200 else narrative,
        "type_detection": None,
        "related_entities": None,
        "open_loops": [],
        "calendar": [],
        "email": [],
        "reminders": [],
        "next_steps": [],
    }


def mock_smart_synthesis(
    new_content: str,
    existing_narrative: str,
    existing_title: str,
    input_history: list,
) -> dict:
    """Mock smart synthesis for local dev (no API key)."""
    if len(new_content.split()) < 50:
        return {
            "decision": {
                "update_type": "append",
                "confidence": 0.7,
                "reason": "New content is short, appending to existing"
            },
            "result": {
                "narrative": existing_narrative + "\n\n" + new_content,
                "title": existing_title,
                "folder": "Personal",
                "tags": [],
                "summary": None,
                "calendar": [],
                "email": [],
                "reminders": [],
                "next_steps": []
            }
        }
    else:
        all_content = "\n\n".join([
            entry.get("content", "") for entry in input_history
        ])
        return {
            "decision": {
                "update_type": "resynthesize",
                "confidence": 0.7,
                "reason": "Substantial new content, resynthesizing"
            },
            "result": {
                "narrative": all_content,
                "title": existing_title,
                "folder": "Personal",
                "tags": [],
                "summary": None,
                "calendar": [],
                "email": [],
                "reminders": [],
                "next_steps": []
            }
        }
