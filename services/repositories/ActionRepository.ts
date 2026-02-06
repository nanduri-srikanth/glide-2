/**
 * Action Repository
 *
 * Provides CRUD operations for actions (calendar events, emails, reminders)
 * extracted from notes and stored in the local SQLite database.
 */

import { databaseManager } from '../database';
import {
  CalendarAction,
  EmailAction,
  ReminderAction,
  NextStepAction,
  EditableAction,
} from '../../data/types';

/**
 * Action type enum
 */
export enum ActionType {
  CALENDAR = 'calendar',
  EMAIL = 'email',
  REMINDER = 'reminder',
  NEXT_STEP = 'next_step',
}

/**
 * Action status enum
 */
export enum ActionStatus {
  PENDING = 'pending',
  CREATED = 'created',
  EXECUTED = 'executed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Action priority enum
 */
export enum ActionPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

/**
 * Action data model for database storage
 */
export interface DBAction {
  id: string;
  note_id: string;
  action_type: ActionType;
  status: ActionStatus;
  priority: ActionPriority;
  title: string;
  description?: string;
  details: Record<string, any>;
  scheduled_date?: string;
  scheduled_end_date?: string;
  location?: string;
  attendees: any[];
  email_to?: string;
  email_subject?: string;
  email_body?: string;
  external_id?: string;
  external_service?: string;
  external_url?: string;
  created_at: string;
  updated_at: string;
  executed_at?: string;
}

/**
 * Action creation input (without auto-generated fields)
 */
export type ActionInput = Omit<
  DBAction,
  'id' | 'created_at' | 'updated_at'
>;

/**
 * Action update input (all fields optional)
 */
export type ActionUpdate = Partial<Omit<ActionInput, 'id' | 'note_id'>>;

/**
 * Action query filters
 */
export interface ActionFilters {
  noteId?: string;
  actionType?: ActionType;
  status?: ActionStatus;
  priority?: ActionPriority;
  externalService?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'scheduled_date' | 'created_at' | 'priority';
  sortOrder?: 'ASC' | 'DESC';
}

/**
 * Action Repository Class
 *
 * Handles all database operations for actions including:
 * - CRUD operations for all action types
 * - Type-specific queries (calendar, email, reminder)
 * - Status tracking (pending, executed, failed)
 * - External service synchronization
 */
export class ActionRepository {
  private tableName = 'actions';

  /**
   * Create a new action
   */
  async create(input: ActionInput): Promise<DBAction> {
    const db = await databaseManager.getDatabase();

    const now = new Date().toISOString();
    const id = this.generateId();

    const action: DBAction = {
      ...input,
      id,
      created_at: now,
      updated_at: now,
    };

    await db.runAsync(
      `INSERT INTO ${this.tableName} (
        id, note_id, action_type, status, priority, title, description,
        details, scheduled_date, scheduled_end_date, location, attendees,
        email_to, email_subject, email_body, external_id, external_service,
        external_url, created_at, updated_at, executed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        action.id,
        action.note_id,
        action.action_type,
        action.status,
        action.priority,
        action.title,
        action.description || null,
        JSON.stringify(action.details),
        action.scheduled_date || null,
        action.scheduled_end_date || null,
        action.location || null,
        JSON.stringify(action.attendees),
        action.email_to || null,
        action.email_subject || null,
        action.email_body || null,
        action.external_id || null,
        action.external_service || null,
        action.external_url || null,
        action.created_at,
        action.updated_at,
        action.executed_at || null,
      ]
    );

    return action;
  }

  /**
   * Get an action by ID
   */
  async getById(id: string): Promise<DBAction | null> {
    const db = await databaseManager.getDatabase();

    const result = await db.getFirstAsync<any>(
      `SELECT * FROM ${this.tableName} WHERE id = ?`,
      [id]
    );

    return result ? this.mapFromDb(result) : null;
  }

  /**
   * Get all actions with optional filters
   */
  async getAll(filters: ActionFilters = {}): Promise<DBAction[]> {
    const db = await databaseManager.getDatabase();

    let query = `SELECT * FROM ${this.tableName} WHERE 1=1`;
    const params: any[] = [];

    // Apply filters
    if (filters.noteId) {
      query += ' AND note_id = ?';
      params.push(filters.noteId);
    }

    if (filters.actionType) {
      query += ' AND action_type = ?';
      params.push(filters.actionType);
    }

    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    if (filters.priority) {
      query += ' AND priority = ?';
      params.push(filters.priority);
    }

    if (filters.externalService) {
      query += ' AND external_service = ?';
      params.push(filters.externalService);
    }

    if (filters.startDate) {
      query += ' AND scheduled_date >= ?';
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      query += ' AND scheduled_date <= ?';
      params.push(filters.endDate);
    }

    // Sorting
    const sortBy = filters.sortBy || 'scheduled_date';
    const sortOrder = filters.sortOrder || 'ASC';
    query += ` ORDER BY ${sortBy} ${sortOrder}`;

    // Pagination
    if (filters.limit) {
      query += ` LIMIT ?`;
      params.push(filters.limit);

      if (filters.offset) {
        query += ` OFFSET ?`;
        params.push(filters.offset);
      }
    }

    const results = await db.getAllAsync<any>(query, params);
    return results.map(row => this.mapFromDb(row));
  }

  /**
   * Update an action
   */
  async update(id: string, updates: ActionUpdate): Promise<DBAction | null> {
    const db = await databaseManager.getDatabase();

    const existing = await this.getById(id);
    if (!existing) return null;

    const updated: DBAction = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    await db.runAsync(
      `UPDATE ${this.tableName} SET
        action_type = ?, status = ?, priority = ?, title = ?, description = ?,
        details = ?, scheduled_date = ?, scheduled_end_date = ?, location = ?,
        attendees = ?, email_to = ?, email_subject = ?, email_body = ?,
        external_id = ?, external_service = ?, external_url = ?,
        updated_at = ?, executed_at = ?
      WHERE id = ?`,
      [
        updated.action_type,
        updated.status,
        updated.priority,
        updated.title,
        updated.description || null,
        JSON.stringify(updated.details),
        updated.scheduled_date || null,
        updated.scheduled_end_date || null,
        updated.location || null,
        JSON.stringify(updated.attendees),
        updated.email_to || null,
        updated.email_subject || null,
        updated.email_body || null,
        updated.external_id || null,
        updated.external_service || null,
        updated.external_url || null,
        updated.updated_at,
        updated.executed_at || null,
        id,
      ]
    );

    return updated;
  }

  /**
   * Delete an action
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
   * Get actions by note ID
   */
  async getByNoteId(noteId: string): Promise<DBAction[]> {
    return this.getAll({ noteId });
  }

  /**
   * Get calendar actions
   */
  async getCalendarActions(filters: Omit<ActionFilters, 'actionType'> = {}): Promise<DBAction[]> {
    return this.getAll({ ...filters, actionType: ActionType.CALENDAR });
  }

  /**
   * Get email actions
   */
  async getEmailActions(filters: Omit<ActionFilters, 'actionType'> = {}): Promise<DBAction[]> {
    return this.getAll({ ...filters, actionType: ActionType.EMAIL });
  }

  /**
   * Get reminder actions
   */
  async getReminderActions(filters: Omit<ActionFilters, 'actionType'> = {}): Promise<DBAction[]> {
    return this.getAll({ ...filters, actionType: ActionType.REMINDER });
  }

  /**
   * Get pending actions
   */
  async getPendingActions(limit?: number): Promise<DBAction[]> {
    return this.getAll({
      status: ActionStatus.PENDING,
      sortBy: 'scheduled_date',
      sortOrder: 'ASC',
      limit,
    });
  }

  /**
   * Get upcoming actions (scheduled in the future)
   */
  async getUpcomingActions(limit = 10): Promise<DBAction[]> {
    const now = new Date().toISOString();
    const db = await databaseManager.getDatabase();

    const results = await db.getAllAsync<any>(
      `SELECT * FROM ${this.tableName}
       WHERE status = ? AND scheduled_date > ?
       ORDER BY scheduled_date ASC
       LIMIT ?`,
      [ActionStatus.PENDING, now, limit]
    );

    return results.map(row => this.mapFromDb(row));
  }

  /**
   * Get overdue actions
   */
  async getOverdueActions(): Promise<DBAction[]> {
    const now = new Date().toISOString();
    const db = await databaseManager.getDatabase();

    const results = await db.getAllAsync<any>(
      `SELECT * FROM ${this.tableName}
       WHERE status = ? AND scheduled_date < ?
       ORDER BY scheduled_date ASC`,
      [ActionStatus.PENDING, now]
    );

    return results.map(row => this.mapFromDb(row));
  }

  /**
   * Mark action as executed
   */
  async markAsExecuted(id: string, externalUrl?: string): Promise<DBAction | null> {
    return this.update(id, {
      status: ActionStatus.EXECUTED,
      executed_at: new Date().toISOString(),
      external_url: externalUrl,
    });
  }

  /**
   * Mark action as failed
   */
  async markAsFailed(id: string, errorMessage?: string): Promise<DBAction | null> {
    const updates: ActionUpdate = {
      status: ActionStatus.FAILED,
    };

    if (errorMessage) {
      updates.details = { error: errorMessage };
    }

    return this.update(id, updates);
  }

  /**
   * Cancel an action
   */
  async cancel(id: string): Promise<DBAction | null> {
    return this.update(id, { status: ActionStatus.CANCELLED });
  }

  /**
   * Count actions with optional filters
   */
  async count(filters: ActionFilters = {}): Promise<number> {
    const db = await databaseManager.getDatabase();

    let query = `SELECT COUNT(*) as count FROM ${this.tableName} WHERE 1=1`;
    const params: any[] = [];

    if (filters.noteId) {
      query += ' AND note_id = ?';
      params.push(filters.noteId);
    }

    if (filters.actionType) {
      query += ' AND action_type = ?';
      params.push(filters.actionType);
    }

    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    const result = await db.getFirstAsync<{ count: number }>(query, params);
    return result?.count || 0;
  }

  /**
   * Batch create actions
   */
  async createMany(inputs: ActionInput[]): Promise<DBAction[]> {
    return databaseManager.withTransaction(async () => {
      const actions: DBAction[] = [];
      for (const input of inputs) {
        const action = await this.create(input);
        actions.push(action);
      }
      return actions;
    });
  }

  /**
   * Batch delete actions
   */
  async deleteMany(ids: string[]): Promise<number> {
    return databaseManager.withTransaction(async () => {
      let deletedCount = 0;
      for (const id of ids) {
        const deleted = await this.delete(id);
        if (deleted) deletedCount++;
      }
      return deletedCount;
    });
  }

  /**
   * Convert DB action to type-specific action
   */
  toCalendarAction(action: DBAction): CalendarAction {
    const details = action.details || {};
    return {
      id: action.id,
      title: action.title,
      date: action.scheduled_date?.split('T')[0] || '',
      time: action.scheduled_date?.split('T')[1] || '',
      location: action.location,
      attendees: action.attendees || [],
      status: action.status as any,
      source: details.source,
      isNew: details.isNew,
      isDeleted: details.isDeleted,
      isModified: details.isModified,
    };
  }

  toEmailAction(action: DBAction): EmailAction {
    const details = action.details || {};
    return {
      id: action.id,
      to: action.email_to || '',
      subject: action.email_subject || '',
      body: action.email_body,
      preview: details.preview,
      status: action.status as any,
      scheduledTime: action.scheduled_date,
      source: details.source,
      isNew: details.isNew,
      isDeleted: details.isDeleted,
      isModified: details.isModified,
    };
  }

  toReminderAction(action: DBAction): ReminderAction {
    const details = action.details || {};
    return {
      id: action.id,
      title: action.title,
      dueDate: action.scheduled_date?.split('T')[0] || '',
      dueTime: action.scheduled_date?.split('T')[1] || '',
      priority: action.priority as any,
      status: action.status as any,
      source: details.source,
      isNew: details.isNew,
      isDeleted: details.isDeleted,
      isModified: details.isModified,
    };
  }

  toNextStepAction(action: DBAction): NextStepAction {
    const details = action.details || {};
    return {
      id: action.id,
      title: action.title,
      status: action.status as any,
      source: details.source,
      isNew: details.isNew,
      isDeleted: details.isDeleted,
      isModified: details.isModified,
    };
  }

  /**
   * Map database row to Action object
   */
  private mapFromDb(row: any): DBAction {
    return {
      id: row.id,
      note_id: row.note_id,
      action_type: row.action_type,
      status: row.status,
      priority: row.priority,
      title: row.title,
      description: row.description,
      details: row.details ? JSON.parse(row.details) : {},
      scheduled_date: row.scheduled_date,
      scheduled_end_date: row.scheduled_end_date,
      location: row.location,
      attendees: row.attendees ? JSON.parse(row.attendees) : [],
      email_to: row.email_to,
      email_subject: row.email_subject,
      email_body: row.email_body,
      external_id: row.external_id,
      external_service: row.external_service,
      external_url: row.external_url,
      created_at: row.created_at,
      updated_at: row.updated_at,
      executed_at: row.executed_at,
    };
  }

  /**
   * Generate a unique ID for a new action
   */
  private generateId(): string {
    return `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance
export const actionRepository = new ActionRepository();
