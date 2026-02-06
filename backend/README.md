# Glide Backend API

FastAPI backend for the Glide voice notes app. Handles voice transcription, AI action extraction, and external service integrations.

## Quick Start

### 1. Install Dependencies

```bash
cd glide-backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your API keys and database URL
```

Required API keys:
- `OPENAI_API_KEY` - For Whisper transcription
- `ANTHROPIC_API_KEY` - For Claude action extraction
- `DATABASE_URL` - PostgreSQL connection string

### 3. Setup Database

Using Supabase:
1. Create a new Supabase project
2. Copy the connection string from Settings > Database
3. Update `DATABASE_URL` in `.env`

Or local PostgreSQL:
```bash
createdb glide
```

Run migrations:
```bash
alembic upgrade head
```

### 4. Start Server

Development:
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Production:
```bash
gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login and get tokens
- `POST /api/v1/auth/refresh` - Refresh access token
- `GET /api/v1/auth/me` - Get current user

### Voice Processing
- `POST /api/v1/voice/process` - Upload and process voice memo
- `POST /api/v1/voice/transcribe` - Transcribe only (preview)
- `POST /api/v1/voice/analyze` - Analyze transcript for actions

### Notes
- `GET /api/v1/notes` - List notes with filters
- `GET /api/v1/notes/{id}` - Get single note
- `POST /api/v1/notes` - Create note
- `PATCH /api/v1/notes/{id}` - Update note
- `DELETE /api/v1/notes/{id}` - Delete note

### Folders
- `GET /api/v1/folders` - List folders
- `POST /api/v1/folders` - Create folder
- `POST /api/v1/folders/setup-defaults` - Create default folders

### Actions
- `GET /api/v1/actions` - List actions
- `POST /api/v1/actions/{id}/execute` - Execute action (create event/email/reminder)
- `POST /api/v1/actions/{id}/complete` - Mark action complete

### Integrations
- `GET /api/v1/integrations/status` - Check connected services
- `GET /api/v1/integrations/google/connect` - Start Google OAuth
- `POST /api/v1/integrations/apple/connect` - Connect Apple CalDAV

## API Documentation

Interactive docs available at:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Architecture

```
app/
├── main.py              # FastAPI app entry
├── config.py            # Settings from env
├── database.py          # SQLAlchemy setup
├── models/              # Database models
├── schemas/             # Pydantic schemas
├── routers/             # API endpoints
├── services/            # Business logic
│   ├── transcription.py # Whisper API
│   ├── llm.py           # Claude API
│   ├── google_services.py
│   ├── apple_services.py
│   └── storage.py       # S3/Supabase storage
└── utils/               # Helpers
```

## Supabase Integration

The backend works seamlessly with Supabase:

1. **Database**: Use Supabase PostgreSQL as `DATABASE_URL`
2. **Storage**: Use Supabase Storage (S3-compatible) for audio files
3. **Auth**: Can optionally use Supabase Auth instead of JWT

### Storage Setup

In `.env`:
```
AWS_ACCESS_KEY_ID=your-supabase-storage-key
AWS_SECRET_ACCESS_KEY=your-supabase-storage-secret
S3_BUCKET_NAME=audio-files
```

In `app/services/storage.py`, uncomment the Supabase endpoint:
```python
endpoint_url='https://YOUR_PROJECT.supabase.co/storage/v1/s3'
```

## Development

### Run Tests
```bash
pytest
```

### Create Migration
```bash
alembic revision --autogenerate -m "Description"
alembic upgrade head
```

### Code Style
```bash
pip install black isort
black app/
isort app/
```

## Deployment

### AWS Lambda (Serverless)

The app includes Mangum handler for Lambda:
```python
from mangum import Mangum
handler = Mangum(app)
```

### Docker

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Railway/Render

1. Connect your repo
2. Set environment variables
3. Deploy

## License

MIT
