/**
 * Note Repository
 *
 * Provides CRUD operations for notes stored in the local SQLite database.
 * All operations are type-safe and return structured data.
 */

import { databaseManager } from '../database';
import { Note, NoteActions } from '../../data/types';

/**
 * Note data model for database storage
 * Extends the base Note interface with database-specific fields
 */
export interface DBNote extends Omit<Note, 'actions' | 'timestamp'> {
  user_id: string;
  summary?: string;
  audio_url?: string;
  audio_format?: string;
  is_archived: boolean;
  is_deleted: boolean;
  deleted_at?: string;
  ai_processed: boolean;
  ai_metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

/**
 * Note creation input (without auto-generated fields)
 */
export type NoteInput = Omit<
  DBNote,
  'id' | 'created_at' | 'updated_at'
>;

/**
 * Note update input (all fields optional)
 */
export type NoteUpdate = Partial<Omit<NoteInput, 'id'>>;

/**
 * Note query filters
 */
export interface NoteFilters {
  userId?: string;
  folderId?: string;
  isPinned?: boolean;
  isArchived?: boolean;
  isDeleted?: boolean;
  searchQuery?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
  sortBy?: 'created_at' | 'updated_at' | 'title';
  sortOrder?: 'ASC' | 'DESC';
}

/**
 * Note Repository Class
 *
 * Handles all database operations for notes including:
 * - CRUD operations (create, read, update, delete)
 * - Query with filters
 * - Soft delete support
 * - Batch operations
 */
export class NoteRepository {
  private tableName = 'notes';

  /**
   * Create a new note
   */
  async create(input: NoteInput): Promise<DBNote> {
    const db = await databaseManager.getDatabase();

    const now = new Date().toISOString();
    const id = this.generateId();

    const note: DBNote = {
      ...input,
      id,
      created_at: now,
      updated_at: now,
    };

    await db.runAsync(
      `INSERT INTO ${this.tableName} (
        id, user_id, folder_id, title, transcript, summary,
        duration, audio_url, audio_format, tags,
        is_pinned, is_archived, is_deleted, deleted_at,
        ai_processed, ai_metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        note.id,
        note.user_id,
        note.folderId || null,
        note.title,
        note.transcript,
        note.summary || null,
        note.duration || null,
        note.audio_url || null,
        note.audio_format || null,
        JSON.stringify(note.tags),
        note.isPinned ? 1 : 0,
        note.is_archived ? 1 : 0,
        note.is_deleted ? 1 : 0,
        note.deleted_at || null,
        note.ai_processed ? 1 : 0,
        JSON.stringify(note.ai_metadata),
        note.created_at,
        note.updated_at,
      ]
    );

    return note;
  }

  /**
   * Get a note by ID
   */
  async getById(id: string): Promise<DBNote | null> {
    const db = await databaseManager.getDatabase();

    const result = await db.getFirstAsync<any>(
      `SELECT * FROM ${this.tableName} WHERE id = ?`,
      [id]
    );

    return result ? this.mapFromDb(result) : null;
  }

  /**
   * Get all notes with optional filters
   */
  async getAll(filters: NoteFilters = {}): Promise<DBNote[]> {
    const db = await databaseManager.getDatabase();

    let query = `SELECT * FROM ${this.tableName} WHERE 1=1`;
    const params: any[] = [];

    // Apply filters
    if (filters.userId) {
      query += ' AND user_id = ?';
      params.push(filters.userId);
    }

    if (filters.folderId) {
      query += ' AND folder_id = ?';
      params.push(filters.folderId);
    }

    if (filters.isPinned !== undefined) {
      query += ` AND is_pinned = ?`;
      params.push(filters.isPinned ? 1 : 0);
    }

    if (filters.isArchived !== undefined) {
      query += ` AND is_archived = ?`;
      params.push(filters.isArchived ? 1 : 0);
    }

    if (filters.isDeleted !== undefined) {
      query += ` AND is_deleted = ?`;
      params.push(filters.isDeleted ? 1 : 0);
    }

    if (filters.searchQuery) {
      query += ` AND (title LIKE ? OR transcript LIKE ?)`;
      const searchTerm = `%${filters.searchQuery}%`;
      params.push(searchTerm, searchTerm);
    }

    if (filters.tags && filters.tags.length > 0) {
      // Filter by tags (JSON array contains any of the tags)
      query += ` AND (`;
      const tagConditions = filters.tags.map(() => `tags LIKE ?`);
      query += tagConditions.join(' OR ');
      query += `)`;
      filters.tags.forEach(tag => {
        params.push(`%"${tag}"%`);
      });
    }

    // Sorting
    const sortBy = filters.sortBy || 'created_at';
    const sortOrder = filters.sortOrder || 'DESC';
    query += ` ORDER BY ${sortBy} ${sortOrder}`;

    // Pagination
    if (filters.limit) {
      query += ` LIMIT ?`;
      params.push(filters.limit);

      if (filters.offset) {
        query += ` OFFSET ?`;
        params.push(filters.offset);
      }
    }

    const results = await db.getAllAsync<any>(query, params);
    return results.map(row => this.mapFromDb(row));
  }

  /**
   * Update a note
   */
  async update(id: string, updates: NoteUpdate): Promise<DBNote | null> {
    const db = await databaseManager.getDatabase();

    const existing = await this.getById(id);
    if (!existing) return null;

    const updated: DBNote = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    await db.runAsync(
      `UPDATE ${this.tableName} SET
        user_id = ?, folder_id = ?, title = ?, transcript = ?, summary = ?,
        duration = ?, audio_url = ?, audio_format = ?, tags = ?,
        is_pinned = ?, is_archived = ?, is_deleted = ?, deleted_at = ?,
        ai_processed = ?, ai_metadata = ?, updated_at = ?
      WHERE id = ?`,
      [
        updated.user_id,
        updated.folderId || null,
        updated.title,
        updated.transcript,
        updated.summary || null,
        updated.duration || null,
        updated.audio_url || null,
        updated.audio_format || null,
        JSON.stringify(updated.tags),
        updated.isPinned ? 1 : 0,
        updated.is_archived ? 1 : 0,
        updated.is_deleted ? 1 : 0,
        updated.deleted_at || null,
        updated.ai_processed ? 1 : 0,
        JSON.stringify(updated.ai_metadata),
        updated.updated_at,
        id,
      ]
    );

    return updated;
  }

  /**
   * Delete a note (hard delete)
   */
  async delete(id: string): Promise<boolean> {
    const db = await databaseManager.getDatabase();

    const result = await db.runAsync(
      `DELETE FROM ${this.tableName} WHERE id = ?`,
      [id]
    );

    return (result.changes || 0) > 0;
  }

  /**
   * Soft delete a note
   */
  async softDelete(id: string): Promise<DBNote | null> {
    return this.update(id, {
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    });
  }

  /**
   * Restore a soft-deleted note
   */
  async restore(id: string): Promise<DBNote | null> {
    return this.update(id, {
      is_deleted: false,
      deleted_at: undefined,
    });
  }

  /**
   * Count notes with optional filters
   */
  async count(filters: NoteFilters = {}): Promise<number> {
    const db = await databaseManager.getDatabase();

    let query = `SELECT COUNT(*) as count FROM ${this.tableName} WHERE 1=1`;
    const params: any[] = [];

    // Apply same filters as getAll
    if (filters.userId) {
      query += ' AND user_id = ?';
      params.push(filters.userId);
    }

    if (filters.folderId) {
      query += ' AND folder_id = ?';
      params.push(filters.folderId);
    }

    if (filters.isPinned !== undefined) {
      query += ` AND is_pinned = ?`;
      params.push(filters.isPinned ? 1 : 0);
    }

    if (filters.isArchived !== undefined) {
      query += ` AND is_archived = ?`;
      params.push(filters.isArchived ? 1 : 0);
    }

    if (filters.isDeleted !== undefined) {
      query += ` AND is_deleted = ?`;
      params.push(filters.isDeleted ? 1 : 0);
    }

    const result = await db.getFirstAsync<{ count: number }>(query, params);
    return result?.count || 0;
  }

  /**
   * Batch create notes
   */
  async createMany(inputs: NoteInput[]): Promise<DBNote[]> {
    return databaseManager.withTransaction(async () => {
      const notes: DBNote[] = [];
      for (const input of inputs) {
        const note = await this.create(input);
        notes.push(note);
      }
      return notes;
    });
  }

  /**
   * Batch update notes
   */
  async updateMany(updates: { id: string; changes: NoteUpdate }[]): Promise<(DBNote | null)[]> {
    return databaseManager.withTransaction(async () => {
      const results: (DBNote | null)[] = [];
      for (const { id, changes } of updates) {
        const result = await this.update(id, changes);
        results.push(result);
      }
      return results;
    });
  }

  /**
   * Batch delete notes
   */
  async deleteMany(ids: string[]): Promise<number> {
    return databaseManager.withTransaction(async () => {
      let deletedCount = 0;
      for (const id of ids) {
        const deleted = await this.delete(id);
        if (deleted) deletedCount++;
      }
      return deletedCount;
    });
  }

  /**
   * Get notes by tag
   */
  async getByTag(tag: string, userId?: string): Promise<DBNote[]> {
    return this.getAll({
      userId,
      tags: [tag],
      isDeleted: false,
    });
  }

  /**
   * Search notes by content
   */
  async search(query: string, userId?: string): Promise<DBNote[]> {
    return this.getAll({
      userId,
      searchQuery: query,
      isDeleted: false,
    });
  }

  /**
   * Get recent notes
   */
  async getRecent(userId: string, limit = 20): Promise<DBNote[]> {
    return this.getAll({
      userId,
      isDeleted: false,
      sortBy: 'created_at',
      sortOrder: 'DESC',
      limit,
    });
  }

  /**
   * Get pinned notes
   */
  async getPinned(userId: string): Promise<DBNote[]> {
    return this.getAll({
      userId,
      isPinned: true,
      isDeleted: false,
      sortBy: 'updated_at',
      sortOrder: 'DESC',
    });
  }

  /**
   * Map database row to Note object
   */
  private mapFromDb(row: any): DBNote {
    return {
      id: row.id,
      user_id: row.user_id,
      folderId: row.folder_id,
      title: row.title,
      transcript: row.transcript,
      summary: row.summary,
      duration: row.duration,
      audio_url: row.audio_url,
      audio_format: row.audio_format,
      tags: row.tags ? JSON.parse(row.tags) : [],
      isPinned: row.is_pinned === 1,
      is_archived: row.is_archived === 1,
      is_deleted: row.is_deleted === 1,
      deleted_at: row.deleted_at,
      ai_processed: row.ai_processed === 1,
      ai_metadata: row.ai_metadata ? JSON.parse(row.ai_metadata) : {},
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  /**
   * Generate a unique ID for a new note
   */
  private generateId(): string {
    return `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance
export const noteRepository = new NoteRepository();
