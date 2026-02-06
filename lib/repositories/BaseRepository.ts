import { eq, sql } from 'drizzle-orm';
import { db } from '../database/client';
import type { SyncStatus } from '../database/schema';

export interface EntityWithSync {
  id: string;
  sync_status: SyncStatus | null;
  local_updated_at?: string | null;
  server_updated_at?: string | null;
}

/**
 * Base repository class with common CRUD operations
 */
export abstract class BaseRepository<
  TRow extends EntityWithSync,
  TInsert,
  TTable extends { id: ReturnType<typeof import('drizzle-orm/sqlite-core').text> }
> {
  protected abstract table: TTable;
  protected abstract tableName: string;

  /**
   * Get entity by ID
   */
  async getById(id: string): Promise<TRow | null> {
    const results = await db
      .select()
      .from(this.table as any)
      .where(eq((this.table as any).id, id))
      .limit(1);
    return (results[0] as TRow) || null;
  }

  /**
   * Check if entity exists
   */
  async exists(id: string): Promise<boolean> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(this.table as any)
      .where(eq((this.table as any).id, id));
    return result[0].count > 0;
  }

  /**
   * Delete entity by ID
   */
  async deleteById(id: string): Promise<void> {
    await db
      .delete(this.table as any)
      .where(eq((this.table as any).id, id));
  }

  /**
   * Mark entity as synced
   */
  async markSynced(id: string, serverUpdatedAt?: string): Promise<void> {
    await db
      .update(this.table as any)
      .set({
        sync_status: 'synced' as SyncStatus,
        server_updated_at: serverUpdatedAt || new Date().toISOString(),
      })
      .where(eq((this.table as any).id, id));
  }

  /**
   * Mark entity as pending sync
   */
  async markPending(id: string): Promise<void> {
    await db
      .update(this.table as any)
      .set({
        sync_status: 'pending' as SyncStatus,
        local_updated_at: new Date().toISOString(),
      })
      .where(eq((this.table as any).id, id));
  }

  /**
   * Mark entity as having a conflict
   */
  async markConflict(id: string): Promise<void> {
    await db
      .update(this.table as any)
      .set({
        sync_status: 'conflict' as SyncStatus,
      })
      .where(eq((this.table as any).id, id));
  }

  /**
   * Mark entity as having an error
   */
  async markError(id: string): Promise<void> {
    await db
      .update(this.table as any)
      .set({
        sync_status: 'error' as SyncStatus,
      })
      .where(eq((this.table as any).id, id));
  }

  /**
   * Get all entities with pending sync status
   */
  async getPending(): Promise<TRow[]> {
    return db
      .select()
      .from(this.table as any)
      .where(eq((this.table as any).sync_status, 'pending')) as Promise<TRow[]>;
  }

  /**
   * Get count of pending sync entities
   */
  async getPendingCount(): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(this.table as any)
      .where(eq((this.table as any).sync_status, 'pending'));
    return result[0].count;
  }
}
