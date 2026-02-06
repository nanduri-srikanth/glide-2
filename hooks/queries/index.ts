/**
 * Query Hooks Index
 *
 * Re-exports all TanStack Query hooks for easy importing.
 */

// Notes queries and mutations
export {
  useNotesListQuery,
  useNoteDetailQuery,
  useNotesSearchQuery,
  useUnifiedSearchQuery,
  useCreateNoteMutation,
  useUpdateNoteMutation,
  useDeleteNoteMutation,
  useAutoSortNoteMutation,
  usePrefetchNoteDetail,
} from './useNotesQuery';

// Folders queries and mutations
export {
  useFoldersQuery,
  useCreateFolderMutation,
  useUpdateFolderMutation,
  useDeleteFolderMutation,
  useReorderFoldersMutation,
  useSetupDefaultFoldersMutation,
} from './useFoldersQuery';

// Re-export query keys for manual cache management
export { queryKeys } from '@/lib/queryClient';
