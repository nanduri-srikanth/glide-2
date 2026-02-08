# Glide Roadmap: Formatting + Smart AI Notes

## Goals
- Let users write and edit notes with fast, expressive formatting (iOS-first).
- Keep the system easy to debug and maintain long-term (pure transforms, versioned AI outputs, traceability).
- Enable “Smart AI Notes” that improve over time without overwriting user intent.

## Non-Negotiables
- Never overwrite user-written/edited content or formatting without an explicit user action.
- Every AI step is debuggable (structured output, stored run metadata, prompt versioning).
- If we must optimize, optimize for iOS (keyboard accessory UX, interactions, performance).

## Core Product Principles
- Inputs are first-class artifacts (voice, paste, PDF, link).
- AI outputs are structured “views” that can be safely applied to notes.
- Style matching is deterministic: AI produces JSON; the app renders into user style via a renderer (not “LLM writes markdown directly”).

## Key Architecture Decisions

### 1) Separate AI Text From User Text (Longevity)
Store AI output and user-edited formatted content separately.

- `notes.transcript`: AI-owned content (derived, can be regenerated).
- `notes.content_markdown` (NEW): user-owned formatted content (canonical for editing).

Rendering rule:
- Display `content_markdown ?? transcript`.

Re-synthesize rule:
- Re-synthesize updates `transcript` only.
- User can explicitly choose:
  - Replace my edits with AI version: `content_markdown = transcript`
  - Insert AI section into my note (append structured section)

### 2) Formatting As Pure, Tested Text Transforms
All formatting operations are implemented as pure functions:
- Inputs: `(text, selection, context)`
- Outputs: `(nextText, nextSelection, metadata)`

Benefits:
- Easy unit tests
- Easy bug reproduction
- Stable behavior across platforms

### 3) AI Outputs As Versioned, Structured JSON
LLM returns JSON only. Markdown is generated via a deterministic renderer that applies the user's style profile.

## Features: Note Formatting (Match Target UI)

### Block Styles (apply to current line or selected lines)
- Title: `# `
- Heading: `## `
- Subheading: `### `
- Body: remove heading markers for selected line(s)

### Inline Styles (toggle on selection or insert markers at cursor)
- Bold: `**...**`
- Italic: `_..._`
- Underline: `<u>...</u>` (sanitized)
- Strikethrough: `~~...~~`

### Lists + Indentation (selection-aware; multi-line)
- Bullets: `- `
- Numbered: `1. `
- Checklist: `- [ ] `
- Indent right: add 2 spaces or increase list nesting
- Indent left: remove 2 spaces or decrease nesting

### Color/Highlight (start small; expand later)
Initial:
- Highlight: `<mark>...</mark>` (sanitized)

Optional (later):
- Limited palette via controlled markers (avoid freeform inline CSS)

### Insertions
- Link: `[text](url)` (prompt for URL; edit existing link)
- Table: insert markdown table stub
- Attachment placeholders: markdown link to Supabase Storage object (phase-gated)

## Undo/Redo
- Add Undo in the note editor header (iOS-first).
- Implement `useUndoRedo` storing `{ text, selection }` snapshots.
- Snapshot rules:
  - Always on formatting actions
  - Typing snapshots throttled (e.g., every 600-900ms, and on newline)
- Clear redo stack on new edits.

## iOS-First Editor UX
- iOS: `InputAccessoryView` for the keyboard toolbar.
- Android: functional toolbar fallback pinned above keyboard.

Target interaction:
- Quick bar with icons, and an `Aa` button to open a bottom sheet “Format” panel.

## “Smart AI Notes” (Synthesis + Style Matching)

### Problem
AI summaries default to prose; users often want clipped, bullet-like notes. Users also paste/clip content and attach PDFs.

### Solution Overview
1. Capture all “inputs” (voice, paste, PDF, link) as first-class records.
2. AI produces structured JSON outputs (sections, bullets, tasks, references).
3. Renderer converts JSON into markdown using the user's style profile.
4. User explicitly applies AI output: insert/append/replace.

### Style Profile (per user, optionally per folder)
Compute from user-edited content (`content_markdown`) only.

`user_style_profile` (jsonb):
- `preferred_structure`: `bullets|mixed|prose`
- `bullet_ratio`
- `avg_line_len`
- `heading_usage`
- `checklist_usage`
- `tone`: `clipped|neutral|verbose`

Renderer uses this profile to:
- Convert paragraphs into bullets where appropriate
- Choose headings vs flat structure
- Prefer checklists for tasks if user tends to use them

### AI Output Schema (example)
AI returns JSON like:
- `title`
- `sections[]`: `{ heading, bullets[], paragraphs[], tasks[], quotes[], references[] }`
- `references[]`: pointers back to inputs (e.g., PDF pages, paste sources)

## Inputs, Attachments, and Provenance (Wisprflow-like)

### Add Content Modal (expanded)
- Record audio
- Paste text
- Add link
- Import PDF
- Clip from note (quote block w/ source reference)

### Provenance
All AI-generated content can include citations back to:
- input IDs
- PDF page numbers
- source URL

## Database Roadmap (Production-Grade, Minimal First)

### Phase 1: User Editing + Formatting
- Add `notes.content_markdown` (nullable)
- Add `notes.content_updated_at` (optional)

### Phase 2: Inputs + Versioned AI Runs
- `note_inputs`
  - `id`, `note_id`, `user_id`, `type` (`audio|text|pdf|clip|link`)
  - `storage_path`, `raw_text`, `source_url`, `page_range`, `created_at`, `metadata` (jsonb)
- `note_ai_runs`
  - `id`, `note_id`, `user_id`, `run_type` (`summarize|extract|actions|entities`)
  - `model`, `prompt_version`, `input_ids`, `output_json` (jsonb)
  - `created_at`, `latency_ms`, `token_counts` (jsonb)

### Phase 3: Retrieval + PDF Chunking
- `note_chunks`
  - `id`, `user_id`, `note_id`, `input_id`, `content`, `embedding` (pgvector), `created_at`

### Phase 4: Knowledge Graph (Start Small)
- `entities`
  - `id`, `user_id`, `name`, `type` (`person|org|project|topic|doc`), `metadata` (jsonb)
- `entity_mentions`
  - `entity_id`, `note_id`, `input_id`, `snippet`, `created_at`

Later (only when product surfaces demand it):
- `entity_edges`
  - `src_entity_id`, `dst_entity_id`, `relation`, `confidence`, `note_id`, `created_at`

## Debuggability and Tooling
- Store every AI run with `prompt_version` and structured JSON outputs.
- Add a dev-only “AI Trace” panel in note detail:
  - inputs used
  - latest `note_ai_runs` JSON (raw)
  - rendered markdown preview
  - citations view
- Formatting transforms unit tested (Jest) with:
  - selection edge cases
  - multi-line blocks
  - list nesting/indent behavior

## Phased Execution Plan

### Phase 1: Formatting + Undo (iOS-first)
- Add `content_markdown`
- Selection-aware formatting transforms
- Undo/redo
- iOS InputAccessoryView toolbar + format sheet
- Android fallback toolbar

### Phase 2: Inputs As First-Class
- Introduce `note_inputs` and migrate existing input history to this table
- Expand “Add Content” to support paste/link/PDF (upload + metadata)

### Phase 3: Structured AI Output + Safe Apply
- Create AI JSON schema(s) and server endpoints
- Add renderer: JSON -> markdown using style profile
- Add explicit “Apply” actions: insert/append/replace

### Phase 4: Citations + Retrieval
- Chunk extracted text, generate embeddings
- “Ask your notes” and “Related notes” surfaces
- Citation UI (tap to source; PDF page jump)

### Phase 5: Knowledge Graph Surfaces
- Entity extraction + mentions
- Topic pages and cross-note navigation

## Open Decisions (Need to Lock Before Phase 1/2)
- Underline/highlight/color encoding:
  - Recommended: limited HTML tags + strict sanitizer (`<u>`, `<mark>`, controlled spans)
- Default AI style:
  - Auto-detect per user/folder via style profile + quick toggle (Prose vs Notes)

