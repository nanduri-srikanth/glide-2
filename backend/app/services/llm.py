"""LLM service using Groq for fast action extraction."""
import json
from datetime import datetime
from typing import Optional

from app.config import get_settings
from app.core.errors import ExternalServiceError
from app.schemas.voice_schemas import ActionExtractionResult


class LLMService:
    """Service for AI-powered action extraction using Groq LLM."""

    # Groq model to use - llama-3.3-70b-versatile for best quality
    MODEL = "llama-3.3-70b-versatile"

    def __init__(self):
        settings = get_settings()
        self.client = None

        if settings.groq_api_key:
            from groq import Groq
            self.client = Groq(api_key=settings.groq_api_key)

    async def extract_actions(
        self,
        transcript: str,
        user_context: Optional[dict] = None
    ) -> ActionExtractionResult:
        """
        Analyze transcript and extract actionable items using Groq LLM.

        Args:
            transcript: The transcribed text from voice memo
            user_context: Optional context about the user (timezone, preferences)

        Returns:
            ActionExtractionResult with structured actions
        """
        # Return mock response when API key not configured (local dev mode)
        if not self.client:
            return self._mock_extraction(transcript)

        # Get user's folders or use defaults
        folders_list = ['Work', 'Personal', 'Ideas', 'Meetings', 'Projects']
        if user_context and user_context.get('folders'):
            folders_list = user_context.get('folders')
        folders_str = '|'.join(folders_list)

        context_str = ""
        if user_context:
            context_str = f"""
User context:
- Timezone: {user_context.get('timezone', 'America/Chicago')}
- Current date: {user_context.get('current_date', 'today')}
- Your folders: {', '.join(folders_list)}
"""

        prompt = f"""Analyze this voice memo transcript and extract actionable items.

Transcript:
{transcript}

{context_str}

## FIELD DEFINITIONS

**summary** (card preview)
- 2-4 sentence preview for note card/list view
- Captures essence without opening the note
- Think: "What would I want to see in a notification?"

## SUMMARY INSTRUCTIONS
This is YOUR note—write it as a refined version of your own thoughts, not an observer's description.

### Step 1: Detect the Note Type
First, identify what kind of note this is and return type detection metadata:

**MEETING** — Discussion with others, decisions made, follow-ups needed
**BRAINSTORM** — Exploring ideas, possibilities, creative thinking
**TASKS** — List of things to do, errands, action items
**PLANNING** — Strategy, goals, weighing options, making decisions
**REFLECTION** — Personal thoughts, processing feelings, journaling
**TECHNICAL** — Problem-solving, debugging, implementation details
**QUICK_NOTE** — Brief reminder or single thought

Notes can be HYBRID (e.g., PLANNING + TASKS, MEETING + TASKS):
- If content fits multiple types, identify primary_type and secondary_type
- Use hybrid_format: true to blend formatting approaches

### Step 2: Format According to Type

**MEETING format:**
## Context
Who, what, when — one line

## Key Points
- Main discussion topics as bullets
- Decisions made (prefix with ✓)
- Concerns raised

## Follow-ups
What needs to happen next (captured as reminders separately)

**BRAINSTORM format:**
## The Idea
Core concept in 1-2 sentences

## Exploration
Natural prose exploring the idea, connections, possibilities.

## Open Questions
- Unresolved aspects to think through

**TASKS format:**
## Overview
What this batch of tasks is about

## Tasks
- [ ] Task 1
- [ ] Task 2
(Individual tasks also captured as reminders)

**PLANNING format:**
## Goal
What I'm trying to achieve

## Options Considered
**Option A:** description, pros/cons

## Decision / Next Step
What I decided or need to decide

**REFLECTION format:**
Natural flowing prose. Preserve emotional context. No forced structure.

**TECHNICAL format:**
## Problem / ## Approach / ## Details / ## Status

**QUICK_NOTE format:**
Just the essential info, 2-4 sentences. No headers needed.

### Voice & Tone
- Match the original register (casual, professional, frustrated, excited)
- First-person where natural
- Preserve personality—don't sanitize or formalize

### Comprehensiveness
- Capture specifics: names, numbers, dates, exact phrasing
- Include reasoning, not just conclusions
- Note uncertainties: *[unclear: audio garbled here]*

## ACTION EXTRACTION — Intent-Based Classification

For each statement or thought, classify the underlying intent:

### Intent Types:

**COMMITMENT_TO_SELF**
- Signals: "I need to", "I should", "gotta", "have to", "want to", "planning to"
- → Creates: Reminder

**COMMITMENT_TO_OTHER**
- Signals: "I'll send", "let them know", "loop in", "update X", "get back to", "follow up with"
- Also catches: Any communication obligation, even without "email" keyword
- → Creates: Email draft OR Reminder

**TIME_BINDING**
- Signals: Any date, time, day reference ("Tuesday", "3pm", "next week", "by Friday")
- Combined with people: → Calendar event
- Combined with task: → Reminder with due date

**DELEGATION**
- Signals: "Ask X to", "have X do", "X needs to", "waiting on X"
- → Creates: Reminder with context about the delegation

**OPEN_LOOP**
- Signals: "need to figure out", "not sure yet", "have to research", unresolved questions
- → Creates: Entry in open_loops array (NOT a reminder unless explicitly actionable)

### Classification Rules:
1. One statement can have MULTIPLE intents
2. Implicit > Explicit ("loop in the team" = Email without "email" keyword)
3. Extract EVERY actionable item separately (5 items = 5 reminders)
4. Preserve context in action titles ("Email Sarah re: Q3 deck" not just "Email Sarah")
5. Distinguish actions from open loops - don't create reminders for unresolved questions

Extract and return ONLY valid JSON (no markdown, no explanation) with this exact structure:
{{
  "type_detection": {{
    "primary_type": "PLANNING | MEETING | BRAINSTORM | TASKS | REFLECTION | TECHNICAL | QUICK_NOTE",
    "secondary_type": "same options or null",
    "confidence": 0.0-1.0,
    "hybrid_format": true | false,
    "classification_hints": {{
      "considered_types": ["TYPE1", "TYPE2"],
      "ambiguity_note": "string if confidence < 0.8, otherwise null"
    }}
  }},
  "title": "Brief descriptive title for this note (5-10 words max)",
  "folder": "{folders_str}",
  "tags": ["relevant", "tags", "max5"],
  "summary": "2-4 sentence card preview - match user's tone",
  "related_entities": {{
    "people": ["names mentioned"],
    "projects": ["project names"],
    "companies": ["company names"],
    "concepts": ["key concepts"]
  }},
  "open_loops": [
    {{
      "item": "Description of unresolved item",
      "status": "unresolved | question | blocked | deferred",
      "context": "Why this is unresolved"
    }}
  ],
  "calendar": [
    {{
      "title": "Event name",
      "date": "YYYY-MM-DD",
      "time": "HH:MM (24hr, optional)",
      "location": "optional location",
      "attendees": ["optional", "attendees"]
    }}
  ],
  "email": [
    {{
      "to": "email@example.com or descriptive name",
      "subject": "Email subject line",
      "body": "Draft email body content - be professional and complete"
    }}
  ],
  "reminders": [
    {{
      "title": "Clear, actionable reminder text WITH CONTEXT",
      "due_date": "YYYY-MM-DD",
      "due_time": "HH:MM (optional)",
      "priority": "low|medium|high",
      "intent_source": "COMMITMENT_TO_SELF | COMMITMENT_TO_OTHER | TIME_BINDING | DELEGATION"
    }}
  ]
}}

Rules:
1. Only extract Calendar, Email, and Reminder actions - nothing else
2. Be thorough - if someone lists multiple items, create a reminder for EACH item
3. Use realistic dates based on context (if "next Tuesday" is mentioned, calculate the actual date)
4. For emails, draft complete professional content with greeting and sign-off placeholder
5. For reminders, make titles clear and actionable WITH CONTEXT
6. Categorize into the most appropriate folder
7. Extract 2-5 relevant tags
8. If no actions of a type are found, use empty array []
9. Capture open loops separately - don't create reminders for unresolved questions
10. Return ONLY the JSON object, nothing else"""

        try:
            response = self.client.chat.completions.create(
                model=self.MODEL,
                max_tokens=2000,
                response_format={"type": "json_object"},
                messages=[{"role": "user", "content": prompt}],
            )
        except Exception as e:
            raise ExternalServiceError(service="llm", message=f"Groq LLM request failed: {e}") from e

        # Parse JSON response
        response_text = response.choices[0].message.content.strip()

        # Handle potential markdown code blocks
        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]
            response_text = response_text.strip()

        try:
            data = json.loads(response_text)
        except json.JSONDecodeError:
            # Fallback if JSON parsing fails
            return ActionExtractionResult(
                title="Voice Note",
                folder="Personal",
                tags=[],
                summary=transcript[:200] + "..." if len(transcript) > 200 else transcript,
                calendar=[],
                email=[],
                reminders=[],
                next_steps=[],
            )

        return ActionExtractionResult(
            title=data.get("title", "Voice Note"),
            folder=data.get("folder", "Personal"),
            tags=data.get("tags", [])[:5],  # Limit to 5 tags
            summary=data.get("summary"),
            type_detection=data.get("type_detection"),
            related_entities=data.get("related_entities"),
            open_loops=data.get("open_loops", []),
            calendar=data.get("calendar", []),
            email=data.get("email", []),
            reminders=data.get("reminders", []),
            next_steps=[],  # Deprecated - no longer extracting next_steps
        )

    def _mock_extraction(self, transcript: str) -> ActionExtractionResult:
        """Return mock extraction result for local dev (no API key)."""
        # Generate a simple title from the transcript
        words = transcript.split()[:10]
        title = " ".join(words) + ("..." if len(transcript.split()) > 10 else "")
        if not title.strip():
            title = f"Voice Note - {datetime.utcnow().strftime('%b %d, %Y %I:%M %p')}"

        # Create a summary from the first 200 chars
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

    async def extract_actions_for_append(
        self,
        new_transcript: str,
        existing_transcript: str,
        existing_title: str,
        user_context: Optional[dict] = None
    ) -> ActionExtractionResult:
        """
        Extract actions from new audio appended to an existing note.
        Designed to avoid duplicating actions already captured in the original note.

        Args:
            new_transcript: The newly transcribed text
            existing_transcript: The existing note's transcript
            existing_title: The existing note's title
            user_context: Optional context about the user

        Returns:
            ActionExtractionResult with only NEW actions
        """
        # Return mock response when API key not configured
        if not self.client:
            return self._mock_extraction(new_transcript)

        context_str = ""
        if user_context:
            context_str = f"""
User context:
- Timezone: {user_context.get('timezone', 'America/Chicago')}
- Current date: {user_context.get('current_date', 'today')}
"""

        prompt = f"""You are analyzing ADDITIONAL audio that was recorded and appended to an existing note.
Your task is to extract ONLY NEW actionable items from the new audio that are NOT already covered in the existing note.

EXISTING NOTE TITLE: {existing_title}

EXISTING NOTE TRANSCRIPT:
{existing_transcript}

---

NEW AUDIO TRANSCRIPT (just recorded):
{new_transcript}

{context_str}

## ACTION EXTRACTION — Intent-Based Classification

For each statement or thought in the NEW content, classify the underlying intent:

### Intent Types:

**COMMITMENT_TO_SELF**
- Signals: "I need to", "I should", "gotta", "have to", "want to", "planning to"
- → Creates: Reminder

**COMMITMENT_TO_OTHER**
- Signals: "I'll send", "let them know", "loop in", "update X", "get back to", "follow up with"
- → Creates: Email draft OR Reminder

**TIME_BINDING**
- Signals: Any date, time, day reference
- Combined with people: → Calendar event
- Combined with task: → Reminder with due date

**DELEGATION**
- Signals: "Ask X to", "have X do", "X needs to", "waiting on X"
- → Creates: Reminder with context

### Classification Rules:
1. One statement can have MULTIPLE intents
2. Implicit > Explicit ("loop in the team" = Email without "email" keyword)
3. Extract EVERY actionable item separately
4. Preserve context in action titles

IMPORTANT: Only extract actions from the NEW transcript that are genuinely new additions.
Do NOT duplicate actions that are already implied by the existing transcript.
If the new audio is just a continuation of the same thought with no new actions, return empty arrays.

Extract and return ONLY valid JSON (no markdown, no explanation) with this exact structure:
{{
  "title": "{existing_title}",
  "folder": "Keep the same folder",
  "tags": ["any", "new", "tags", "only"],
  "summary": "Brief summary of what NEW information was added",
  "calendar": [
    {{
      "title": "NEW Event name",
      "date": "YYYY-MM-DD",
      "time": "HH:MM (24hr, optional)",
      "location": "optional location",
      "attendees": ["optional", "attendees"]
    }}
  ],
  "email": [
    {{
      "to": "email@example.com or name",
      "subject": "NEW Email subject",
      "body": "Draft email body - complete and professional"
    }}
  ],
  "reminders": [
    {{
      "title": "Clear, actionable reminder text WITH CONTEXT",
      "due_date": "YYYY-MM-DD",
      "due_time": "HH:MM (optional)",
      "priority": "low|medium|high",
      "intent_source": "COMMITMENT_TO_SELF | COMMITMENT_TO_OTHER | TIME_BINDING | DELEGATION"
    }}
  ]
}}

Rules:
1. Only extract Calendar, Email, and Reminder actions - nothing else
2. ONLY include actions explicitly mentioned in the NEW transcript
3. Do NOT duplicate any actions implied by the existing transcript
4. If someone lists multiple items, create a reminder for EACH item
5. If no new actions are found, use empty arrays []
6. The title should remain the same as the existing title
7. Only add new tags that are relevant to the new content
8. Return ONLY the JSON object, nothing else"""

        try:
            response = self.client.chat.completions.create(
                model=self.MODEL,
                max_tokens=2000,
                response_format={"type": "json_object"},
                messages=[{"role": "user", "content": prompt}],
            )
        except Exception as e:
            raise ExternalServiceError(service="llm", message=f"Groq LLM request failed: {e}") from e

        # Parse JSON response
        response_text = response.choices[0].message.content.strip()

        # Handle potential markdown code blocks
        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]
            response_text = response_text.strip()

        try:
            data = json.loads(response_text)
        except json.JSONDecodeError:
            # Fallback if JSON parsing fails - return empty actions
            return ActionExtractionResult(
                title=existing_title,
                folder="Personal",
                tags=[],
                summary=f"Added: {new_transcript[:100]}..." if len(new_transcript) > 100 else f"Added: {new_transcript}",
                calendar=[],
                email=[],
                reminders=[],
                next_steps=[],
            )

        return ActionExtractionResult(
            title=data.get("title", existing_title),
            folder=data.get("folder", "Personal"),
            tags=data.get("tags", [])[:5],
            summary=data.get("summary"),
            calendar=data.get("calendar", []),
            email=data.get("email", []),
            reminders=data.get("reminders", []),
            next_steps=[],  # Deprecated - no longer extracting next_steps
        )

    async def generate_email_draft(
        self,
        context: str,
        recipient: str,
        purpose: str
    ) -> dict:
        """
        Generate a polished email draft based on context.

        Args:
            context: Context from the voice memo
            recipient: Who the email is for
            purpose: Purpose of the email

        Returns:
            dict with subject and body
        """
        # Return mock response when API key not configured
        if not self.client:
            return {
                "subject": f"Re: {purpose}",
                "body": f"[AI draft unavailable - connect Groq API]\n\nContext: {context[:200]}..."
            }

        prompt = f"""Generate a professional email draft.

Context from voice memo: {context}
Recipient: {recipient}
Purpose: {purpose}

Return JSON with:
{{
  "subject": "Email subject line",
  "body": "Full email body with proper greeting and signature placeholder"
}}

Return ONLY valid JSON."""

        try:
            response = self.client.chat.completions.create(
                model=self.MODEL,
                max_tokens=1000,
                response_format={"type": "json_object"},
                messages=[{"role": "user", "content": prompt}],
            )
        except Exception as e:
            raise ExternalServiceError(service="llm", message=f"Groq LLM request failed: {e}") from e

        response_text = response.choices[0].message.content.strip()
        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]
            response_text = response_text.strip()

        return json.loads(response_text)

    async def synthesize_content(
        self,
        text_input: str = "",
        audio_transcript: str = "",
        user_context: Optional[dict] = None
    ) -> dict:
        """
        Synthesize text input and audio transcription into a cohesive narrative.

        Args:
            text_input: User's typed text
            audio_transcript: Transcribed audio content
            user_context: Optional context about the user

        Returns:
            dict with narrative, title, folder, tags, summary, and extracted actions
        """
        # Combine inputs for context
        combined_content = ""
        if text_input and audio_transcript:
            combined_content = f"TYPED TEXT:\n{text_input}\n\nSPOKEN AUDIO:\n{audio_transcript}"
        elif text_input:
            combined_content = text_input
        elif audio_transcript:
            combined_content = audio_transcript
        else:
            # No content provided
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

        # Return mock response when API key not configured
        if not self.client:
            return self._mock_synthesis(combined_content, text_input, audio_transcript)

        # Get user's folders or use defaults
        folders_list = ['Work', 'Personal', 'Ideas', 'Meetings', 'Projects']
        if user_context and user_context.get('folders'):
            folders_list = user_context.get('folders')
        folders_str = '|'.join(folders_list)

        context_str = ""
        if user_context:
            context_str = f"""
User context:
- Timezone: {user_context.get('timezone', 'America/Chicago')}
- Current date: {user_context.get('current_date', 'today')}
- Your folders: {', '.join(folders_list)}
"""

        prompt = f"""You are helping synthesize a user's thoughts into a cohesive note.
The user may have provided TYPED TEXT and/or SPOKEN AUDIO (transcribed).
Your job is to merge these into ONE coherent narrative that flows naturally.

{combined_content}

{context_str}

## FIELD DEFINITIONS

**narrative** (full content)
- The complete, formatted note content
- What the user reads when they open the note
- Comprehensive — nothing important omitted

**summary** (card preview)
- 2-4 sentence preview for note card/list view
- Captures essence without opening the note
- Always much shorter than narrative

## NARRATIVE & SUMMARY INSTRUCTIONS
This is YOUR note—write as a refined version of your own thinking, not a third-party description.

### Step 1: Detect the Note Type
First, identify what kind of note this is and return type detection metadata:

**MEETING** — Discussion with others, decisions made, follow-ups needed
**BRAINSTORM** — Exploring ideas, possibilities, creative thinking
**TASKS** — List of things to do, errands, action items
**PLANNING** — Strategy, goals, weighing options, making decisions
**REFLECTION** — Personal thoughts, processing feelings, journaling
**TECHNICAL** — Problem-solving, debugging, implementation details
**QUICK_NOTE** — Brief reminder or single thought

Notes can be HYBRID (e.g., PLANNING + TASKS, MEETING + TASKS):
- If content fits multiple types, identify primary_type and secondary_type
- Use hybrid_format: true to blend formatting approaches

### Step 2: Format the Narrative According to Type

**MEETING format:** ## Context / ## Key Points / ## Follow-ups
**BRAINSTORM format:** ## The Idea / ## Exploration / ## Open Questions
**TASKS format:** ## Overview / ## Tasks (checkboxes)
**PLANNING format:** ## Goal / ## Options Considered / ## Decision
**REFLECTION format:** Natural flowing prose, no headers
**TECHNICAL format:** ## Problem / ## Approach / ## Details / ## Status
**QUICK_NOTE format:** 2-4 sentences, no headers

### Voice & Tone
- Match the original register (casual, professional, frustrated, excited)
- First-person where natural
- Preserve personality—don't sanitize or formalize

## NARRATIVE RULES
1. Create a single, cohesive narrative that integrates both inputs naturally
2. Do NOT separate "typed" vs "spoken" - merge them into one flowing text
3. Fix grammar, remove filler words, but PRESERVE the user's voice and intent

## ACTION EXTRACTION — Intent-Based Classification

For each statement or thought, classify the underlying intent:

### Intent Types:

**COMMITMENT_TO_SELF**
- Signals: "I need to", "I should", "gotta", "have to", "want to"
- → Creates: Reminder

**COMMITMENT_TO_OTHER**
- Signals: "I'll send", "let them know", "loop in", "update X", "follow up with"
- → Creates: Email draft OR Reminder

**TIME_BINDING**
- Signals: Any date, time, day reference
- Combined with people: → Calendar event
- Combined with task: → Reminder with due date

**DELEGATION**
- Signals: "Ask X to", "have X do", "waiting on X"
- → Creates: Reminder with context

**OPEN_LOOP**
- Signals: "need to figure out", "not sure yet", unresolved questions
- → Creates: Entry in open_loops array (NOT a reminder)

### Classification Rules:
1. One statement can have MULTIPLE intents
2. Implicit > Explicit ("loop in the team" = Email)
3. Extract EVERY actionable item separately
4. Preserve context in action titles
5. Distinguish actions from open loops

Return ONLY valid JSON (no markdown, no explanation) with this exact structure:
{{
  "type_detection": {{
    "primary_type": "PLANNING | MEETING | BRAINSTORM | TASKS | REFLECTION | TECHNICAL | QUICK_NOTE",
    "secondary_type": "same options or null",
    "confidence": 0.0-1.0,
    "hybrid_format": true | false,
    "classification_hints": {{
      "considered_types": ["TYPE1", "TYPE2"],
      "ambiguity_note": "string if confidence < 0.8, otherwise null"
    }}
  }},
  "narrative": "The synthesized, cohesive narrative combining all inputs - preserve user's voice",
  "title": "Brief descriptive title for this note (5-10 words max)",
  "folder": "{folders_str}",
  "tags": ["relevant", "tags", "max5"],
  "summary": "2-4 sentence card preview - NOT the full narrative",
  "related_entities": {{
    "people": ["names mentioned"],
    "projects": ["project names"],
    "companies": ["company names"],
    "concepts": ["key concepts"]
  }},
  "open_loops": [
    {{
      "item": "Description of unresolved item",
      "status": "unresolved | question | blocked | deferred",
      "context": "Why this is unresolved"
    }}
  ],
  "calendar": [
    {{
      "title": "Event name",
      "date": "YYYY-MM-DD",
      "time": "HH:MM (24hr, optional)",
      "location": "optional location",
      "attendees": ["optional", "attendees"]
    }}
  ],
  "email": [
    {{
      "to": "email@example.com or descriptive name",
      "subject": "Email subject line",
      "body": "Draft email body content - complete and professional"
    }}
  ],
  "reminders": [
    {{
      "title": "Clear, actionable reminder text WITH CONTEXT",
      "due_date": "YYYY-MM-DD",
      "due_time": "HH:MM (optional)",
      "priority": "low|medium|high",
      "intent_source": "COMMITMENT_TO_SELF | COMMITMENT_TO_OTHER | TIME_BINDING | DELEGATION"
    }}
  ]
}}

Rules:
1. The narrative should read as ONE cohesive piece, not sections
2. Only extract Calendar, Email, and Reminder actions - nothing else
3. Be thorough with reminders - if someone lists 5 items, create 5 reminders
4. Use realistic dates based on context
5. If no actions of a type are found, use empty array []
6. Capture open loops separately from actions
7. Return ONLY the JSON object, nothing else"""

        try:
            response = self.client.chat.completions.create(
                model=self.MODEL,
                max_tokens=3000,
                response_format={"type": "json_object"},
                messages=[{"role": "user", "content": prompt}],
            )
        except Exception as e:
            raise ExternalServiceError(service="llm", message=f"Groq LLM request failed: {e}") from e

        # Parse JSON response
        response_text = response.choices[0].message.content.strip()

        # Handle potential markdown code blocks
        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]
            response_text = response_text.strip()

        try:
            data = json.loads(response_text)
        except json.JSONDecodeError:
            # Fallback if JSON parsing fails
            return {
                "narrative": combined_content,
                "title": "Voice Note",
                "folder": "Personal",
                "tags": [],
                "summary": combined_content[:200] + "..." if len(combined_content) > 200 else combined_content,
                "type_detection": None,
                "related_entities": None,
                "open_loops": [],
                "calendar": [],
                "email": [],
                "reminders": [],
                "next_steps": [],
            }

        return {
            "narrative": data.get("narrative", combined_content),
            "title": data.get("title", "Voice Note"),
            "folder": data.get("folder", "Personal"),
            "tags": data.get("tags", [])[:5],
            "summary": data.get("summary"),
            "type_detection": data.get("type_detection"),
            "related_entities": data.get("related_entities"),
            "open_loops": data.get("open_loops", []),
            "calendar": data.get("calendar", []),
            "email": data.get("email", []),
            "reminders": data.get("reminders", []),
            "next_steps": [],  # Deprecated
        }

    def _mock_synthesis(self, combined: str, text: str, audio: str) -> dict:
        """Return mock synthesis result for local dev (no API key)."""
        # Use combined content as narrative
        narrative = combined
        if text and audio:
            narrative = f"{text}\n\n{audio}"
        elif text:
            narrative = text
        elif audio:
            narrative = audio

        # Generate title from first line
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

    async def summarize_new_content(
        self,
        new_transcript: str,
        existing_title: str,
        user_context: Optional[dict] = None
    ) -> dict:
        """
        Summarize new content in isolation for appending to an existing note.
        Creates a well-structured summary of just the new content without
        merging with existing content.

        Args:
            new_transcript: The newly transcribed audio content
            existing_title: The title of the existing note for context
            user_context: Optional context about the user

        Returns:
            dict with summary, tags, and extracted actions from new content only
        """
        # Return mock response when API key not configured
        if not self.client:
            return {
                "summary": new_transcript[:300] + "..." if len(new_transcript) > 300 else new_transcript,
                "tags": [],
                "calendar": [],
                "email": [],
                "reminders": [],
            }

        context_str = ""
        if user_context:
            context_str = f"""
User context:
- Timezone: {user_context.get('timezone', 'America/Chicago')}
- Current date: {user_context.get('current_date', 'today')}
"""

        prompt = f"""You are summarizing NEW CONTENT being added to an existing note.
This is an addition/update to the note titled: "{existing_title}"

NEW AUDIO TRANSCRIPT:
{new_transcript}

{context_str}

## TASK
Create a well-structured summary of ONLY this new content. This will be appended
to the existing note as a new section.

## FORMATTING GUIDELINES
- Write in first-person, preserving the speaker's voice
- Use markdown formatting where appropriate (headers, bullets, bold)
- Capture ALL specific details: names, numbers, dates, exact phrasing
- Include reasoning and context, not just bare facts
- Match the tone of the original (casual, professional, etc.)
- If this is a continuation of thoughts, frame it as an update/addition

## LENGTH GUIDELINES
- For short additions (< 30 seconds): 2-4 sentences
- For medium additions (30s - 2min): 1-2 paragraphs with bullets if needed
- For longer additions (> 2min): Multiple paragraphs, use headers if topics shift

## ACTION EXTRACTION — Intent-Based Classification

For each statement or thought, classify the underlying intent:

### Intent Types:

**COMMITMENT_TO_SELF** → Reminder
- Signals: "I need to", "I should", "gotta", "have to"

**COMMITMENT_TO_OTHER** → Email/Reminder
- Signals: "I'll send", "let them know", "loop in", "follow up with"

**TIME_BINDING** → Calendar/Reminder with date
- Signals: Any date, time, day reference

**DELEGATION** → Reminder with context
- Signals: "Ask X to", "have X do", "waiting on X"

### Classification Rules:
1. One statement can have MULTIPLE intents
2. Implicit > Explicit ("loop in the team" = Email)
3. Extract EVERY actionable item separately
4. Preserve context in action titles

Return ONLY valid JSON:
{{
  "summary": "Well-structured summary of the new content - comprehensive but focused",
  "tags": ["new", "relevant", "tags"],
  "calendar": [
    {{
      "title": "Event name",
      "date": "YYYY-MM-DD",
      "time": "HH:MM (optional)",
      "location": "optional",
      "attendees": []
    }}
  ],
  "email": [
    {{
      "to": "recipient",
      "subject": "Subject",
      "body": "Draft body"
    }}
  ],
  "reminders": [
    {{
      "title": "Task description WITH CONTEXT",
      "due_date": "YYYY-MM-DD",
      "due_time": "HH:MM (optional)",
      "priority": "low|medium|high",
      "intent_source": "COMMITMENT_TO_SELF | COMMITMENT_TO_OTHER | TIME_BINDING | DELEGATION"
    }}
  ]
}}"""

        try:
            response = self.client.chat.completions.create(
                model=self.MODEL,
                max_tokens=2000,
                response_format={"type": "json_object"},
                messages=[{"role": "user", "content": prompt}],
            )
        except Exception as e:
            raise ExternalServiceError(service="llm", message=f"Groq LLM request failed: {e}") from e

        response_text = response.choices[0].message.content.strip()

        # Handle potential markdown code blocks
        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]
            response_text = response_text.strip()

        try:
            data = json.loads(response_text)
            return {
                "summary": data.get("summary", new_transcript),
                "tags": data.get("tags", [])[:5],
                "calendar": data.get("calendar", []),
                "email": data.get("email", []),
                "reminders": data.get("reminders", []),
            }
        except json.JSONDecodeError:
            return {
                "summary": new_transcript[:300] + "..." if len(new_transcript) > 300 else new_transcript,
                "tags": [],
                "calendar": [],
                "email": [],
                "reminders": [],
            }

    async def resynthesize_content(
        self,
        input_history: list,
        user_context: Optional[dict] = None,
        comprehensive: bool = True
    ) -> dict:
        """
        Re-synthesize content from a history of inputs.
        Creates a COMPREHENSIVE narrative that preserves all information.

        Args:
            input_history: List of InputHistoryEntry-like dicts with type and content
            user_context: Optional context about the user
            comprehensive: If True (default), creates longer summaries to avoid info loss

        Returns:
            dict with narrative, title, folder, tags, summary, and extracted actions
        """
        # Combine all inputs in chronological order
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
            return await self.comprehensive_synthesize(text_input, audio_transcript, input_history, user_context)
        else:
            return await self.synthesize_content(text_input, audio_transcript, user_context)

    async def comprehensive_synthesize(
        self,
        text_input: str,
        audio_transcript: str,
        input_history: list,
        user_context: Optional[dict] = None
    ) -> dict:
        """
        Create a COMPREHENSIVE synthesis that preserves ALL information.
        Designed for re-synthesis where we want to avoid information loss.

        The output will be longer and more detailed than standard synthesis.
        """
        # Combine inputs for context
        combined_content = ""
        if text_input and audio_transcript:
            combined_content = f"TYPED TEXT:\n{text_input}\n\nSPOKEN AUDIO:\n{audio_transcript}"
        elif text_input:
            combined_content = text_input
        elif audio_transcript:
            combined_content = audio_transcript
        else:
            return {
                "narrative": "",
                "title": "Empty Note",
                "folder": "Personal",
                "tags": [],
                "summary": None,
                "calendar": [],
                "email": [],
                "reminders": [],
            }

        # Return mock response when API key not configured
        if not self.client:
            return self._mock_synthesis(combined_content, text_input, audio_transcript)

        # Calculate input count for context
        input_count = len(input_history)
        total_words = len(combined_content.split())

        # Get user's folders or use defaults
        folders_list = ['Work', 'Personal', 'Ideas', 'Meetings', 'Projects']
        if user_context and user_context.get('folders'):
            folders_list = user_context.get('folders')
        folders_str = '|'.join(folders_list)

        context_str = ""
        if user_context:
            context_str = f"""
User context:
- Timezone: {user_context.get('timezone', 'America/Chicago')}
- Current date: {user_context.get('current_date', 'today')}
- Your folders: {', '.join(folders_list)}
"""

        prompt = f"""You are RE-SYNTHESIZING a note from {input_count} separate inputs.
This is a COMPREHENSIVE re-synthesis - your goal is to PRESERVE ALL INFORMATION.

DO NOT CONDENSE OR LOSE DETAILS. The output should be LONGER and MORE DETAILED
than a typical summary. Users are adding to their notes over time and don't want
information loss when re-synthesizing.

INPUTS TO SYNTHESIZE ({total_words} total words):
{combined_content}

{context_str}

## FIELD DEFINITIONS

**narrative** (full content)
- The complete, formatted note content
- Comprehensive — nothing important omitted
- Length scales with input length

**summary** (card preview)
- 2-4 sentence preview for note card/list view
- Always much shorter than narrative

## COMPREHENSIVE SYNTHESIS RULES

1. **PRESERVE EVERYTHING**: Every specific detail, name, number, date, and idea
   from the inputs should be captured in the output.

2. **EXPAND, DON'T CONDENSE**: If the input is 500 words, the narrative should
   be 400-600 words, NOT 100 words. Match or exceed input length.

3. **ORGANIZE BY THEME**: Group related information together, but include ALL of it.

4. **MAINTAIN CHRONOLOGY**: When relevant, preserve the order information was added.

5. **CAPTURE NUANCE**: Include hedging, uncertainty, alternatives mentioned.

## NOTE TYPE DETECTION
First identify what kind of note this is:
- MEETING — Discussion, decisions, follow-ups
- BRAINSTORM — Ideas, possibilities, exploration
- TASKS — To-do items, errands
- PLANNING — Strategy, goals, options
- REFLECTION — Personal thoughts, journaling
- TECHNICAL — Problem-solving, implementation
- QUICK_NOTE — Brief thoughts

Notes can be HYBRID - identify primary and secondary types if applicable.

## ACTION EXTRACTION — Intent-Based Classification

For each statement or thought, classify the underlying intent:

### Intent Types:

**COMMITMENT_TO_SELF** → Reminder
- Signals: "I need to", "I should", "gotta", "have to"

**COMMITMENT_TO_OTHER** → Email/Reminder
- Signals: "I'll send", "let them know", "loop in", "follow up with"

**TIME_BINDING** → Calendar/Reminder with date
- Signals: Any date, time, day reference

**DELEGATION** → Reminder with context
- Signals: "Ask X to", "have X do", "waiting on X"

**OPEN_LOOP** → Entry in open_loops array
- Signals: "need to figure out", "not sure yet", unresolved questions

### Classification Rules:
1. One statement can have MULTIPLE intents
2. Implicit > Explicit ("loop in the team" = Email)
3. Extract EVERY actionable item separately
4. Preserve context in action titles
5. Distinguish actions from open loops

Return ONLY valid JSON:
{{
  "narrative": "COMPREHENSIVE narrative preserving ALL details from all inputs - use markdown formatting",
  "title": "Descriptive title (5-10 words)",
  "folder": "{folders_str}",
  "tags": ["relevant", "tags", "up-to-5"],
  "summary": "2-4 sentence card preview - NOT the full narrative",
  "related_entities": {{
    "people": ["names mentioned"],
    "projects": ["project names"],
    "companies": ["company names"],
    "concepts": ["key concepts"]
  }},
  "open_loops": [
    {{
      "item": "Description of unresolved item",
      "status": "unresolved | question | blocked | deferred",
      "context": "Why this is unresolved"
    }}
  ],
  "calendar": [
    {{
      "title": "Event",
      "date": "YYYY-MM-DD",
      "time": "HH:MM (optional)",
      "location": "optional",
      "attendees": []
    }}
  ],
  "email": [
    {{
      "to": "recipient",
      "subject": "Subject",
      "body": "Complete draft"
    }}
  ],
  "reminders": [
    {{
      "title": "Clear, actionable task WITH CONTEXT",
      "due_date": "YYYY-MM-DD",
      "due_time": "HH:MM (optional)",
      "priority": "low|medium|high",
      "intent_source": "COMMITMENT_TO_SELF | COMMITMENT_TO_OTHER | TIME_BINDING | DELEGATION"
    }}
  ]
}}

CRITICAL: The narrative should be COMPREHENSIVE. If 5 items were discussed,
all 5 should appear. If reasoning was given, include the reasoning.
DO NOT summarize away important details."""

        try:
            response = self.client.chat.completions.create(
                model=self.MODEL,
                max_tokens=4000,  # Higher limit for comprehensive output
                response_format={"type": "json_object"},
                messages=[{"role": "user", "content": prompt}],
            )
        except Exception as e:
            raise ExternalServiceError(service="llm", message=f"Groq LLM request failed: {e}") from e

        response_text = response.choices[0].message.content.strip()

        # Handle potential markdown code blocks
        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]
            response_text = response_text.strip()

        try:
            data = json.loads(response_text)
        except json.JSONDecodeError:
            return {
                "narrative": combined_content,
                "title": "Voice Note",
                "folder": "Personal",
                "tags": [],
                "summary": combined_content,
                "type_detection": None,
                "related_entities": None,
                "open_loops": [],
                "calendar": [],
                "email": [],
                "reminders": [],
            }

        return {
            "narrative": data.get("narrative", combined_content),
            "title": data.get("title", "Voice Note"),
            "folder": data.get("folder", "Personal"),
            "tags": data.get("tags", [])[:5],
            "summary": data.get("summary", data.get("narrative", combined_content)),
            "type_detection": data.get("type_detection"),
            "related_entities": data.get("related_entities"),
            "open_loops": data.get("open_loops", []),
            "calendar": data.get("calendar", []),
            "email": data.get("email", []),
            "reminders": data.get("reminders", []),
        }

    def should_force_resynthesize(
        self,
        existing_narrative: str,
        new_content: str,
        input_history: list
    ) -> tuple[bool, str | None]:
        """
        Heuristic pre-checks to determine if we should force a full resynthesize.
        Returns (should_force, reason) tuple.
        """
        existing_len = len(existing_narrative.split())
        new_len = len(new_content.split())

        # Force resynthesize if new content is >50% of existing length
        if existing_len > 0 and new_len > existing_len * 0.5:
            return True, "New content is substantial relative to existing note"

        # Force resynthesize if we have 5+ fragmented inputs
        if len(input_history) >= 5:
            return True, "Multiple fragmented inputs benefit from full synthesis"

        # Force resynthesize if existing note is very short (<50 words)
        if existing_len < 50:
            return True, "Short note benefits from full synthesis"

        return False, None

    async def smart_synthesize(
        self,
        new_content: str,
        existing_narrative: str,
        existing_title: str,
        existing_summary: str | None,
        input_history: list,
        user_context: Optional[dict] = None
    ) -> dict:
        """
        Intelligently decide whether to append or resynthesize, then do it.
        Returns dict with decision info and synthesized result.
        """
        # Check heuristics first
        force_resynth, force_reason = self.should_force_resynthesize(
            existing_narrative, new_content, input_history
        )

        if force_resynth:
            # Add new content to history and do full resynthesize
            result = await self.resynthesize_content(input_history, user_context)
            return {
                "decision": {
                    "update_type": "resynthesize",
                    "confidence": 0.95,
                    "reason": force_reason or "Heuristic check determined resynthesize needed"
                },
                "result": result
            }

        # Return mock response when API key not configured
        if not self.client:
            return self._mock_smart_synthesis(
                new_content, existing_narrative, existing_title, input_history
            )

        context_str = ""
        if user_context:
            context_str = f"""
User context:
- Timezone: {user_context.get('timezone', 'America/Chicago')}
- Current date: {user_context.get('current_date', 'today')}
"""

        prompt = f"""You are helping update an existing note with new content.
Analyze the existing note and new content, then decide the best update strategy.

EXISTING NOTE:
Title: {existing_title}
Content: {existing_narrative}
Summary: {existing_summary or 'None'}

NEW CONTENT TO ADD:
{new_content}

{context_str}

## FIELD DEFINITIONS

**narrative** (full content)
- The complete, formatted note content
- Comprehensive — nothing important omitted

**summary** (card preview)
- 2-4 sentence preview for note card/list view
- Always much shorter than narrative

DECISION CRITERIA:
- Choose RESYNTHESIZE if:
  * New content contradicts or corrects existing content
  * Topic has shifted significantly
  * New content changes the meaning/intent of the note
  * Major updates that change >30% of the content meaning
- Choose APPEND if:
  * New content is purely additive (new details, additions)
  * Same topic, no contradictions
  * Just expanding on existing points

## ACTION EXTRACTION — Intent-Based Classification

For each statement or thought, classify the underlying intent:

### Intent Types:

**COMMITMENT_TO_SELF** → Reminder
- Signals: "I need to", "I should", "gotta", "have to"

**COMMITMENT_TO_OTHER** → Email/Reminder
- Signals: "I'll send", "let them know", "loop in", "follow up with"

**TIME_BINDING** → Calendar/Reminder with date
- Signals: Any date, time, day reference

**DELEGATION** → Reminder with context
- Signals: "Ask X to", "have X do", "waiting on X"

### Classification Rules:
1. One statement can have MULTIPLE intents
2. Implicit > Explicit ("loop in the team" = Email)
3. Extract EVERY actionable item separately
4. Preserve context in action titles

Return ONLY valid JSON (no markdown, no explanation) with this structure:
{{
  "decision": {{
    "update_type": "append" or "resynthesize",
    "confidence": 0.0 to 1.0,
    "reason": "Brief explanation"
  }},
  "result": {{
    "narrative": "The FULL updated note content (either appended or fully resynthesized)",
    "title": "Updated title if changed, otherwise keep existing",
    "folder": "Work|Personal|Ideas|Meetings|Projects",
    "tags": ["relevant", "tags"],
    "summary": "2-4 sentence card preview - NOT the full narrative",
    "calendar": [],
    "email": [],
    "reminders": [
      {{
        "title": "Task WITH CONTEXT",
        "due_date": "YYYY-MM-DD",
        "due_time": "HH:MM (optional)",
        "priority": "low|medium|high",
        "intent_source": "COMMITMENT_TO_SELF | COMMITMENT_TO_OTHER | TIME_BINDING | DELEGATION"
      }}
    ]
  }}
}}

IMPORTANT:
- If appending, the narrative should seamlessly integrate the new content
- If resynthesizing, create a completely fresh narrative from all information
- Always return the COMPLETE narrative, not just changes
- Only extract Calendar, Email, and Reminder actions - nothing else"""

        try:
            response = self.client.chat.completions.create(
                model=self.MODEL,
                max_tokens=4000,
                response_format={"type": "json_object"},
                messages=[{"role": "user", "content": prompt}],
            )
        except Exception as e:
            raise ExternalServiceError(service="llm", message=f"Groq LLM request failed: {e}") from e

        response_text = response.choices[0].message.content.strip()

        # Handle potential markdown code blocks
        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]
            response_text = response_text.strip()

        try:
            data = json.loads(response_text)
            return {
                "decision": data.get("decision", {
                    "update_type": "append",
                    "confidence": 0.5,
                    "reason": "Default decision"
                }),
                "result": data.get("result", {
                    "narrative": existing_narrative + "\n\n" + new_content,
                    "title": existing_title,
                    "folder": "Personal",
                    "tags": [],
                    "summary": existing_summary,
                    "calendar": [],
                    "email": [],
                    "reminders": [],
                    "next_steps": []
                })
            }
        except json.JSONDecodeError:
            # Fallback: just append
            return {
                "decision": {
                    "update_type": "append",
                    "confidence": 0.5,
                    "reason": "JSON parse failed, defaulting to append"
                },
                "result": {
                    "narrative": existing_narrative + "\n\n" + new_content,
                    "title": existing_title,
                    "folder": "Personal",
                    "tags": [],
                    "summary": existing_summary,
                    "calendar": [],
                    "email": [],
                    "reminders": [],
                    "next_steps": []
                }
            }

    def _mock_smart_synthesis(
        self,
        new_content: str,
        existing_narrative: str,
        existing_title: str,
        input_history: list
    ) -> dict:
        """Mock smart synthesis for local dev (no API key)."""
        # Simple heuristic: if new content is short, append; otherwise resynthesize
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
            # Combine all content for mock resynthesize
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

    async def summarize_note(self, transcript: str, duration_seconds: int = 0) -> str:
        """
        Generate a concise summary of a note.

        Args:
            transcript: The full transcript
            duration_seconds: Optional duration of the recording for length scaling

        Returns:
            Summary string
        """
        # Return mock response when API key not configured
        if not self.client:
            return transcript[:200] + ("..." if len(transcript) > 200 else "")

        # Determine expected length based on duration
        if duration_seconds < 60:
            length_guidance = "3-5 sentences capturing the complete thought."
        elif duration_seconds < 300:
            length_guidance = "2-3 substantial paragraphs preserving the full reasoning and context."
        else:
            length_guidance = "4-6 paragraphs with natural sections. Capture everything important—this is a longer note and deserves a comprehensive summary."

        prompt = f"""This is YOUR note—write a refined, well-structured version of your own thinking.

TRANSCRIPT:
{transcript}

## Step 1: Detect the Note Type
First, identify what kind of note this is:
- MEETING — Discussion with others, decisions, follow-ups
- BRAINSTORM — Exploring ideas, possibilities, creative thinking
- TASKS — List of things to do, errands, action items
- PLANNING — Strategy, goals, weighing options
- REFLECTION — Personal thoughts, processing feelings
- TECHNICAL — Problem-solving, debugging, implementation
- QUICK_NOTE — Brief reminder or single thought

Notes can be HYBRID (e.g., PLANNING + TASKS):
- If content fits multiple types, blend formatting approaches
- PLANNING + TASKS: Goal/Options/Decision + Action Items section
- MEETING + TASKS: Meeting structure + Follow-ups as checkboxes

## Step 2: Format According to Type

For MEETING: Use "## Context", "## Key Points" (bullets), "## Follow-ups"
For BRAINSTORM: Use "## The Idea", "## Exploration" (prose), "## Open Questions"
For TASKS: Use "## Overview", "## Tasks" (checkbox list)
For PLANNING: Use "## Goal", "## Options Considered", "## Decision"
For REFLECTION: Natural flowing prose with paragraph breaks, no headers
For TECHNICAL: Use "## Problem", "## Approach", "## Details", "## Status"
For QUICK_NOTE: Just 2-4 sentences, no headers needed

## Voice & Tone
- Same voice and personality as the original
- First-person where natural
- Preserve emotional context (frustration, excitement, uncertainty)
- Don't sanitize or formalize

## Comprehensiveness
- Capture specifics: names, numbers, dates, exact phrasing
- Include reasoning, not just conclusions
- Note uncertainties: *[unclear: audio garbled here]*

## Length
{length_guidance}

Return only the formatted note text (with markdown headers/bullets as appropriate for the type)."""

        response = self.client.chat.completions.create(
            model=self.MODEL,
            max_tokens=1000,
            messages=[{"role": "user", "content": prompt}]
        )

        return response.choices[0].message.content.strip()
