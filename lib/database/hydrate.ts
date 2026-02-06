import { notesService } from '@/services/notes';
import { notesRepository, foldersRepository, metadataRepository } from '../repositories';

const MIGRATION_KEY = 'hydration_complete';
const USER_ID_KEY = 'current_user_id';

/**
 * Check if initial hydration has been completed for the current user
 */
export async function isHydrated(userId: string): Promise<boolean> {
  const hydrated = await metadataRepository.get(MIGRATION_KEY);
  const storedUserId = await metadataRepository.get(USER_ID_KEY);

  // If different user, need to re-hydrate
  if (storedUserId !== userId) {
    return false;
  }

  return hydrated === 'true';
}

/**
 * Perform initial hydration from server
 * Fetches all data and populates SQLite
 * Non-blocking - if it fails, app continues with API fallback
 */
export async function hydrateFromServer(userId: string): Promise<boolean> {
  console.log('[Hydration] Starting initial hydration for user:', userId);

  try {
    // Check if already hydrated for this user
    if (await isHydrated(userId)) {
      console.log('[Hydration] Already hydrated, skipping');
      return true;
    }

    // Clear existing data if switching users
    const storedUserId = await metadataRepository.get(USER_ID_KEY);
    if (storedUserId && storedUserId !== userId) {
      console.log('[Hydration] Different user detected, clearing local data');
      await notesRepository.clearForUser(storedUserId);
      await foldersRepository.clearForUser(storedUserId);
    }

    // Store user ID immediately so we know who we're working with
    await metadataRepository.set(USER_ID_KEY, userId);

    // Fetch all data from server in parallel
    const [notesResponse, foldersResponse] = await Promise.all([
      notesService.listNotes({ per_page: 1000 }),
      notesService.listFolders(),
    ]);

    // Handle partial failures - only mark complete if BOTH succeed
    let notesOk = false;
    let foldersOk = false;

    if (foldersResponse.error) {
      console.warn('[Hydration] Failed to fetch folders:', foldersResponse.error);
    } else if (foldersResponse.data) {
      console.log('[Hydration] Inserting', foldersResponse.data.length, 'folders');
      await foldersRepository.bulkUpsert(foldersResponse.data, userId);
      foldersOk = true;
    }

    if (notesResponse.error) {
      console.warn('[Hydration] Failed to fetch notes:', notesResponse.error);
    } else if (notesResponse.data?.items) {
      console.log('[Hydration] Inserting', notesResponse.data.items.length, 'notes');
      await notesRepository.bulkUpsert(notesResponse.data.items, userId);
      notesOk = true;
    }

    // Only mark hydration complete if both notes and folders succeeded
    // to avoid permanently skipping one type of data
    if (notesOk && foldersOk) {
      await metadataRepository.set(MIGRATION_KEY, 'true');
      await metadataRepository.set('last_hydration', new Date().toISOString());
      console.log('[Hydration] Complete');
      return true;
    } else if (notesOk || foldersOk) {
      console.warn('[Hydration] Partial hydration - will retry on next launch');
      return false;
    } else {
      console.warn('[Hydration] No data fetched, will retry later');
      return false;
    }
  } catch (error) {
    console.error('[Hydration] Failed:', error);
    // Don't throw - app will continue with API fallback
    return false;
  }
}

/**
 * Force re-hydration (clears existing data and fetches fresh)
 */
export async function forceRehydrate(userId: string): Promise<void> {
  console.log('[Hydration] Force re-hydrating...');

  // Clear hydration flag
  await metadataRepository.delete(MIGRATION_KEY);

  // Clear existing data
  await notesRepository.clearForUser(userId);
  await foldersRepository.clearForUser(userId);

  // Re-hydrate
  await hydrateFromServer(userId);
}

/**
 * Clear hydration state (for logout)
 */
export async function clearHydrationState(): Promise<void> {
  await metadataRepository.delete(MIGRATION_KEY);
  await metadataRepository.delete(USER_ID_KEY);
  await metadataRepository.delete('last_hydration');
}

/**
 * Get hydration status
 */
export async function getHydrationStatus(): Promise<{
  isHydrated: boolean;
  userId: string | null;
  lastHydration: string | null;
}> {
  const [hydrated, userId, lastHydration] = await Promise.all([
    metadataRepository.get(MIGRATION_KEY),
    metadataRepository.get(USER_ID_KEY),
    metadataRepository.get('last_hydration'),
  ]);

  return {
    isHydrated: hydrated === 'true',
    userId,
    lastHydration,
  };
}
