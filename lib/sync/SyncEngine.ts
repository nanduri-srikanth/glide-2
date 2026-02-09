import { notesService, type NoteFilters, type NoteListResponse } from '@/services/notes';
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
   * Start periodic sync (every 60 seconds)
   */
  private startPeriodicSync(): void {
    if (this.syncInterval) return;

    this.syncInterval = setInterval(async () => {
      try {
        await this.processQueue();
      } catch (error) {
        console.warn('[SyncEngine] Periodic sync failed:', error);
      }
    }, 60000);
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
        this.lastSyncAt = new Date().toISOString();
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
          client_id: entity_id,
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
          client_id: entity_id,
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
    // Capture userId to avoid race condition if destroy() is called during sync
    const userId = this.userId;
    if (!userId) {
      console.warn('[SyncEngine] No user ID, skipping notes sync');
      return;
    }

    try {
      const fetchAllPages = async (fetchPage: (page: number) => Promise<{ data?: NoteListResponse; error?: string }>) => {
        let page = 1;
        let pages = 1;
        const allItems: NoteListResponse['items'] = [];

        while (page <= pages) {
          const { data, error } = await fetchPage(page);
          if (error) return { error };
          if (data?.items) {
            allItems.push(...data.items);
            pages = data.pages || pages;
          }
          page += 1;
        }

        return { data: { items: allItems } as Pick<NoteListResponse, 'items'> };
      };

      const result = filters.folder_id
          ? await fetchAllPages((page) => notesService.listNotes({ ...filters, page, per_page: 100 }))
          : await fetchAllPages((page) => notesService.listAllNotes(page, 100));

      const { data, error } = result as { data?: Pick<NoteListResponse, 'items'>; error?: string };

      if (error) {
        console.error('[SyncEngine] Failed to fetch notes:', error);
        return;
      }

      if (data?.items) {
        // Batch fetch full details for notes that need updating,
        // using concurrent requests with a concurrency limit
        const CONCURRENCY = 5;
        const items = data.items;
        for (let i = 0; i < items.length; i += CONCURRENCY) {
          const batch = items.slice(i, i + CONCURRENCY);
          const detailResults = await Promise.all(
            batch.map(note => notesService.getNote(note.id))
          );
          for (const detailResponse of detailResults) {
            if (detailResponse.data) {
              try {
                await notesRepository.upsertFromServer(detailResponse.data, userId);
              } catch (noteError) {
                // Log and continue - don't let one bad note kill the entire sync
                console.warn('[SyncEngine] Failed to upsert note:', detailResponse.data.id, noteError);
              }
            }
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
    const userId = this.userId;
    if (!userId) {
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
        await foldersRepository.bulkUpsert(data, userId);

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

    // Wait for any in-progress sync to finish before processing queue
    // This ensures user-triggered sync always pushes pending changes
    const maxWait = 10000; // 10 seconds max wait
    const start = Date.now();
    while (this.isSyncing && Date.now() - start < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Push local changes
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
