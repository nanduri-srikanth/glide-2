/**
 * Query Cache Persister
 *
 * Persists TanStack Query cache to AsyncStorage for:
 * - Instant app startup with cached data
 * - Offline access to previously fetched data
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

const CACHE_KEY = 'glide-query-cache';

// Create the persister
export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: CACHE_KEY,
  throttleTime: 1000, // Throttle writes to storage (1 second)
  serialize: (data) => JSON.stringify(data),
  deserialize: (data) => JSON.parse(data),
});

// Helper to clear the cache (for logout, etc.)
export const clearQueryCache = async () => {
  try {
    await AsyncStorage.removeItem(CACHE_KEY);
  } catch (error) {
    console.error('[Persister] Failed to clear cache:', error);
  }
};

// Helper to get cache size (for debugging/settings)
export const getQueryCacheSize = async (): Promise<number> => {
  try {
    const cache = await AsyncStorage.getItem(CACHE_KEY);
    return cache ? new Blob([cache]).size : 0;
  } catch (error) {
    console.error('[Persister] Failed to get cache size:', error);
    return 0;
  }
};

export default asyncStoragePersister;
