/**
 * Actions Service
 */

import api from './api';
import { ActionResponse } from './notes';

export interface ActionExecuteResponse {
  action_id: string;
  status: string;
  external_id: string | null;
  external_url: string | null;
  message: string;
}

export interface IntegrationStatus {
  google: { connected: boolean; services: string[]; expires: string | null };
  apple: { connected: boolean; services: string[] };
}

class ActionsService {
  async listActions(filters?: { note_id?: string; action_type?: string; status?: string; limit?: number }): Promise<{ data?: ActionResponse[]; error?: string }> {
    const params = new URLSearchParams();
    if (filters?.note_id) params.append('note_id', filters.note_id);
    if (filters?.action_type) params.append('action_type', filters.action_type);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.limit) params.append('limit', String(filters.limit));

    const queryString = params.toString();
    const response = await api.get<ActionResponse[]>(queryString ? `/actions?${queryString}` : '/actions');
    if (response.error) return { error: response.error.message };
    return { data: response.data };
  }

  async executeAction(actionId: string, service: 'google' | 'apple'): Promise<{ data?: ActionExecuteResponse; error?: string }> {
    const response = await api.post<ActionExecuteResponse>(`/actions/${actionId}/execute`, { service });
    if (response.error) return { error: response.error.message };
    return { data: response.data };
  }

  async completeAction(actionId: string): Promise<{ data?: ActionResponse; error?: string }> {
    const response = await api.post<ActionResponse>(`/actions/${actionId}/complete`);
    if (response.error) return { error: response.error.message };
    return { data: response.data };
  }

  async getIntegrationStatus(): Promise<{ data?: IntegrationStatus; error?: string }> {
    const response = await api.get<IntegrationStatus>('/integrations/status');
    if (response.error) return { error: response.error.message };
    return { data: response.data };
  }

  async connectGoogle(): Promise<{ auth_url?: string; error?: string }> {
    const response = await api.get<{ auth_url: string }>('/integrations/google/connect');
    if (response.error) return { error: response.error.message };
    return { auth_url: response.data?.auth_url };
  }

  async connectApple(username: string, appPassword: string): Promise<{ success: boolean; calendars?: string[]; error?: string }> {
    const response = await api.post<{ message: string; calendars: string[] }>('/integrations/apple/connect', { username, app_password: appPassword });
    if (response.error) return { success: false, error: response.error.message };
    return { success: true, calendars: response.data?.calendars };
  }
}

export const actionsService = new ActionsService();
export default actionsService;
