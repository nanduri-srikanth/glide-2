# Glide Synthesis API Documentation

## Overview

The Synthesis API enables intelligent note creation by merging text input and audio recordings into cohesive narratives. It uses Groq's Llama 3.3 70B model for synthesis and Whisper large-v3 for audio transcription.

## Key Concepts

### Input History
Every note maintains an **input history** - a chronological record of all text and audio inputs. This enables:
- Re-synthesis: Regenerate the narrative from original inputs
- Audit trail: Track what was added when
- Intelligent merging: AI understands context across all inputs

### Synthesis vs Processing
| Old Flow (`/voice/process`) | New Flow (`/voice/synthesize`) |
|----------------------------|-------------------------------|
| Audio only | Text + Audio (either or both) |
| Simple transcription | AI-synthesized narrative |
| Actions extracted from transcript | Actions extracted from synthesized content |
| No input history | Full input history tracking |

---

## Endpoints

### 1. Create Synthesized Note
```
POST /voice/synthesize
```

Creates a new note from text and/or audio input.

**Request (multipart/form-data):**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text_input` | string | No* | User's typed text |
| `audio_file` | file | No* | Audio recording (mp3, m4a, wav) |
| `folder_id` | UUID | No | Target folder (auto-sorted if omitted) |

*At least one of `text_input` or `audio_file` must be provided.

**Response:**
```json
{
  "note_id": "uuid",
  "title": "AI-generated title",
  "narrative": "Synthesized cohesive narrative...",
  "raw_inputs": [
    {
      "type": "text",
      "content": "User's typed text",
      "timestamp": "2024-01-28T18:00:00",
      "duration": null,
      "audio_key": null
    },
    {
      "type": "audio",
      "content": "Transcribed audio content",
      "timestamp": "2024-01-28T18:00:05",
      "duration": 45,
      "audio_key": "users/123/recordings/abc.mp3"
    }
  ],
  "summary": "2-3 sentence summary",
  "duration": 45,
  "folder_id": "uuid",
  "folder_name": "Work",
  "tags": ["meeting", "project"],
  "actions": {
    "title": "...",
    "folder": "Work",
    "tags": ["..."],
    "summary": "...",
    "calendar": [...],
    "email": [...],
    "reminders": [...],
    "next_steps": [...]
  },
  "created_at": "2024-01-28T18:00:00",
  "updated_at": "2024-01-28T18:00:00"
}
```

---

### 2. Add Content to Existing Note
```
POST /voice/synthesize/{note_id}
```

Adds new text and/or audio to an existing note.

**Request (multipart/form-data):**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text_input` | string | No* | Additional text |
| `audio_file` | file | No* | Additional audio |
| `resynthesize` | boolean | No | If true, re-run full synthesis on all inputs |

*At least one of `text_input` or `audio_file` must be provided.

**Behavior:**
- `resynthesize=false` (default): Appends content with timestamp separator, extracts only new actions
- `resynthesize=true`: Re-processes all inputs to generate fresh narrative

**Response:** Same as create endpoint.

---

### 3. Re-synthesize Note
```
POST /voice/resynthesize/{note_id}
```

Re-generates the narrative from the note's input history. Useful after user edits the note manually.

**Request:** No body required.

**Response:** Same as create endpoint.

---

## Data Storage

### Note Model (`ai_metadata` field)
```json
{
  "synthesis_model": "llama-3.3-70b-versatile",
  "input_history": [
    {
      "type": "text|audio",
      "content": "Raw content or transcription",
      "timestamp": "ISO timestamp",
      "duration": 45,
      "audio_key": "storage path"
    }
  ],
  "raw_inputs": {
    "text": "Original text input",
    "audio_transcript": "Original transcription"
  },
  "synthesized_at": "ISO timestamp"
}
```

### Storage Locations
- **Narrative**: Stored in `notes.transcript` field
- **Input History**: Stored in `notes.ai_metadata.input_history`
- **Audio Files**: Stored via StorageService (local or S3)

---

## AI Synthesis Process

### 1. Input Collection
```
User Input (text + audio)
         ↓
Transcribe audio (Groq Whisper large-v3)
         ↓
Combine: "TYPED TEXT:\n{text}\n\nSPOKEN AUDIO:\n{transcript}"
```

### 2. LLM Synthesis Prompt
The LLM receives instructions to:
- Merge both inputs into ONE cohesive narrative
- Fix grammar, remove filler words
- Preserve user's voice and intent
- Extract actionable items (calendar, email, reminders, next steps)

### 3. Output Structure
```json
{
  "narrative": "Single cohesive narrative (not sectioned)",
  "title": "5-10 word title",
  "folder": "Work|Personal|Ideas|Meetings|Projects",
  "tags": ["max", "5", "tags"],
  "summary": "2-3 sentences",
  "calendar": [...],
  "email": [...],
  "reminders": [...],
  "next_steps": [...]
}
```

---

## Action Extraction

Actions are automatically extracted and created in the database:

### Calendar Events
```json
{
  "title": "Team standup",
  "date": "2024-01-29",
  "time": "10:00",
  "location": "Conference Room A",
  "attendees": ["john@example.com"]
}
```

### Email Drafts
```json
{
  "to": "client@example.com",
  "subject": "Project Update",
  "body": "Hi,\n\nHere's the latest..."
}
```

### Reminders
```json
{
  "title": "Follow up with vendor",
  "due_date": "2024-01-30",
  "due_time": "14:00",
  "priority": "high|medium|low"
}
```

### Next Steps
```json
["Review proposal", "Send invoice", "Schedule meeting"]
```

---

## Error Handling

### Common Errors
| Status | Error | Cause |
|--------|-------|-------|
| 400 | "At least one of text_input or audio_file must be provided" | Empty request |
| 400 | "Invalid audio format" | Unsupported file type |
| 404 | "Note not found" | Invalid note_id or unauthorized |
| 500 | "Failed to synthesize note" | LLM or transcription error |

### Graceful Degradation
- If LLM fails to parse JSON: Returns raw combined content as narrative
- If transcription fails: Error returned, no partial save
- If no Groq API key: Mock responses returned (dev mode)

---

## Frontend Integration

### Voice Service Methods
```typescript
// Create new note
voiceService.synthesizeNote({
  textInput: "Meeting notes...",
  audioUri: "file://recording.m4a",
  folderId: "uuid"
}, onProgress);

// Add to existing note
voiceService.addToNote(noteId, {
  textInput: "Additional thoughts...",
  audioUri: "file://more.m4a",
  resynthesize: false
}, onProgress);

// Re-synthesize
voiceService.resynthesizeNote(noteId, onProgress);
```

### Progress Callbacks
```typescript
onProgress(progress: number, status: string) => {
  // progress: 0-100
  // status: "Preparing...", "Uploading audio...", "Transcribing...", etc.
}
```

---

## Configuration

### Environment Variables
```bash
# Required for synthesis
GROQ_API_KEY=gsk_...

# Optional - defaults shown
DATABASE_URL=postgresql+asyncpg://...
```

### Models Used
| Task | Model | Provider |
|------|-------|----------|
| Transcription | whisper-large-v3 | Groq |
| Synthesis | llama-3.3-70b-versatile | Groq |

---

## Migration from Old API

### Deprecated Endpoints
- `POST /voice/process` - Still works, but doesn't support text input
- `POST /voice/append/{note_id}` - Still works, but no re-synthesis option

### Recommended Migration
1. Replace `processVoiceMemo()` calls with `synthesizeNote()`
2. Replace `appendToNote()` calls with `addToNote()`
3. Add re-synthesize button for user-triggered regeneration

---

## Examples

### Create Note with Text Only
```bash
curl -X POST "http://localhost:8000/api/v1/voice/synthesize" \
  -H "Authorization: Bearer $TOKEN" \
  -F "text_input=Remember to call John about the project deadline"
```

### Create Note with Audio Only
```bash
curl -X POST "http://localhost:8000/api/v1/voice/synthesize" \
  -H "Authorization: Bearer $TOKEN" \
  -F "audio_file=@recording.m4a"
```

### Create Note with Both
```bash
curl -X POST "http://localhost:8000/api/v1/voice/synthesize" \
  -H "Authorization: Bearer $TOKEN" \
  -F "text_input=Project Alpha kickoff" \
  -F "audio_file=@meeting.m4a" \
  -F "folder_id=123e4567-e89b-12d3-a456-426614174000"
```

### Add Content and Re-synthesize
```bash
curl -X POST "http://localhost:8000/api/v1/voice/synthesize/$NOTE_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -F "text_input=One more thing - budget approved!" \
  -F "resynthesize=true"
```
