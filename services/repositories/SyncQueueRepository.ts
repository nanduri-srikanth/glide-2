/**
 * Sync Queue Repository
 *
 * Manages the sync queue table for tracking pending offline changes
 * that need to be synchronized with the backend server.
 */

import { databaseManager } from '../database';

/**
 * Sync operation types
 */
export enum SyncOperation {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
}

/**
 * Sync status
 */
export enum SyncStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * Sync queue item data model
 */
export interface SyncQueueItem {
  id: string;
  table_name: string;
  record_id: string;
  operation: SyncOperation;
  data: Record<string, any>;
  created_at: string;
  attempts: number;
  last_error?: string;
  status: SyncStatus;
}

/**
 * Sync queue creation input
 */
export type SyncQueueInput = Omit<
  SyncQueueItem,
  'id' | 'created_at' | 'attempts' | 'status'
>;

/**
 * Sync queue filters
 */
export interface SyncQueueFilters {
  tableName?: string;
  recordId?: string;
  operation?: SyncOperation;
  status?: SyncStatus;
  limit?: number;
}

/**
 * Sync result
 */
export interface SyncResult {
  success: boolean;
  processed: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
}

/**
 * Sync Queue Repository Class
 *
 * Manages offline sync queue for tracking changes that need to be
 * synchronized with the backend server.
 */
export class SyncQueueRepository {
  private tableName = 'sync_queue';

  /**
   * Add an item to the sync queue
   */
  async add(input: SyncQueueInput): Promise<SyncQueueItem> {
    const db = await databaseManager.getDatabase();

    const now = new Date().toISOString();
    const id = this.generateId();

    const item: SyncQueueItem = {
      ...input,
      id,
      created_at: now,
      attempts: 0,
      status: SyncStatus.PENDING,
    };

    await db.runAsync(
      `INSERT INTO ${this.tableName} (
        id, table_name, record_id, operation, data,
        created_at, attempts, last_error, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.table_name,
        item.record_id,
        item.operation,
        JSON.stringify(item.data),
        item.created_at,
        item.attempts,
        item.last_error || null,
        item.status,
      ]
    );

    return item;
  }

  /**
   * Get a sync queue item by ID
   */
  async getById(id: string): Promise<SyncQueueItem | null> {
    const db = await databaseManager.getDatabase();

    const result = await db.getFirstAsync<any>(
      `SELECT * FROM ${this.tableName} WHERE id = ?`,
      [id]
    );

    return result ? this.mapFromDb(result) : null;
  }

  /**
   * Get all sync queue items with optional filters
   */
  async getAll(filters: SyncQueueFilters = {}): Promise<SyncQueueItem[]> {
    const db = await databaseManager.getDatabase();

    let query = `SELECT * FROM ${this.tableName} WHERE 1=1`;
    const params: any[] = [];

    if (filters.tableName) {
      query += ' AND table_name = ?';
      params.push(filters.tableName);
    }

    if (filters.recordId) {
      query += ' AND record_id = ?';
      params.push(filters.recordId);
    }

    if (filters.operation) {
      query += ' AND operation = ?';
      params.push(filters.operation);
    }

    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    query += ` ORDER BY created_at ASC`;

    if (filters.limit) {
      query += ` LIMIT ?`;
      params.push(filters.limit);
    }

    const results = await db.getAllAsync<any>(query, params);
    return results.map(row => this.mapFromDb(row));
  }

  /**
   * Get pending sync items
   */
  async getPending(limit = 50): Promise<SyncQueueItem[]> {
    return this.getAll({
      status: SyncStatus.PENDING,
      limit,
    });
  }

  /**
   * Get failed sync items (for retry)
   */
  async getFailed(limit = 50): Promise<SyncQueueItem[]> {
    return this.getAll({
      status: SyncStatus.FAILED,
      limit,
    });
  }

  /**
   * Get items by table name
   */
  async getByTable(tableName: string): Promise<SyncQueueItem[]> {
    return this.getAll({ tableName });
  }

  /**
   * Get items by record ID
   */
  async getByRecord(recordId: string): Promise<SyncQueueItem[]> {
    return this.getAll({ recordId });
  }

  /**
   * Update a sync queue item
   */
  async update(
    id: string,
    updates: Partial<Omit<SyncQueueItem, 'id' | 'created_at'>>
  ): Promise<SyncQueueItem | null> {
    const db = await databaseManager.getDatabase();

    const existing = await this.getById(id);
    if (!existing) return null;

    const updated: SyncQueueItem = {
      ...existing,
      ...updates,
    };

    await db.runAsync(
      `UPDATE ${this.tableName} SET
        table_name = ?, record_id = ?, operation = ?, data = ?,
        attempts = ?, last_error = ?, status = ?
      WHERE id = ?`,
      [
        updated.table_name,
        updated.record_id,
        updated.operation,
        JSON.stringify(updated.data),
        updated.attempts,
        updated.last_error || null,
        updated.status,
        id,
      ]
    );

    return updated;
  }

  /**
   * Mark item as in progress
   */
  async markInProgress(id: string): Promise<SyncQueueItem | null> {
    return this.update(id, { status: SyncStatus.IN_PROGRESS });
  }

  /**
   * Mark item as completed
   */
  async markCompleted(id: string): Promise<SyncQueueItem | null> {
    return this.update(id, { status: SyncStatus.COMPLETED });
  }

  /**
   * Mark item as failed with error message
   */
  async markFailed(id: string, error: string): Promise<SyncQueueItem | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    return this.update(id, {
      status: SyncStatus.FAILED,
      last_error: error,
      attempts: existing.attempts + 1,
    });
  }

  /**
   * Delete a sync queue item
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
   * Delete completed items
   */
  async deleteCompleted(): Promise<number> {
    const db = await databaseManager.getDatabase();

    const result = await db.runAsync(
      `DELETE FROM ${this.tableName} WHERE status = ?`,
      [SyncStatus.COMPLETED]
    );

    return result.changes || 0;
  }

  /**
   * Clear all sync queue items (for testing/logout)
   */
  async clear(): Promise<number> {
    const db = await databaseManager.getDatabase();

    const result = await db.runAsync(`DELETE FROM ${this.tableName}`);

    return result.changes || 0;
  }

  /**
   * Count sync queue items with optional filters
   */
  async count(filters: SyncQueueFilters = {}): Promise<number> {
    const db = await databaseManager.getDatabase();

    let query = `SELECT COUNT(*) as count FROM ${this.tableName} WHERE 1=1`;
    const params: any[] = [];

    if (filters.tableName) {
      query += ' AND table_name = ?';
      params.push(filters.tableName);
    }

    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    const result = await db.getFirstAsync<{ count: number }>(query, params);
    return result?.count || 0;
  }

  /**
   * Get sync queue statistics
   */
  async getStats(): Promise<{
    pending: number;
    inProgress: number;
    failed: number;
    completed: number;
    total: number;
  }> {
    const db = await databaseManager.getDatabase();

    const [pending, inProgress, failed, completed] = await Promise.all([
      db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM ${this.tableName} WHERE status = ?`,
        [SyncStatus.PENDING]
      ),
      db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM ${this.tableName} WHERE status = ?`,
        [SyncStatus.IN_PROGRESS]
      ),
      db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM ${this.tableName} WHERE status = ?`,
        [SyncStatus.FAILED]
      ),
      db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM ${this.tableName} WHERE status = ?`,
        [SyncStatus.COMPLETED]
      ),
    ]);

    const total =
      (pending?.count || 0) +
      (inProgress?.count || 0) +
      (failed?.count || 0) +
      (completed?.count || 0);

    return {
      pending: pending?.count || 0,
      inProgress: inProgress?.count || 0,
      failed: failed?.count || 0,
      completed: completed?.count || 0,
      total,
    };
  }

  /**
   * Retry failed items (reset to pending)
   */
  async retryFailed(maxAttempts = 3): Promise<number> {
    const failedItems = await this.getFailed();
    let retriedCount = 0;

    for (const item of failedItems) {
      if (item.attempts < maxAttempts) {
        await this.update(item.id, {
          status: SyncStatus.PENDING,
          last_error: undefined,
        });
        retriedCount++;
      }
    }

    return retriedCount;
  }

  /**
   * Queue a create operation
   */
  async queueCreate(
    tableName: string,
    recordId: string,
    data: Record<string, any>
  ): Promise<SyncQueueItem> {
    return this.add({
      table_name: tableName,
      record_id: recordId,
      operation: SyncOperation.CREATE,
      data,
    });
  }

  /**
   * Queue an update operation
   */
  async queueUpdate(
    tableName: string,
    recordId: string,
    data: Record<string, any>
  ): Promise<SyncQueueItem> {
    return this.add({
      table_name: tableName,
      record_id: recordId,
      operation: SyncOperation.UPDATE,
      data,
    });
  }

  /**
   * Queue a delete operation
   */
  async queueDelete(
    tableName: string,
    recordId: string,
    data: Record<string, any> = {}
  ): Promise<SyncQueueItem> {
    return this.add({
      table_name: tableName,
      record_id: recordId,
      operation: SyncOperation.DELETE,
      data,
    });
  }

  /**
   * Map database row to SyncQueueItem object
   */
  private mapFromDb(row: any): SyncQueueItem {
    return {
      id: row.id,
      table_name: row.table_name,
      record_id: row.record_id,
      operation: row.operation,
      data: row.data ? JSON.parse(row.data) : {},
      created_at: row.created_at,
      attempts: row.attempts,
      last_error: row.last_error,
      status: row.status,
    };
  }

  /**
   * Generate a unique ID for a new sync queue item
   */
  private generateId(): string {
    return `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance
export const syncQueueRepository = new SyncQueueRepository();
