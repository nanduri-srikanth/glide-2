/**
 * Audio Uploads Repository
 *
 * Manages the audio upload queue in SQLite.
 * Tracks which audio files need to be uploaded and their status.
 */

import { eq, and, or, asc, desc, sql } from 'drizzle-orm';
import { db } from '../database/client';
import { audioUploads, type AudioUploadRow, type AudioUploadInsert, type AudioUploadStatus } from '../database/schema';

export interface QueuedAudioUpload {
  id: number;
  noteId: string;
  localPath: string;
  remoteUrl: string | null;
  fileSize: number | null;
  status: AudioUploadStatus;
  retryCount: number;
  lastError: string | null;
  createdAt: string;
  uploadedAt: string | null;
}

class AudioUploadsRepository {
  /**
   * Queue an audio file for upload
   */
  async queue(noteId: string, localPath: string, fileSize?: number): Promise<number> {
    const now = new Date().toISOString();

    const result = await db.insert(audioUploads).values({
      note_id: noteId,
      local_path: localPath,
      file_size: fileSize || null,
      status: 'pending',
      retry_count: 0,
      created_at: now,
    }).returning({ id: audioUploads.id });

    console.log('[AudioUploadsRepository] Queued audio upload for note:', noteId);
    return result[0].id;
  }

  /**
   * Get pending uploads (for processing)
   */
  async getPending(limit: number = 5): Promise<QueuedAudioUpload[]> {
    const rows = await db
      .select()
      .from(audioUploads)
      .where(
        or(
          eq(audioUploads.status, 'pending'),
          eq(audioUploads.status, 'failed') // Retry failed uploads
        )
      )
      .orderBy(asc(audioUploads.created_at))
      .limit(limit);

    return rows.map(this.toQueuedUpload);
  }

  /**
   * Get upload by note ID
   */
  async getByNoteId(noteId: string): Promise<QueuedAudioUpload | null> {
    const rows = await db
      .select()
      .from(audioUploads)
      .where(eq(audioUploads.note_id, noteId))
      .orderBy(desc(audioUploads.created_at))
      .limit(1);

    return rows.length > 0 ? this.toQueuedUpload(rows[0]) : null;
  }

  /**
   * Mark upload as started
   */
  async markUploading(id: number): Promise<void> {
    await db
      .update(audioUploads)
      .set({ status: 'uploading' })
      .where(eq(audioUploads.id, id));
  }

  /**
   * Mark upload as completed
   */
  async markCompleted(id: number, remoteUrl: string): Promise<void> {
    const now = new Date().toISOString();

    await db
      .update(audioUploads)
      .set({
        status: 'completed',
        remote_url: remoteUrl,
        uploaded_at: now,
      })
      .where(eq(audioUploads.id, id));

    console.log('[AudioUploadsRepository] Marked upload completed:', id);
  }

  /**
   * Mark upload as failed
   */
  async markFailed(id: number, error: string): Promise<void> {
    // Get current retry count
    const rows = await db
      .select({ retry_count: audioUploads.retry_count })
      .from(audioUploads)
      .where(eq(audioUploads.id, id))
      .limit(1);

    const currentRetryCount = rows[0]?.retry_count || 0;

    await db
      .update(audioUploads)
      .set({
        status: 'failed',
        last_error: error,
        retry_count: currentRetryCount + 1,
      })
      .where(eq(audioUploads.id, id));

    console.log('[AudioUploadsRepository] Marked upload failed:', id, error);
  }

  /**
   * Get count of pending uploads
   */
  async getPendingCount(): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(audioUploads)
      .where(
        or(
          eq(audioUploads.status, 'pending'),
          eq(audioUploads.status, 'uploading')
        )
      );

    return result[0]?.count || 0;
  }

  /**
   * Get count of failed uploads
   */
  async getFailedCount(): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(audioUploads)
      .where(eq(audioUploads.status, 'failed'));

    return result[0]?.count || 0;
  }

  /**
   * Delete upload record
   */
  async delete(id: number): Promise<void> {
    await db.delete(audioUploads).where(eq(audioUploads.id, id));
  }

  /**
   * Delete uploads for a note
   */
  async deleteForNote(noteId: string): Promise<void> {
    await db.delete(audioUploads).where(eq(audioUploads.note_id, noteId));
  }

  /**
   * Get all uploads (for debugging)
   */
  async getAll(): Promise<QueuedAudioUpload[]> {
    const rows = await db
      .select()
      .from(audioUploads)
      .orderBy(desc(audioUploads.created_at));

    return rows.map(this.toQueuedUpload);
  }

  /**
   * Clear completed uploads older than specified days
   */
  async clearOldCompleted(daysOld: number = 7): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    const cutoffIso = cutoffDate.toISOString();

    const result = await db
      .delete(audioUploads)
      .where(
        and(
          eq(audioUploads.status, 'completed'),
          sql`${audioUploads.uploaded_at} < ${cutoffIso}`
        )
      )
      .returning({ id: audioUploads.id });

    return result.length;
  }

  /**
   * Reset stuck "uploading" status to "pending"
   * Call this on app start to handle interrupted uploads
   */
  async resetStuckUploads(): Promise<number> {
    const result = await db
      .update(audioUploads)
      .set({ status: 'pending' })
      .where(eq(audioUploads.status, 'uploading'))
      .returning({ id: audioUploads.id });

    if (result.length > 0) {
      console.log('[AudioUploadsRepository] Reset', result.length, 'stuck uploads');
    }

    return result.length;
  }

  private toQueuedUpload(row: AudioUploadRow): QueuedAudioUpload {
    return {
      id: row.id,
      noteId: row.note_id,
      localPath: row.local_path,
      remoteUrl: row.remote_url,
      fileSize: row.file_size,
      status: row.status as AudioUploadStatus,
      retryCount: row.retry_count || 0,
      lastError: row.last_error,
      createdAt: row.created_at,
      uploadedAt: row.uploaded_at,
    };
  }
}

export const audioUploadsRepository = new AudioUploadsRepository();
export default audioUploadsRepository;
