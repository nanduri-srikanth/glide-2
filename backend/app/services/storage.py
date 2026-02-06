"""Storage service for audio files using Supabase Storage or local filesystem."""
import os
import uuid
import httpx
from datetime import datetime
from typing import BinaryIO

from app.config import get_settings


class StorageService:
    """Service for file storage (Supabase Storage or local filesystem)."""

    def __init__(self):
        self.settings = get_settings()
        self.use_local = self.settings.use_local_storage
        self.local_path = self.settings.local_storage_path

        # Supabase Storage config
        self.supabase_url = self.settings.supabase_url
        self.service_role_key = self.settings.supabase_service_role_key
        self.bucket_name = "audio"

    def _generate_key(self, user_id: str, filename: str) -> str:
        """Generate a unique key for the file."""
        ext = os.path.splitext(filename)[1] or '.mp3'
        date_prefix = datetime.utcnow().strftime('%Y/%m/%d')
        unique_id = uuid.uuid4().hex[:8]
        return f"{user_id}/{date_prefix}/{unique_id}{ext}"

    async def upload_audio(
        self,
        file: BinaryIO,
        user_id: str,
        filename: str,
        content_type: str = "audio/mpeg"
    ) -> dict:
        """
        Upload audio file to storage.

        Returns:
            dict with url and key
        """
        key = self._generate_key(user_id, filename)

        if self.use_local:
            return await self._upload_local(file, key)
        else:
            return await self._upload_supabase(file, key, content_type)

    async def _upload_local(self, file: BinaryIO, key: str) -> dict:
        """Upload to local filesystem."""
        file_path = os.path.join(self.local_path, key)

        # Create directories if they don't exist
        os.makedirs(os.path.dirname(file_path), exist_ok=True)

        # Actually write the file
        with open(file_path, 'wb') as f:
            f.write(file.read())

        return {
            'key': key,
            'url': f"file://{file_path}",
            'bucket': 'local',
        }

    async def _upload_supabase(self, file: BinaryIO, key: str, content_type: str) -> dict:
        """Upload to Supabase Storage."""
        url = f"{self.supabase_url}/storage/v1/object/{self.bucket_name}/{key}"

        file_content = file.read()

        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                content=file_content,
                headers={
                    "Authorization": f"Bearer {self.service_role_key}",
                    "Content-Type": content_type,
                    "x-upsert": "true",  # Overwrite if exists
                }
            )

            if response.status_code not in (200, 201):
                raise Exception(f"Failed to upload file: {response.text}")

        # Generate public URL
        public_url = f"{self.supabase_url}/storage/v1/object/public/{self.bucket_name}/{key}"

        return {
            'key': key,
            'url': public_url,
            'bucket': self.bucket_name,
        }

    async def get_signed_url(
        self,
        key: str,
        expires_in: int = 3600
    ) -> str:
        """Get a signed URL for accessing a private file."""
        if self.use_local:
            file_path = os.path.join(self.local_path, key)
            return f"file://{file_path}"

        url = f"{self.supabase_url}/storage/v1/object/sign/{self.bucket_name}/{key}"

        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                json={"expiresIn": expires_in},
                headers={
                    "Authorization": f"Bearer {self.service_role_key}",
                    "Content-Type": "application/json",
                }
            )

            if response.status_code != 200:
                raise Exception(f"Failed to generate signed URL: {response.text}")

            data = response.json()
            return f"{self.supabase_url}/storage/v1{data['signedURL']}"

    async def get_public_url(self, key: str) -> str:
        """Get public URL for a file (bucket must be public or use signed URL)."""
        if self.use_local:
            file_path = os.path.join(self.local_path, key)
            return f"file://{file_path}"

        return f"{self.supabase_url}/storage/v1/object/public/{self.bucket_name}/{key}"

    async def delete_audio(self, key: str) -> bool:
        """Delete an audio file from storage."""
        if self.use_local:
            file_path = os.path.join(self.local_path, key)
            if os.path.exists(file_path):
                os.remove(file_path)
            return True

        url = f"{self.supabase_url}/storage/v1/object/{self.bucket_name}/{key}"

        async with httpx.AsyncClient() as client:
            response = await client.delete(
                url,
                headers={
                    "Authorization": f"Bearer {self.service_role_key}",
                }
            )
            return response.status_code in (200, 204, 404)

    async def get_upload_url(
        self,
        user_id: str,
        filename: str,
        content_type: str = "audio/mpeg",
        expires_in: int = 3600
    ) -> dict:
        """Generate a signed URL for direct upload from client."""
        key = self._generate_key(user_id, filename)

        if self.use_local:
            return {
                'upload_url': f"local://{key}",
                'key': key,
            }

        # For Supabase, we create a signed upload URL
        url = f"{self.supabase_url}/storage/v1/object/upload/sign/{self.bucket_name}/{key}"

        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                json={"expiresIn": expires_in},
                headers={
                    "Authorization": f"Bearer {self.service_role_key}",
                    "Content-Type": "application/json",
                }
            )

            if response.status_code != 200:
                raise Exception(f"Failed to generate upload URL: {response.text}")

            data = response.json()
            upload_url = f"{self.supabase_url}/storage/v1{data['url']}"

            return {
                'upload_url': upload_url,
                'key': key,
                'token': data.get('token'),
            }
