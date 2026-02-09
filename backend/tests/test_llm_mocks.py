"""Tests for app.services.llm.mocks -- standalone mock function tests."""
from app.schemas.voice_schemas import ActionExtractionResult
from app.services.llm.mocks import (
    mock_extraction,
    mock_synthesis,
    mock_smart_synthesis,
)

from tests.llm_helpers import TRANSCRIPT_MEETING


# -- mock_extraction --

def test_mock_extraction_title_long():
    result = mock_extraction(TRANSCRIPT_MEETING)
    words = TRANSCRIPT_MEETING.split()[:10]
    expected_title = " ".join(words) + "..."
    assert result.title == expected_title


def test_mock_extraction_title_short():
    result = mock_extraction("Buy milk")
    assert result.title == "Buy milk"
    assert "..." not in result.title


def test_mock_extraction_empty_timestamp():
    result = mock_extraction("")
    assert result.title.startswith("Voice Note - ")


def test_mock_extraction_type():
    result = mock_extraction("Some text")
    assert isinstance(result, ActionExtractionResult)


def test_mock_extraction_folder():
    result = mock_extraction("Some text")
    assert result.folder == "Personal"


def test_mock_extraction_empty_actions():
    result = mock_extraction(TRANSCRIPT_MEETING)
    assert result.calendar == []
    assert result.email == []
    assert result.reminders == []
    assert result.next_steps == []


# -- mock_synthesis --

def test_mock_synthesis_text_and_audio():
    result = mock_synthesis("combined", "typed text", "spoken audio")
    assert result["narrative"] == "typed text\n\nspoken audio"


def test_mock_synthesis_text_only():
    result = mock_synthesis("typed text", "typed text", "")
    assert result["narrative"] == "typed text"


def test_mock_synthesis_audio_only():
    result = mock_synthesis("spoken audio", "", "spoken audio")
    assert result["narrative"] == "spoken audio"


def test_mock_synthesis_all_keys():
    result = mock_synthesis("test", "test", "")
    expected_keys = {
        "narrative", "title", "folder", "tags", "summary",
        "type_detection", "related_entities", "open_loops",
        "calendar", "email", "reminders", "next_steps",
    }
    assert expected_keys == set(result.keys())


# -- mock_smart_synthesis --

def test_mock_smart_short_appends():
    result = mock_smart_synthesis(
        new_content="Quick update on the meeting",
        existing_narrative="Original meeting notes go here.",
        existing_title="Meeting Notes",
        input_history=[{"type": "audio", "content": "Original meeting notes go here."}],
    )
    assert result["decision"]["update_type"] == "append"
    assert result["result"]["narrative"].endswith("Quick update on the meeting")


def test_mock_smart_long_resynthesizes():
    long_content = " ".join(["word"] * 60)  # 60 words, >= 50 threshold
    result = mock_smart_synthesis(
        new_content=long_content,
        existing_narrative="Short existing note.",
        existing_title="Notes",
        input_history=[
            {"type": "audio", "content": "Short existing note."},
            {"type": "audio", "content": long_content},
        ],
    )
    assert result["decision"]["update_type"] == "resynthesize"
