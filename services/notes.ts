/**
 * Notes Service - CRUD operations for notes and folders
 */

import api from './api';
import { Note, Folder, NoteActions } from '@/data/types';

export interface NoteListItem {
  id: string;
  title: string;
  preview: string;
  duration: number | null;
  folder_id: string | null;
  tags: string[];
  is_pinned: boolean;
  action_count: number;
  calendar_count: number;
  email_count: number;
  reminder_count: number;
  created_at: string;
  updated_at?: string;
}

export interface NoteListResponse {
  items: NoteListItem[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

export interface NoteDetailResponse {
  id: string;
  title: string;
  transcript: string;
  summary: string | null;
  duration: number | null;
  audio_url: string | null;
  folder_id: string | null;
  folder_name: string | null;
  tags: string[];
  is_pinned: boolean;
  is_archived: boolean;
  ai_processed: boolean;
  ai_metadata?: {
    input_history?: Array<{
      type: 'text' | 'audio';
      content: string;
      timestamp: string;
      duration?: number;
      audio_key?: string;
    }>;
    synthesized_at?: string;
    [key: string]: any;
  };
  actions: ActionResponse[];
  created_at: string;
  updated_at: string;
}

export interface ActionResponse {
  id: string;
  note_id: string;
  action_type: 'calendar' | 'email' | 'reminder' | 'next_step';
  status: 'pending' | 'created' | 'executed' | 'failed' | 'cancelled';
  priority: 'low' | 'medium' | 'high';
  title: string;
  description: string | null;
  scheduled_date: string | null;
  scheduled_end_date: string | null;
  location: string | null;
  attendees: string[];
  email_to: string | null;
  email_subject: string | null;
  email_body: string | null;
  external_id: string | null;
  external_service: string | null;
  external_url: string | null;
  created_at: string;
  executed_at: string | null;
}

export interface FolderResponse {
  id: string;
  name: string;
  icon: string;
  color: string | null;
  is_system: boolean;
  note_count: number;
  sort_order: number;
  parent_id: string | null;
  depth: number;
  children: FolderResponse[];
  created_at: string;
}

export interface FolderReorderItem {
  id: string;
  sort_order: number;
  parent_id: string | null;
}

export interface FolderBulkReorder {
  folders: FolderReorderItem[];
}

export interface NoteFilters {
  folder_id?: string;
  q?: string;
  tags?: string[];
  is_pinned?: boolean;
  is_archived?: boolean;
  page?: number;
  per_page?: number;
}

export interface UnifiedSearchResponse {
  folders: FolderResponse[];
  notes: NoteListItem[];
}

class NotesService {
  async listNotes(filters: NoteFilters = {}): Promise<{ data?: NoteListResponse; error?: string }> {
    const params = new URLSearchParams();
    if (filters.folder_id) params.append('folder_id', filters.folder_id);
    if (filters.q) params.append('q', filters.q);
    if (filters.tags) filters.tags.forEach(tag => params.append('tags', tag));
    if (filters.is_pinned !== undefined) params.append('is_pinned', String(filters.is_pinned));
    if (filters.is_archived !== undefined) params.append('is_archived', String(filters.is_archived));
    if (filters.page) params.append('page', String(filters.page));
    if (filters.per_page) params.append('per_page', String(filters.per_page));

    const queryString = params.toString();
    const endpoint = queryString ? `/notes?${queryString}` : '/notes';
    const response = await api.get<NoteListResponse>(endpoint);
    if (response.error) return { error: response.error.message };
    return { data: response.data };
  }

  async listAllNotes(page?: number, perPage?: number): Promise<{ data?: NoteListResponse; error?: string }> {
    const params = new URLSearchParams();
    if (page) params.append('page', String(page));
    if (perPage) params.append('per_page', String(perPage));
    const queryString = params.toString();
    const endpoint = queryString ? `/notes/all?${queryString}` : '/notes/all';
    const response = await api.get<NoteListResponse>(endpoint);
    if (response.error) return { error: response.error.message };
    return { data: response.data };
  }

  async getNote(noteId: string): Promise<{ data?: NoteDetailResponse; error?: string }> {
    const response = await api.get<NoteDetailResponse>(`/notes/${noteId}`);
    if (response.error) return { error: response.error.message };
    return { data: response.data };
  }

  async createNote(data: { title: string; transcript: string; folder_id?: string; tags?: string[]; client_id?: string }): Promise<{ data?: NoteDetailResponse; error?: string }> {
    const response = await api.post<NoteDetailResponse>('/notes', data);
    if (response.error) return { error: response.error.message };
    return { data: response.data };
  }

  async updateNote(noteId: string, data: { title?: string; transcript?: string; folder_id?: string; tags?: string[]; is_pinned?: boolean; is_archived?: boolean }): Promise<{ data?: NoteDetailResponse; error?: string }> {
    const response = await api.patch<NoteDetailResponse>(`/notes/${noteId}`, data);
    if (response.error) return { error: response.error.message };
    return { data: response.data };
  }

  async deleteNote(noteId: string, permanent: boolean = false): Promise<{ success: boolean; error?: string }> {
    const endpoint = permanent ? `/notes/${noteId}?permanent=true` : `/notes/${noteId}`;
    const response = await api.delete(endpoint);
    if (response.error) return { success: false, error: response.error.message };
    return { success: true };
  }

  async autoSortNote(noteId: string): Promise<{ data?: NoteDetailResponse; error?: string }> {
    const response = await api.post<NoteDetailResponse>(`/notes/${noteId}/auto-sort`);
    if (response.error) return { error: response.error.message };
    return { data: response.data };
  }

  async searchNotes(query: string, page: number = 1): Promise<{ data?: NoteListResponse; error?: string }> {
    const response = await api.get<NoteListResponse>(`/notes/search?q=${encodeURIComponent(query)}&page=${page}`);
    if (response.error) return { error: response.error.message };
    return { data: response.data };
  }

  async unifiedSearch(query: string): Promise<{ data?: UnifiedSearchResponse; error?: string }> {
    const response = await api.get<UnifiedSearchResponse>(`/notes/search/all?q=${encodeURIComponent(query)}`);
    if (response.error) return { error: response.error.message };
    return { data: response.data };
  }

  async listFolders(): Promise<{ data?: FolderResponse[]; error?: string }> {
    const response = await api.get<FolderResponse[]>('/folders');
    if (response.error) return { error: response.error.message };
    return { data: response.data };
  }

  async createFolder(data: { name: string; icon?: string; color?: string; client_id?: string; parent_id?: string | null }): Promise<{ data?: FolderResponse; error?: string }> {
    const response = await api.post<FolderResponse>('/folders', data);
    if (response.error) return { error: response.error.message };
    return { data: response.data };
  }

  async setupDefaultFolders(): Promise<{ success: boolean; error?: string }> {
    const response = await api.post('/folders/setup-defaults');
    if (response.error) return { success: false, error: response.error.message };
    return { success: true };
  }

  async deleteFolder(folderId: string): Promise<{ success: boolean; error?: string }> {
    const response = await api.delete(`/folders/${folderId}`);
    if (response.error) return { success: false, error: response.error.message };
    return { success: true };
  }

  async updateFolder(folderId: string, data: { name?: string; icon?: string; color?: string; parent_id?: string | null; sort_order?: number }): Promise<{ data?: FolderResponse; error?: string }> {
    const response = await api.patch<FolderResponse>(`/folders/${folderId}`, data);
    if (response.error) return { error: response.error.message };
    return { data: response.data };
  }

  convertToNote(apiNote: NoteDetailResponse): Note {
    return {
      id: apiNote.id,
      title: apiNote.title,
      timestamp: apiNote.created_at,
      transcript: apiNote.transcript,
      duration: apiNote.duration || 0,
      folderId: apiNote.folder_id || 'all-icloud',
      tags: apiNote.tags,
      actions: this.convertActions(apiNote.actions),
    };
  }

  private convertActions(actions: ActionResponse[]): NoteActions {
    return {
      calendar: actions.filter(a => a.action_type === 'calendar').map(a => ({
        id: a.id,
        title: a.title,
        date: a.scheduled_date || '',
        time: a.scheduled_date ? new Date(a.scheduled_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : undefined,
        location: a.location || undefined,
        attendees: a.attendees,
        status: a.status === 'executed' ? 'created' : 'pending' as const,
      })),
      email: actions.filter(a => a.action_type === 'email').map(a => ({
        id: a.id,
        to: a.email_to || '',
        subject: a.email_subject || '',
        preview: a.email_body?.slice(0, 100) || '',
        status: a.status === 'executed' ? 'sent' : 'draft' as const,
      })),
      reminders: actions.filter(a => a.action_type === 'reminder').map(a => ({
        id: a.id,
        title: a.title,
        dueDate: a.scheduled_date || '',
        dueTime: a.scheduled_date ? new Date(a.scheduled_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : undefined,
        priority: a.priority,
        status: a.status === 'executed' ? 'completed' : 'pending' as const,
      })),
      nextSteps: actions.filter(a => a.action_type === 'next_step').map(a => a.title),
    };
  }

  async reorderFolders(updates: FolderReorderItem[]): Promise<{ success: boolean; error?: string }> {
    const response = await api.post('/folders/reorder', { folders: updates });
    if (response.error) return { success: false, error: response.error.message };
    return { success: true };
  }

  convertToFolder(apiFolder: FolderResponse): Folder {
    return {
      id: apiFolder.id,
      name: apiFolder.name,
      icon: apiFolder.icon,
      noteCount: apiFolder.note_count,
      color: apiFolder.color || undefined,
      isSystem: apiFolder.is_system,
      sortOrder: apiFolder.sort_order,
      parentId: apiFolder.parent_id,
      depth: apiFolder.depth,
      children: apiFolder.children?.map(c => this.convertToFolder(c)),
    };
  }
}

export const notesService = new NotesService();
export default notesService;
