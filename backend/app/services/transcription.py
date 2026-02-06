"""Transcription service using Groq Whisper API."""
import os
import tempfile
from typing import BinaryIO

from app.config import get_settings
from app.schemas.voice_schemas import TranscriptionResult
from app.utils.audio import get_audio_duration


class TranscriptionService:
    """Service for audio transcription using Groq Whisper."""

    def __init__(self):
        settings = get_settings()
        self.groq_client = None

        # Use Groq for transcription (primary)
        if settings.groq_api_key:
            from groq import Groq
            self.groq_client = Groq(api_key=settings.groq_api_key)

    async def transcribe(self, audio_file: BinaryIO, filename: str) -> TranscriptionResult:
        """
        Transcribe audio file using Groq Whisper API.

        Args:
            audio_file: Binary audio file
            filename: Original filename for format detection

        Returns:
            TranscriptionResult with text, language, and duration
        """
        # Save to temp file for processing
        suffix = os.path.splitext(filename)[1] or ".mp3"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_file:
            temp_file.write(audio_file.read())
            temp_path = temp_file.name

        try:
            # Get audio duration
            duration = get_audio_duration(temp_path)

            # If no Groq client, return mock transcription
            if not self.groq_client:
                return TranscriptionResult(
                    text="[Transcription unavailable - Groq API key not configured]",
                    language="en",
                    duration=duration,
                    confidence=None,
                )

            # Transcribe using Groq Whisper API
            # Using whisper-large-v3-turbo for 2-3x faster transcription
            # with nearly identical quality to whisper-large-v3
            with open(temp_path, "rb") as audio:
                response = self.groq_client.audio.transcriptions.create(
                    model="whisper-large-v3-turbo",
                    file=audio,
                    response_format="verbose_json",
                )

            return TranscriptionResult(
                text=response.text,
                language=getattr(response, 'language', 'en') or "en",
                duration=duration,
                confidence=None,
            )

        finally:
            # Clean up temp file
            if os.path.exists(temp_path):
                os.unlink(temp_path)

    async def transcribe_from_url(self, audio_url: str) -> TranscriptionResult:
        """
        Transcribe audio from a URL (e.g., S3).

        Args:
            audio_url: URL to the audio file

        Returns:
            TranscriptionResult
        """
        import httpx

        async with httpx.AsyncClient() as client:
            response = await client.get(audio_url)
            response.raise_for_status()

            # Save to temp file
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as temp_file:
                temp_file.write(response.content)
                temp_path = temp_file.name

        try:
            duration = get_audio_duration(temp_path)

            # If no Groq client, return mock transcription
            if not self.groq_client:
                return TranscriptionResult(
                    text="[Transcription unavailable - Groq API key not configured]",
                    language="en",
                    duration=duration,
                )

            with open(temp_path, "rb") as audio:
                groq_response = self.groq_client.audio.transcriptions.create(
                    model="whisper-large-v3-turbo",
                    file=audio,
                    response_format="verbose_json",
                )

            return TranscriptionResult(
                text=groq_response.text,
                language=getattr(groq_response, 'language', 'en') or "en",
                duration=duration,
            )
        finally:
            if os.path.exists(temp_path):
                os.unlink(temp_path)
