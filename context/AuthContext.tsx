/**
 * Authentication Context
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authService, User } from '@/services/auth';
import { notesService } from '@/services/notes';
import api from '@/services/api';
import { RateLimitStatus } from '@/utils/rateLimit';

// Navigation persistence key (must match useNavigationPersistence)
const NAVIGATION_STATE_KEY = 'glide_last_route';

// DEV MODE: Auto-login with test credentials for faster development
// This bypasses the login screen during development to speed up testing
//
// To enable: Set EXPO_PUBLIC_DEV_AUTO_LOGIN=true in .env.local
// To disable: Set EXPO_PUBLIC_DEV_AUTO_LOGIN=false or remove the variable
//
// IMPORTANT: Disable this to test the real authentication flow!
const DEV_AUTO_LOGIN = process.env.EXPO_PUBLIC_DEV_AUTO_LOGIN === 'true';
const DEV_TEST_EMAIL = process.env.EXPO_PUBLIC_DEV_TEST_EMAIL || 'devtest@glide.app';
const DEV_TEST_PASSWORD = process.env.EXPO_PUBLIC_DEV_TEST_PASSWORD || 'test123';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; rateLimitStatus?: RateLimitStatus }>;
  register: (email: string, password: string, fullName?: string) => Promise<{ success: boolean; error?: string }>;
  signInWithApple: () => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      // Ensure tokens are loaded from SecureStore before checking auth
      await api.ensureTokensLoaded();

      if (api.isAuthenticated()) {
        console.log('[AUTH] Found existing token, fetching user...');
        const { user: userData, error: userError } = await authService.getCurrentUser();
        if (userData) {
          setUser(userData);
          console.log('[AUTH] Restored session for:', userData.email);
          // Ensure default folders exist
          try {
            await notesService.setupDefaultFolders();
          } catch (e) {
            // Ignore - folders may already exist
          }
        } else {
          console.log('[AUTH] Token exists but failed to get user:', userError);
          // Token might be expired/invalid - clear it
          await api.clearTokens();
        }
      } else if (DEV_AUTO_LOGIN) {
        // DEV MODE: Auto-login with test credentials
        console.log('[DEV] No existing tokens, auto-logging in with test credentials...');
        console.log('[DEV] Attempting login for:', DEV_TEST_EMAIL);

        const result = await authService.login({
          email: DEV_TEST_EMAIL,
          password: DEV_TEST_PASSWORD
        });

        console.log('[DEV] Login result:', result.success ? 'SUCCESS' : 'FAILED');

        if (result.success) {
          const { user: userData, error: userError } = await authService.getCurrentUser();
          if (userData) {
            setUser(userData);
            console.log('[DEV] Auto-login successful, user:', userData.email);
            try {
              await notesService.setupDefaultFolders();
            } catch (e) {
              // Ignore - folders may already exist
            }
          } else {
            console.log('[DEV] Failed to get user after login:', userError);
          }
        } else {
          console.log('[DEV] Auto-login failed:', result.error);
          console.log('[DEV] Make sure test user exists: email=' + DEV_TEST_EMAIL);
        }
      } else {
        console.log('[AUTH] No tokens and DEV_AUTO_LOGIN is disabled');
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const setupUserDefaults = async () => {
    // Setup default folders for new users
    try {
      await notesService.setupDefaultFolders();
    } catch (error) {
      console.log('Default folders setup:', error);
    }
  };

  const login = async (email: string, password: string) => {
    const result = await authService.login({ email, password });
    if (result.success) {
      const { user: userData } = await authService.getCurrentUser();
      if (userData) setUser(userData);
      await setupUserDefaults();
    }
    return result;
  };

  const register = async (email: string, password: string, fullName?: string) => {
    const { error } = await authService.register({ email, password, full_name: fullName });
    if (error) return { success: false, error };
    return await login(email, password);
  };

  const logout = async () => {
    // Clear saved navigation state to prevent restoring authenticated routes
    try {
      await AsyncStorage.removeItem(NAVIGATION_STATE_KEY);
    } catch (error) {
      console.warn('Failed to clear navigation state on logout:', error);
    }
    await authService.logout();
    setUser(null);
  };

  const signInWithApple = async () => {
    const result = await authService.signInWithApple();
    if (result.success) {
      const { user: userData } = await authService.getCurrentUser();
      if (userData) setUser(userData);
      await setupUserDefaults();
    }
    return result;
  };

  const refreshUser = async () => {
    const { user: userData } = await authService.getCurrentUser();
    if (userData) setUser(userData);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, register, signInWithApple, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}

export default AuthContext;
