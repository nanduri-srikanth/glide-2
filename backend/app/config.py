"""Application configuration using Pydantic Settings."""
from functools import lru_cache
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Storage mode
    use_local_storage: bool = False  # Use Supabase Storage (set True for local filesystem)

    # API Keys (optional - mock responses used when not configured)
    groq_api_key: str = ""  # Groq for fast Whisper transcription and LLM inference

    # Supabase
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""  # For server-side storage access

    # Database
    database_url: str = ""

    @property
    def database_url_async(self) -> str:
        """Return async database URL."""
        if self.database_url:
            return self.database_url
        return "postgresql+asyncpg://postgres:password@localhost:5432/glide"

    @property
    def database_url_sync(self) -> str:
        """Return sync database URL for Alembic."""
        url = self.database_url_async
        return url.replace("+asyncpg", "")

    # Local storage path for audio files
    local_storage_path: str = "./uploads"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # JWT
    secret_key: str = "change-this-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # Encryption (for sensitive data at rest)
    encryption_key: str = ""  # Fernet key for encrypting tokens

    # AWS S3
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = "us-east-1"
    s3_bucket_name: str = "glide-audio-files"

    # Google OAuth
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/v1/integrations/google/callback"

    # Apple CalDAV
    apple_caldav_url: str = "https://caldav.icloud.com"

    # Apple Sign-In
    apple_bundle_id: str = ""  # Your app's bundle ID (e.g., com.yourcompany.glide)

    # App Settings
    debug: bool = True
    allowed_origins: str = "http://localhost:3000,exp://localhost:8081"

    @property
    def cors_origins(self) -> List[str]:
        """Parse CORS origins from comma-separated string."""
        return [origin.strip() for origin in self.allowed_origins.split(",")]


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
