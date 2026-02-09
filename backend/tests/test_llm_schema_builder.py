"""Tests for app.services.llm.schema_builder -- pure function tests."""
from app.services.llm.schema_builder import (
    build_user_context_string,
    build_messages,
    build_json_schema,
)


# -- build_user_context_string --

def test_build_context_string_full():
    ctx = {"timezone": "US/Pacific", "current_date": "2025-01-15"}
    folders = ["Work", "Personal"]
    result = build_user_context_string(ctx, folders)
    assert "US/Pacific" in result
    assert "2025-01-15" in result
    assert "Work, Personal" in result


def test_build_context_string_defaults():
    ctx = {"other_key": "value"}
    folders = ["Design"]
    result = build_user_context_string(ctx, folders)
    assert "America/Chicago" in result
    assert "today" in result


def test_build_context_string_none():
    result = build_user_context_string(None, ["Work"])
    assert result == ""


# -- build_messages --

def test_build_messages_structure():
    msgs = build_messages("system text", "user text")
    assert len(msgs) == 2
    assert msgs[0] == {"role": "system", "content": "system text"}
    assert msgs[1] == {"role": "user", "content": "user text"}


# -- build_json_schema --

def test_schema_default_flags():
    schema = build_json_schema(["Work", "Personal"])
    assert "title" in schema
    assert "folder" in schema
    assert "tags" in schema
    assert "format_signals" in schema
    assert "related_entities" in schema
    # Defaults: no narrative, no decision
    assert "narrative" not in schema
    assert "update_type" not in schema


def test_schema_with_narrative():
    schema = build_json_schema(["Work"], include_narrative=True)
    assert "narrative" in schema


def test_schema_with_decision():
    schema = build_json_schema(["Work"], include_decision=True)
    assert "decision" in schema
    assert "update_type" in schema


def test_schema_folder_names():
    schema = build_json_schema(["CustomFolder", "AnotherFolder"])
    assert "CustomFolder" in schema
    assert "AnotherFolder" in schema
