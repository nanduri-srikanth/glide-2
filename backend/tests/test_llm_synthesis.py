"""Tests for app.services.llm.synthesis + smart_synthesis -- domain module tests."""
import pytest

from app.core.errors import ExternalServiceError
from app.services.llm.synthesis import (
    _combine_inputs,
    _empty_synthesis_result,
    synthesize_content,
    comprehensive_synthesize,
    resynthesize_content,
)
from app.services.llm.smart_synthesis import (
    should_force_resynthesize,
    smart_synthesize,
)
from app.services.llm.mocks import mock_synthesis

from tests.llm_helpers import (
    FakeGroqClient,
    FakeErrorClient,
    TRANSCRIPT_MEETING,
    CANNED_SYNTHESIS_RESPONSE,
    CANNED_SMART_SYNTHESIS_RESPONSE,
)

MODEL = "llama-3.3-70b-versatile"


# -- _combine_inputs --

def test_combine_inputs_both():
    result = _combine_inputs("typed", "spoken")
    assert result == "TYPED TEXT:\ntyped\n\nSPOKEN AUDIO:\nspoken"


def test_combine_inputs_text_only():
    assert _combine_inputs("typed", "") == "typed"


def test_combine_inputs_audio_only():
    assert _combine_inputs("", "spoken") == "spoken"


def test_combine_inputs_empty():
    assert _combine_inputs("", "") == ""


# -- _empty_synthesis_result --

def test_empty_synthesis_result():
    result = _empty_synthesis_result()
    assert result["narrative"] == ""
    assert result["title"] == "Empty Note"
    assert result["folder"] == "Personal"
    assert result["tags"] == []
    assert result["calendar"] == []
    assert result["email"] == []
    assert result["reminders"] == []


# -- synthesize_content --

@pytest.mark.asyncio
async def test_synthesize_happy_path():
    client = FakeGroqClient(CANNED_SYNTHESIS_RESPONSE)
    result = await synthesize_content(
        client, MODEL, text_input=TRANSCRIPT_MEETING, audio_transcript=""
    )
    assert result["title"] == "Product Sync Meeting Notes"
    assert result["folder"] == "Meetings"
    assert "productive sync" in result["narrative"]
    assert len(result["tags"]) == 3


@pytest.mark.asyncio
async def test_synthesize_empty_input():
    client = FakeGroqClient(CANNED_SYNTHESIS_RESPONSE)
    result = await synthesize_content(client, MODEL, text_input="", audio_transcript="")
    assert result["title"] == "Empty Note"
    assert result["narrative"] == ""


@pytest.mark.asyncio
async def test_synthesize_json_fail():
    client = FakeGroqClient("not json")
    result = await synthesize_content(
        client, MODEL, text_input="my notes here", audio_transcript=""
    )
    assert result["narrative"] == "my notes here"
    assert result["title"] == "Voice Note"


@pytest.mark.asyncio
async def test_synthesize_client_error():
    client = FakeErrorClient()
    with pytest.raises(ExternalServiceError):
        await synthesize_content(
            client, MODEL, text_input="some text", audio_transcript=""
        )


# -- comprehensive_synthesize --

@pytest.mark.asyncio
async def test_comprehensive_happy_path():
    client = FakeGroqClient(CANNED_SYNTHESIS_RESPONSE)
    history = [
        {"type": "text", "content": "first part"},
        {"type": "audio", "content": "second part"},
    ]
    result = await comprehensive_synthesize(
        client, MODEL, text_input=TRANSCRIPT_MEETING,
        audio_transcript="", input_history=history,
    )
    assert result["title"] == "Product Sync Meeting Notes"
    assert result["narrative"] != ""


# -- resynthesize_content --

@pytest.mark.asyncio
async def test_resynthesize_separates_types():
    client = FakeGroqClient(CANNED_SYNTHESIS_RESPONSE)
    history = [
        {"type": "text", "content": "typed part one"},
        {"type": "audio", "content": "spoken part"},
        {"type": "text", "content": "typed part two"},
    ]
    result = await resynthesize_content(
        client, MODEL, history, comprehensive=True,
    )
    assert result["title"] == "Product Sync Meeting Notes"


@pytest.mark.asyncio
async def test_resynthesize_mock_fallback():
    history = [
        {"type": "text", "content": "hello"},
        {"type": "audio", "content": "world"},
    ]
    result = await resynthesize_content(
        client=None, model=MODEL, input_history=history,
        mock_synthesis_fn=mock_synthesis,
    )
    assert "hello" in result["narrative"]
    assert "world" in result["narrative"]


# -- should_force_resynthesize --

def test_force_resynth_large_content():
    existing = " ".join(["word"] * 100)  # 100 words
    new = " ".join(["word"] * 60)  # 60 words, > 50% of 100
    should, reason = should_force_resynthesize(existing, new, [])
    assert should is True
    assert "substantial" in reason.lower()


def test_force_resynth_many_inputs():
    existing = " ".join(["word"] * 200)
    new = "short"
    history = [{"content": "x"} for _ in range(5)]  # 5+ inputs
    should, reason = should_force_resynthesize(existing, new, history)
    assert should is True
    assert "fragmented" in reason.lower()


def test_force_resynth_short_existing():
    existing = "Very short note."  # < 50 words
    new = "x"  # Tiny, so ratio check won't trigger first
    should, reason = should_force_resynthesize(existing, new, [])
    assert should is True
    assert "short" in reason.lower()


def test_force_resynth_no_trigger():
    existing = " ".join(["word"] * 200)  # 200 words
    new = " ".join(["word"] * 30)  # 30 words, < 50% of 200
    history = [{"content": "x"}, {"content": "y"}, {"content": "z"}]  # 3 inputs
    should, reason = should_force_resynthesize(existing, new, history)
    assert should is False
    assert reason is None


# -- smart_synthesize --

@pytest.mark.asyncio
async def test_smart_synthesize_happy_path():
    client = FakeGroqClient(CANNED_SMART_SYNTHESIS_RESPONSE)
    existing = " ".join(["word"] * 200)
    new = " ".join(["word"] * 30)
    result = await smart_synthesize(
        client, MODEL,
        new_content=new,
        existing_narrative=existing,
        existing_title="Test Note",
        existing_summary="Test summary",
        input_history=[
            {"type": "text", "content": existing},
            {"type": "text", "content": new},
        ],
    )
    assert result["decision"]["update_type"] == "append"
    assert result["decision"]["confidence"] == 0.85
    assert "result" in result
    assert "narrative" in result["result"]
