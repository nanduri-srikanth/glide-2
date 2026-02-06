import { eq, and, or, like, desc, asc, sql, isNull } from 'drizzle-orm';
import { db } from '../database/client';
import { notes, actions, type NoteRow, type NoteInsert, type SyncStatus, type ActionRow } from '../database/schema';
import { BaseRepository } from './BaseRepository';
import type { NoteFilters, NoteListItem, NoteDetailResponse, ActionResponse } from '@/services/notes';

export interface LocalNoteListItem extends NoteListItem {
  sync_status: SyncStatus | null;
}

export interface LocalNoteDetail extends NoteDetailResponse {
  sync_status: SyncStatus | null;
  local_audio_path: string | null;
}

export interface CreateNoteInput {
  id: string;
  user_id: string;
  title: string;
  transcript?: string;
  folder_id?: string | null;
  tags?: string[];
  duration?: number;
  audio_url?: string;
  local_audio_path?: string;
}

export interface UpdateNoteInput {
  title?: string;
  transcript?: string;
  summary?: string;
  folder_id?: string | null;
  tags?: string[];
  is_pinned?: boolean;
  is_archived?: boolean;
  is_deleted?: boolean;
  ai_metadata?: Record<string, any>;
  audio_url?: string;
  local_audio_path?: string;
}

class NotesRepository extends BaseRepository<NoteRow, NoteInsert, typeof notes> {
  protected table = notes;
  protected tableName = 'notes';

  /**
   * List notes with filters, matching API response format
   */
  async list(filters: NoteFilters = {}, userId: string): Promise<LocalNoteListItem[]> {
    let query = db
      .select()
      .from(notes)
      .where(
        and(
          eq(notes.user_id, userId),
          eq(notes.is_deleted, false),
          filters.folder_id ? eq(notes.folder_id, filters.folder_id) : undefined,
          filters.is_pinned !== undefined ? eq(notes.is_pinned, filters.is_pinned) : undefined,
          filters.is_archived !== undefined ? eq(notes.is_archived, filters.is_archived) : undefined,
          filters.q ? or(
            like(notes.title, `%${filters.q}%`),
            like(notes.transcript, `%${filters.q}%`)
          ) : undefined
        )
      )
      .orderBy(desc(notes.is_pinned), desc(notes.created_at));

    const noteRows = await query;

    // Get action counts for each note
    const noteIds = noteRows.map(n => n.id);
    const actionCounts = await this.getActionCounts(noteIds);

    return noteRows.map(note => this.toListItem(note, actionCounts[note.id] || {}));
  }

  /**
   * Get action counts grouped by note_id and action_type
   */
  private async getActionCounts(noteIds: string[]): Promise<Record<string, Record<string, number>>> {
    if (noteIds.length === 0) return {};

    const counts = await db
      .select({
        note_id: actions.note_id,
        action_type: actions.action_type,
        count: sql<number>`count(*)`,
      })
      .from(actions)
      .where(sql`${actions.note_id} IN (${sql.join(noteIds.map(id => sql`${id}`), sql`, `)})`)
      .groupBy(actions.note_id, actions.action_type);

    const result: Record<string, Record<string, number>> = {};
    for (const row of counts) {
      if (!result[row.note_id]) {
        result[row.note_id] = {};
      }
      result[row.note_id][row.action_type] = row.count;
    }
    return result;
  }

  /**
   * Convert note row to list item format
   */
  private toListItem(note: NoteRow, actionCounts: Record<string, number>): LocalNoteListItem {
    return {
      id: note.id,
      title: note.title,
      preview: note.transcript?.slice(0, 150) || '',
      duration: note.duration,
      folder_id: note.folder_id,
      tags: (note.tags as string[]) || [],
      is_pinned: note.is_pinned || false,
      action_count: Object.values(actionCounts).reduce((a, b) => a + b, 0),
      calendar_count: actionCounts.calendar || 0,
      email_count: actionCounts.email || 0,
      reminder_count: actionCounts.reminder || 0,
      created_at: note.created_at,
      updated_at: note.updated_at,
      sync_status: note.sync_status,
    };
  }

  /**
   * Get note detail by ID
   */
  async getDetail(id: string): Promise<LocalNoteDetail | null> {
    const noteRows = await db
      .select()
      .from(notes)
      .where(eq(notes.id, id))
      .limit(1);

    if (noteRows.length === 0) return null;

    const note = noteRows[0];
    const noteActions = await this.getActionsForNote(id);

    return this.toDetail(note, noteActions);
  }

  /**
   * Get actions for a note
   */
  private async getActionsForNote(noteId: string): Promise<ActionRow[]> {
    return db
      .select()
      .from(actions)
      .where(eq(actions.note_id, noteId));
  }

  /**
   * Convert note row to detail format
   */
  private toDetail(note: NoteRow, noteActions: ActionRow[]): LocalNoteDetail {
    return {
      id: note.id,
      title: note.title,
      transcript: note.transcript || '',
      summary: note.summary,
      duration: note.duration,
      audio_url: note.audio_url,
      folder_id: note.folder_id,
      folder_name: null, // Will be filled by caller if needed
      tags: (note.tags as string[]) || [],
      is_pinned: note.is_pinned || false,
      is_archived: note.is_archived || false,
      ai_processed: !!note.ai_metadata,
      ai_metadata: note.ai_metadata as NoteDetailResponse['ai_metadata'],
      actions: noteActions.map(a => this.toActionResponse(a)),
      created_at: note.created_at,
      updated_at: note.updated_at,
      sync_status: note.sync_status,
      local_audio_path: note.local_audio_path,
    };
  }

  /**
   * Convert action row to response format
   */
  private toActionResponse(action: ActionRow): ActionResponse {
    return {
      id: action.id,
      note_id: action.note_id,
      action_type: action.action_type as ActionResponse['action_type'],
      status: action.status as ActionResponse['status'],
      priority: action.priority as ActionResponse['priority'],
      title: action.title,
      description: action.description,
      scheduled_date: action.scheduled_date,
      scheduled_end_date: null,
      location: null,
      attendees: [],
      email_to: null,
      email_subject: null,
      email_body: null,
      external_id: null,
      external_service: null,
      external_url: null,
      created_at: action.created_at,
      executed_at: null,
    };
  }

  /**
   * Create a new note
   */
  async create(input: CreateNoteInput): Promise<string> {
    const now = new Date().toISOString();

    await db.insert(notes).values({
      id: input.id,
      user_id: input.user_id,
      title: input.title,
      transcript: input.transcript || '',
      folder_id: input.folder_id || null,
      tags: input.tags || [],
      duration: input.duration || null,
      audio_url: input.audio_url || null,
      local_audio_path: input.local_audio_path || null,
      is_pinned: false,
      is_archived: false,
      is_deleted: false,
      created_at: now,
      updated_at: now,
      sync_status: 'pending',
      local_updated_at: now,
    });

    return input.id;
  }

  /**
   * Update a note
   */
  async update(id: string, input: UpdateNoteInput): Promise<void> {
    const now = new Date().toISOString();

    await db
      .update(notes)
      .set({
        ...input,
        updated_at: now,
        sync_status: 'pending',
        local_updated_at: now,
      })
      .where(eq(notes.id, id));
  }

  /**
   * Soft delete a note
   */
  async softDelete(id: string): Promise<void> {
    const now = new Date().toISOString();

    await db
      .update(notes)
      .set({
        is_deleted: true,
        updated_at: now,
        sync_status: 'pending',
        local_updated_at: now,
      })
      .where(eq(notes.id, id));
  }

  /**
   * Permanently delete a note
   */
  async hardDelete(id: string): Promise<void> {
    // Delete associated actions first
    await db.delete(actions).where(eq(actions.note_id, id));
    // Then delete the note
    await db.delete(notes).where(eq(notes.id, id));
  }

  /**
   * Upsert note from server data
   */
  async upsertFromServer(serverNote: NoteDetailResponse, userId: string): Promise<void> {
    const existing = await this.getById(serverNote.id);

    const noteData: NoteInsert = {
      id: serverNote.id,
      user_id: userId,
      folder_id: serverNote.folder_id,
      title: serverNote.title,
      transcript: serverNote.transcript,
      summary: serverNote.summary,
      duration: serverNote.duration,
      audio_url: serverNote.audio_url,
      tags: serverNote.tags,
      is_pinned: serverNote.is_pinned,
      is_archived: serverNote.is_archived,
      is_deleted: false,
      ai_metadata: serverNote.ai_metadata ? JSON.stringify(serverNote.ai_metadata) : null,
      created_at: serverNote.created_at,
      updated_at: serverNote.updated_at,
      sync_status: 'synced',
      server_updated_at: serverNote.updated_at,
    };

    if (existing) {
      // Check for conflict (local changes since last sync)
      if (existing.sync_status === 'pending') {
        // Local changes exist - use last-write-wins strategy based on timestamps.
        // If server data is newer, accept it. Otherwise keep local changes
        // so they can be pushed on the next sync cycle.
        const localTime = existing.local_updated_at || existing.updated_at;
        const serverTime = serverNote.updated_at;

        if (serverTime && localTime && serverTime > localTime) {
          // Server is newer - accept server data, discard local pending changes
          await db
            .update(notes)
            .set(noteData)
            .where(eq(notes.id, serverNote.id));
        }
        // Otherwise keep local version - it will be pushed on next sync
        return;
      }

      // No local changes - update from server
      await db
        .update(notes)
        .set(noteData)
        .where(eq(notes.id, serverNote.id));
    } else {
      await db.insert(notes).values(noteData);
    }

    // Update actions (guard against null/undefined from API)
    if (Array.isArray(serverNote.actions) && serverNote.actions.length > 0) {
      await this.upsertActionsFromServer(serverNote.id, serverNote.actions);
    }
  }

  /**
   * Upsert actions from server data
   */
  private async upsertActionsFromServer(noteId: string, serverActions: ActionResponse[]): Promise<void> {
    // Delete existing actions for this note
    await db.delete(actions).where(eq(actions.note_id, noteId));

    // Insert new actions
    const now = new Date().toISOString();
    for (const action of serverActions) {
      await db.insert(actions).values({
        id: action.id,
        note_id: action.note_id || noteId,
        action_type: action.action_type,
        status: action.status,
        priority: action.priority,
        title: action.title,
        description: action.description,
        scheduled_date: action.scheduled_date,
        created_at: action.created_at || now,
        updated_at: action.created_at || now,
        sync_status: 'synced',
      });
    }
  }

  /**
   * Bulk upsert notes from server (for initial hydration)
   */
  async bulkUpsert(serverNotes: NoteListItem[], userId: string): Promise<void> {
    for (const note of serverNotes) {
      const existing = await this.getById(note.id);

      const noteData: NoteInsert = {
        id: note.id,
        user_id: userId,
        folder_id: note.folder_id,
        title: note.title,
        transcript: note.preview || '', // List items only have preview; full transcript fetched on detail view
        duration: note.duration,
        tags: note.tags,
        is_pinned: note.is_pinned,
        is_archived: false,
        is_deleted: false,
        created_at: note.created_at,
        updated_at: note.updated_at || note.created_at,
        sync_status: 'synced',
        server_updated_at: note.updated_at || note.created_at,
      };

      if (existing) {
        if (existing.sync_status !== 'pending') {
          await db
            .update(notes)
            .set(noteData)
            .where(eq(notes.id, note.id));
        }
      } else {
        await db.insert(notes).values(noteData);
      }
    }
  }

  /**
   * Search notes by query
   */
  async search(query: string, userId: string): Promise<LocalNoteListItem[]> {
    const searchTerm = `%${query}%`;

    const noteRows = await db
      .select()
      .from(notes)
      .where(
        and(
          eq(notes.user_id, userId),
          eq(notes.is_deleted, false),
          or(
            like(notes.title, searchTerm),
            like(notes.transcript, searchTerm),
            like(notes.summary, searchTerm)
          )
        )
      )
      .orderBy(desc(notes.created_at));

    const noteIds = noteRows.map(n => n.id);
    const actionCounts = await this.getActionCounts(noteIds);

    return noteRows.map(note => this.toListItem(note, actionCounts[note.id] || {}));
  }

  /**
   * Get all note IDs for a user (for cleanup)
   */
  async getAllIds(userId: string): Promise<string[]> {
    const result = await db
      .select({ id: notes.id })
      .from(notes)
      .where(eq(notes.user_id, userId));
    return result.map(r => r.id);
  }

  /**
   * Clear all notes for a user
   */
  async clearForUser(userId: string): Promise<void> {
    const noteIds = await this.getAllIds(userId);

    // Delete actions first
    for (const id of noteIds) {
      await db.delete(actions).where(eq(actions.note_id, id));
    }

    // Then delete notes
    await db.delete(notes).where(eq(notes.user_id, userId));
  }
}

export const notesRepository = new NotesRepository();
export default notesRepository;
