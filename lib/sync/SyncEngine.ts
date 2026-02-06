import { notesService, type NoteFilters } from '@/services/notes';
import { notesRepository, foldersRepository } from '../repositories';
import { syncQueueService, type QueueItem, type EntityType } from './SyncQueue';
import { getQueryClient } from '../queryClient';

type SyncListener = (status: SyncStatus) => void;

export interface SyncStatus {
  isSyncing: boolean;
  pendingCount: number;
  failedCount: number;
  lastSyncAt: string | null;
  lastError: string | null;
}

class SyncEngine {
  private isSyncing = false;
  private lastSyncAt: string | null = null;
  private lastError: string | null = null;
  private listeners: Set<SyncListener> = new Set();
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private userId: string | null = null;

  /**
   * Initialize the sync engine with user context
   */
  async initialize(userId: string): Promise<void> {
    this.userId = userId;

    // Reset any items stuck in "processing" state
    await syncQueueService.resetProcessing();

    // Start periodic sync
    this.startPeriodicSync();

    console.log('[SyncEngine] Initialized for user:', userId);
  }

  /**
   * Start periodic sync (every 30 seconds)
   */
  private startPeriodicSync(): void {
    if (this.syncInterval) return;

    this.syncInterval = setInterval(async () => {
      try {
        await this.processQueue();
      } catch (error) {
        console.warn('[SyncEngine] Periodic sync failed:', error);
      }
    }, 30000);
  }

  /**
   * Stop periodic sync
   */
  stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Subscribe to sync status changes
   */
  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of status change
   */
  private async notifyListeners(): Promise<void> {
    const status = await this.getStatus();
    this.listeners.forEach(listener => listener(status));
  }

  /**
   * Get current sync status
   */
  async getStatus(): Promise<SyncStatus> {
    const [pendingCount, failedCount] = await Promise.all([
      syncQueueService.getPendingCount(),
      syncQueueService.getFailedCount(),
    ]);

    return {
      isSyncing: this.isSyncing,
      pendingCount,
      failedCount,
      lastSyncAt: this.lastSyncAt,
      lastError: this.lastError,
    };
  }

  /**
   * Process the sync queue
   */
  async processQueue(): Promise<void> {
    if (this.isSyncing) {
      console.log('[SyncEngine] Already syncing, skipping');
      return;
    }

    this.isSyncing = true;
    this.lastError = null;
    await this.notifyListeners();

    try {
      const items = await syncQueueService.dequeue(10);

      if (items.length === 0) {
        console.log('[SyncEngine] No items to sync');
        return;
      }

      console.log('[SyncEngine] Processing', items.length, 'items');

      for (const item of items) {
        try {
          await this.pushToServer(item);
          await syncQueueService.markComplete(item.id);
          await this.markEntitySynced(item);
          console.log('[SyncEngine] Synced:', item.entity_type, item.entity_id, item.operation);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error('[SyncEngine] Failed to sync:', item.entity_type, item.entity_id, errorMessage);
          await syncQueueService.markFailed(item.id, errorMessage);
          this.lastError = errorMessage;
        }
      }

      this.lastSyncAt = new Date().toISOString();
    } finally {
      this.isSyncing = false;
      await this.notifyListeners();
    }
  }

  /**
   * Push a queue item to the server
   */
  private async pushToServer(item: QueueItem): Promise<void> {
    switch (item.entity_type) {
      case 'note':
        await this.pushNote(item);
        break;
      case 'folder':
        await this.pushFolder(item);
        break;
      case 'action':
        // Actions are typically synced as part of notes
        break;
      default:
        throw new Error(`Unknown entity type: ${item.entity_type}`);
    }
  }

  /**
   * Push a note to the server
   */
  private async pushNote(item: QueueItem): Promise<void> {
    const { entity_id, operation, payload } = item;

    switch (operation) {
      case 'create': {
        const result = await notesService.createNote({
          title: payload?.title || 'Untitled',
          transcript: payload?.transcript || '',
          folder_id: payload?.folder_id,
          tags: payload?.tags,
        });
        if (result.error) throw new Error(result.error);

        // Update local note with server-generated data
        if (result.data) {
          await notesRepository.upsertFromServer(result.data, this.userId!);
        }
        break;
      }

      case 'update': {
        const result = await notesService.updateNote(entity_id, {
          title: payload?.title,
          transcript: payload?.transcript,
          folder_id: payload?.folder_id,
          tags: payload?.tags,
          is_pinned: payload?.is_pinned,
          is_archived: payload?.is_archived,
        });
        if (result.error) throw new Error(result.error);
        break;
      }

      case 'delete': {
        const result = await notesService.deleteNote(entity_id, payload?.permanent || false);
        if (!result.success) throw new Error(result.error || 'Delete failed');
        break;
      }
    }
  }

  /**
   * Push a folder to the server
   */
  private async pushFolder(item: QueueItem): Promise<void> {
    const { entity_id, operation, payload } = item;

    switch (operation) {
      case 'create': {
        const result = await notesService.createFolder({
          name: payload?.name || 'New Folder',
          icon: payload?.icon || 'folder',
          color: payload?.color,
        });
        if (result.error) throw new Error(result.error);
        break;
      }

      case 'update': {
        const result = await notesService.updateFolder(entity_id, {
          name: payload?.name,
          icon: payload?.icon,
          color: payload?.color,
          sort_order: payload?.sort_order,
          parent_id: payload?.parent_id,
        });
        if (result.error) throw new Error(result.error);
        break;
      }

      case 'delete': {
        const result = await notesService.deleteFolder(entity_id);
        if (!result.success) throw new Error(result.error || 'Delete failed');
        break;
      }
    }
  }

  /**
   * Mark an entity as synced in the repository
   */
  private async markEntitySynced(item: QueueItem): Promise<void> {
    switch (item.entity_type) {
      case 'note':
        await notesRepository.markSynced(item.entity_id);
        break;
      case 'folder':
        await foldersRepository.markSynced(item.entity_id);
        break;
    }
  }

  /**
   * Sync notes from server (pull)
   * @param filters - Note filters
   * @param invalidateCache - Whether to invalidate query cache after sync (default: false)
   */
  async syncNotes(filters: NoteFilters = {}, invalidateCache: boolean = false): Promise<void> {
    if (!this.userId) {
      console.warn('[SyncEngine] No user ID, skipping notes sync');
      return;
    }

    try {
      const { data, error } = filters.folder_id
          ? await notesService.listNotes({ ...filters, per_page: 100 })
          : await notesService.listAllNotes(1, 100);

      if (error) {
        console.error('[SyncEngine] Failed to fetch notes:', error);
        return;
      }

      if (data?.items) {
        for (const note of data.items) {
          // Fetch full note details for complete data
          const detailResponse = await notesService.getNote(note.id);
          if (detailResponse.data) {
            await notesRepository.upsertFromServer(detailResponse.data, this.userId);
          }
        }

        // Only invalidate cache if explicitly requested
        // This prevents race conditions with optimistic updates
        if (invalidateCache) {
          const queryClient = getQueryClient();
          queryClient.invalidateQueries({ queryKey: ['notes'] });
        }
      }
    } catch (error) {
      console.error('[SyncEngine] Notes sync failed:', error);
    }
  }

  /**
   * Sync folders from server (pull)
   * @param invalidateCache - Whether to invalidate query cache after sync (default: false)
   */
  async syncFolders(invalidateCache: boolean = false): Promise<void> {
    if (!this.userId) {
      console.warn('[SyncEngine] No user ID, skipping folders sync');
      return;
    }

    try {
      const { data, error } = await notesService.listFolders();

      if (error) {
        console.error('[SyncEngine] Failed to fetch folders:', error);
        return;
      }

      if (data) {
        await foldersRepository.bulkUpsert(data, this.userId);

        // Only invalidate cache if explicitly requested
        if (invalidateCache) {
          const queryClient = getQueryClient();
          queryClient.invalidateQueries({ queryKey: ['folders'] });
        }
      }
    } catch (error) {
      console.error('[SyncEngine] Folders sync failed:', error);
    }
  }

  /**
   * Full sync - push local changes, then pull from server
   * This is a user-triggered action, so we invalidate cache after
   */
  async fullSync(): Promise<void> {
    console.log('[SyncEngine] Starting full sync');

    // First push local changes
    await this.processQueue();

    // Then pull from server and invalidate cache (explicit user action)
    await Promise.all([
      this.syncNotes({}, true),
      this.syncFolders(true),
    ]);

    console.log('[SyncEngine] Full sync complete');
  }

  /**
   * Trigger sync attempt (non-blocking)
   */
  triggerSync(): void {
    this.processQueue().catch(error => {
      console.warn('[SyncEngine] Triggered sync failed:', error);
    });
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopPeriodicSync();
    this.listeners.clear();
    this.userId = null;
  }
}

export const syncEngine = new SyncEngine();
export default syncEngine;
