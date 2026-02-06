/**
 * Notes Query Hooks
 *
 * TanStack Query hooks for fetching and mutating notes.
 * Implements offline-first pattern with SQLite as source of truth.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import {
  notesService,
  NoteListResponse,
  NoteDetailResponse,
  NoteFilters,
  UnifiedSearchResponse,
} from '@/services/notes';
import { notesRepository, type LocalNoteListItem } from '@/lib/repositories';
import { syncEngine, syncQueueService } from '@/lib/sync';
import { useNetwork } from '@/context/NetworkContext';
import { useAuth } from '@/context/AuthContext';
import { isDatabaseInitialized } from '@/lib/database';

// ============ QUERIES ============

/**
 * Fetch list of notes with optional filters
 * Reads from SQLite first, triggers background sync if online
 */
export function useNotesListQuery(filters: NoteFilters = {}) {
  const { isOnline } = useNetwork();
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.notes.list(filters),
    queryFn: async () => {
      // If database not initialized, fall back to API
      if (!isDatabaseInitialized() || !user?.id) {
        const { data, error } = await notesService.listNotes(filters);
        if (error) throw new Error(error);
        return data!;
      }

      // PRIMARY: Read from SQLite
      const localNotes = await notesRepository.list(filters, user.id);

      // SECONDARY: Background sync if online (don't await)
      if (isOnline) {
        syncEngine.syncNotes(filters).catch(console.warn);
      }

      // Transform to match API response format
      return {
        items: localNotes,
        total: localNotes.length,
        page: filters.page || 1,
        per_page: filters.per_page || 20,
        pages: Math.ceil(localNotes.length / (filters.per_page || 20)),
      } as NoteListResponse;
    },
    // Keep previous data while fetching with new filters
    placeholderData: (previousData) => previousData,
    // Shorter stale time since we're reading from local
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Fetch a single note by ID
 * Reads from SQLite first, falls back to API if not found
 */
export function useNoteDetailQuery(noteId: string | undefined) {
  const { isOnline } = useNetwork();
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.notes.detail(noteId || ''),
    queryFn: async () => {
      if (!noteId) throw new Error('Note ID is required');

      // Try SQLite first
      if (isDatabaseInitialized()) {
        const localNote = await notesRepository.getDetail(noteId);
        if (localNote) {
          // Trigger background sync for this note if online
          if (isOnline) {
            notesService.getNote(noteId).then(({ data }) => {
              if (data && user?.id) {
                notesRepository.upsertFromServer(data, user.id).catch(console.warn);
              }
            }).catch(console.warn);
          }
          return localNote as NoteDetailResponse;
        }
      }

      // Fall back to API
      const { data, error } = await notesService.getNote(noteId);
      if (error) throw new Error(error);

      // Store in SQLite for future offline access
      if (data && isDatabaseInitialized() && user?.id) {
        await notesRepository.upsertFromServer(data, user.id).catch(console.warn);
      }

      return data!;
    },
    enabled: !!noteId,
  });
}

/**
 * Search notes
 * Searches local SQLite first, syncs from API if online
 */
export function useNotesSearchQuery(query: string, enabled: boolean = true) {
  const { isOnline } = useNetwork();
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.notes.search(query),
    queryFn: async () => {
      // If database initialized, search locally first
      if (isDatabaseInitialized() && user?.id) {
        const localResults = await notesRepository.search(query, user.id);

        // Also fetch from API if online
        if (isOnline) {
          notesService.searchNotes(query).catch(console.warn);
        }

        return {
          items: localResults,
          total: localResults.length,
          page: 1,
          per_page: 20,
          pages: 1,
        } as NoteListResponse;
      }

      // Fall back to API
      const { data, error } = await notesService.searchNotes(query);
      if (error) throw new Error(error);
      return data!;
    },
    enabled: enabled && query.length > 0,
    staleTime: 1 * 60 * 1000, // 1 minute
  });
}

/**
 * Unified search (notes + folders)
 */
export function useUnifiedSearchQuery(query: string, enabled: boolean = true) {
  const { isOnline } = useNetwork();
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.search.unified(query),
    queryFn: async () => {
      // For unified search, still use API as it combines notes and folders
      // TODO: Implement local search across both when needed
      if (!isOnline) {
        // If offline, search locally
        if (isDatabaseInitialized() && user?.id) {
          const localNotes = await notesRepository.search(query, user.id);
          const { foldersRepository } = await import('@/lib/repositories');
          const allFolders = await foldersRepository.list(user.id);

          // Simple filter on folders by name
          const matchedFolders = allFolders.filter(f =>
            f.name.toLowerCase().includes(query.toLowerCase())
          );

          return {
            folders: matchedFolders,
            notes: localNotes,
          } as UnifiedSearchResponse;
        }
      }

      const { data, error } = await notesService.unifiedSearch(query);
      if (error) throw new Error(error);
      return data!;
    },
    enabled: enabled && query.length > 0,
    staleTime: 1 * 60 * 1000, // 1 minute
  });
}

// ============ MUTATIONS ============

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

/**
 * Create a new note
 * Writes to SQLite first, queues for sync
 */
export function useCreateNoteMutation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { isOnline } = useNetwork();

  return useMutation({
    mutationFn: async (data: {
      title: string;
      transcript: string;
      folder_id?: string;
      tags?: string[];
    }) => {
      const id = generateId();
      const now = new Date().toISOString();

      if (isDatabaseInitialized() && user?.id) {
        // 1. Save to SQLite immediately
        await notesRepository.create({
          id,
          user_id: user.id,
          title: data.title,
          transcript: data.transcript,
          folder_id: data.folder_id,
          tags: data.tags,
        });

        // 2. Queue for sync
        await syncQueueService.enqueue({
          entity_type: 'note',
          entity_id: id,
          operation: 'create',
          payload: data,
        });

        // 3. Trigger sync if online (non-blocking)
        if (isOnline) {
          syncEngine.triggerSync();
        }

        // Return a response that matches the expected format
        const localNote = await notesRepository.getDetail(id);
        return localNote as NoteDetailResponse;
      }

      // Fall back to API if database not ready
      const { data: note, error } = await notesService.createNote(data);
      if (error) throw new Error(error);
      return note!;
    },
    onSuccess: (newNote) => {
      // Invalidate notes list to show the new note
      queryClient.invalidateQueries({ queryKey: queryKeys.notes.lists() });
      // Invalidate folders to update note counts
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.all });
      // Pre-populate the detail cache
      queryClient.setQueryData(queryKeys.notes.detail(newNote.id), newNote);
    },
  });
}

/**
 * Update an existing note
 * Writes to SQLite first, queues for sync
 */
export function useUpdateNoteMutation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { isOnline } = useNetwork();

  return useMutation({
    mutationFn: async ({
      noteId,
      data,
    }: {
      noteId: string;
      data: {
        title?: string;
        transcript?: string;
        folder_id?: string;
        tags?: string[];
        is_pinned?: boolean;
        is_archived?: boolean;
      };
    }) => {
      if (isDatabaseInitialized() && user?.id) {
        // 1. Update in SQLite
        await notesRepository.update(noteId, data);

        // 2. Queue for sync
        await syncQueueService.enqueue({
          entity_type: 'note',
          entity_id: noteId,
          operation: 'update',
          payload: data,
        });

        // 3. Trigger sync if online
        if (isOnline) {
          syncEngine.triggerSync();
        }

        // Return updated note
        const localNote = await notesRepository.getDetail(noteId);
        return localNote as NoteDetailResponse;
      }

      // Fall back to API
      const { data: note, error } = await notesService.updateNote(noteId, data);
      if (error) throw new Error(error);
      return note!;
    },
    onSuccess: (updatedNote, { noteId, data }) => {
      // Update the detail cache
      queryClient.setQueryData(queryKeys.notes.detail(noteId), updatedNote);

      // Only invalidate lists if folder changed (not for pin/archive updates)
      // Pin/archive updates use optimistic updates so we don't want to refetch
      const isPinOrArchiveOnly =
        data.is_pinned !== undefined || data.is_archived !== undefined;
      const hasOtherChanges =
        data.title !== undefined ||
        data.transcript !== undefined ||
        data.folder_id !== undefined ||
        data.tags !== undefined;

      if (!isPinOrArchiveOnly || hasOtherChanges) {
        // Invalidate lists to reflect changes
        queryClient.invalidateQueries({ queryKey: queryKeys.notes.lists() });
      }

      // Invalidate folders if folder changed
      if (data.folder_id !== undefined) {
        queryClient.invalidateQueries({ queryKey: queryKeys.folders.all });
      }
    },
  });
}

/**
 * Delete a note
 * Writes to SQLite first, queues for sync
 */
export function useDeleteNoteMutation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { isOnline } = useNetwork();

  return useMutation({
    mutationFn: async ({
      noteId,
      permanent = false,
    }: {
      noteId: string;
      permanent?: boolean;
    }) => {
      if (isDatabaseInitialized() && user?.id) {
        if (permanent) {
          // Hard delete
          await notesRepository.hardDelete(noteId);
        } else {
          // Soft delete
          await notesRepository.softDelete(noteId);
        }

        // Queue for sync
        await syncQueueService.enqueue({
          entity_type: 'note',
          entity_id: noteId,
          operation: 'delete',
          payload: { permanent },
        });

        // Trigger sync if online
        if (isOnline) {
          syncEngine.triggerSync();
        }

        return { noteId, success: true };
      }

      // Fall back to API
      const { success, error } = await notesService.deleteNote(noteId, permanent);
      if (error) throw new Error(error);
      return { noteId, success };
    },
    onSuccess: ({ noteId }) => {
      // Remove from detail cache
      queryClient.removeQueries({ queryKey: queryKeys.notes.detail(noteId) });
      // Invalidate lists
      queryClient.invalidateQueries({ queryKey: queryKeys.notes.lists() });
      // Invalidate folders to update note counts
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.all });
    },
  });
}

/**
 * Auto-sort note into appropriate folder
 * This still goes through API as it requires AI processing
 */
export function useAutoSortNoteMutation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (noteId: string) => {
      const { data, error } = await notesService.autoSortNote(noteId);
      if (error) throw new Error(error);

      // Update local SQLite with the result
      if (data && isDatabaseInitialized() && user?.id) {
        await notesRepository.upsertFromServer(data, user.id).catch(console.warn);
      }

      return data!;
    },
    onSuccess: (updatedNote, noteId) => {
      // Update detail cache
      queryClient.setQueryData(queryKeys.notes.detail(noteId), updatedNote);
      // Invalidate lists and folders
      queryClient.invalidateQueries({ queryKey: queryKeys.notes.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.all });
    },
  });
}

// ============ HELPERS ============

/**
 * Hook to prefetch a note detail
 */
export function usePrefetchNoteDetail() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return (noteId: string) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.notes.detail(noteId),
      queryFn: async () => {
        // Try local first
        if (isDatabaseInitialized()) {
          const localNote = await notesRepository.getDetail(noteId);
          if (localNote) return localNote as NoteDetailResponse;
        }

        // Fall back to API
        const { data, error } = await notesService.getNote(noteId);
        if (error) throw new Error(error);

        // Store in SQLite
        if (data && isDatabaseInitialized() && user?.id) {
          await notesRepository.upsertFromServer(data, user.id).catch(console.warn);
        }

        return data!;
      },
    });
  };
}

export default useNotesListQuery;
