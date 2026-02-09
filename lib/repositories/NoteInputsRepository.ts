import { eq, asc } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { db } from '../database/client';
import { noteInputs, type NoteInputRow, type NoteInputInsert } from '../database/schema';

class NoteInputsRepository {
  /**
   * Get all inputs for a note, ordered by created_at ascending (chronological)
   */
  async getAllForNote(noteId: string): Promise<NoteInputRow[]> {
    return db
      .select()
      .from(noteInputs)
      .where(eq(noteInputs.note_id, noteId))
      .orderBy(asc(noteInputs.created_at));
  }

  /**
   * Append a new input row (inputs are immutable once written)
   */
  async append(input: NoteInputInsert): Promise<void> {
    const now = new Date().toISOString();

    await db.insert(noteInputs).values({
      ...input,
      id: input.id || Crypto.randomUUID(),
      created_at: input.created_at || now,
      sync_status: input.sync_status || 'synced',
    });
  }

  /**
   * Delete a single input by ID
   */
  async delete(id: string): Promise<void> {
    await db.delete(noteInputs).where(eq(noteInputs.id, id));
  }

  /**
   * Delete all inputs for a note
   */
  async deleteAllForNote(noteId: string): Promise<void> {
    await db.delete(noteInputs).where(eq(noteInputs.note_id, noteId));
  }

  /**
   * Atomically replace all inputs for a note (delete all + bulk insert).
   * Used after API responses that return the full raw_inputs array.
   */
  async replaceAllForNote(noteId: string, inputs: NoteInputInsert[]): Promise<void> {
    await db.delete(noteInputs).where(eq(noteInputs.note_id, noteId));

    if (inputs.length === 0) return;

    const now = new Date().toISOString();
    await db.insert(noteInputs).values(
      inputs.map((input) => ({
        ...input,
        id: input.id || Crypto.randomUUID(),
        note_id: noteId,
        created_at: input.created_at || now,
        sync_status: input.sync_status || ('synced' as const),
      }))
    );
  }
}

export const noteInputsRepository = new NoteInputsRepository();
export default noteInputsRepository;
