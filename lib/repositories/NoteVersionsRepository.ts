import { eq, desc, asc, and } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { db } from '../database/client';
import { noteVersions, type NoteVersionRow, type NoteVersionInsert } from '../database/schema';

class NoteVersionsRepository {
  /**
   * Get all versions for a note, ordered by created_at descending (newest first)
   */
  async getAllForNote(noteId: string): Promise<NoteVersionRow[]> {
    return db
      .select()
      .from(noteVersions)
      .where(eq(noteVersions.note_id, noteId))
      .orderBy(desc(noteVersions.created_at));
  }

  /**
   * Create a new version. Returns the generated ID.
   * `id` and `created_at` are auto-generated if not provided.
   */
  async create(input: Omit<NoteVersionInsert, 'id' | 'created_at'> & { id?: string; created_at?: string }): Promise<string> {
    const now = new Date().toISOString();
    const id = input.id || Crypto.randomUUID();

    await db.insert(noteVersions).values({
      ...input,
      id,
      created_at: input.created_at || now,
      sync_status: 'pending',
    });

    return id;
  }

  /**
   * Get a single version by ID
   */
  async get(id: string): Promise<NoteVersionRow | null> {
    const results = await db
      .select()
      .from(noteVersions)
      .where(eq(noteVersions.id, id))
      .limit(1);

    return results[0] || null;
  }

  /**
   * Delete all versions for a note
   */
  async deleteAllForNote(noteId: string): Promise<void> {
    await db.delete(noteVersions).where(eq(noteVersions.note_id, noteId));
  }

  /**
   * Enforce retention limits for a note's versions.
   *
   * 1. Prune synth-kind versions down to maxSynth (keep newest).
   * 2. Prune total versions down to maxTotal (keep newest).
   *
   * Oldest versions (by created_at) are deleted first.
   */
  async prune(noteId: string, maxTotal: number = 20, maxSynth: number = 3): Promise<void> {
    // --- Step 1: prune synth versions ---
    const synthVersions = await db
      .select()
      .from(noteVersions)
      .where(and(eq(noteVersions.note_id, noteId), eq(noteVersions.kind, 'synth')))
      .orderBy(desc(noteVersions.created_at));

    if (synthVersions.length > maxSynth) {
      const synthToDelete = synthVersions.slice(maxSynth);
      for (const v of synthToDelete) {
        await db.delete(noteVersions).where(eq(noteVersions.id, v.id));
      }
    }

    // --- Step 2: prune total versions ---
    const allVersions = await db
      .select()
      .from(noteVersions)
      .where(eq(noteVersions.note_id, noteId))
      .orderBy(desc(noteVersions.created_at));

    if (allVersions.length > maxTotal) {
      const totalToDelete = allVersions.slice(maxTotal);
      for (const v of totalToDelete) {
        await db.delete(noteVersions).where(eq(noteVersions.id, v.id));
      }
    }
  }
}

export const noteVersionsRepository = new NoteVersionsRepository();
export default noteVersionsRepository;
