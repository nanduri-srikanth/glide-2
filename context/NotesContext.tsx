/**
 * Notes Context
 *
 * Provides notes and folders data using TanStack Query for SWR caching.
 * Data is cached locally and automatically refreshed in the background.
 */

import React, { createContext, useContext, useState, useCallback, ReactNode, useRef, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useNotesListQuery,
  useNoteDetailQuery,
  useFoldersQuery,
  useUnifiedSearchQuery,
  useDeleteNoteMutation,
  useUpdateNoteMutation,
  useDeleteFolderMutation,
  useReorderFoldersMutation,
  useUpdateFolderMutation,
  queryKeys,
} from '@/hooks/queries';
import { NoteListItem, FolderResponse, NoteDetailResponse, FolderReorderItem } from '@/services/notes';
import { Folder } from '@/data/types';
import { useSync } from '@/context/SyncContext';

interface NotesContextType {
  // Data
  notes: NoteListItem[];
  folders: FolderResponse[];
  isLoading: boolean;
  error: string | null;

  // Selection state
  selectedFolderId: string | null;
  expandedFolderIds: Set<string>;

  // Actions
  fetchNotes: (folderId?: string) => Promise<void>;
  fetchFolders: () => Promise<void>;
  refreshAll: () => Promise<void>;
  selectFolder: (folderId: string | null) => void;
  searchNotes: (query: string) => Promise<void>;
  deleteNote: (noteId: string) => Promise<boolean>;
  moveNote: (noteId: string, folderId: string) => Promise<boolean>;
  deleteFolder: (folderId: string) => Promise<boolean>;

  // Folder tree management
  reorderFolders: (updates: FolderReorderItem[]) => Promise<boolean>;
  nestFolder: (folderId: string, parentId: string | null) => Promise<boolean>;
  toggleFolderExpanded: (folderId: string) => void;
  buildFlattenedTree: () => Folder[];

  // Cache for newly created notes (instant display)
  cacheNote: (note: NoteDetailResponse) => void;
  getCachedNote: (noteId: string) => NoteDetailResponse | null;
  clearCachedNote: (noteId: string) => void;
}

const NotesContext = createContext<NotesContextType | undefined>(undefined);

export function NotesProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { syncNow } = useSync();

  // Local UI state
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Cache for newly created notes - use ref to avoid re-renders
  const noteCache = useRef<Map<string, NoteDetailResponse>>(new Map());

  // TanStack Query hooks - data is automatically cached and refreshed
  const notesQuery = useNotesListQuery({
    folder_id: selectedFolderId || undefined,
    per_page: 50,
  });

  const foldersQuery = useFoldersQuery();

  const searchQueryResult = useUnifiedSearchQuery(searchQuery, searchQuery.length > 0);

  // Mutations
  const deleteNoteMutation = useDeleteNoteMutation();
  const updateNoteMutation = useUpdateNoteMutation();
  const deleteFolderMutation = useDeleteFolderMutation();
  const reorderFoldersMutation = useReorderFoldersMutation();
  const updateFolderMutation = useUpdateFolderMutation();

  // Derived state
  const notes = useMemo(() => {
    if (searchQuery && searchQueryResult.data) {
      return searchQueryResult.data.notes;
    }
    return notesQuery.data?.items || [];
  }, [searchQuery, searchQueryResult.data, notesQuery.data]);

  const folders = foldersQuery.data || [];

  const isLoading = notesQuery.isLoading || foldersQuery.isLoading || searchQueryResult.isLoading;

  const error = useMemo(() => {
    if (notesQuery.error) return (notesQuery.error as Error).message;
    if (foldersQuery.error) return (foldersQuery.error as Error).message;
    if (searchQueryResult.error) return (searchQueryResult.error as Error).message;
    return null;
  }, [notesQuery.error, foldersQuery.error, searchQueryResult.error]);

  // Actions - these now just trigger refetches or update local state
  const fetchNotes = useCallback(async (folderId?: string) => {
    // Explicitly set null when fetching "All Notes"
    // (undefined should not leave previous folder selection in place)
    setSelectedFolderId(folderId ?? null);
    // TanStack Query will automatically refetch when selectedFolderId changes
    // For manual refresh:
    await queryClient.invalidateQueries({ queryKey: queryKeys.notes.lists() });
  }, [queryClient]);

  const fetchFolders = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.folders.all });
  }, [queryClient]);

  const refreshAll = useCallback(async () => {
    await syncNow();
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.notes.lists() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.all }),
    ]);
  }, [queryClient, syncNow]);

  const selectFolder = useCallback((folderId: string | null) => {
    setSelectedFolderId(folderId);
    setSearchQuery(''); // Clear search when selecting folder
  }, []);

  const searchNotes = useCallback(async (query: string) => {
    setSearchQuery(query);
    // If empty query, clear search and return to folder view
    if (!query.trim()) {
      setSearchQuery('');
    }
  }, []);

  const deleteNote = useCallback(async (noteId: string): Promise<boolean> => {
    try {
      await deleteNoteMutation.mutateAsync({ noteId });
      noteCache.current.delete(noteId);
      return true;
    } catch {
      return false;
    }
  }, [deleteNoteMutation]);

  const moveNote = useCallback(async (noteId: string, folderId: string): Promise<boolean> => {
    try {
      await updateNoteMutation.mutateAsync({
        noteId,
        data: { folder_id: folderId },
      });
      return true;
    } catch {
      return false;
    }
  }, [updateNoteMutation]);

  const deleteFolder = useCallback(async (folderId: string): Promise<boolean> => {
    try {
      await deleteFolderMutation.mutateAsync(folderId);
      return true;
    } catch {
      return false;
    }
  }, [deleteFolderMutation]);

  const reorderFolders = useCallback(async (updates: FolderReorderItem[]): Promise<boolean> => {
    try {
      await reorderFoldersMutation.mutateAsync(updates);
      return true;
    } catch {
      return false;
    }
  }, [reorderFoldersMutation]);

  const nestFolder = useCallback(async (folderId: string, parentId: string | null): Promise<boolean> => {
    try {
      await updateFolderMutation.mutateAsync({
        folderId,
        data: { parent_id: parentId },
      });
      return true;
    } catch {
      return false;
    }
  }, [updateFolderMutation]);

  const toggleFolderExpanded = useCallback((folderId: string) => {
    setExpandedFolderIds(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  // Build flattened tree for display (respecting expanded state)
  const buildFlattenedTree = useCallback(() => {
    const convertFolder = (apiFolder: FolderResponse): Folder => ({
      id: apiFolder.id,
      name: apiFolder.name,
      icon: apiFolder.icon,
      noteCount: apiFolder.note_count,
      color: apiFolder.color || undefined,
      isSystem: apiFolder.is_system,
      sortOrder: apiFolder.sort_order,
      parentId: apiFolder.parent_id,
      depth: apiFolder.depth,
      children: apiFolder.children?.map(c => convertFolder(c)),
    });

    const flatten = (folders: FolderResponse[], depth: number = 0): Folder[] => {
      const result: Folder[] = [];
      for (const folder of folders) {
        const converted = convertFolder(folder);
        converted.depth = depth;
        result.push(converted);
        // Only add children if folder is expanded and has children
        if (folder.children && folder.children.length > 0 && expandedFolderIds.has(folder.id)) {
          result.push(...flatten(folder.children, depth + 1));
        }
      }
      return result;
    };

    return flatten(folders);
  }, [folders, expandedFolderIds]);

  // Cache functions for instant note display
  const cacheNote = useCallback((note: NoteDetailResponse) => {
    noteCache.current.set(note.id, note);
    // Also update the TanStack Query cache
    queryClient.setQueryData(queryKeys.notes.detail(note.id), note);
    // Auto-clear local cache after 30 seconds
    setTimeout(() => {
      noteCache.current.delete(note.id);
    }, 30000);
  }, [queryClient]);

  const getCachedNote = useCallback((noteId: string) => {
    // First check local cache
    const localCached = noteCache.current.get(noteId);
    if (localCached) return localCached;
    // Then check TanStack Query cache
    return queryClient.getQueryData<NoteDetailResponse>(queryKeys.notes.detail(noteId)) || null;
  }, [queryClient]);

  const clearCachedNote = useCallback((noteId: string) => {
    noteCache.current.delete(noteId);
  }, []);

  const value: NotesContextType = {
    notes,
    folders,
    isLoading,
    error,
    selectedFolderId,
    expandedFolderIds,
    fetchNotes,
    fetchFolders,
    refreshAll,
    selectFolder,
    searchNotes,
    deleteNote,
    moveNote,
    deleteFolder,
    reorderFolders,
    nestFolder,
    toggleFolderExpanded,
    buildFlattenedTree,
    cacheNote,
    getCachedNote,
    clearCachedNote,
  };

  return (
    <NotesContext.Provider value={value}>
      {children}
    </NotesContext.Provider>
  );
}

export function useNotes() {
  const context = useContext(NotesContext);
  if (context === undefined) {
    throw new Error('useNotes must be used within a NotesProvider');
  }
  return context;
}

export default NotesContext;
