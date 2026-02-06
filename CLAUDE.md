# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Glide is a mobile app that converts voice memos into actionable tasks using AI. It has two main parts:

- **React Native/Expo frontend** (root directory) — cross-platform mobile app
- **FastAPI Python backend** (`backend/`) — REST API handling transcription, AI action extraction, and integrations

Both share a PostgreSQL database (Supabase) and Supabase Storage for audio files.

## Common Commands

### Frontend (React Native/Expo)
```bash
npm install                    # Install dependencies
npm start                      # Start Expo dev server (alias: npx expo start)
npm run ios                    # Build and run on iOS simulator
npm run android                # Build and run on Android emulator
npm run lint                   # Run ESLint (expo lint)
```

### Backend (Python/FastAPI)
```bash
cd backend
source venv/bin/activate       # Activate Python virtualenv
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000  # Dev server
pytest                         # Run tests
pytest tests/test_api.py       # Run a specific test file
alembic upgrade head           # Run database migrations
alembic revision --autogenerate -m "description"  # Create new migration
black app/ && isort app/       # Format code
```

### Full Stack
```bash
npm run dev                    # Runs start-dev.sh (Docker PostgreSQL + backend + Expo)
```
Note: `start-dev.sh` expects the backend at `glide-backend/` but the actual path is `backend/` — this script may need updating.

## Architecture

### Frontend Structure
- **`app/`** — Expo Router file-based routing. `_layout.tsx` is the root layout handling auth, database init, and sync setup.
  - `(tabs)/` — Tab navigation (Notes list, Settings)
  - `auth/` — Login/registration screens
  - `notes/` — Note detail and folder views
  - `recording.tsx` — Voice recording screen (core feature)
- **`context/`** — React Context providers: `AuthContext`, `NotesContext`, `NetworkContext`, `SyncContext`
- **`hooks/`** — Custom hooks. Key ones: `useRecording` (voice capture), `useActionDrafts` (action state management), `useNoteDetail`
- **`lib/`** — Core libraries:
  - `database/` — Drizzle ORM schema and SQLite client (offline-first local DB)
  - `repositories/` — Data access layer (Notes, Folders, Actions, AudioUploads)
  - `sync/` — Offline sync engine: `SyncEngine`, `SyncQueue`, `AudioUploader`
  - `queryClient.ts` — TanStack React Query setup with AsyncStorage persistence
- **`services/`** — API client (`api.ts` with auto token refresh), domain services (voice, notes, auth, actions)
- **`components/`** — UI components organized by feature (`notes/`, `sync/`, `ui/`)

### Backend Structure (`backend/app/`)
- **`main.py`** — FastAPI entry point, route registration, error handlers
- **`models/`** — SQLAlchemy models: User, Note, Folder, Action
- **`schemas/`** — Pydantic request/response schemas
- **`routers/`** — API endpoint handlers (auth, voice, notes, folders, actions, integrations)
- **`services/`** — Business logic:
  - `llm.py` — Claude API integration for action extraction (largest file, ~55KB)
  - `transcription.py` — Groq Whisper API for audio-to-text
  - `google_services.py` / `apple_services.py` — Calendar integrations
  - `storage.py` — Supabase/S3 audio storage
- **`core/`** — Error classes, standardized responses, middleware
- **`utils/`** — JWT auth, encryption, audio processing helpers
- **`alembic/`** — Database migration files

### Key Architectural Patterns
- **Offline-first**: All data persists in local SQLite (Drizzle ORM). A sync queue tracks pending operations and syncs to the backend when online.
- **Repository pattern**: Data access abstracted through repository classes in `lib/repositories/`
- **TanStack Query**: API response caching with AsyncStorage persistence across app restarts
- **JWT auth**: Tokens stored in expo-secure-store; `services/api.ts` handles automatic token refresh
- **Path alias**: `@/*` maps to the project root (configured in `tsconfig.json`)

### Core Data Flow (Voice → Actions)
1. User records audio → `useRecording` hook manages capture
2. Audio saved locally → uploaded to Supabase Storage
3. Backend transcribes via Groq Whisper API
4. Claude extracts structured actions (calendar events, emails, reminders)
5. Results synced to local SQLite and displayed in UI

## Environment Setup

### Frontend
Copy `.env.example` to `.env.local`. Key variables:
- `EXPO_PUBLIC_API_PORT` — Backend port (default: 8000)
- `EXPO_PUBLIC_DEV_AUTO_LOGIN` — Set `true` to skip auth screen in development; set `false` when testing authentication
- `EXPO_PUBLIC_DEV_TEST_EMAIL` / `EXPO_PUBLIC_DEV_TEST_PASSWORD` — Auto-login credentials

### Backend
Requires `.env` in `backend/` with:
- `DATABASE_URL` — PostgreSQL connection string (asyncpg)
- `GROQ_API_KEY` — For Whisper transcription
- `ANTHROPIC_API_KEY` — For Claude action extraction
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — Storage
- `SECRET_KEY` — 64-byte key for JWT signing

## API

All endpoints are prefixed with `/api/v1/`. Interactive docs at `http://localhost:8000/docs` (Swagger) or `/redoc`.

Main route groups: `/auth`, `/voice`, `/notes`, `/folders`, `/actions`, `/integrations`

## Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Mobile framework | React Native 0.81 + Expo 54 |
| Navigation | Expo Router (file-based) |
| Local database | expo-sqlite + Drizzle ORM |
| State/caching | TanStack React Query + React Context |
| Backend framework | FastAPI (async) |
| Backend database | PostgreSQL (SQLAlchemy + Alembic) |
| AI | Claude API (action extraction), Groq Whisper (transcription) |
| Storage | Supabase Storage (S3-compatible) |
| Auth | JWT (python-jose / expo-secure-store) |
