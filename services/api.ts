/**
 * API Service - Core HTTP client for backend communication
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { getSupabaseAccessToken } from '@/lib/supabase';

// API Configuration - automatically detects the correct host
const getDevHost = () => {
  // Expo Go provides the dev server address which has the correct IP
  const expoHost = Constants.expoGoConfig?.debuggerHost ?? Constants.manifest2?.extra?.expoGo?.debuggerHost;
  if (expoHost) {
    // debuggerHost is "192.168.x.x:8081" - extract just the IP
    return expoHost.split(':')[0];
  }
  // Fallback for simulators/emulators
  if (Platform.OS === 'android') {
    return '10.0.2.2'; // Android emulator localhost alias
  }
  return 'localhost'; // iOS Simulator
};

// Environment-based API configuration
// EXPO_PUBLIC_API_PORT: Port number for the API server (default: 8000)
// EXPO_PUBLIC_API_URL: Full URL for production override (optional)
const API_PORT = process.env.EXPO_PUBLIC_API_PORT || '8000';
const PRODUCTION_API_URL = process.env.EXPO_PUBLIC_API_URL;

export const API_BASE_URL = __DEV__
  ? `http://${getDevHost()}:${API_PORT}/api/v1`  // Development (Glide backend)
  : PRODUCTION_API_URL || 'https://your-production-api.com/api/v1';  // Production

// Debug: Log the API URL on startup
console.log('[API] Base URL:', API_BASE_URL);

// Types
export interface ApiError {
  status: number;
  message: string;
  detail?: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: ApiError;
}

class ApiService {
  async ensureTokensLoaded(): Promise<void> {
    // Supabase SDK manages session persistence; nothing to load here.
    return;
  }

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers: HeadersInit = { ...options.headers };

    const accessToken = await getSupabaseAccessToken();
    if (accessToken) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${accessToken}`;
    }

    if (options.body && typeof options.body === 'string') {
      (headers as Record<string, string>)['Content-Type'] = 'application/json';
    }

    try {
      const response = await fetch(url, { ...options, headers });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        // Handle standardized error format: { error: { code, message, param, details } }
        // Also support legacy FastAPI format: { detail: "message" } or { detail: [{ msg, ... }] }
        let message = response.statusText;

        // Check for new standardized format first
        if (errorData.error?.message) {
          message = errorData.error.message;
        }
        // Fall back to legacy FastAPI format (detail field)
        else if (typeof errorData.detail === 'string') {
          message = errorData.detail;
        } else if (Array.isArray(errorData.detail) && errorData.detail.length > 0) {
          // Pydantic validation errors - extract first error message
          const firstError = errorData.detail[0];
          message = firstError.msg || firstError.message || 'Validation error';
        } else if (errorData.message) {
          message = errorData.message;
        }

        return {
          error: {
            status: response.status,
            message,
            detail: typeof errorData.detail === 'string' ? errorData.detail : JSON.stringify(errorData.detail),
          },
        };
      }

      const text = await response.text();
      if (!text) return { data: undefined };

      const data = JSON.parse(text) as T;
      return { data };
    } catch (error) {
      return {
        error: {
          status: 0,
          message: error instanceof Error ? error.message : 'Network error',
        },
      };
    }
  }

  get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  post<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async postFormData<T>(endpoint: string, formData: FormData): Promise<ApiResponse<T>> {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers: Record<string, string> = {};
    const accessToken = await getSupabaseAccessToken();
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

    try {
      const response = await fetch(url, { method: 'POST', headers, body: formData });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        // Handle standardized error format: { error: { message } }
        // Also support legacy FastAPI format: { detail: "message" } or { detail: [{ msg, ... }] }
        let message = response.statusText;

        // Check for new standardized format first
        if (errorData.error?.message) {
          message = errorData.error.message;
        }
        // Fall back to legacy FastAPI format (detail field)
        else if (typeof errorData.detail === 'string') {
          message = errorData.detail;
        } else if (Array.isArray(errorData.detail) && errorData.detail.length > 0) {
          // Pydantic validation errors - extract first error message
          const firstError = errorData.detail[0];
          message = firstError.msg || firstError.message || 'Validation error';
        } else if (errorData.message) {
          message = errorData.message;
        }

        return {
          error: { status: response.status, message },
        };
      }

      const data = await response.json() as T;
      return { data };
    } catch (error) {
      return {
        error: { status: 0, message: error instanceof Error ? error.message : 'Network error' },
      };
    }
  }

  patch<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export const api = new ApiService();
export default api;
