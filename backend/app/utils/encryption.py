"""Encryption utilities for sensitive data at rest."""
from typing import Optional
from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings


class EncryptionService:
    """Service for encrypting and decrypting sensitive data."""

    def __init__(self):
        settings = get_settings()
        self._fernet: Optional[Fernet] = None
        
        if settings.encryption_key:
            try:
                self._fernet = Fernet(settings.encryption_key.encode())
            except Exception:
                pass  # Invalid key format

    @property
    def is_configured(self) -> bool:
        """Check if encryption is properly configured."""
        return self._fernet is not None

    def encrypt(self, plaintext: str) -> str:
        """
        Encrypt a string value.
        
        Returns the encrypted value prefixed with 'enc:' to identify encrypted data.
        If encryption is not configured, returns the plaintext (backwards compatibility).
        """
        if not plaintext:
            return plaintext
            
        if not self._fernet:
            return plaintext
            
        encrypted = self._fernet.encrypt(plaintext.encode())
        return f"enc:{encrypted.decode()}"

    def decrypt(self, ciphertext: str) -> str:
        """
        Decrypt an encrypted string value.
        
        Handles both encrypted (prefixed with 'enc:') and unencrypted values
        for backwards compatibility with existing data.
        """
        if not ciphertext:
            return ciphertext
            
        # Check if this is encrypted data
        if not ciphertext.startswith("enc:"):
            # Return as-is (unencrypted legacy data)
            return ciphertext
            
        if not self._fernet:
            # Can't decrypt without key - return empty
            return ""
            
        try:
            encrypted_data = ciphertext[4:]  # Remove 'enc:' prefix
            decrypted = self._fernet.decrypt(encrypted_data.encode())
            return decrypted.decode()
        except InvalidToken:
            # Invalid or corrupted data
            return ""


# Singleton instance
_encryption_service: Optional[EncryptionService] = None


def get_encryption_service() -> EncryptionService:
    """Get the singleton encryption service instance."""
    global _encryption_service
    if _encryption_service is None:
        _encryption_service = EncryptionService()
    return _encryption_service


def encrypt_token(token: Optional[str]) -> Optional[str]:
    """Convenience function to encrypt a token."""
    if not token:
        return token
    return get_encryption_service().encrypt(token)


def decrypt_token(token: Optional[str]) -> Optional[str]:
    """Convenience function to decrypt a token."""
    if not token:
        return token
    return get_encryption_service().decrypt(token)
