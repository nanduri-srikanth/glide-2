/**
 * Database Initialization and Utilities
 *
 * Initializes the SQLite database and provides helper functions
 * for data hydration and management.
 */

import { databaseManager } from '@/services/database';
import { noteRepository } from '@/services/repositories/NoteRepository';
import { folderRepository } from '@/services/repositories/FolderRepository';
import { actionRepository } from '@/services/repositories/ActionRepository';

// Track initialization state
let isInitialized = false;
let isInitializing = false;

/**
 * Initialize the database
 * Creates tables and runs migrations if needed
 */
export async function initializeDatabase(): Promise<void> {
  // Prevent multiple initializations
  if (isInitialized) {
    console.log('[Database] Already initialized');
    return;
  }

  if (isInitializing) {
    console.log('[Database] Initialization already in progress, waiting...');
    // Wait up to 10 seconds for initialization to complete
    const maxWait = 10000;
    const checkInterval = 100;
    let waited = 0;

    while (isInitializing && waited < maxWait) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waited += checkInterval;
    }

    if (isInitialized) {
      console.log('[Database] Initialization completed while waiting');
      return;
    }

    throw new Error('Database initialization timeout');
  }

  isInitializing = true;

  try {
    console.log('[Database] Starting initialization...');
    await databaseManager.initialize();
    isInitialized = true;
    console.log('[Database] Initialization complete');
  } catch (error) {
    console.error('[Database] Initialization failed:', error);
    throw error;
  } finally {
    isInitializing = false;
  }
}

/**
 * Check if database is initialized
 */
export function isDatabaseInitialized(): boolean {
  return isInitialized;
}

/**
 * Reset the database (delete all data and recreate tables)
 * Useful for testing or recovery from corrupted state
 */
export async function resetDatabase(): Promise<void> {
  console.log('[Database] Resetting database...');

  try {
    await databaseManager.resetDatabase();
    isInitialized = true; // Database is still initialized after reset
    console.log('[Database] Database reset complete');
  } catch (error) {
    console.error('[Database] Reset failed:', error);
    throw error;
  }
}

/**
 * Hydrate local database from server
 * Fetches all user data from the API and stores it locally
 *
 * @param userId - The user ID to fetch data for
 * @returns true if hydration was successful, false otherwise
 */
export async function hydrateFromServer(userId: string): Promise<boolean> {
  try {
    console.log('[Database] Starting hydration from server...');

    // Import API service to avoid circular dependency
    const { api } = await import('@/services/api');

    // Fetch folders
    const foldersData = await api.get('/api/v1/folders');
    if (foldersData.data && Array.isArray(foldersData.data)) {
      console.log(`[Database] Hydrating ${foldersData.data.length} folders...`);

      for (const folder of foldersData.data) {
        try {
          await folderRepository.create({
            user_id: folder.user_id || userId,
            name: folder.name,
            icon: folder.icon || 'folder.fill',
            color: folder.color,
            isSystem: folder.is_system || false,
            sortOrder: folder.sort_order || 0,
            parentId: folder.parent_id,
            depth: folder.depth || 0,
          });
        } catch (error) {
          // Folder might already exist, update it instead
          console.warn(`[Database] Failed to create folder ${folder.id}, trying update...`);
          // Continue anyway
        }
      }
    }

    // Fetch notes
    const notesData = await api.get('/api/v1/notes');
    if (notesData.data && Array.isArray(notesData.data)) {
      console.log(`[Database] Hydrating ${notesData.data.length} notes...`);

      for (const note of notesData.data) {
        try {
          await noteRepository.create({
            user_id: note.user_id || userId,
            folderId: note.folder_id,
            title: note.title,
            transcript: note.transcript,
            summary: note.summary,
            duration: note.duration,
            audio_url: note.audio_url,
            audio_format: note.audio_format,
            tags: note.tags || [],
            isPinned: note.is_pinned || false,
            is_archived: note.is_archived || false,
            is_deleted: note.is_deleted || false,
            deleted_at: note.deleted_at,
            ai_processed: note.ai_processed || false,
            ai_metadata: note.ai_metadata || {},
          });
        } catch (error) {
          // Note might already exist
          console.warn(`[Database] Failed to create note ${note.id}, skipping...`);
          // Continue anyway
        }
      }
    }

    // Fetch actions (if the endpoint exists)
    try {
      const actionsData = await api.get('/api/v1/actions');
      if (actionsData.data && Array.isArray(actionsData.data)) {
        console.log(`[Database] Hydrating ${actionsData.data.length} actions...`);

        for (const action of actionsData.data) {
          try {
            await actionRepository.create({
              note_id: action.note_id,
              action_type: action.action_type,
              status: action.status || 'pending',
              priority: action.priority || 'medium',
              title: action.title,
              description: action.description,
              details: action.details || {},
              scheduled_date: action.scheduled_date,
              scheduled_end_date: action.scheduled_end_date,
              location: action.location,
              attendees: action.attendees || [],
              email_to: action.email_to,
              email_subject: action.email_subject,
              email_body: action.email_body,
              external_id: action.external_id,
              external_service: action.external_service,
              external_url: action.external_url,
            });
          } catch (error) {
            // Action might already exist
            console.warn(`[Database] Failed to create action ${action.id}, skipping...`);
            // Continue anyway
          }
        }
      }
    } catch (error) {
      // Actions endpoint might not exist yet
      console.warn('[Database] Actions hydration failed or not supported:', error);
    }

    console.log('[Database] Hydration complete');
    return true;
  } catch (error) {
    console.error('[Database] Hydration failed:', error);
    return false;
  }
}

/**
 * Get database statistics
 */
export async function getDatabaseStats() {
  return databaseManager.getStats();
}

/**
 * Close the database connection
 * Called on app logout or shutdown
 */
export async function closeDatabase(): Promise<void> {
  await databaseManager.close();
  isInitialized = false;
}

/**
 * Clear all user data from database (for logout)
 */
export async function clearUserData(): Promise<void> {
  try {
    console.log('[Database] Clearing user data...');
    await resetDatabase();
    console.log('[Database] User data cleared');
  } catch (error) {
    console.error('[Database] Failed to clear user data:', error);
    throw error;
  }
}

/**
 * Export the database manager for advanced use cases
 */
export { databaseManager };
