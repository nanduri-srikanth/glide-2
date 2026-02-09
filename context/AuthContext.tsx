/**
 * Authentication Context
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { notesService } from '@/services/notes';
import { supabase, setupSupabaseAutoRefresh } from '@/lib/supabase';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

// Navigation persistence key (must match useNavigationPersistence)
const NAVIGATION_STATE_KEY = 'glide_last_route';

WebBrowser.maybeCompleteAuthSession();

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

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

export interface AuthUser {
  id: string;
  email: string | null;
  full_name?: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, fullName?: string) => Promise<{ success: boolean; error?: string }>;
  signInWithProvider: (provider: 'apple' | 'google' | 'azure') => Promise<{ success: boolean; error?: string }>;
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  devLogin: () => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cleanup: (() => void) | null = null;
    checkAuth().then((autoRefreshCleanup) => {
      cleanup = autoRefreshCleanup ?? null;
    });
    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  const checkAuth = async (): Promise<(() => void) | null> => {
    const timeoutMs = __DEV__ ? 4000 : 8000;
    try {
      const { data } = await withTimeout(supabase.auth.getSession(), timeoutMs, 'supabase.auth.getSession');
      const sessionUser = data.session?.user ?? null;
      if (sessionUser) {
        setUser({
          id: sessionUser.id,
          email: sessionUser.email ?? null,
          full_name: sessionUser.user_metadata?.full_name ?? null,
        });
        // Don't block app startup on backend calls.
        setupUserDefaults().catch((err) => console.log('Default folders setup:', err));
      } else if (DEV_AUTO_LOGIN) {
        const result = await login(DEV_TEST_EMAIL, DEV_TEST_PASSWORD);
        if (!result.success) {
          console.log('[DEV] Auto-login failed:', result.error);
        }
      }

      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        const nextUser = session?.user
          ? {
            id: session.user.id,
            email: session.user.email ?? null,
            full_name: session.user.user_metadata?.full_name ?? null,
          }
          : null;
        setUser(nextUser);
      });

      const autoRefreshCleanup = setupSupabaseAutoRefresh();
      return () => {
        listener.subscription.unsubscribe();
        autoRefreshCleanup();
      };
    } catch (error) {
      console.error('Auth check failed:', error);
      return null;
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
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { success: false, error: error.message };
    setupUserDefaults().catch((err) => console.log('Default folders setup:', err));
    return { success: true };
  };

  const register = async (email: string, password: string, fullName?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) return { success: false, error: error.message };
    setupUserDefaults().catch((err) => console.log('Default folders setup:', err));
    return { success: true };
  };

  const logout = async () => {
    // Clear saved navigation state to prevent restoring authenticated routes
    try {
      await AsyncStorage.removeItem(NAVIGATION_STATE_KEY);
    } catch (error) {
      console.warn('Failed to clear navigation state on logout:', error);
    }
    await supabase.auth.signOut();
    setUser(null);
  };

  const signInWithProvider = async (provider: 'apple' | 'google' | 'azure') => {
    const redirectTo = AuthSession.makeRedirectUri({ scheme: 'glide', path: 'auth-callback' });
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });
    if (error) return { success: false, error: error.message };
    if (!data?.url) return { success: false, error: 'No auth URL returned' };

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success' || !result.url) {
      return { success: false, error: 'Sign-in cancelled' };
    }

    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(result.url);
    if (exchangeError) return { success: false, error: exchangeError.message };

    setupUserDefaults().catch((err) => console.log('Default folders setup:', err));
    return { success: true };
  };

  const resetPassword = async (email: string) => {
    const redirectTo = AuthSession.makeRedirectUri({ scheme: 'glide' });
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) return { success: false, error: error.message };
    return { success: true };
  };

  const refreshUser = async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error) return;
    if (data.user) {
      setUser({
        id: data.user.id,
        email: data.user.email ?? null,
        full_name: data.user.user_metadata?.full_name ?? null,
      });
    }
  };

  const devLogin = async () => {
    const email = DEV_TEST_EMAIL;
    const password = DEV_TEST_PASSWORD;
    if (!email || !password) {
      return { success: false, error: 'Missing dev credentials' };
    }
    return await login(email, password);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, register, signInWithProvider, resetPassword, devLogin, logout, refreshUser }}>
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
