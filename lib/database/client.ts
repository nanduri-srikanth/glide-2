import * as SQLite from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';

const DATABASE_NAME = 'glide.db';

// Database instance - lazily initialized
let expoDb: SQLite.SQLiteDatabase | null = null;
let drizzleDb: ReturnType<typeof drizzle> | null = null;

function getExpoDatabase(): SQLite.SQLiteDatabase {
  if (!expoDb) {
    expoDb = SQLite.openDatabaseSync(DATABASE_NAME);
  }
  return expoDb;
}

// Create the Drizzle ORM instance (lazy)
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_, prop) {
    if (!drizzleDb) {
      drizzleDb = drizzle(getExpoDatabase(), { schema });
    }
    return (drizzleDb as any)[prop];
  },
});

// SQL statements for table creation
const CREATE_NOTES_TABLE = `
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    folder_id TEXT,
    title TEXT NOT NULL,
    transcript TEXT,
    summary TEXT,
    duration INTEGER,
    audio_url TEXT,
    local_audio_path TEXT,
    tags TEXT DEFAULT '[]',
    is_pinned INTEGER DEFAULT 0,
    is_archived INTEGER DEFAULT 0,
    is_deleted INTEGER DEFAULT 0,
    ai_metadata TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    sync_status TEXT DEFAULT 'synced',
    local_updated_at TEXT,
    server_updated_at TEXT
  )
`;

const CREATE_FOLDERS_TABLE = `
  CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    icon TEXT NOT NULL,
    color TEXT,
    is_system INTEGER DEFAULT 0,
    sort_order INTEGER NOT NULL,
    parent_id TEXT,
    depth INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    sync_status TEXT DEFAULT 'synced'
  )
`;

const CREATE_ACTIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS actions (
    id TEXT PRIMARY KEY,
    note_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    status TEXT NOT NULL,
    priority TEXT,
    title TEXT NOT NULL,
    description TEXT,
    scheduled_date TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    sync_status TEXT DEFAULT 'synced'
  )
`;

const CREATE_SYNC_QUEUE_TABLE = `
  CREATE TABLE IF NOT EXISTS sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    payload TEXT,
    created_at TEXT NOT NULL,
    retry_count INTEGER DEFAULT 0,
    last_error TEXT,
    status TEXT DEFAULT 'pending'
  )
`;

const CREATE_METADATA_TABLE = `
  CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;

const CREATE_AUDIO_UPLOADS_TABLE = `
  CREATE TABLE IF NOT EXISTS audio_uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id TEXT NOT NULL,
    local_path TEXT NOT NULL,
    remote_url TEXT,
    file_size INTEGER,
    status TEXT DEFAULT 'pending',
    retry_count INTEGER DEFAULT 0,
    last_error TEXT,
    created_at TEXT NOT NULL,
    uploaded_at TEXT
  )
`;

const CREATE_NOTE_RICH_CONTENT_TABLE = `
  CREATE TABLE IF NOT EXISTS note_rich_content (
    note_id TEXT PRIMARY KEY,
    rtf_base64 TEXT NOT NULL,
    plaintext TEXT,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
  )
`;

// Schema version - increment when schema changes
const SCHEMA_VERSION = 3;

let isInitialized = false;
let initPromise: Promise<void> | null = null;

/**
 * Check if a column exists in a table
 */
function columnExists(db: SQLite.SQLiteDatabase, table: string, column: string): boolean {
  try {
    const result = db.getFirstSync<{ count: number }>(
      `SELECT COUNT(*) as count FROM pragma_table_info('${table}') WHERE name='${column}'`
    );
    return result !== null && result.count > 0;
  } catch {
    return false;
  }
}

/**
 * Check if a table exists
 */
function tableExists(db: SQLite.SQLiteDatabase, table: string): boolean {
  try {
    const result = db.getFirstSync<{ count: number }>(
      `SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='${table}'`
    );
    return result !== null && result.count > 0;
  } catch {
    return false;
  }
}

/**
 * Run schema migrations to add missing columns (preserves existing data)
 */
function runMigrations(db: SQLite.SQLiteDatabase): void {
  console.log('[Database] Running schema migrations...');

  // Notes table migrations
  if (tableExists(db, 'notes')) {
    const noteColumns = [
      { name: 'user_id', sql: "ALTER TABLE notes ADD COLUMN user_id TEXT NOT NULL DEFAULT ''" },
      { name: 'sync_status', sql: "ALTER TABLE notes ADD COLUMN sync_status TEXT DEFAULT 'synced'" },
      { name: 'local_updated_at', sql: 'ALTER TABLE notes ADD COLUMN local_updated_at TEXT' },
      { name: 'server_updated_at', sql: 'ALTER TABLE notes ADD COLUMN server_updated_at TEXT' },
      { name: 'local_audio_path', sql: 'ALTER TABLE notes ADD COLUMN local_audio_path TEXT' },
      { name: 'is_deleted', sql: 'ALTER TABLE notes ADD COLUMN is_deleted INTEGER DEFAULT 0' },
    ];

    for (const { name, sql } of noteColumns) {
      if (!columnExists(db, 'notes', name)) {
        try {
          db.execSync(sql);
          console.log(`[Database] Added column notes.${name}`);
        } catch (err) {
          console.warn(`[Database] Failed to add column notes.${name}:`, err);
        }
      }
    }
  }

  // Folders table migrations
  if (tableExists(db, 'folders')) {
    const folderColumns = [
      { name: 'user_id', sql: "ALTER TABLE folders ADD COLUMN user_id TEXT NOT NULL DEFAULT ''" },
      { name: 'sync_status', sql: "ALTER TABLE folders ADD COLUMN sync_status TEXT DEFAULT 'synced'" },
    ];

    for (const { name, sql } of folderColumns) {
      if (!columnExists(db, 'folders', name)) {
        try {
          db.execSync(sql);
          console.log(`[Database] Added column folders.${name}`);
        } catch (err) {
          console.warn(`[Database] Failed to add column folders.${name}:`, err);
        }
      }
    }
  }

  // Actions table migrations
  if (tableExists(db, 'actions')) {
    const actionColumns = [
      { name: 'sync_status', sql: "ALTER TABLE actions ADD COLUMN sync_status TEXT DEFAULT 'synced'" },
      { name: 'updated_at', sql: "ALTER TABLE actions ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''" },
    ];

    for (const { name, sql } of actionColumns) {
      if (!columnExists(db, 'actions', name)) {
        try {
          db.execSync(sql);
          console.log(`[Database] Added column actions.${name}`);
        } catch (err) {
          console.warn(`[Database] Failed to add column actions.${name}:`, err);
        }
      }
    }
  }

  console.log('[Database] Schema migrations complete');
}

/**
 * Initialize the database by creating all required tables
 */
export async function initializeDatabase(): Promise<void> {
  if (isInitialized) return;

  // Prevent multiple simultaneous initializations
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const db = getExpoDatabase();

      // Create tables one by one with error handling (IF NOT EXISTS is safe)
      const statements = [
        { name: 'notes', sql: CREATE_NOTES_TABLE },
        { name: 'folders', sql: CREATE_FOLDERS_TABLE },
        { name: 'actions', sql: CREATE_ACTIONS_TABLE },
        { name: 'sync_queue', sql: CREATE_SYNC_QUEUE_TABLE },
        { name: 'metadata', sql: CREATE_METADATA_TABLE },
        { name: 'audio_uploads', sql: CREATE_AUDIO_UPLOADS_TABLE },
        { name: 'note_rich_content', sql: CREATE_NOTE_RICH_CONTENT_TABLE },
      ];

      for (const { name, sql } of statements) {
        try {
          db.execSync(sql);
          console.log(`[Database] Created table: ${name}`);
        } catch (err) {
          console.error(`[Database] Failed to create table ${name}:`, err);
          throw err;
        }
      }

      // Run migrations to add any missing columns (for upgrades)
      runMigrations(db);

      // Create indexes after tables are confirmed created
      const indexStatements = [
        'CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_notes_folder_id ON notes(folder_id)',
        'CREATE INDEX IF NOT EXISTS idx_notes_sync_status ON notes(sync_status)',
        'CREATE INDEX IF NOT EXISTS idx_notes_is_deleted ON notes(is_deleted)',
        'CREATE INDEX IF NOT EXISTS idx_notes_is_archived ON notes(is_archived)',
        'CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id)',
        'CREATE INDEX IF NOT EXISTS idx_actions_note_id ON actions(note_id)',
        'CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status)',
        'CREATE INDEX IF NOT EXISTS idx_audio_uploads_note_id ON audio_uploads(note_id)',
        'CREATE INDEX IF NOT EXISTS idx_audio_uploads_status ON audio_uploads(status)',
      ];

      for (const sql of indexStatements) {
        try {
          db.execSync(sql);
        } catch (err) {
          console.warn(`[Database] Failed to create index:`, err);
          // Continue with other indexes
        }
      }

      isInitialized = true;
      console.log('[Database] Initialized successfully');
    } catch (error) {
      console.error('[Database] Initialization failed:', error);
      initPromise = null;
      throw error;
    }
  })();

  return initPromise;
}

/**
 * Check if the database has been initialized
 */
export function isDatabaseInitialized(): boolean {
  return isInitialized;
}

/**
 * Get the underlying expo-sqlite database for direct SQL operations
 */
export function getExpoDb(): SQLite.SQLiteDatabase {
  return getExpoDatabase();
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (expoDb) {
    expoDb.closeSync();
    expoDb = null;
    drizzleDb = null;
  }
  isInitialized = false;
  initPromise = null;
}

/**
 * Clear all data from the database (for logout/testing)
 */
export async function clearDatabase(): Promise<void> {
  const db = getExpoDatabase();
  db.execSync('DELETE FROM notes');
  db.execSync('DELETE FROM folders');
  db.execSync('DELETE FROM actions');
  db.execSync('DELETE FROM sync_queue');
  db.execSync('DELETE FROM metadata');
  db.execSync('DELETE FROM audio_uploads');
  db.execSync('DELETE FROM note_rich_content');
  console.log('[Database] All data cleared');
}

/**
 * Delete the database file completely (for development)
 */
export async function deleteDatabase(): Promise<void> {
  closeDatabase();
  await SQLite.deleteDatabaseAsync(DATABASE_NAME);
  console.log('[Database] Database deleted');
}

/**
 * Reset the database - delete and recreate (for fixing corrupted state)
 */
export async function resetDatabase(): Promise<void> {
  console.log('[Database] Resetting database...');
  await deleteDatabase();
  await initializeDatabase();
  console.log('[Database] Database reset complete');
}

export { schema };
