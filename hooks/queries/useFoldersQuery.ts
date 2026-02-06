/**
 * Folders Query Hooks
 *
 * TanStack Query hooks for fetching and mutating folders.
 * Implements offline-first pattern with SQLite as source of truth.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { notesService, FolderResponse, FolderReorderItem } from '@/services/notes';
import { foldersRepository } from '@/lib/repositories';
import { syncEngine, syncQueueService } from '@/lib/sync';
import { useNetwork } from '@/context/NetworkContext';
import { useAuth } from '@/context/AuthContext';
import { isDatabaseInitialized } from '@/lib/database';

/**
 * Generate a UUID for new entities
 */
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ============ QUERIES ============

/**
 * Fetch list of folders
 * Reads from SQLite first, triggers background sync if online
 */
export function useFoldersQuery() {
  const { isOnline } = useNetwork();
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.folders.list(),
    queryFn: async () => {
      // If database not initialized, fall back to API
      if (!isDatabaseInitialized() || !user?.id) {
        const { data, error } = await notesService.listFolders();
        if (error) throw new Error(error);
        return data!;
      }

      // PRIMARY: Read from SQLite
      const localFolders = await foldersRepository.list(user.id);

      // SECONDARY: Background sync if online (don't await)
      if (isOnline) {
        syncEngine.syncFolders().catch(console.warn);
      }

      return localFolders as FolderResponse[];
    },
    // Folders change less frequently, but still shorter stale time since reading local
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// ============ MUTATIONS ============

/**
 * Create a new folder
 * Writes to SQLite first, queues for sync
 */
export function useCreateFolderMutation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { isOnline } = useNetwork();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      icon?: string;
      color?: string;
    }) => {
      const id = generateId();

      if (isDatabaseInitialized() && user?.id) {
        // Get next sort order
        const sortOrder = await foldersRepository.getNextSortOrder(user.id);

        // 1. Save to SQLite
        await foldersRepository.create({
          id,
          user_id: user.id,
          name: data.name,
          icon: data.icon || 'folder',
          color: data.color,
          sort_order: sortOrder,
        });

        // 2. Queue for sync
        await syncQueueService.enqueue({
          entity_type: 'folder',
          entity_id: id,
          operation: 'create',
          payload: data,
        });

        // 3. Trigger sync if online
        if (isOnline) {
          syncEngine.triggerSync();
        }

        // Return folder response
        const folders = await foldersRepository.list(user.id);
        const newFolder = folders.find(f => f.id === id);
        return newFolder as FolderResponse;
      }

      // Fall back to API
      const { data: folder, error } = await notesService.createFolder(data);
      if (error) throw new Error(error);
      return folder!;
    },
    onSuccess: () => {
      // Invalidate folders list
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.all });
    },
  });
}

/**
 * Update a folder
 * Writes to SQLite first, queues for sync
 */
export function useUpdateFolderMutation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { isOnline } = useNetwork();

  return useMutation({
    mutationFn: async ({
      folderId,
      data,
    }: {
      folderId: string;
      data: {
        name?: string;
        icon?: string;
        color?: string;
        parent_id?: string | null;
        sort_order?: number;
      };
    }) => {
      if (isDatabaseInitialized() && user?.id) {
        // 1. Update in SQLite
        await foldersRepository.update(folderId, data);

        // 2. Queue for sync
        await syncQueueService.enqueue({
          entity_type: 'folder',
          entity_id: folderId,
          operation: 'update',
          payload: data,
        });

        // 3. Trigger sync if online
        if (isOnline) {
          syncEngine.triggerSync();
        }

        // Return updated folder
        const folders = await foldersRepository.list(user.id);
        const findFolder = (folders: FolderResponse[]): FolderResponse | undefined => {
          for (const f of folders) {
            if (f.id === folderId) return f;
            if (f.children) {
              const found = findFolder(f.children);
              if (found) return found;
            }
          }
          return undefined;
        };
        const updatedFolder = findFolder(folders as FolderResponse[]);
        return updatedFolder!;
      }

      // Fall back to API
      const { data: folder, error } = await notesService.updateFolder(folderId, data);
      if (error) throw new Error(error);
      return folder!;
    },
    onSuccess: () => {
      // Invalidate folders list
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.all });
    },
  });
}

/**
 * Delete a folder
 * Writes to SQLite first, queues for sync
 */
export function useDeleteFolderMutation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { isOnline } = useNetwork();

  return useMutation({
    mutationFn: async (folderId: string) => {
      if (isDatabaseInitialized() && user?.id) {
        // 1. Delete from SQLite
        await foldersRepository.delete(folderId);

        // 2. Queue for sync
        await syncQueueService.enqueue({
          entity_type: 'folder',
          entity_id: folderId,
          operation: 'delete',
          payload: {},
        });

        // 3. Trigger sync if online
        if (isOnline) {
          syncEngine.triggerSync();
        }

        return { folderId, success: true };
      }

      // Fall back to API
      const { success, error } = await notesService.deleteFolder(folderId);
      if (error) throw new Error(error);
      return { folderId, success };
    },
    onSuccess: () => {
      // Invalidate folders list
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.all });
      // Also invalidate notes as they may have been moved
      queryClient.invalidateQueries({ queryKey: queryKeys.notes.lists() });
    },
  });
}

/**
 * Reorder folders
 * Writes to SQLite first, queues for sync
 */
export function useReorderFoldersMutation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { isOnline } = useNetwork();

  return useMutation({
    mutationFn: async (updates: FolderReorderItem[]) => {
      if (isDatabaseInitialized() && user?.id) {
        // 1. Update in SQLite
        await foldersRepository.reorder(updates);

        // 2. Queue each update for sync (or batch)
        for (const update of updates) {
          await syncQueueService.enqueue({
            entity_type: 'folder',
            entity_id: update.id,
            operation: 'update',
            payload: {
              sort_order: update.sort_order,
              parent_id: update.parent_id,
            },
          });
        }

        // 3. Trigger sync if online
        if (isOnline) {
          syncEngine.triggerSync();
        }

        return { success: true };
      }

      // Fall back to API
      const { success, error } = await notesService.reorderFolders(updates);
      if (error) throw new Error(error);
      return { success };
    },
    // Optimistic update for smooth drag-and-drop
    onMutate: async (updates) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.folders.list() });

      // Snapshot previous value
      const previousFolders = queryClient.getQueryData<FolderResponse[]>(queryKeys.folders.list());

      // Return context for rollback
      return { previousFolders };
    },
    onError: (_err, _updates, context) => {
      // Rollback on error
      if (context?.previousFolders) {
        queryClient.setQueryData(queryKeys.folders.list(), context.previousFolders);
      }
    },
    onSettled: () => {
      // Always refetch after mutation
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.all });
    },
  });
}

/**
 * Setup default folders
 * This goes through API as it's a one-time server operation
 */
export function useSetupDefaultFoldersMutation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async () => {
      const { success, error } = await notesService.setupDefaultFolders();
      if (error) throw new Error(error);

      // Sync folders from server after setup
      if (isDatabaseInitialized() && user?.id) {
        await syncEngine.syncFolders();
      }

      return { success };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.all });
    },
  });
}

export default useFoldersQuery;
