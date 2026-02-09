import type { Note } from './types';

// NOTE: Despite the filename, this is only used as an unauthenticated fallback.
// Authenticated flows should use the API + NotesContext.

export const mockNotes: Note[] = [
  {
    id: 'mock-1',
    title: 'Welcome to Glide',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    transcript: 'Tap into a note to edit it. When you sign in, your notes will sync.',
    duration: 51,
    folderId: 'all-icloud',
    tags: ['getting-started'],
    isPinned: false,
    actions: { calendar: [], email: [], reminders: [], nextSteps: [] },
  },
];

export function getNotesByFolder(folderId: string): Note[] {
  if (!folderId) return mockNotes;
  return mockNotes.filter(n => (n.folderId || 'all-icloud') === folderId);
}

export function getNoteById(noteId: string): Note | undefined {
  return mockNotes.find(n => n.id === noteId);
}

export function formatDuration(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.floor(seconds ?? 0));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';

  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 60) return 'Just now';

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

