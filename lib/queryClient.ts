/**
 * TanStack Query Client Configuration
 *
 * Implements Stale-While-Revalidate (SWR) pattern:
 * - Return cached data immediately (stale)
 * - Fetch fresh data in background (revalidate)
 * - Update UI when fresh data arrives
 */

import { QueryClient } from '@tanstack/react-query';

// Query key factory for consistent key generation
export const queryKeys = {
  // Notes
  notes: {
    all: ['notes'] as const,
    lists: () => [...queryKeys.notes.all, 'list'] as const,
    list: (filters: object) => [...queryKeys.notes.lists(), filters] as const,
    details: () => [...queryKeys.notes.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.notes.details(), id] as const,
    search: (query: string) => [...queryKeys.notes.all, 'search', query] as const,
  },
  // Folders
  folders: {
    all: ['folders'] as const,
    list: () => [...queryKeys.folders.all, 'list'] as const,
  },
  // Unified search
  search: {
    all: ['search'] as const,
    unified: (query: string) => [...queryKeys.search.all, 'unified', query] as const,
  },
};

// Create the query client with SWR defaults
export const createQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      // SWR Configuration
      staleTime: 5 * 60 * 1000,        // 5 minutes - data considered fresh
      gcTime: 24 * 60 * 60 * 1000,     // 24 hours - keep in cache (formerly cacheTime)

      // Retry configuration
      retry: 2,                         // Retry failed requests twice
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),

      // Refetch behavior
      refetchOnWindowFocus: true,       // Refetch when app comes to foreground
      refetchOnReconnect: true,         // Refetch when network reconnects
      refetchOnMount: true,             // Refetch on component mount if stale

      // Network mode - always show cached data, fetch when possible
      networkMode: 'offlineFirst',
    },
    mutations: {
      // Retry mutations once
      retry: 1,

      // Network mode
      networkMode: 'offlineFirst',
    },
  },
});

// Singleton instance for the app
let queryClient: QueryClient | null = null;

export const getQueryClient = () => {
  if (!queryClient) {
    queryClient = createQueryClient();
  }
  return queryClient;
};

export default getQueryClient;
