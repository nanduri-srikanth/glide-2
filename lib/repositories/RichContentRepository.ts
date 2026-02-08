import { eq } from 'drizzle-orm';
import { db } from '../database/client';
import { noteRichContent, type NoteRichContentRow } from '../database/schema';

class RichContentRepository {
  /**
   * Get rich content for a note by ID
   */
  async get(noteId: string): Promise<NoteRichContentRow | null> {
    const results = await db
      .select()
      .from(noteRichContent)
      .where(eq(noteRichContent.note_id, noteId))
      .limit(1);

    return results[0] || null;
  }

  /**
   * Save (upsert) rich content for a note
   */
  async save(noteId: string, rtfBase64: string, plaintext?: string): Promise<void> {
    const now = new Date().toISOString();
    const existing = await this.get(noteId);

    if (existing !== null) {
      await db
        .update(noteRichContent)
        .set({ rtf_base64: rtfBase64, plaintext: plaintext ?? null, updated_at: now })
        .where(eq(noteRichContent.note_id, noteId));
    } else {
      await db.insert(noteRichContent).values({
        note_id: noteId,
        rtf_base64: rtfBase64,
        plaintext: plaintext ?? null,
        updated_at: now,
      });
    }
  }

  /**
   * Delete rich content for a note
   */
  async delete(noteId: string): Promise<void> {
    await db.delete(noteRichContent).where(eq(noteRichContent.note_id, noteId));
  }

  /**
   * Delete all rich content
   */
  async deleteAll(): Promise<void> {
    await db.delete(noteRichContent);
  }
}

export const richContentRepository = new RichContentRepository();
export default richContentRepository;
