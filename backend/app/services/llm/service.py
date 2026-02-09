"""LLMService -- the main coordinator class for all LLM operations."""
import logging
from typing import Optional

from app.config import get_settings
from app.schemas.voice_schemas import ActionExtractionResult
from app.services.llm import extraction, synthesis, smart_synthesis, summarization, email
from app.services.llm.mocks import mock_extraction, mock_synthesis, mock_smart_synthesis

logger = logging.getLogger(__name__)


class LLMService:
    """Service for AI-powered action extraction using Groq LLM.

    This class is a thin coordinator that delegates to focused modules.
    Each module contains pure async functions that receive the Groq client
    and model as explicit parameters.
    """

    MODEL = "llama-3.3-70b-versatile"

    def __init__(self):
        settings = get_settings()
        self.client = None

        if settings.groq_api_key:
            from groq import Groq
            self.client = Groq(api_key=settings.groq_api_key)

    # -- Extraction --

    async def extract_actions(
        self,
        transcript: str,
        user_context: Optional[dict] = None,
    ) -> ActionExtractionResult:
        if not self.client:
            return mock_extraction(transcript)
        return await extraction.extract_actions(
            self.client, self.MODEL, transcript, user_context
        )

    async def extract_actions_for_append(
        self,
        new_transcript: str,
        existing_transcript: str,
        existing_title: str,
        user_context: Optional[dict] = None,
    ) -> ActionExtractionResult:
        if not self.client:
            return mock_extraction(new_transcript)
        return await extraction.extract_actions_for_append(
            self.client, self.MODEL, new_transcript,
            existing_transcript, existing_title, user_context
        )

    # -- Email --

    async def generate_email_draft(
        self, context: str, recipient: str, purpose: str
    ) -> dict:
        if not self.client:
            return {
                "subject": f"Re: {purpose}",
                "body": f"[AI draft unavailable - connect Groq API]\n\nContext: {context[:200]}...",
            }
        return await email.generate_email_draft(
            self.client, self.MODEL, context, recipient, purpose
        )

    # -- Synthesis --

    async def synthesize_content(
        self,
        text_input: str = "",
        audio_transcript: str = "",
        user_context: Optional[dict] = None,
    ) -> dict:
        combined = synthesis._combine_inputs(text_input, audio_transcript)
        if not combined:
            return synthesis._empty_synthesis_result()
        if not self.client:
            return mock_synthesis(combined, text_input, audio_transcript)
        return await synthesis.synthesize_content(
            self.client, self.MODEL, text_input, audio_transcript, user_context
        )

    async def resynthesize_content(
        self,
        input_history: list,
        user_context: Optional[dict] = None,
        comprehensive: bool = True,
    ) -> dict:
        return await synthesis.resynthesize_content(
            self.client, self.MODEL, input_history, user_context, comprehensive,
            mock_synthesis_fn=mock_synthesis if not self.client else None,
        )

    async def comprehensive_synthesize(
        self,
        text_input: str,
        audio_transcript: str,
        input_history: list,
        user_context: Optional[dict] = None,
    ) -> dict:
        combined = synthesis._combine_inputs(text_input, audio_transcript)
        if not combined:
            return synthesis._empty_synthesis_result()
        if not self.client:
            return mock_synthesis(combined, text_input, audio_transcript)
        return await synthesis.comprehensive_synthesize(
            self.client, self.MODEL, text_input, audio_transcript,
            input_history, user_context
        )

    # -- Smart Synthesis --

    def should_force_resynthesize(
        self,
        existing_narrative: str,
        new_content: str,
        input_history: list,
    ) -> tuple[bool, str | None]:
        return smart_synthesis.should_force_resynthesize(
            existing_narrative, new_content, input_history
        )

    async def smart_synthesize(
        self,
        new_content: str,
        existing_narrative: str,
        existing_title: str,
        existing_summary: str | None,
        input_history: list,
        user_context: Optional[dict] = None,
    ) -> dict:
        force_resynth, force_reason = smart_synthesis.should_force_resynthesize(
            existing_narrative, new_content, input_history
        )

        if force_resynth:
            result = await self.resynthesize_content(input_history, user_context)
            return {
                "decision": {
                    "update_type": "resynthesize",
                    "confidence": 0.95,
                    "reason": force_reason or "Heuristic check determined resynthesize needed",
                },
                "result": result,
            }

        if not self.client:
            return mock_smart_synthesis(
                new_content, existing_narrative, existing_title, input_history
            )

        return await smart_synthesis.smart_synthesize(
            self.client, self.MODEL, new_content, existing_narrative,
            existing_title, existing_summary, input_history, user_context
        )

    # -- Summarization --

    async def summarize_note(self, transcript: str, duration_seconds: int = 0) -> str:
        if not self.client:
            return transcript[:200] + ("..." if len(transcript) > 200 else "")
        return await summarization.summarize_note(
            self.client, self.MODEL, transcript, duration_seconds
        )

    async def summarize_new_content(
        self,
        new_transcript: str,
        existing_title: str,
        user_context: Optional[dict] = None,
    ) -> dict:
        if not self.client:
            return {
                "summary": new_transcript[:300] + "..." if len(new_transcript) > 300 else new_transcript,
                "tags": [],
                "calendar": [],
                "email": [],
                "reminders": [],
            }
        return await summarization.summarize_new_content(
            self.client, self.MODEL, new_transcript, existing_title, user_context
        )
