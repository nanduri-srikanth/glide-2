"""Tests for app.services.llm.service -- LLMService coordinator routing."""
import pytest

from app.schemas.voice_schemas import ActionExtractionResult
from app.services.llm.service import LLMService

from tests.llm_helpers import (
    FakeGroqClient,
    TRANSCRIPT_MEETING,
    TRANSCRIPT_SHORT,
    TRANSCRIPT_APPEND_EXISTING,
    TRANSCRIPT_APPEND_NEW,
    TRANSCRIPT_EMAIL_CONTEXT,
    TRANSCRIPT_SEQUENTIAL,
    CANNED_EXTRACTION_RESPONSE,
    CANNED_SYNTHESIS_RESPONSE,
    CANNED_EMAIL_RESPONSE,
    CANNED_SEQUENTIAL_RESPONSE,
)


def _make_service(with_client=False, response_content=None):
    """Create an LLMService with client=None or a FakeGroqClient."""
    svc = LLMService.__new__(LLMService)
    svc.client = FakeGroqClient(response_content or "{}") if with_client else None
    return svc


# -- init --

def test_init_no_api_key():
    """When client is not set, it should be None."""
    svc = _make_service(with_client=False)
    assert svc.client is None


# -- extract_actions --

@pytest.mark.asyncio
async def test_extract_actions_mock():
    svc = _make_service(with_client=False)
    result = await svc.extract_actions(TRANSCRIPT_MEETING)
    assert isinstance(result, ActionExtractionResult)
    assert result.folder == "Personal"
    assert result.tags == []


@pytest.mark.asyncio
async def test_extract_actions_llm():
    svc = _make_service(with_client=True, response_content=CANNED_EXTRACTION_RESPONSE)
    result = await svc.extract_actions(TRANSCRIPT_MEETING)
    assert isinstance(result, ActionExtractionResult)
    assert result.title == "Product Sync with Engineering"
    assert result.folder == "Meetings"
    assert len(result.calendar) == 1
    assert len(result.reminders) == 2


# -- extract_actions_for_append --

@pytest.mark.asyncio
async def test_extract_for_append_mock():
    svc = _make_service(with_client=False)
    result = await svc.extract_actions_for_append(
        TRANSCRIPT_APPEND_NEW, TRANSCRIPT_APPEND_EXISTING, "Onboarding Notes"
    )
    assert isinstance(result, ActionExtractionResult)
    assert result.folder == "Personal"


@pytest.mark.asyncio
async def test_extract_for_append_llm():
    svc = _make_service(with_client=True, response_content=CANNED_EXTRACTION_RESPONSE)
    result = await svc.extract_actions_for_append(
        TRANSCRIPT_APPEND_NEW, TRANSCRIPT_APPEND_EXISTING, "Onboarding Notes"
    )
    assert isinstance(result, ActionExtractionResult)
    assert result.title == "Product Sync with Engineering"


# -- generate_email_draft --

@pytest.mark.asyncio
async def test_email_draft_mock():
    svc = _make_service(with_client=False)
    result = await svc.generate_email_draft(
        TRANSCRIPT_EMAIL_CONTEXT, "pm@company.com", "timeline update"
    )
    assert result["subject"] == "Re: timeline update"
    assert "AI draft unavailable" in result["body"]


@pytest.mark.asyncio
async def test_email_draft_llm():
    svc = _make_service(with_client=True, response_content=CANNED_EMAIL_RESPONSE)
    result = await svc.generate_email_draft(
        TRANSCRIPT_EMAIL_CONTEXT, "pm@company.com", "timeline update"
    )
    assert "Timeline" in result["subject"]
    assert "Dear" in result["body"]


# -- synthesize_content --

@pytest.mark.asyncio
async def test_synthesize_empty():
    svc = _make_service(with_client=True, response_content=CANNED_SYNTHESIS_RESPONSE)
    result = await svc.synthesize_content(text_input="", audio_transcript="")
    assert result["title"] == "Empty Note"
    assert result["narrative"] == ""


@pytest.mark.asyncio
async def test_synthesize_mock():
    svc = _make_service(with_client=False)
    result = await svc.synthesize_content(
        text_input="typed notes about the project", audio_transcript=""
    )
    assert result["narrative"] == "typed notes about the project"
    assert result["folder"] == "Personal"


@pytest.mark.asyncio
async def test_synthesize_llm():
    svc = _make_service(with_client=True, response_content=CANNED_SYNTHESIS_RESPONSE)
    result = await svc.synthesize_content(
        text_input=TRANSCRIPT_MEETING, audio_transcript=""
    )
    assert result["title"] == "Product Sync Meeting Notes"
    assert result["folder"] == "Meetings"

@pytest.mark.asyncio
async def test_synthesize_llm_sequential_steps():
    svc = _make_service(with_client=True, response_content=CANNED_SEQUENTIAL_RESPONSE)
    result = await svc.synthesize_content(
        text_input=TRANSCRIPT_SEQUENTIAL, audio_transcript=""
    )
    assert result["format_composition"]["format_signals"]["has_sequential_steps"] is True
    assert "numbered_list" in result["format_composition"]["format_recipe"]


# -- resynthesize_content --

@pytest.mark.asyncio
async def test_resynthesize_mock():
    svc = _make_service(with_client=False)
    history = [
        {"type": "text", "content": "typed part"},
        {"type": "audio", "content": "spoken part"},
    ]
    result = await svc.resynthesize_content(history)
    assert "typed part" in result["narrative"] or "spoken part" in result["narrative"]


@pytest.mark.asyncio
async def test_resynthesize_llm():
    svc = _make_service(with_client=True, response_content=CANNED_SYNTHESIS_RESPONSE)
    history = [
        {"type": "text", "content": "typed part"},
        {"type": "audio", "content": "spoken part"},
    ]
    result = await svc.resynthesize_content(history)
    assert result["title"] == "Product Sync Meeting Notes"


# -- comprehensive_synthesize --

@pytest.mark.asyncio
async def test_comprehensive_empty():
    svc = _make_service(with_client=True)
    result = await svc.comprehensive_synthesize("", "", [])
    assert result["title"] == "Empty Note"


@pytest.mark.asyncio
async def test_comprehensive_mock():
    svc = _make_service(with_client=False)
    result = await svc.comprehensive_synthesize(
        "typed text", "", [{"type": "text", "content": "typed text"}]
    )
    assert result["narrative"] == "typed text"


# -- should_force_resynthesize --

def test_force_resynthesize_short_existing():
    svc = _make_service()
    should_force, reason = svc.should_force_resynthesize(
        existing_narrative="Short note here.",
        new_content="Some new content.",
        input_history=[],
    )
    assert should_force is True
    assert reason is not None


# -- smart_synthesize --

@pytest.mark.asyncio
async def test_smart_synth_force_path():
    """Short existing note triggers force-resynthesize path."""
    svc = _make_service(with_client=False)
    result = await svc.smart_synthesize(
        new_content="New info here",
        existing_narrative="Short note.",  # < 50 words → force resynthesize
        existing_title="Test Note",
        existing_summary=None,
        input_history=[
            {"type": "text", "content": "Short note."},
            {"type": "text", "content": "New info here"},
        ],
    )
    assert result["decision"]["update_type"] == "resynthesize"
    assert result["decision"]["confidence"] == 0.95


@pytest.mark.asyncio
async def test_smart_synth_mock():
    """No force trigger, no client → mock smart synthesis."""
    svc = _make_service(with_client=False)
    existing = " ".join(["word"] * 200)  # 200 words, above 50 threshold
    new = "Quick update here"  # short, < 50% of existing
    result = await svc.smart_synthesize(
        new_content=new,
        existing_narrative=existing,
        existing_title="Long Note",
        existing_summary=None,
        input_history=[
            {"type": "text", "content": existing},
            {"type": "text", "content": new},
        ],
    )
    assert result["decision"]["update_type"] == "append"


# -- summarize_note --

@pytest.mark.asyncio
async def test_summarize_note_mock():
    svc = _make_service(with_client=False)
    result = await svc.summarize_note(TRANSCRIPT_MEETING)
    assert result == TRANSCRIPT_MEETING[:200] + "..."


@pytest.mark.asyncio
async def test_summarize_note_short_mock():
    svc = _make_service(with_client=False)
    result = await svc.summarize_note(TRANSCRIPT_SHORT)
    assert result == TRANSCRIPT_SHORT  # No "..." for short text
