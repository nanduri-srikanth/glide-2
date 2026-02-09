"""Tests for app.services.llm.summarization + email -- domain module tests."""
import json

import pytest

from app.core.errors import ExternalServiceError
from app.services.llm.summarization import summarize_note, summarize_new_content
from app.services.llm.email import generate_email_draft

from tests.llm_helpers import (
    FakeGroqClient,
    FakeErrorClient,
    TRANSCRIPT_QUICK_TASK,
    TRANSCRIPT_MEETING,
    TRANSCRIPT_APPEND_NEW,
    TRANSCRIPT_EMAIL_CONTEXT,
    CANNED_SUMMARIZE_NOTE_RESPONSE,
    CANNED_SUMMARIZE_NEW_CONTENT_RESPONSE,
    CANNED_EMAIL_RESPONSE,
)

MODEL = "llama-3.3-70b-versatile"


# -- summarize_note --

@pytest.mark.asyncio
async def test_summarize_note_success():
    client = FakeGroqClient(CANNED_SUMMARIZE_NOTE_RESPONSE)
    result = await summarize_note(client, MODEL, TRANSCRIPT_QUICK_TASK)
    assert isinstance(result, str)
    assert len(result) > 0
    assert "dry cleaning" in result.lower()


@pytest.mark.asyncio
async def test_summarize_note_short_duration():
    client = FakeGroqClient(CANNED_SUMMARIZE_NOTE_RESPONSE)
    await summarize_note(client, MODEL, TRANSCRIPT_QUICK_TASK, duration_seconds=30)
    # Verify the prompt sent includes short-duration guidance
    sent = client.chat.completions.last_kwargs
    user_msg = sent["messages"][1]["content"]
    assert "3-5 sentences" in user_msg


@pytest.mark.asyncio
async def test_summarize_note_long_duration():
    client = FakeGroqClient(CANNED_SUMMARIZE_NOTE_RESPONSE)
    await summarize_note(client, MODEL, TRANSCRIPT_MEETING, duration_seconds=600)
    sent = client.chat.completions.last_kwargs
    user_msg = sent["messages"][1]["content"]
    assert "4-6 paragraphs" in user_msg


@pytest.mark.asyncio
async def test_summarize_note_error():
    client = FakeErrorClient()
    with pytest.raises(ExternalServiceError):
        await summarize_note(client, MODEL, TRANSCRIPT_QUICK_TASK)


# -- summarize_new_content --

@pytest.mark.asyncio
async def test_summarize_new_content_success():
    client = FakeGroqClient(CANNED_SUMMARIZE_NEW_CONTENT_RESPONSE)
    result = await summarize_new_content(
        client, MODEL, TRANSCRIPT_APPEND_NEW, "Onboarding Notes"
    )
    assert "Sarah" in result["summary"]
    assert len(result["tags"]) == 3
    assert len(result["calendar"]) == 1
    assert len(result["reminders"]) == 1


@pytest.mark.asyncio
async def test_summarize_new_content_json_fail():
    client = FakeGroqClient("not valid json")
    result = await summarize_new_content(
        client, MODEL, TRANSCRIPT_APPEND_NEW, "Onboarding Notes"
    )
    # Falls back to truncated transcript
    assert result["summary"] == TRANSCRIPT_APPEND_NEW  # Under 300 chars
    assert result["tags"] == []
    assert result["calendar"] == []


@pytest.mark.asyncio
async def test_summarize_new_content_tags_capped():
    response = json.dumps({
        "summary": "Test summary",
        "tags": ["a", "b", "c", "d", "e", "f", "g", "h"],
        "calendar": [],
        "email": [],
        "reminders": [],
    })
    client = FakeGroqClient(response)
    result = await summarize_new_content(client, MODEL, "test", "Title")
    assert len(result["tags"]) == 5


# -- generate_email_draft --

@pytest.mark.asyncio
async def test_email_draft_success():
    client = FakeGroqClient(CANNED_EMAIL_RESPONSE)
    result = await generate_email_draft(
        client, MODEL, TRANSCRIPT_EMAIL_CONTEXT,
        "pm@company.com", "timeline update",
    )
    assert "Timeline" in result["subject"]
    assert "Dear" in result["body"]


@pytest.mark.asyncio
async def test_email_draft_json_fail():
    client = FakeGroqClient("not json")
    result = await generate_email_draft(
        client, MODEL, TRANSCRIPT_EMAIL_CONTEXT,
        "pm@company.com", "timeline update",
    )
    assert result["subject"] == "Re: timeline update"
    assert "Draft generation failed" in result["body"]


@pytest.mark.asyncio
async def test_email_draft_error():
    client = FakeErrorClient()
    with pytest.raises(ExternalServiceError):
        await generate_email_draft(
            client, MODEL, TRANSCRIPT_EMAIL_CONTEXT,
            "pm@company.com", "timeline update",
        )
