/**
 * Authentication Service
 */

import api, { API_BASE_URL } from './api';
import * as AppleAuthentication from 'expo-apple-authentication';
import { checkRateLimit, recordFailedAttempt, clearAttempts, RateLimitStatus } from '@/utils/rateLimit';

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  is_verified: boolean;
  timezone: string;
  auto_transcribe: boolean;
  auto_create_actions: boolean;
  created_at: string;
  google_connected: boolean;
  apple_connected: boolean;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface RegisterData {
  email: string;
  password: string;
  full_name?: string;
}

export interface LoginData {
  email: string;
  password: string;
}

class AuthService {
  async register(data: RegisterData): Promise<{ user?: User; error?: string }> {
    const response = await api.post<User>('/auth/register', data);
    if (response.error) return { error: response.error.message };
    return { user: response.data };
  }

  async login(data: LoginData): Promise<{ success: boolean; error?: string; rateLimitStatus?: RateLimitStatus }> {
    // Check rate limit first
    const rateLimitStatus = await checkRateLimit(data.email);
    if (rateLimitStatus.isLockedOut) {
      const minutesLeft = Math.ceil(rateLimitStatus.lockoutRemainingSeconds / 60);
      return {
        success: false,
        error: `Too many failed attempts. Please try again in ${minutesLeft} minute${minutesLeft > 1 ? 's' : ''}.`,
        rateLimitStatus
      };
    }

    const formData = new URLSearchParams();
    formData.append('username', data.email);
    formData.append('password', data.password);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        // Handle standardized error format: { error: { message } }
        // Also support legacy FastAPI format: { detail: "message" }
        const errorMessage = errorData.error?.message || errorData.detail || 'Login failed';

        // Record failed attempt
        const newStatus = await recordFailedAttempt(data.email);

        if (newStatus.isLockedOut) {
          const minutesLeft = Math.ceil(newStatus.lockoutRemainingSeconds / 60);
          return {
            success: false,
            error: `Too many failed attempts. Please try again in ${minutesLeft} minute${minutesLeft > 1 ? 's' : ''}.`,
            rateLimitStatus: newStatus
          };
        }

        return {
          success: false,
          error: errorMessage,
          rateLimitStatus: newStatus
        };
      }

      const tokens: LoginResponse = await response.json();
      await api.saveTokens(tokens.access_token, tokens.refresh_token);

      // Clear failed attempts on successful login
      await clearAttempts(data.email);

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  }

  async logout(): Promise<void> {
    await api.post('/auth/logout').catch(() => {});
    await api.clearTokens();
  }

  async getCurrentUser(): Promise<{ user?: User; error?: string }> {
    const response = await api.get<User>('/auth/me');
    if (response.error) return { error: response.error.message };
    return { user: response.data };
  }

  async updateProfile(data: Partial<User>): Promise<{ user?: User; error?: string }> {
    const response = await api.patch<User>('/auth/me', data);
    if (response.error) return { error: response.error.message };
    return { user: response.data };
  }

  isAuthenticated(): boolean {
    return api.isAuthenticated();
  }

  async signInWithApple(): Promise<{ success: boolean; error?: string }> {
    try {
      // Check if Apple Sign-In is available
      const isAvailable = await AppleAuthentication.isAvailableAsync();
      if (!isAvailable) {
        return { success: false, error: 'Apple Sign-In is not available on this device' };
      }

      // Request Apple Sign-In
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      // Send to backend for verification and token exchange
      const response = await fetch(`${API_BASE_URL}/auth/apple`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identity_token: credential.identityToken,
          authorization_code: credential.authorizationCode,
          user_id: credential.user,
          email: credential.email,
          full_name: credential.fullName
            ? `${credential.fullName.givenName || ''} ${credential.fullName.familyName || ''}`.trim()
            : null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        // Handle standardized error format: { error: { message } }
        // Also support legacy FastAPI format: { detail: "message" }
        const errorMessage = errorData.error?.message || errorData.detail || 'Apple Sign-In failed';
        return { success: false, error: errorMessage };
      }

      const tokens: LoginResponse = await response.json();
      await api.saveTokens(tokens.access_token, tokens.refresh_token);
      return { success: true };
    } catch (error: any) {
      if (error.code === 'ERR_REQUEST_CANCELED') {
        return { success: false, error: 'Sign-In was cancelled' };
      }
      return { success: false, error: error.message || 'Apple Sign-In failed' };
    }
  }
}

export const authService = new AuthService();
export default authService;
