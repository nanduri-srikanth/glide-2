/**
 * Database Manager Service
 *
 * Manages SQLite database connection using expo-sqlite for offline-first data persistence.
 * Provides database initialization, schema migrations, and connection management.
 *
 * Database Schema:
 * - folders: User folders for organizing notes
 * - notes: Voice memos with transcriptions
 * - actions: Calendar events, emails, reminders extracted from notes
 * - sync_queue: Tracks pending changes for background sync
 */

import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

// Database name
export const DB_NAME = 'glide.db';

// Database version for migrations
export const DB_VERSION = 8;

// Enable debug logging in development
const DEBUG = __DEV__;

export interface DatabaseStats {
  notesCount: number;
  foldersCount: number;
  actionsCount: number;
  syncQueueCount: number;
  databaseSize: number;
}

/**
 * Database Manager Class
 *
 * Singleton service for managing SQLite database operations.
 * Handles initialization, migrations, and provides utility methods.
 */
class DatabaseManager {
  private db: SQLite.SQLiteDatabase | null = null;
  private isInitializing = false;
  private initPromise: Promise<void> | null = null;

  /**
   * Get or create the database instance
   */
  async getDatabase(): Promise<SQLite.SQLiteDatabase> {
    if (this.db) {
      return this.db;
    }

    // If initialization is in progress, wait for it
    if (this.isInitializing && this.initPromise) {
      await this.initPromise;
      return this.db!;
    }

    // Initialize the database
    await this.initialize();
    return this.db!;
  }

  /**
   * Initialize the database and create tables
   */
  async initialize(): Promise<void> {
    if (this.db) {
      if (DEBUG) console.log('[Database] Already initialized');
      return;
    }

    if (this.isInitializing) {
      if (DEBUG) console.log('[Database] Initialization already in progress');
      return;
    }

    this.isInitializing = true;

    this.initPromise = (async () => {
      try {
        if (DEBUG) console.log('[Database] Opening database...');

        // Open database
        this.db = await SQLite.openDatabaseAsync(DB_NAME);

        if (DEBUG) console.log('[Database] Database opened successfully');

        // Enable foreign keys
        await this.db.execAsync('PRAGMA foreign_keys = ON;');

        // Create tables
        await this.createTables();

        // Run migrations if needed
        await this.runMigrations();

        if (DEBUG) console.log('[Database] Initialization complete');
      } catch (error) {
        console.error('[Database] Initialization failed:', error);
        throw error;
      } finally {
        this.isInitializing = false;
      }
    })();

    await this.initPromise;
  }

  /**
   * Create all database tables
   */
  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    if (DEBUG) console.log('[Database] Creating tables...');

    // Create folders table
    // Note: user_id references Supabase Auth user, not a local users table
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        icon TEXT DEFAULT 'folder.fill',
        color TEXT,
        is_system INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        parent_id TEXT,
        depth INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        sync_status TEXT DEFAULT 'synced',
        FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id);
      CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id);
    `);

    // Create notes table
    // Note: user_id references Supabase Auth user, not a local users table
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        folder_id TEXT,
        title TEXT NOT NULL,
        transcript TEXT NOT NULL,
        summary TEXT,
        duration INTEGER,
        audio_url TEXT,
        audio_format TEXT,
        local_audio_path TEXT,
        tags TEXT DEFAULT '[]',
        is_pinned INTEGER DEFAULT 0,
        is_archived INTEGER DEFAULT 0,
        is_deleted INTEGER DEFAULT 0,
        deleted_at TEXT,
        ai_processed INTEGER DEFAULT 0,
        ai_metadata TEXT DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        sync_status TEXT DEFAULT 'synced',
        local_updated_at TEXT,
        server_updated_at TEXT,
        current_version_id TEXT,
        full_transcript_plain TEXT,
        body_plain TEXT,
        summary_plain TEXT,
        actions_json TEXT,
        FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
      CREATE INDEX IF NOT EXISTS idx_notes_folder_id ON notes(folder_id);
      CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_notes_is_deleted ON notes(is_deleted);
    `);

    // Create actions table
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS actions (
        id TEXT PRIMARY KEY,
        note_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        priority TEXT DEFAULT 'medium',
        title TEXT NOT NULL,
        description TEXT,
        details TEXT DEFAULT '{}',
        scheduled_date TEXT,
        scheduled_end_date TEXT,
        location TEXT,
        attendees TEXT DEFAULT '[]',
        email_to TEXT,
        email_subject TEXT,
        email_body TEXT,
        external_id TEXT,
        external_service TEXT,
        external_url TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        executed_at TEXT,
        sync_status TEXT DEFAULT 'synced',
        FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_actions_note_id ON actions(note_id);
      CREATE INDEX IF NOT EXISTS idx_actions_action_type ON actions(action_type);
      CREATE INDEX IF NOT EXISTS idx_actions_status ON actions(status);
      CREATE INDEX IF NOT EXISTS idx_actions_scheduled_date ON actions(scheduled_date);
    `);

    // Create sync_queue table for offline sync
    await this.db.execAsync(`
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
      );

      CREATE INDEX IF NOT EXISTS idx_sync_queue_entity_type ON sync_queue(entity_type);
      CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
      CREATE INDEX IF NOT EXISTS idx_sync_queue_created_at ON sync_queue(created_at);
    `);

    // Create audio_uploads table for tracking audio file uploads
    await this.db.execAsync(`
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
        uploaded_at TEXT,
        FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_audio_uploads_note_id ON audio_uploads(note_id);
      CREATE INDEX IF NOT EXISTS idx_audio_uploads_status ON audio_uploads(status);
    `);

    // Create metadata table for storing key-value pairs (e.g., last sync timestamp)
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    // Create note_rich_content table for storing rich text (RTF) per note
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS note_rich_content (
        note_id TEXT PRIMARY KEY,
        rtf_base64 TEXT NOT NULL,
        plaintext TEXT,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
      );
    `);

    // Create note_inputs table for immutable append-only inputs
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS note_inputs (
        id TEXT PRIMARY KEY,
        note_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        type TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'user',
        text_plain TEXT,
        audio_url TEXT,
        meta TEXT,
        sync_status TEXT DEFAULT 'synced',
        FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
      );
    `);

    // Create note_versions table for versioned note state
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS note_versions (
        id TEXT PRIMARY KEY,
        note_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        kind TEXT NOT NULL,
        actor TEXT NOT NULL,
        title TEXT,
        body_plain TEXT,
        body_rtf_base64 TEXT,
        summary_plain TEXT,
        actions_json TEXT,
        what_removed TEXT,
        parent_version_id TEXT,
        sync_status TEXT DEFAULT 'synced',
        FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
      );
    `);

    if (DEBUG) console.log('[Database] Tables created successfully');
  }

  /**
   * Run database migrations
   * Checks the current version and applies any pending migrations
   */
  private async runMigrations(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    if (DEBUG) console.log('[Database] Checking migrations...');

    // Get current version from user_version table
    const result = await this.db.getFirstAsync<{ user_version: number }>(
      'PRAGMA user_version'
    );
    const currentVersion = result?.user_version || 0;

    if (DEBUG) console.log(`[Database] Current version: ${currentVersion}, Target: ${DB_VERSION}`);

    if (currentVersion >= DB_VERSION) {
      if (DEBUG) console.log('[Database] Database is up to date');
      return;
    }

    // Apply migrations sequentially
    for (let version = currentVersion + 1; version <= DB_VERSION; version++) {
      if (DEBUG) console.log(`[Database] Applying migration v${version}...`);
      await this.applyMigration(version);
    }

    // Update user_version
    await this.db.execAsync(`PRAGMA user_version = ${DB_VERSION}`);

    if (DEBUG) console.log('[Database] Migrations complete');
  }

  /**
   * Apply a specific migration
   */
  private async applyMigration(version: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    switch (version) {
      case 1:
        // Initial schema is created in createTables()
        break;

      case 2:
        // Add audio_uploads table for existing databases
        // This table was added to createTables() but existing installations
        // don't have it, so we need to create it via migration
        await this.db.execAsync(`
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
            uploaded_at TEXT,
            FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
          );

          CREATE INDEX IF NOT EXISTS idx_audio_uploads_note_id ON audio_uploads(note_id);
          CREATE INDEX IF NOT EXISTS idx_audio_uploads_status ON audio_uploads(status);
        `);
        break;

      case 3:
        // Add sync_status columns to folders, notes, and actions tables
        // These columns are expected by the Drizzle schema but were not in the original SQLite schema
        // Use try/catch for each ALTER TABLE since columns may already exist in fresh installs

        // Add sync_status to folders table
        try {
          await this.db.execAsync(`ALTER TABLE folders ADD COLUMN sync_status TEXT DEFAULT 'synced';`);
        } catch (e) { /* Column may already exist */ }

        // Add sync_status, local_updated_at, server_updated_at to notes table
        try {
          await this.db.execAsync(`ALTER TABLE notes ADD COLUMN sync_status TEXT DEFAULT 'synced';`);
        } catch (e) { /* Column may already exist */ }
        try {
          await this.db.execAsync(`ALTER TABLE notes ADD COLUMN local_updated_at TEXT;`);
        } catch (e) { /* Column may already exist */ }
        try {
          await this.db.execAsync(`ALTER TABLE notes ADD COLUMN server_updated_at TEXT;`);
        } catch (e) { /* Column may already exist */ }
        try {
          await this.db.execAsync(`ALTER TABLE notes ADD COLUMN local_audio_path TEXT;`);
        } catch (e) { /* Column may already exist */ }

        // Add sync_status to actions table
        try {
          await this.db.execAsync(`ALTER TABLE actions ADD COLUMN sync_status TEXT DEFAULT 'synced';`);
        } catch (e) { /* Column may already exist */ }
        break;

      case 4:
        // Recreate sync_queue table with correct schema
        // The old schema used different column names (table_name, record_id, data, attempts)
        // The Drizzle schema expects (entity_type, entity_id, payload, retry_count)
        // Drop and recreate since pending sync items can be regenerated
        await this.db.execAsync(`DROP TABLE IF EXISTS sync_queue;`);
        await this.db.execAsync(`
          CREATE TABLE sync_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            operation TEXT NOT NULL,
            payload TEXT,
            created_at TEXT NOT NULL,
            retry_count INTEGER DEFAULT 0,
            last_error TEXT,
            status TEXT DEFAULT 'pending'
          );

          CREATE INDEX IF NOT EXISTS idx_sync_queue_entity_type ON sync_queue(entity_type);
          CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
          CREATE INDEX IF NOT EXISTS idx_sync_queue_created_at ON sync_queue(created_at);
        `);

        // Create metadata table if it doesn't exist
        await this.db.execAsync(`
          CREATE TABLE IF NOT EXISTS metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
        `);
        break;

      case 5:
        // No schema changes — createTables() already has the correct schema
        break;

      case 6:
        // Add note_rich_content table for storing rich text (RTF) per note
        await this.db.execAsync(`
          CREATE TABLE IF NOT EXISTS note_rich_content (
            note_id TEXT PRIMARY KEY,
            rtf_base64 TEXT NOT NULL,
            plaintext TEXT,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
          );
        `);
        break;

      case 7:
        // Add note_inputs and note_versions tables for history & audit
        await this.db.execAsync(`
          CREATE TABLE IF NOT EXISTS note_inputs (
            id TEXT PRIMARY KEY,
            note_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            type TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'user',
            text_plain TEXT,
            audio_url TEXT,
            meta TEXT,
            sync_status TEXT DEFAULT 'synced',
            FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
          );
        `);
        await this.db.execAsync(`
          CREATE TABLE IF NOT EXISTS note_versions (
            id TEXT PRIMARY KEY,
            note_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            kind TEXT NOT NULL,
            actor TEXT NOT NULL,
            title TEXT,
            body_plain TEXT,
            body_rtf_base64 TEXT,
            summary_plain TEXT,
            actions_json TEXT,
            what_removed TEXT,
            parent_version_id TEXT,
            sync_status TEXT DEFAULT 'synced',
            FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
          );
        `);
        break;

      case 8:
        // Add history/audit columns to notes table
        try {
          await this.db.execAsync(`ALTER TABLE notes ADD COLUMN current_version_id TEXT`);
        } catch (e) { /* Column may already exist */ }
        try {
          await this.db.execAsync(`ALTER TABLE notes ADD COLUMN full_transcript_plain TEXT`);
        } catch (e) { /* Column may already exist */ }
        try {
          await this.db.execAsync(`ALTER TABLE notes ADD COLUMN body_plain TEXT`);
        } catch (e) { /* Column may already exist */ }
        try {
          await this.db.execAsync(`ALTER TABLE notes ADD COLUMN summary_plain TEXT`);
        } catch (e) { /* Column may already exist */ }
        try {
          await this.db.execAsync(`ALTER TABLE notes ADD COLUMN actions_json TEXT`);
        } catch (e) { /* Column may already exist */ }
        break;

      default:
        throw new Error(`Unknown migration version: ${version}`);
    }
  }

  /**
   * Close the database connection
   * Note: expo-sqlite doesn't actually close databases in the same way as native SQLite
   * This is primarily for cleanup and testing
   */
  async close(): Promise<void> {
    if (this.db) {
      if (DEBUG) console.log('[Database] Closing database...');
      this.db = null;
      if (DEBUG) console.log('[Database] Database closed');
    }
  }

  /**
   * Delete all data (for testing/logout)
   */
  async resetDatabase(): Promise<void> {
    const db = await this.getDatabase();

    if (DEBUG) console.log('[Database] Resetting database...');

    // Drop all tables
    await db.execAsync(`
      DROP TABLE IF EXISTS note_versions;
      DROP TABLE IF EXISTS note_inputs;
      DROP TABLE IF EXISTS note_rich_content;
      DROP TABLE IF EXISTS audio_uploads;
      DROP TABLE IF EXISTS sync_queue;
      DROP TABLE IF EXISTS actions;
      DROP TABLE IF EXISTS notes;
      DROP TABLE IF EXISTS folders;
    `);

    // Recreate tables
    await this.createTables();

    if (DEBUG) console.log('[Database] Database reset complete');
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<DatabaseStats> {
    const db = await this.getDatabase();

    const [notesCount, foldersCount, actionsCount, syncQueueCount] = await Promise.all([
      db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM notes'),
      db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM folders'),
      db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM actions'),
      db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM sync_queue'),
    ]);

    return {
      notesCount: notesCount?.count || 0,
      foldersCount: foldersCount?.count || 0,
      actionsCount: actionsCount?.count || 0,
      syncQueueCount: syncQueueCount?.count || 0,
      databaseSize: 0, // Would need file system access to get actual size
    };
  }

  /**
   * Execute a raw SQL query
   * This is a low-level method for advanced use cases
   */
  async executeRaw<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const db = await this.getDatabase();
    return await db.getAllAsync<T>(sql, params);
  }

  /**
   * Begin a transaction
   * Returns a transaction object that can be used to execute multiple queries atomically
   */
  async withTransaction<T>(callback: () => Promise<T>): Promise<T> {
    const db = await this.getDatabase();

    await db.execAsync('BEGIN TRANSACTION');

    try {
      const result = await callback();
      await db.execAsync('COMMIT');
      return result;
    } catch (error) {
      await db.execAsync('ROLLBACK');
      throw error;
    }
  }
}

// Export singleton instance
export const databaseManager = new DatabaseManager();

// Export types
export type { DatabaseManager };
