"""Tests for app.services.llm.extraction -- domain module tests (async)."""
import json
import logging

import pytest

from app.core.errors import ExternalServiceError
from app.schemas.voice_schemas import ActionExtractionResult
from app.services.llm.extraction import extract_actions, extract_actions_for_append

from tests.llm_helpers import (
    FakeGroqClient,
    FakeErrorClient,
    TRANSCRIPT_MEETING,
    TRANSCRIPT_WITH_INJECTION,
    TRANSCRIPT_APPEND_EXISTING,
    TRANSCRIPT_APPEND_NEW,
    CANNED_EXTRACTION_RESPONSE,
)

MODEL = "llama-3.3-70b-versatile"


@pytest.mark.asyncio
async def test_extract_actions_success():
    client = FakeGroqClient(CANNED_EXTRACTION_RESPONSE)
    result = await extract_actions(client, MODEL, TRANSCRIPT_MEETING)

    assert isinstance(result, ActionExtractionResult)
    assert result.title == "Product Sync with Engineering"
    assert result.folder == "Meetings"
    assert len(result.tags) == 3
    assert len(result.calendar) == 1
    assert result.calendar[0].title == "Team Lunch"
    assert len(result.reminders) == 2


@pytest.mark.asyncio
async def test_extract_actions_with_context():
    response = json.dumps({
        "title": "Design Review",
        "folder": "Design",
        "tags": ["design"],
        "summary": "Design review notes.",
        "calendar": [],
        "email": [],
        "reminders": [],
    })
    client = FakeGroqClient(response)
    ctx = {"folders": ["Dev", "Design", "Marketing"], "timezone": "US/Pacific"}
    result = await extract_actions(client, MODEL, TRANSCRIPT_MEETING, user_context=ctx)

    assert result.folder == "Design"


@pytest.mark.asyncio
async def test_extract_actions_json_fail():
    client = FakeGroqClient("this is not valid json")
    result = await extract_actions(client, MODEL, TRANSCRIPT_MEETING)

    assert result.title == "Voice Note"
    assert result.folder == "Personal"
    assert result.tags == []


@pytest.mark.asyncio
async def test_extract_actions_client_error():
    client = FakeErrorClient()
    with pytest.raises(ExternalServiceError):
        await extract_actions(client, MODEL, TRANSCRIPT_MEETING)


@pytest.mark.asyncio
async def test_extract_actions_tags_capped():
    response = json.dumps({
        "title": "Test",
        "folder": "Work",
        "tags": ["a", "b", "c", "d", "e", "f", "g", "h"],
        "summary": "Test",
        "calendar": [],
        "email": [],
        "reminders": [],
    })
    client = FakeGroqClient(response)
    ctx = {"folders": ["Work"]}
    result = await extract_actions(client, MODEL, "test text", user_context=ctx)

    assert len(result.tags) == 5


@pytest.mark.asyncio
async def test_extract_actions_injection_logged(caplog):
    client = FakeGroqClient(CANNED_EXTRACTION_RESPONSE)
    with caplog.at_level(logging.WARNING, logger="app.services.llm.validation"):
        result = await extract_actions(client, MODEL, TRANSCRIPT_WITH_INJECTION)

    assert "prompt injection" in caplog.text
    # Extraction still succeeds
    assert isinstance(result, ActionExtractionResult)
    assert result.title == "Product Sync with Engineering"


# -- extract_actions_for_append --

@pytest.mark.asyncio
async def test_extract_for_append_success():
    response = json.dumps({
        "title": "Onboarding Redesign",
        "folder": "Work",
        "tags": ["onboarding"],
        "summary": "Follow-up with stakeholder review.",
        "calendar": [{
            "title": "Stakeholder Review",
            "date": "2025-01-24",
            "time": "14:00",
            "location": "Main Conference Room",
            "attendees": [],
        }],
        "email": [],
        "reminders": [],
    })
    client = FakeGroqClient(response)
    ctx = {"folders": ["Work", "Personal"]}
    result = await extract_actions_for_append(
        client, MODEL, TRANSCRIPT_APPEND_NEW,
        TRANSCRIPT_APPEND_EXISTING, "Onboarding Notes",
        user_context=ctx,
    )

    assert isinstance(result, ActionExtractionResult)
    assert len(result.calendar) == 1
    assert result.calendar[0].title == "Stakeholder Review"


@pytest.mark.asyncio
async def test_extract_for_append_no_actions():
    response = json.dumps({
        "title": "Onboarding Notes",
        "folder": "Work",
        "tags": [],
        "summary": "Continuation of earlier discussion.",
        "calendar": [],
        "email": [],
        "reminders": [],
    })
    client = FakeGroqClient(response)
    ctx = {"folders": ["Work"]}
    result = await extract_actions_for_append(
        client, MODEL, TRANSCRIPT_APPEND_NEW,
        TRANSCRIPT_APPEND_EXISTING, "Onboarding Notes",
        user_context=ctx,
    )

    assert result.calendar == []
    assert result.email == []
    assert result.reminders == []


@pytest.mark.asyncio
async def test_extract_for_append_json_fail():
    client = FakeGroqClient("not json at all")
    result = await extract_actions_for_append(
        client, MODEL, TRANSCRIPT_APPEND_NEW,
        TRANSCRIPT_APPEND_EXISTING, "Onboarding Notes",
    )

    assert result.title == "Onboarding Notes"  # Falls back to existing_title
    assert result.summary.startswith("Added:")


@pytest.mark.asyncio
async def test_extract_format_composition():
    client = FakeGroqClient(CANNED_EXTRACTION_RESPONSE)
    result = await extract_actions(client, MODEL, TRANSCRIPT_MEETING)

    assert result.format_composition is not None
    assert result.format_composition.format_recipe == "header_sections + bullet_list + checklist"
