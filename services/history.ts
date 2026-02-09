/**
 * History Service - Inputs, versions, synthesize, and restore for notes
 */

import api from './api';

export interface NoteInputResponse {
  id: string;
  note_id: string;
  created_at: string;
  type: 'audio' | 'text' | 'import';
  source: 'user' | 'ai';
  text_plain: string | null;
  audio_url: string | null;
  meta: Record<string, any> | null;
}

export interface NoteVersionResponse {
  id: string;
  note_id: string;
  created_at: string;
  kind: 'manual' | 'synth' | 'metadata';
  actor: 'user' | 'ai';
  title: string | null;
  body_plain: string | null;
  body_rtf_base64: string | null;
  summary_plain: string | null;
  actions_json: any[] | null;
  what_removed: string | null;
  parent_version_id: string | null;
}

export interface SynthesizeRequest {
  input_ids?: string[];  // Optional: specific input IDs to include; if omitted, use all
}

export interface SynthesizeResponse {
  version: NoteVersionResponse;
  diff: {
    added: string[];
    removed: string[];
  };
}

export interface RestoreResponse {
  version: NoteVersionResponse;  // The newly created version after restore
}

class HistoryService {
  async getInputs(noteId: string): Promise<{ data?: NoteInputResponse[]; error?: string }> {
    const response = await api.get<NoteInputResponse[]>(`/notes/${noteId}/inputs`);
    if (response.error) return { error: response.error.message };
    return { data: response.data };
  }

  async createInput(noteId: string, input: { type: string; source?: string; text_plain?: string; audio_url?: string; meta?: Record<string, any> }): Promise<{ data?: NoteInputResponse; error?: string }> {
    const response = await api.post<NoteInputResponse>(`/notes/${noteId}/inputs`, input);
    if (response.error) return { error: response.error.message };
    return { data: response.data };
  }

  async getVersions(noteId: string): Promise<{ data?: NoteVersionResponse[]; error?: string }> {
    const response = await api.get<NoteVersionResponse[]>(`/notes/${noteId}/versions`);
    if (response.error) return { error: response.error.message };
    return { data: response.data };
  }

  async getVersion(noteId: string, versionId: string): Promise<{ data?: NoteVersionResponse; error?: string }> {
    const response = await api.get<NoteVersionResponse>(`/notes/${noteId}/versions/${versionId}`);
    if (response.error) return { error: response.error.message };
    return { data: response.data };
  }

  async synthesize(noteId: string, request?: SynthesizeRequest): Promise<{ data?: SynthesizeResponse; error?: string }> {
    const response = await api.post<SynthesizeResponse>(`/notes/${noteId}/synthesize`, request);
    if (response.error) return { error: response.error.message };
    return { data: response.data };
  }

  async restore(noteId: string, versionId: string): Promise<{ data?: RestoreResponse; error?: string }> {
    const response = await api.post<RestoreResponse>(`/notes/${noteId}/restore/${versionId}`);
    if (response.error) return { error: response.error.message };
    return { data: response.data };
  }
}

export const historyService = new HistoryService();
export default historyService;
