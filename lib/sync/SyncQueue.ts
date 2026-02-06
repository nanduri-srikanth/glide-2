import { eq, and, lt, asc, sql } from 'drizzle-orm';
import { db } from '../database/client';
import { syncQueue, type SyncQueueRow, type SyncQueueInsert } from '../database/schema';

export type EntityType = 'note' | 'folder' | 'action';
export type OperationType = 'create' | 'update' | 'delete';
export type QueueStatus = 'pending' | 'processing' | 'failed';

export interface QueueItem {
  id: number;
  entity_type: EntityType;
  entity_id: string;
  operation: OperationType;
  payload: Record<string, any> | null;
  created_at: string;
  retry_count: number;
  last_error: string | null;
  status: QueueStatus;
}

export interface EnqueueInput {
  entity_type: EntityType;
  entity_id: string;
  operation: OperationType;
  payload?: Record<string, any>;
}

const MAX_RETRIES = 5;

class SyncQueue {
  /**
   * Add an item to the sync queue
   */
  async enqueue(input: EnqueueInput): Promise<number> {
    const now = new Date().toISOString();

    // Check if there's already a pending item for this entity
    const existing = await db
      .select()
      .from(syncQueue)
      .where(
        and(
          eq(syncQueue.entity_type, input.entity_type),
          eq(syncQueue.entity_id, input.entity_id),
          eq(syncQueue.status, 'pending')
        )
      )
      .limit(1);

    if (existing.length > 0) {
      // Merge with existing item
      const existingItem = existing[0];

      // If creating then updating, keep as create with updated payload
      // If updating multiple times, keep as update with latest payload
      // If deleting, change to delete
      let newOperation = input.operation;
      let newPayload = input.payload || existingItem.payload;

      if (existingItem.operation === 'create' && input.operation === 'update') {
        newOperation = 'create';
        newPayload = { ...(existingItem.payload as Record<string, any>), ...input.payload };
      } else if (existingItem.operation === 'create' && input.operation === 'delete') {
        // Created then deleted before sync - just remove from queue
        await this.remove(existingItem.id);
        return existingItem.id;
      }

      await db
        .update(syncQueue)
        .set({
          operation: newOperation,
          payload: newPayload ? JSON.stringify(newPayload) : null,
          created_at: now,
        })
        .where(eq(syncQueue.id, existingItem.id));

      return existingItem.id;
    }

    // Insert new queue item
    const result = await db.insert(syncQueue).values({
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      operation: input.operation,
      payload: input.payload ? JSON.stringify(input.payload) : null,
      created_at: now,
      retry_count: 0,
      status: 'pending',
    });

    // Return the inserted ID (expo-sqlite returns lastInsertRowId)
    return (result as any).lastInsertRowId || 0;
  }

  /**
   * Get items from the queue ready for processing
   */
  async dequeue(limit: number = 10): Promise<QueueItem[]> {
    // Get pending items that haven't exceeded max retries
    const items = await db
      .select()
      .from(syncQueue)
      .where(
        and(
          eq(syncQueue.status, 'pending'),
          lt(syncQueue.retry_count, MAX_RETRIES)
        )
      )
      .orderBy(asc(syncQueue.created_at))
      .limit(limit);

    // Mark as processing
    for (const item of items) {
      await db
        .update(syncQueue)
        .set({ status: 'processing' })
        .where(eq(syncQueue.id, item.id));
    }

    return items.map(item => this.toQueueItem(item));
  }

  /**
   * Convert database row to QueueItem
   */
  private toQueueItem(row: SyncQueueRow): QueueItem {
    return {
      id: row.id,
      entity_type: row.entity_type as EntityType,
      entity_id: row.entity_id,
      operation: row.operation as OperationType,
      payload: row.payload as Record<string, any> | null,
      created_at: row.created_at,
      retry_count: row.retry_count || 0,
      last_error: row.last_error,
      status: row.status as QueueStatus,
    };
  }

  /**
   * Mark an item as successfully processed (remove from queue)
   */
  async markComplete(id: number): Promise<void> {
    await db.delete(syncQueue).where(eq(syncQueue.id, id));
  }

  /**
   * Mark an item as failed
   */
  async markFailed(id: number, error: string): Promise<void> {
    const items = await db
      .select()
      .from(syncQueue)
      .where(eq(syncQueue.id, id))
      .limit(1);

    if (items.length === 0) return;

    const item = items[0];
    const newRetryCount = (item.retry_count || 0) + 1;

    if (newRetryCount >= MAX_RETRIES) {
      // Max retries exceeded - mark as failed
      await db
        .update(syncQueue)
        .set({
          status: 'failed',
          retry_count: newRetryCount,
          last_error: error,
        })
        .where(eq(syncQueue.id, id));
    } else {
      // Retry later - set back to pending
      await db
        .update(syncQueue)
        .set({
          status: 'pending',
          retry_count: newRetryCount,
          last_error: error,
        })
        .where(eq(syncQueue.id, id));
    }
  }

  /**
   * Get an item by ID
   */
  async getById(id: number): Promise<QueueItem | null> {
    const items = await db
      .select()
      .from(syncQueue)
      .where(eq(syncQueue.id, id))
      .limit(1);

    return items[0] ? this.toQueueItem(items[0]) : null;
  }

  /**
   * Remove an item from the queue
   */
  async remove(id: number): Promise<void> {
    await db.delete(syncQueue).where(eq(syncQueue.id, id));
  }

  /**
   * Get count of pending items
   */
  async getPendingCount(): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(syncQueue)
      .where(eq(syncQueue.status, 'pending'));
    return result[0].count;
  }

  /**
   * Get count of failed items
   */
  async getFailedCount(): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(syncQueue)
      .where(eq(syncQueue.status, 'failed'));
    return result[0].count;
  }

  /**
   * Get all pending items
   */
  async getAllPending(): Promise<QueueItem[]> {
    const items = await db
      .select()
      .from(syncQueue)
      .where(eq(syncQueue.status, 'pending'))
      .orderBy(asc(syncQueue.created_at));

    return items.map(item => this.toQueueItem(item));
  }

  /**
   * Get all failed items
   */
  async getAllFailed(): Promise<QueueItem[]> {
    const items = await db
      .select()
      .from(syncQueue)
      .where(eq(syncQueue.status, 'failed'))
      .orderBy(asc(syncQueue.created_at));

    return items.map(item => this.toQueueItem(item));
  }

  /**
   * Retry failed items (reset status to pending)
   */
  async retryFailed(): Promise<number> {
    const failed = await this.getAllFailed();

    for (const item of failed) {
      await db
        .update(syncQueue)
        .set({
          status: 'pending',
          retry_count: 0,
          last_error: null,
        })
        .where(eq(syncQueue.id, item.id));
    }

    return failed.length;
  }

  /**
   * Clear all items from the queue
   */
  async clear(): Promise<void> {
    await db.delete(syncQueue);
  }

  /**
   * Reset processing items back to pending (for app restart)
   */
  async resetProcessing(): Promise<void> {
    await db
      .update(syncQueue)
      .set({ status: 'pending' })
      .where(eq(syncQueue.status, 'processing'));
  }
}

export const syncQueueService = new SyncQueue();
export default syncQueueService;
