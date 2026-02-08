"""Supabase Auth token verification utilities."""
from __future__ import annotations

import time
from typing import Any, Dict, Optional

import httpx
from jose import jwt, jwk, JWTError

from app.config import get_settings

_jwks_cache: Dict[str, Any] | None = None
_jwks_cache_timestamp: float | None = None
_JWKS_TTL_SECONDS = 3600  # 1 hour


async def _fetch_jwks() -> Dict[str, Any]:
    settings = get_settings()
    if not settings.supabase_url:
        raise RuntimeError("SUPABASE_URL is not configured")

    jwks_url = f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(jwks_url)
        response.raise_for_status()
        return response.json()


async def get_supabase_jwks(force_refresh: bool = False) -> Dict[str, Any]:
    global _jwks_cache, _jwks_cache_timestamp

    now = time.time()
    if (
        not force_refresh
        and _jwks_cache
        and _jwks_cache_timestamp
        and (now - _jwks_cache_timestamp) < _JWKS_TTL_SECONDS
    ):
        return _jwks_cache

    _jwks_cache = await _fetch_jwks()
    _jwks_cache_timestamp = now
    return _jwks_cache


def _get_key_for_token(token: str, jwks: Dict[str, Any]) -> Dict[str, Any]:
    header = jwt.get_unverified_header(token)
    token_kid = header.get("kid")
    if not token_kid:
        raise JWTError("Token header missing 'kid' claim")

    for key in jwks.get("keys", []):
        if key.get("kid") == token_kid:
            return key

    raise JWTError(f"No matching key found for kid: {token_kid}")


async def verify_supabase_jwt(token: str) -> Dict[str, Any]:
    """
    Verify Supabase JWT and return payload.
    Raises JWTError on failure.
    """
    settings = get_settings()
    jwks = await get_supabase_jwks()
    key_data = _get_key_for_token(token, jwks)
    key = jwk.construct(key_data)
    public_key = key.to_pem().decode("utf-8")

    # Supabase uses "authenticated" audience by default.
    # Accept missing audience to avoid breaking custom configs.
    options = {"verify_aud": False} if not settings.supabase_jwt_audience else None

    return jwt.decode(
        token,
        public_key,
        algorithms=[key_data.get("alg", "RS256")],
        audience=settings.supabase_jwt_audience or None,
        options=options,
    )

