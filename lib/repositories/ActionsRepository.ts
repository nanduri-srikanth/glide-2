import { eq, and } from 'drizzle-orm';
import { db } from '../database/client';
import { actions, type ActionRow, type ActionInsert, type SyncStatus } from '../database/schema';
import { BaseRepository } from './BaseRepository';
import type { ActionResponse } from '@/services/notes';

export interface LocalActionResponse extends ActionResponse {
  // API types make this optional; locally we always have a value.
  sync_status: SyncStatus;
}

export interface CreateActionInput {
  id: string;
  note_id: string;
  action_type: string;
  status: string;
  priority?: string;
  title: string;
  description?: string;
  scheduled_date?: string;
}

export interface UpdateActionInput {
  status?: string;
  priority?: string;
  title?: string;
  description?: string;
  scheduled_date?: string;
}

class ActionsRepository extends BaseRepository<ActionRow, ActionInsert, typeof actions> {
  protected table = actions;
  protected tableName = 'actions';

  /**
   * List all actions for a note
   */
  async listForNote(noteId: string): Promise<LocalActionResponse[]> {
    const actionRows = await db
      .select()
      .from(actions)
      .where(eq(actions.note_id, noteId));

    return actionRows.map(a => this.toResponse(a));
  }

  /**
   * Convert action row to response format
   */
  private toResponse(action: ActionRow): LocalActionResponse {
    return {
      id: action.id,
      note_id: action.note_id,
      action_type: action.action_type as ActionResponse['action_type'],
      status: action.status as ActionResponse['status'],
      priority: action.priority as ActionResponse['priority'],
      title: action.title,
      description: action.description,
      scheduled_date: action.scheduled_date,
      scheduled_end_date: null,
      location: null,
      attendees: [],
      email_to: null,
      email_subject: null,
      email_body: null,
      external_id: null,
      external_service: null,
      external_url: null,
      created_at: action.created_at,
      executed_at: null,
      sync_status: action.sync_status ?? 'synced',
    };
  }

  /**
   * Create a new action
   */
  async create(input: CreateActionInput): Promise<string> {
    const now = new Date().toISOString();

    await db.insert(actions).values({
      id: input.id,
      note_id: input.note_id,
      action_type: input.action_type,
      status: input.status,
      priority: input.priority || null,
      title: input.title,
      description: input.description || null,
      scheduled_date: input.scheduled_date || null,
      created_at: now,
      updated_at: now,
      sync_status: 'pending',
    });

    return input.id;
  }

  /**
   * Update an action
   */
  async update(id: string, input: UpdateActionInput): Promise<void> {
    await db
      .update(actions)
      .set({
        ...input,
        sync_status: 'pending',
      })
      .where(eq(actions.id, id));
  }

  /**
   * Delete an action
   */
  async delete(id: string): Promise<void> {
    await db.delete(actions).where(eq(actions.id, id));
  }

  /**
   * Delete all actions for a note
   */
  async deleteForNote(noteId: string): Promise<void> {
    await db.delete(actions).where(eq(actions.note_id, noteId));
  }

  /**
   * Upsert action from server data
   */
  async upsertFromServer(serverAction: ActionResponse): Promise<void> {
    const existing = await this.getById(serverAction.id);

    const actionData: ActionInsert = {
      id: serverAction.id,
      note_id: serverAction.note_id,
      action_type: serverAction.action_type,
      status: serverAction.status,
      priority: serverAction.priority,
      title: serverAction.title,
      description: serverAction.description,
      scheduled_date: serverAction.scheduled_date,
      created_at: serverAction.created_at,
      // Server payload doesn't include updated_at; use created_at as best-effort.
      updated_at: serverAction.created_at,
      sync_status: 'synced',
    };

    if (existing) {
      // Check for conflict
      if (existing.sync_status === 'pending') {
        await this.markConflict(serverAction.id);
        return;
      }

      await db
        .update(actions)
        .set(actionData)
        .where(eq(actions.id, serverAction.id));
    } else {
      await db.insert(actions).values(actionData);
    }
  }

  /**
   * Bulk upsert actions from server
   */
  async bulkUpsert(serverActions: ActionResponse[]): Promise<void> {
    for (const action of serverActions) {
      await this.upsertFromServer(action);
    }
  }
}

export const actionsRepository = new ActionsRepository();
export default actionsRepository;
