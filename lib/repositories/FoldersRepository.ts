import { eq, and, asc, isNull, sql } from 'drizzle-orm';
import { db } from '../database/client';
import { folders, notes, type FolderRow, type FolderInsert, type SyncStatus } from '../database/schema';
import { BaseRepository } from './BaseRepository';
import type { FolderResponse, FolderReorderItem } from '@/services/notes';

export interface LocalFolderResponse extends Omit<FolderResponse, 'children'> {
  sync_status: SyncStatus | null;
  children: LocalFolderResponse[];
}

export interface CreateFolderInput {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  color?: string | null;
  is_system?: boolean;
  sort_order: number;
  parent_id?: string | null;
  depth?: number;
}

export interface UpdateFolderInput {
  name?: string;
  icon?: string;
  color?: string | null;
  sort_order?: number;
  parent_id?: string | null;
  depth?: number;
}

class FoldersRepository extends BaseRepository<FolderRow, FolderInsert, typeof folders> {
  protected table = folders;
  protected tableName = 'folders';

  /**
   * List all folders for a user, returning a flat list
   */
  async listFlat(userId: string): Promise<FolderRow[]> {
    return db
      .select()
      .from(folders)
      .where(eq(folders.user_id, userId))
      .orderBy(asc(folders.sort_order));
  }

  /**
   * Get note counts per folder
   */
  private async getNoteCounts(userId: string): Promise<Record<string, number>> {
    try {
      const counts = await db
        .select({
          folder_id: notes.folder_id,
          count: sql<number>`count(*)`,
        })
        .from(notes)
        .where(
          and(
            eq(notes.user_id, userId),
            eq(notes.is_deleted, false),
            eq(notes.is_archived, false)
          )
        )
        .groupBy(notes.folder_id);

      const result: Record<string, number> = {};
      for (const row of counts) {
        if (row.folder_id) {
          result[row.folder_id] = row.count;
        }
      }
      return result;
    } catch (err) {
      console.warn('[FoldersRepository] Failed to get note counts:', err);
      return {};
    }
  }

  /**
   * Get total count of all notes for a user
   */
  private async getTotalNoteCount(userId: string): Promise<number> {
    try {
      const result = await db
        .select({
          count: sql<number>`count(*)`,
        })
        .from(notes)
        .where(
          and(
            eq(notes.user_id, userId),
            eq(notes.is_deleted, false),
            eq(notes.is_archived, false)
          )
        );

      return result[0]?.count || 0;
    } catch (err) {
      console.warn('[FoldersRepository] Failed to get total note count:', err);
      return 0;
    }
  }

  /**
   * List folders as a tree structure (matching API response format)
   */
  async list(userId: string): Promise<LocalFolderResponse[]> {
    const allFolders = await this.listFlat(userId);
    const [noteCounts, totalCount] = await Promise.all([
      this.getNoteCounts(userId),
      this.getTotalNoteCount(userId),
    ]);
    return this.buildTree(allFolders, noteCounts, totalCount);
  }

  /**
   * Build tree structure from flat folder list
   */
  private buildTree(
    flatFolders: FolderRow[],
    noteCounts: Record<string, number> = {},
    totalCount: number = 0
  ): LocalFolderResponse[] {
    const folderMap = new Map<string, LocalFolderResponse>();
    const rootFolders: LocalFolderResponse[] = [];

    // First pass: create all folder response objects
    for (const folder of flatFolders) {
      // "All Notes" system folder should show total count of all notes
      const isAllNotesFolder = folder.is_system && folder.name === 'All Notes';
      const count = isAllNotesFolder ? totalCount : (noteCounts[folder.id] || 0);
      folderMap.set(folder.id, this.toResponse(folder, count));
    }

    // Second pass: build tree structure
    for (const folder of flatFolders) {
      const folderResponse = folderMap.get(folder.id)!;

      if (folder.parent_id && folderMap.has(folder.parent_id)) {
        folderMap.get(folder.parent_id)!.children.push(folderResponse);
      } else {
        rootFolders.push(folderResponse);
      }
    }

    return rootFolders;
  }

  /**
   * Convert folder row to response format
   */
  private toResponse(folder: FolderRow, noteCount: number = 0): LocalFolderResponse {
    return {
      id: folder.id,
      name: folder.name,
      icon: folder.icon,
      color: folder.color,
      is_system: folder.is_system || false,
      note_count: noteCount,
      sort_order: folder.sort_order,
      parent_id: folder.parent_id,
      depth: folder.depth || 0,
      children: [],
      created_at: folder.created_at,
      sync_status: folder.sync_status,
    };
  }

  /**
   * Create a new folder
   */
  async create(input: CreateFolderInput): Promise<string> {
    const now = new Date().toISOString();

    await db.insert(folders).values({
      id: input.id,
      user_id: input.user_id,
      name: input.name,
      icon: input.icon,
      color: input.color || null,
      is_system: input.is_system || false,
      sort_order: input.sort_order,
      parent_id: input.parent_id || null,
      depth: input.depth || 0,
      created_at: now,
      updated_at: now,
      sync_status: 'pending',
    });

    return input.id;
  }

  /**
   * Update a folder
   */
  async update(id: string, input: UpdateFolderInput): Promise<void> {
    const now = new Date().toISOString();

    await db
      .update(folders)
      .set({
        ...input,
        updated_at: now,
        sync_status: 'pending',
      })
      .where(eq(folders.id, id));
  }

  /**
   * Reorder multiple folders
   */
  async reorder(updates: FolderReorderItem[]): Promise<void> {
    const now = new Date().toISOString();

    for (const update of updates) {
      await db
        .update(folders)
        .set({
          sort_order: update.sort_order,
          parent_id: update.parent_id,
          updated_at: now,
          sync_status: 'pending',
        })
        .where(eq(folders.id, update.id));
    }
  }

  /**
   * Delete a folder
   */
  async delete(id: string): Promise<void> {
    await db.delete(folders).where(eq(folders.id, id));
  }

  /**
   * Upsert folder from server data
   */
  async upsertFromServer(serverFolder: FolderResponse, userId: string): Promise<void> {
    const existing = await this.getById(serverFolder.id);

    const folderData: FolderInsert = {
      id: serverFolder.id,
      user_id: userId,
      name: serverFolder.name,
      icon: serverFolder.icon,
      color: serverFolder.color,
      is_system: serverFolder.is_system,
      sort_order: serverFolder.sort_order,
      parent_id: serverFolder.parent_id,
      depth: serverFolder.depth,
      created_at: serverFolder.created_at,
      updated_at: new Date().toISOString(),
      sync_status: 'synced',
    };

    if (existing) {
      // Check for conflict
      if (existing.sync_status === 'pending') {
        await this.markConflict(serverFolder.id);
        return;
      }

      await db
        .update(folders)
        .set(folderData)
        .where(eq(folders.id, serverFolder.id));
    } else {
      await db.insert(folders).values(folderData);
    }

    // Recursively upsert children
    for (const child of serverFolder.children || []) {
      await this.upsertFromServer(child, userId);
    }
  }

  /**
   * Bulk upsert folders from server (for initial hydration)
   */
  async bulkUpsert(serverFolders: FolderResponse[], userId: string): Promise<void> {
    // Flatten the tree first
    const flatFolders = this.flattenTree(serverFolders);

    for (const folder of flatFolders) {
      const existing = await this.getById(folder.id);

      const folderData: FolderInsert = {
        id: folder.id,
        user_id: userId,
        name: folder.name,
        icon: folder.icon,
        color: folder.color,
        is_system: folder.is_system,
        sort_order: folder.sort_order,
        parent_id: folder.parent_id,
        depth: folder.depth,
        created_at: folder.created_at,
        updated_at: new Date().toISOString(),
        sync_status: 'synced',
      };

      if (existing) {
        if (existing.sync_status !== 'pending') {
          await db
            .update(folders)
            .set(folderData)
            .where(eq(folders.id, folder.id));
        }
      } else {
        await db.insert(folders).values(folderData);
      }
    }
  }

  /**
   * Flatten folder tree to array
   */
  private flattenTree(folderTree: FolderResponse[]): FolderResponse[] {
    const result: FolderResponse[] = [];

    const flatten = (folders: FolderResponse[]) => {
      for (const folder of folders) {
        result.push(folder);
        if (folder.children && folder.children.length > 0) {
          flatten(folder.children);
        }
      }
    };

    flatten(folderTree);
    return result;
  }

  /**
   * Get next sort order for a new folder
   */
  async getNextSortOrder(userId: string): Promise<number> {
    const allFolders = await this.listFlat(userId);
    if (allFolders.length === 0) return 0;
    return Math.max(...allFolders.map(f => f.sort_order)) + 1;
  }

  /**
   * Clear all folders for a user
   */
  async clearForUser(userId: string): Promise<void> {
    await db.delete(folders).where(eq(folders.user_id, userId));
  }
}

export const foldersRepository = new FoldersRepository();
export default foldersRepository;
