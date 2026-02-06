"""
Apple Sign-In JWT Verification.

Properly verifies Apple identity tokens by:
1. Fetching Apple's public keys from their JWKS endpoint
2. Verifying the JWT signature using the correct key
3. Validating claims (issuer, audience, expiration)

Security: Never skip signature verification in production!
"""

import logging
import time
from typing import Dict, Optional, Any
from dataclasses import dataclass

import httpx
from jose import jwt, jwk, JWTError
from jose.exceptions import JWKError

from app.config import get_settings

logger = logging.getLogger(__name__)

# Apple's JWKS endpoint
APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"
APPLE_ISSUER = "https://appleid.apple.com"

# Cache for Apple's public keys (they rarely change)
_apple_keys_cache: Dict[str, Any] = {}
_cache_timestamp: float = 0
CACHE_TTL_SECONDS = 3600  # 1 hour


@dataclass
class AppleTokenPayload:
    """Parsed and verified Apple identity token payload."""
    user_id: str  # The 'sub' claim - Apple's unique user identifier
    email: Optional[str]
    email_verified: bool
    is_private_email: bool
    auth_time: int
    nonce_supported: bool


async def _fetch_apple_public_keys() -> Dict[str, Any]:
    """
    Fetch Apple's public keys from their JWKS endpoint.

    Returns the JWKS as a dictionary with 'keys' array.
    """
    async with httpx.AsyncClient() as client:
        response = await client.get(APPLE_JWKS_URL, timeout=10.0)
        response.raise_for_status()
        return response.json()


async def get_apple_public_keys(force_refresh: bool = False) -> Dict[str, Any]:
    """
    Get Apple's public keys, using cache when available.

    Args:
        force_refresh: If True, bypass cache and fetch fresh keys.

    Returns:
        JWKS dictionary with 'keys' array.
    """
    global _apple_keys_cache, _cache_timestamp

    current_time = time.time()

    # Use cache if valid and not forcing refresh
    if not force_refresh and _apple_keys_cache and (current_time - _cache_timestamp) < CACHE_TTL_SECONDS:
        return _apple_keys_cache

    # Fetch fresh keys
    try:
        keys = await _fetch_apple_public_keys()
        _apple_keys_cache = keys
        _cache_timestamp = current_time
        logger.info("Refreshed Apple public keys from JWKS endpoint")
        return keys
    except Exception as e:
        logger.error(f"Failed to fetch Apple public keys: {e}")
        # If we have cached keys, use them as fallback
        if _apple_keys_cache:
            logger.warning("Using cached Apple public keys as fallback")
            return _apple_keys_cache
        raise


def _get_key_for_token(token: str, jwks: Dict[str, Any]) -> Dict[str, Any]:
    """
    Find the correct public key for verifying the token.

    The token header contains a 'kid' (key ID) that identifies which
    key from the JWKS should be used for verification.

    Args:
        token: The JWT to verify.
        jwks: The JWKS containing Apple's public keys.

    Returns:
        The matching key from the JWKS.

    Raises:
        JWTError: If no matching key is found.
    """
    # Decode header without verification to get the key ID
    unverified_header = jwt.get_unverified_header(token)
    token_kid = unverified_header.get("kid")

    if not token_kid:
        raise JWTError("Token header missing 'kid' claim")

    # Find the matching key
    for key in jwks.get("keys", []):
        if key.get("kid") == token_kid:
            return key

    raise JWTError(f"No matching key found for kid: {token_kid}")


async def verify_apple_identity_token(
    identity_token: str,
    bundle_id: Optional[str] = None,
) -> AppleTokenPayload:
    """
    Verify an Apple identity token and extract the payload.

    This function:
    1. Fetches Apple's current public keys
    2. Finds the correct key based on the token's 'kid' header
    3. Verifies the JWT signature
    4. Validates claims (issuer, audience, expiration)
    5. Returns the parsed payload

    Args:
        identity_token: The identity token from Apple Sign-In.
        bundle_id: Your app's bundle ID (audience). If not provided,
                   uses the configured APPLE_BUNDLE_ID.

    Returns:
        AppleTokenPayload with verified user information.

    Raises:
        JWTError: If verification fails for any reason.
    """
    settings = get_settings()
    audience = bundle_id or settings.apple_bundle_id

    if not audience:
        raise JWTError(
            "Apple bundle ID not configured. Set APPLE_BUNDLE_ID environment variable."
        )

    # Get Apple's public keys
    jwks = await get_apple_public_keys()

    # Find the correct key for this token
    key_data = _get_key_for_token(identity_token, jwks)

    # Convert JWK to a format jose can use
    try:
        public_key = jwk.construct(key_data)
    except JWKError as e:
        raise JWTError(f"Failed to construct public key: {e}")

    # Verify and decode the token
    try:
        payload = jwt.decode(
            identity_token,
            public_key,
            algorithms=["RS256"],
            audience=audience,
            issuer=APPLE_ISSUER,
            options={
                "verify_signature": True,
                "verify_aud": True,
                "verify_iss": True,
                "verify_exp": True,
                "verify_iat": True,
            }
        )
    except JWTError as e:
        logger.warning(f"Apple token verification failed: {e}")
        raise

    # Extract and return the payload
    return AppleTokenPayload(
        user_id=payload.get("sub", ""),
        email=payload.get("email"),
        email_verified=payload.get("email_verified", False),
        is_private_email=payload.get("is_private_email", False),
        auth_time=payload.get("auth_time", 0),
        nonce_supported=payload.get("nonce_supported", False),
    )


async def verify_apple_token_unsafe(identity_token: str) -> Dict[str, Any]:
    """
    Decode an Apple identity token WITHOUT verification.

    WARNING: This is for debugging only. Never use in production!

    Args:
        identity_token: The identity token from Apple Sign-In.

    Returns:
        The decoded payload (unverified).
    """
    logger.warning("UNSAFE: Decoding Apple token without verification")
    return jwt.get_unverified_claims(identity_token)
