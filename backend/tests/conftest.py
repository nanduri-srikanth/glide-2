"""Pytest configuration and fixtures."""
import asyncio
import json
import sqlite3

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.postgresql import UUID as PG_UUID, ARRAY as PG_ARRAY, JSONB as PG_JSONB

from app.main import app
from app import main as app_main
from app.database import Base, get_db
from app.utils import auth as auth_utils
from app.routers import auth as auth_router


# Use SQLite for testing (async)
SQLALCHEMY_DATABASE_URL = "sqlite+aiosqlite:///./test.db"

async_engine = create_async_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
AsyncTestingSessionLocal = async_sessionmaker(
    async_engine, class_=AsyncSession, expire_on_commit=False
)


# Allow PostgreSQL UUID columns to compile under SQLite
@compiles(PG_UUID, "sqlite")
def compile_uuid_sqlite(_type, _compiler, **_kw):
    return "CHAR(36)"


@compiles(PG_ARRAY, "sqlite")
def compile_array_sqlite(_type, _compiler, **_kw):
    return "TEXT"


@compiles(PG_JSONB, "sqlite")
def compile_jsonb_sqlite(_type, _compiler, **_kw):
    return "TEXT"


# Allow SQLite to store list/dict as JSON text
sqlite3.register_adapter(list, lambda v: json.dumps(v))
sqlite3.register_adapter(dict, lambda v: json.dumps(v))


async def override_get_db():
    """Override database dependency for testing."""
    async with AsyncTestingSessionLocal() as session:
        yield session


@pytest.fixture(scope="session")
def test_db():
    """Create test database."""
    async def init_db():
        async with async_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    async def drop_db():
        async with async_engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)

    asyncio.run(init_db())
    yield
    asyncio.run(drop_db())


@pytest.fixture
def client(test_db):
    """Create test client."""
    # Disable app startup DB init (uses production async engine)
    app_main.settings.debug = False
    # Avoid Supabase JWKS network calls during tests; use legacy JWT flow.
    app_main.settings.supabase_url = ""
    app_main.settings.allow_legacy_jwt = True
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def auth_headers(client):
    """Create authenticated user and return headers."""
    # Register user
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "test@example.com",
            "password": "testpassword123",
        },
    )

    # Login
    response = client.post(
        "/api/v1/auth/login",
        data={
            "username": "test@example.com",
            "password": "testpassword123",
        },
    )

    token = response.json().get("access_token")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def mock_password_hashing(monkeypatch):
    """Avoid bcrypt dependency in tests with a deterministic hash."""
    def fake_hash(password: str) -> str:
        return f"hashed:{password}"

    def fake_verify(password: str, hashed: str) -> bool:
        return hashed == f"hashed:{password}"

    monkeypatch.setattr(auth_utils, "get_password_hash", fake_hash, raising=False)
    monkeypatch.setattr(auth_utils, "verify_password", fake_verify, raising=False)
    monkeypatch.setattr(auth_router, "get_password_hash", fake_hash, raising=False)
    monkeypatch.setattr(auth_router, "verify_password", fake_verify, raising=False)
