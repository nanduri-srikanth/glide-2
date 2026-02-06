"""Audio processing utilities."""
import os
from typing import Optional


def get_audio_duration(file_path: str) -> int:
    """
    Get the duration of an audio file in seconds.
    Returns estimated duration based on file size for now.
    """
    try:
        # Rough estimate: ~1MB per minute for compressed audio
        file_size = os.path.getsize(file_path)
        estimated_seconds = int(file_size / 17000)  # ~17KB per second for mp3
        return max(1, estimated_seconds)
    except Exception:
        return 0


def convert_audio(
    input_path: str,
    output_format: str = "mp3",
    bitrate: str = "128k"
) -> Optional[str]:
    """
    Convert audio file to a different format.
    For now, returns input path as-is (Whisper accepts most formats).
    """
    return input_path


def normalize_audio(file_path: str, target_dbfs: float = -20.0) -> Optional[str]:
    """Normalize audio volume. Returns original path for now."""
    return file_path


def trim_silence(
    file_path: str,
    silence_thresh: int = -50,
    min_silence_len: int = 1000
) -> Optional[str]:
    """Trim silence from audio. Returns original path for now."""
    return file_path


def get_audio_info(file_path: str) -> dict:
    """Get basic information about an audio file."""
    try:
        file_size = os.path.getsize(file_path)
        ext = os.path.splitext(file_path)[1].lower()

        return {
            "duration_seconds": get_audio_duration(file_path),
            "file_size": file_size,
            "format": ext.replace(".", ""),
        }
    except Exception as e:
        return {"error": str(e)}
