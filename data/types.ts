// Shared domain types for the React Native app.
// Kept intentionally UI-focused (not 1:1 with backend/DB schemas).

export type ActionType = 'calendar' | 'email' | 'reminder';

export type ActionSource = 'ai' | 'user';

export interface BaseEditableAction {
  id: string;
  source?: ActionSource;
  // Local-only editing state
  isNew?: boolean;
  isModified?: boolean;
  isDeleted?: boolean;
}

export interface CalendarAction extends BaseEditableAction {
  title: string;
  date: string; // YYYY-MM-DD (or ISO date string in older data)
  time?: string; // localized time string
  location?: string;
  attendees?: string[];
  status: 'pending' | 'confirmed' | 'created';
}

export interface EmailAction extends BaseEditableAction {
  to: string;
  subject: string;
  body?: string;
  preview?: string;
  scheduledTime?: string;
  status: 'draft' | 'sent' | 'scheduled';
}

export interface ReminderAction extends BaseEditableAction {
  title: string;
  dueDate: string; // YYYY-MM-DD
  dueTime?: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'completed';
}

export interface NextStepAction extends BaseEditableAction {
  title: string;
  status: 'pending' | 'completed';
}

export type EditableAction = CalendarAction | EmailAction | ReminderAction | NextStepAction;

export interface NoteActions {
  calendar: CalendarAction[];
  email: EmailAction[];
  reminders: ReminderAction[];
  nextSteps: string[];
}

export type NoteSyncStatus = 'synced' | 'pending' | 'conflict' | 'error';

export interface Note {
  id: string;
  title: string;
  timestamp: string; // ISO string
  transcript: string;
  duration: number; // seconds
  actions: NoteActions;
  folderId?: string;
  tags: string[];
  isPinned?: boolean;

  // Offline-first UI needs these for status badges and edge cases.
  sync_status?: NoteSyncStatus;
  ai_processed?: boolean;
}

export interface Folder {
  id: string;
  name: string;
  icon: string;
  noteCount?: number;
  color?: string;
  isSystem: boolean;
  sortOrder: number;
  parentId?: string | null;
  depth: number;
  children?: Folder[];
}

