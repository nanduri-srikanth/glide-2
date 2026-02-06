/**
 * Folder Repository
 *
 * Provides CRUD operations for folders stored in the local SQLite database.
 * Supports hierarchical folder structure with parent-child relationships.
 */

import { databaseManager } from '../database';
import { Folder } from '../../data/types';

/**
 * Folder data model for database storage
 * noteCount is computed and added after fetching from database
 */
export type DBFolder = Omit<Folder, 'children'> & {
  user_id: string;
  created_at: string;
  updated_at: string;
};

/**
 * Folder creation input (without auto-generated fields)
 */
export type FolderInput = Omit<
  DBFolder,
  'id' | 'created_at' | 'updated_at' | 'children'
>;

/**
 * Folder update input (all fields optional)
 */
export type FolderUpdate = Partial<Omit<FolderInput, 'id'>>;

/**
 * Folder query filters
 */
export interface FolderFilters {
  userId?: string;
  parentId?: string | null;
  isSystem?: boolean;
  includeChildren?: boolean;
  sortBy?: 'sort_order' | 'name' | 'created_at';
  sortOrder?: 'ASC' | 'DESC';
}

/**
 * Folder Repository Class
 *
 * Handles all database operations for folders including:
 * - CRUD operations
 * - Hierarchical queries (parent-child relationships)
 * - Tree structure building
 * - System folder management
 */
export class FolderRepository {
  private tableName = 'folders';

  /**
   * Create a new folder
   */
  async create(input: FolderInput): Promise<DBFolder> {
    const db = await databaseManager.getDatabase();

    const now = new Date().toISOString();
    const id = this.generateId();

    const folder: DBFolder = {
      ...input,
      id,
      created_at: now,
      updated_at: now,
    };

    // Calculate depth if parent_id is provided
    let depth = input.depth || 0;
    if (input.parentId) {
      const parent = await this.getById(input.parentId);
      if (parent) {
        depth = parent.depth + 1;
      }
    }

    await db.runAsync(
      `INSERT INTO ${this.tableName} (
        id, user_id, name, icon, color, is_system,
        sort_order, parent_id, depth, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        folder.id,
        folder.user_id,
        folder.name,
        folder.icon,
        folder.color || null,
        folder.isSystem ? 1 : 0,
        folder.sortOrder,
        folder.parentId || null,
        depth,
        folder.created_at,
        folder.updated_at,
      ]
    );

    return folder;
  }

  /**
   * Get a folder by ID
   */
  async getById(id: string): Promise<DBFolder | null> {
    const db = await databaseManager.getDatabase();

    const result = await db.getFirstAsync<any>(
      `SELECT * FROM ${this.tableName} WHERE id = ?`,
      [id]
    );

    if (!result) return null;

    const folder = this.mapFromDb(result);

    // Get note count
    folder.noteCount = await this.getNoteCount(id);

    return folder;
  }

  /**
   * Get all folders with optional filters
   */
  async getAll(filters: FolderFilters = {}): Promise<Folder[]> {
    const db = await databaseManager.getDatabase();

    let query = `SELECT * FROM ${this.tableName} WHERE 1=1`;
    const params: any[] = [];

    // Apply filters
    if (filters.userId) {
      query += ' AND user_id = ?';
      params.push(filters.userId);
    }

    if (filters.parentId !== undefined) {
      if (filters.parentId === null) {
        query += ' AND parent_id IS NULL';
      } else {
        query += ' AND parent_id = ?';
        params.push(filters.parentId);
      }
    }

    if (filters.isSystem !== undefined) {
      query += ` AND is_system = ?`;
      params.push(filters.isSystem ? 1 : 0);
    }

    // Sorting
    const sortBy = filters.sortBy || 'sort_order';
    const sortOrder = filters.sortOrder || 'ASC';
    query += ` ORDER BY ${sortBy} ${sortOrder}`;

    const results = await db.getAllAsync<any>(query, params);
    const folders = results.map(row => this.mapFromDb(row));

    // Add note counts
    for (const folder of folders) {
      folder.noteCount = await this.getNoteCount(folder.id);
    }

    // Build tree structure if requested
    if (filters.includeChildren) {
      return this.buildTree(folders);
    }

    // Cast to Folder[] since noteCount is now guaranteed to be defined
    return folders as Folder[];
  }

  /**
   * Get root folders (no parent)
   */
  async getRootFolders(userId: string): Promise<Folder[]> {
    return this.getAll({
      userId,
      parentId: null,
      includeChildren: true,
    });
  }

  /**
   * Get children of a folder
   */
  async getChildren(parentId: string): Promise<Folder[]> {
    return this.getAll({
      parentId,
      includeChildren: true,
    });
  }

  /**
   * Get system folders (All Notes, Recently Deleted, etc.)
   */
  async getSystemFolders(userId: string): Promise<Folder[]> {
    return this.getAll({
      userId,
      isSystem: true,
    });
  }

  /**
   * Get user folders (non-system)
   */
  async getUserFolders(userId: string): Promise<Folder[]> {
    return this.getAll({
      userId,
      isSystem: false,
      includeChildren: true,
    });
  }

  /**
   * Update a folder
   */
  async update(id: string, updates: FolderUpdate): Promise<DBFolder | null> {
    const db = await databaseManager.getDatabase();

    const existing = await this.getById(id);
    if (!existing) return null;

    const updated: DBFolder = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    await db.runAsync(
      `UPDATE ${this.tableName} SET
        user_id = ?, name = ?, icon = ?, color = ?,
        is_system = ?, sort_order = ?, parent_id = ?,
        depth = ?, updated_at = ?
      WHERE id = ?`,
      [
        updated.user_id,
        updated.name,
        updated.icon,
        updated.color || null,
        updated.isSystem ? 1 : 0,
        updated.sortOrder,
        updated.parentId || null,
        updated.depth,
        updated.updated_at,
        id,
      ]
    );

    return updated;
  }

  /**
   * Delete a folder
   */
  async delete(id: string): Promise<boolean> {
    const db = await databaseManager.getDatabase();

    const result = await db.runAsync(
      `DELETE FROM ${this.tableName} WHERE id = ?`,
      [id]
    );

    return (result.changes || 0) > 0;
  }

  /**
   * Move a folder to a new parent
   */
  async move(id: string, newParentId: string | null): Promise<DBFolder | null> {
    const folder = await this.getById(id);
    if (!folder) return null;

    // Prevent circular references
    if (newParentId) {
      const isDescendant = await this.isDescendant(newParentId, id);
      if (isDescendant) {
        throw new Error('Cannot move a folder into its own descendant');
      }
    }

    // Calculate new depth
    let newDepth = 0;
    if (newParentId) {
      const newParent = await this.getById(newParentId);
      if (newParent) {
        newDepth = newParent.depth + 1;
      }
    }

    return this.update(id, {
      parentId: newParentId,
      depth: newDepth,
    });
  }

  /**
   * Get the full path to a folder
   */
  async getPath(folderId: string): Promise<Folder[]> {
    const path: DBFolder[] = [];
    let current = await this.getById(folderId);

    while (current) {
      path.unshift(current);
      if (current.parentId) {
        current = await this.getById(current.parentId);
      } else {
        break;
      }
    }

    return path as Folder[];
  }

  /**
   * Get all descendants of a folder
   */
  async getDescendants(folderId: string): Promise<Folder[]> {
    const db = await databaseManager.getDatabase();

    const results = await db.getAllAsync<any>(
      `WITH RECURSIVE descendants AS (
        SELECT * FROM ${this.tableName} WHERE id = ?
        UNION ALL
        SELECT f.* FROM ${this.tableName} f
        INNER JOIN descendants d ON f.parent_id = d.id
      )
      SELECT * FROM descendants WHERE id != ?`,
      [folderId, folderId]
    );

    return results.map(row => this.mapFromDb(row)) as Folder[];
  }

  /**
   * Count folders with optional filters
   */
  async count(filters: FolderFilters = {}): Promise<number> {
    const db = await databaseManager.getDatabase();

    let query = `SELECT COUNT(*) as count FROM ${this.tableName} WHERE 1=1`;
    const params: any[] = [];

    if (filters.userId) {
      query += ' AND user_id = ?';
      params.push(filters.userId);
    }

    if (filters.parentId !== undefined) {
      if (filters.parentId === null) {
        query += ' AND parent_id IS NULL';
      } else {
        query += ' AND parent_id = ?';
        params.push(filters.parentId);
      }
    }

    if (filters.isSystem !== undefined) {
      query += ` AND is_system = ?`;
      params.push(filters.isSystem ? 1 : 0);
    }

    const result = await db.getFirstAsync<{ count: number }>(query, params);
    return result?.count || 0;
  }

  /**
   * Reorder folders within a parent
   */
  async reorder(parentId: string | null, folderIds: string[]): Promise<void> {
    return databaseManager.withTransaction(async () => {
      for (let i = 0; i < folderIds.length; i++) {
        await this.update(folderIds[i], { sortOrder: i });
      }
    });
  }

  /**
   * Check if a folder is a descendant of another
   */
  private async isDescendant(ancestorId: string, descendantId: string): Promise<boolean> {
    const descendants = await this.getDescendants(ancestorId);
    return descendants.some(f => f.id === descendantId);
  }

  /**
   * Build tree structure from flat folder list
   */
  private buildTree(folders: DBFolder[]): Folder[] {
    const folderMap = new Map<string, Folder>();

    // First pass: create map with Folder type (which has children)
    folders.forEach(folder => {
      folderMap.set(folder.id, {
        ...folder,
        children: [],
        noteCount: folder.noteCount || 0, // Ensure noteCount is defined
      });
    });

    // Second pass: build tree
    const rootFolders: Folder[] = [];
    folderMap.forEach(folder => {
      if (folder.parentId && folderMap.has(folder.parentId)) {
        const parent = folderMap.get(folder.parentId)!;
        parent.children!.push(folder);
      } else {
        rootFolders.push(folder);
      }
    });

    return rootFolders;
  }

  /**
   * Get note count for a folder
   */
  private async getNoteCount(folderId: string): Promise<number> {
    const db = await databaseManager.getDatabase();

    const result = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM notes WHERE folder_id = ? AND is_deleted = 0`,
      [folderId]
    );

    return result?.count || 0;
  }

  /**
   * Map database row to Folder object
   * Note: noteCount is added separately after mapping
   */
  private mapFromDb(row: any): Omit<DBFolder, 'noteCount'> & { noteCount?: number } {
    return {
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      icon: row.icon,
      color: row.color,
      isSystem: row.is_system === 1,
      sortOrder: row.sort_order,
      parentId: row.parent_id,
      depth: row.depth,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  /**
   * Generate a unique ID for a new folder
   */
  private generateId(): string {
    return `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance
export const folderRepository = new FolderRepository();
