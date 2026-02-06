// TypeScript interfaces for the Notes app

// Base interface for all actions - supports future versioning
export interface BaseAction {
  id: string;
  source?: 'ai' | 'user';  // Whether AI extracted or user created (optional for backwards compat)
  isNew?: boolean;         // Locally created, not yet saved to server
  isDeleted?: boolean;     // Soft delete for tracking changes
  isModified?: boolean;    // User has edited this action
}

export interface CalendarAction extends BaseAction {
  title: string;
  date: string;
  time?: string;
  location?: string;
  attendees?: string[];
  status: 'created' | 'pending' | 'confirmed';
}

export interface EmailAction extends BaseAction {
  to: string;
  subject: string;
  body?: string;
  preview?: string;
  status: 'draft' | 'sent' | 'scheduled';
  scheduledTime?: string;
}

export interface ReminderAction extends BaseAction {
  title: string;
  dueDate: string;
  dueTime?: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'completed';
}

export interface NextStepAction extends BaseAction {
  title: string;
  status: 'pending' | 'completed';
}

export interface NoteActions {
  calendar: CalendarAction[];
  email: EmailAction[];
  reminders: ReminderAction[];
  nextSteps: string[];  // Keep as string[] for backwards compatibility
}

// Editable action type union for the action bar
export type EditableAction = CalendarAction | EmailAction | ReminderAction | NextStepAction;

export interface Note {
  id: string;
  title: string;
  timestamp: string;
  transcript: string;
  duration: number; // in seconds
  actions: NoteActions;
  folderId: string;
  tags: string[];
  isPinned?: boolean;
  sync_status?: 'synced' | 'pending' | 'conflict' | 'error';
}

export interface Folder {
  id: string;
  name: string;
  icon: string; // SF Symbol name
  noteCount?: number; // Made optional for DBFolder compatibility
  color?: string;
  isSystem?: boolean; // For "All iCloud", "Notes", "Recently Deleted"
  sortOrder: number;
  parentId?: string | null;
  depth: number;
  children?: Folder[];
}

export interface NotesState {
  notes: Note[];
  folders: Folder[];
  selectedFolderId: string | null;
  selectedNoteId: string | null;
  isRecording: boolean;
  searchQuery: string;
}

export type ActionType = 'calendar' | 'email' | 'reminder';

export interface ActionBadgeData {
  type: ActionType;
  count: number;
}
