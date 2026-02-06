/**
 * Audio Uploader
 *
 * Handles background uploading of locally stored audio files.
 * When a note is created offline with audio, the audio is saved locally
 * and queued for upload. This service processes that queue.
 */

import { audioUploadsRepository, notesRepository } from '../repositories';
import { audioStorage } from '@/services/audioStorage';
import { voiceService } from '@/services/voice';
import { getQueryClient } from '../queryClient';

type UploadListener = (status: UploadStatus) => void;

export interface UploadStatus {
  isUploading: boolean;
  pendingCount: number;
  currentUpload: {
    noteId: string;
    progress: number;
    status: string;
  } | null;
  lastError: string | null;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

class AudioUploader {
  private isProcessing = false;
  private listeners: Set<UploadListener> = new Set();
  private currentUpload: UploadStatus['currentUpload'] = null;
  private lastError: string | null = null;
  private processInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Initialize the uploader - reset stuck uploads and start periodic processing
   */
  async initialize(): Promise<void> {
    // Reset any uploads stuck in "uploading" state from previous sessions
    await audioUploadsRepository.resetStuckUploads();

    // Start periodic processing
    this.startPeriodicProcessing();

    console.log('[AudioUploader] Initialized');
  }

  /**
   * Start periodic upload processing (every 30 seconds)
   */
  private startPeriodicProcessing(): void {
    if (this.processInterval) return;

    this.processInterval = setInterval(async () => {
      await this.processQueue();
    }, 30000);
  }

  /**
   * Stop periodic processing
   */
  stopPeriodicProcessing(): void {
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }
  }

  /**
   * Subscribe to upload status changes
   */
  subscribe(listener: UploadListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Get current upload status
   */
  async getStatus(): Promise<UploadStatus> {
    const pendingCount = await audioUploadsRepository.getPendingCount();

    return {
      isUploading: this.isProcessing,
      pendingCount,
      currentUpload: this.currentUpload,
      lastError: this.lastError,
    };
  }

  /**
   * Notify all listeners of status change
   */
  private async notifyListeners(): Promise<void> {
    const status = await this.getStatus();
    this.listeners.forEach(listener => listener(status));
  }

  /**
   * Queue an audio file for upload
   * @param noteId - The note this audio belongs to
   * @param localPath - Path to the local audio file
   * @param fileSize - Optional file size in bytes
   */
  async queueUpload(noteId: string, localPath: string, fileSize?: number): Promise<void> {
    await audioUploadsRepository.queue(noteId, localPath, fileSize);
    await this.notifyListeners();

    // Trigger immediate processing attempt
    this.processQueue().catch(console.warn);
  }

  /**
   * Process the upload queue
   */
  async processQueue(): Promise<void> {
    if (this.isProcessing) {
      console.log('[AudioUploader] Already processing, skipping');
      return;
    }

    const pendingUploads = await audioUploadsRepository.getPending(5);

    if (pendingUploads.length === 0) {
      return;
    }

    this.isProcessing = true;
    this.lastError = null;
    await this.notifyListeners();

    console.log('[AudioUploader] Processing', pendingUploads.length, 'uploads');

    for (const upload of pendingUploads) {
      // Skip if too many retries
      if (upload.retryCount >= MAX_RETRIES) {
        console.log('[AudioUploader] Max retries reached for:', upload.noteId);
        continue;
      }

      try {
        await this.processUpload(upload);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[AudioUploader] Upload failed:', upload.noteId, errorMessage);
        await audioUploadsRepository.markFailed(upload.id, errorMessage);
        this.lastError = errorMessage;
      }

      // Small delay between uploads to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    this.isProcessing = false;
    this.currentUpload = null;
    await this.notifyListeners();

    console.log('[AudioUploader] Queue processing complete');
  }

  /**
   * Process a single upload
   */
  private async processUpload(upload: {
    id: number;
    noteId: string;
    localPath: string;
    retryCount: number;
  }): Promise<void> {
    const { id, noteId, localPath } = upload;

    // Verify the file still exists
    const exists = await audioStorage.audioExists(localPath);
    if (!exists) {
      console.warn('[AudioUploader] Audio file not found:', localPath);
      await audioUploadsRepository.delete(id);
      return;
    }

    // Mark as uploading
    await audioUploadsRepository.markUploading(id);
    this.currentUpload = {
      noteId,
      progress: 0,
      status: 'Preparing upload...',
    };
    await this.notifyListeners();

    // Get the note to determine how to process
    const note = await notesRepository.getDetail(noteId);

    if (!note) {
      console.warn('[AudioUploader] Note not found:', noteId);
      await audioUploadsRepository.delete(id);
      return;
    }

    // Update progress
    this.currentUpload = {
      noteId,
      progress: 20,
      status: 'Uploading audio...',
    };
    await this.notifyListeners();

    // Determine if this is a new note (needs full synthesis) or existing (needs addToNote)
    // For now, we'll use the synthesize endpoint to re-process
    // This will transcribe the audio and update the note
    const { data, error } = await voiceService.synthesizeNote(
      {
        audioUri: localPath,
        folderId: note.folder_id || undefined,
      },
      (progress, status) => {
        this.currentUpload = {
          noteId,
          progress: 20 + (progress * 0.7), // Scale 0-100 to 20-90
          status,
        };
        this.notifyListeners();
      }
    );

    if (error) {
      throw new Error(error);
    }

    if (data) {
      // Update progress
      this.currentUpload = {
        noteId,
        progress: 95,
        status: 'Updating local data...',
      };
      await this.notifyListeners();

      // Update the local note with the server response
      await notesRepository.update(noteId, {
        transcript: data.narrative,
        summary: data.summary || undefined,
        tags: data.tags,
        ai_metadata: {
          actions: data.actions,
          raw_inputs: data.raw_inputs,
        },
      });

      // Mark the note as synced
      await notesRepository.markSynced(noteId);

      // Mark upload as complete
      await audioUploadsRepository.markCompleted(id, data.note_id);

      // Invalidate queries to refresh UI
      const queryClient = getQueryClient();
      queryClient.invalidateQueries({ queryKey: ['notes'] });

      console.log('[AudioUploader] Upload completed for:', noteId);
    }

    this.currentUpload = {
      noteId,
      progress: 100,
      status: 'Complete!',
    };
    await this.notifyListeners();
  }

  /**
   * Cancel a pending upload
   */
  async cancelUpload(noteId: string): Promise<void> {
    await audioUploadsRepository.deleteForNote(noteId);
    await this.notifyListeners();
  }

  /**
   * Retry all failed uploads
   */
  async retryFailed(): Promise<void> {
    // Reset retry counts for failed uploads by re-queuing them
    // This is handled by getPending which also returns failed uploads
    await this.processQueue();
  }

  /**
   * Clean up completed uploads and orphaned audio files
   */
  async cleanup(validNoteIds: string[]): Promise<void> {
    // Clear old completed uploads
    const clearedUploads = await audioUploadsRepository.clearOldCompleted(7);
    console.log('[AudioUploader] Cleared', clearedUploads, 'old upload records');

    // Clean up orphaned audio files
    const clearedAudio = await audioStorage.cleanupOrphanedAudio(validNoteIds);
    console.log('[AudioUploader] Cleaned up', clearedAudio, 'orphaned audio files');
  }

  /**
   * Destroy the uploader and clean up resources
   */
  destroy(): void {
    this.stopPeriodicProcessing();
    this.listeners.clear();
  }
}

export const audioUploader = new AudioUploader();
export default audioUploader;
