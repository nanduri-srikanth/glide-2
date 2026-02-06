import { useEffect, useCallback, useRef, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import 'react-native-reanimated';

// TanStack Query for SWR caching
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { getQueryClient } from '@/lib/queryClient';
import { asyncStoragePersister } from '@/lib/persister';

// Database and sync
import { initializeDatabase, hydrateFromServer, isDatabaseInitialized, resetDatabase } from '@/lib/database';
import { syncEngine } from '@/lib/sync';

import { NotesColors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { NetworkProvider, useNetwork } from '@/context/NetworkContext';
import { NotesProvider } from '@/context/NotesContext';
import { SyncProvider } from '@/context/SyncContext';
import { useNavigationPersistence } from '@/hooks/useNavigationPersistence';

// Initialize query client
const queryClient = getQueryClient();

// Deep link URL parsing
const parseDeepLink = (url: string): { action: string; params: Record<string, string> } | null => {
  try {
    const parsed = Linking.parse(url);
    // Handle glide://record or glide://record?param=value
    if (parsed.path === 'record' || parsed.hostname === 'record') {
      return {
        action: 'record',
        params: (parsed.queryParams || {}) as Record<string, string>,
      };
    }
    return null;
  } catch {
    return null;
  }
};

// DEV MODE: Set to true to skip authentication for testing
const DEV_SKIP_AUTH = true;

export const unstable_settings = {
  anchor: '(tabs)',
};

const PurpleLightTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: NotesColors.primary,
    background: NotesColors.background,
    card: NotesColors.card,
    text: NotesColors.textPrimary,
    border: '#E0E0E0',
    notification: NotesColors.secondary,
  },
};

/**
 * Database Initializer - Initializes SQLite and hydrates data
 */
function DatabaseInitializer({ children }: { children: React.ReactNode }) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { isOnline } = useNetwork();
  const [dbState, setDbState] = useState<'initializing' | 'hydrating' | 'ready' | 'error'>('initializing');
  const [error, setError] = useState<string | null>(null);
  const initStarted = useRef(false);
  const retryCount = useRef(0);

  useEffect(() => {
    // Wait for auth to finish loading
    if (isAuthLoading) return;

    // Prevent multiple initializations
    if (initStarted.current) return;
    initStarted.current = true;

    const init = async () => {
      try {
        // 1. Initialize SQLite database
        console.log('[DatabaseInitializer] Initializing database...');
        await initializeDatabase();
        console.log('[DatabaseInitializer] Database initialized');

        // 2. If user is logged in and online, hydrate from server (non-blocking)
        if (user?.id && isOnline) {
          setDbState('hydrating');
          console.log('[DatabaseInitializer] Hydrating from server...');
          const hydrated = await hydrateFromServer(user.id);
          if (hydrated) {
            console.log('[DatabaseInitializer] Hydration complete');
          } else {
            console.log('[DatabaseInitializer] Hydration incomplete, will use API fallback');
          }

          // 3. Initialize sync engine regardless of hydration status
          await syncEngine.initialize(user.id);
        }

        setDbState('ready');
      } catch (err) {
        console.error('[DatabaseInitializer] Initialization failed:', err);
        const errorMessage = err instanceof Error ? err.message : 'Database initialization failed';

        // Only attempt reset for schema-related errors (corrupted state)
        const isSchemaError = errorMessage.includes('no such column') ||
                             errorMessage.includes('no such table') ||
                             errorMessage.includes('SQLITE_CORRUPT');

        if (isSchemaError && retryCount.current === 0) {
          retryCount.current = 1;
          console.log('[DatabaseInitializer] Schema error detected, attempting database reset...');
          try {
            await resetDatabase();
            console.log('[DatabaseInitializer] Database reset successful');
            setDbState('ready');
            return;
          } catch (resetErr) {
            console.error('[DatabaseInitializer] Reset also failed:', resetErr);
          }
        }

        setError(errorMessage);
        setDbState('error');
      }
    };

    init();
  }, [isAuthLoading, user?.id, isOnline]);

  // Re-initialize sync engine when user logs in
  useEffect(() => {
    if (dbState === 'ready' && user?.id && isDatabaseInitialized()) {
      syncEngine.initialize(user.id).catch(console.warn);

      // Hydrate if online
      if (isOnline) {
        hydrateFromServer(user.id).catch(console.warn);
      }
    }
  }, [user?.id, dbState, isOnline]);

  // Show loading while initializing
  if (dbState === 'initializing' || dbState === 'hydrating') {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={NotesColors.primary} />
        <Text style={styles.loadingText}>
          {dbState === 'hydrating' ? 'Syncing data...' : 'Loading...'}
        </Text>
      </View>
    );
  }

  // Show error if initialization failed (but allow retry)
  if (dbState === 'error') {
    console.warn('[DatabaseInitializer] Error state, continuing with API fallback:', error);
    // Continue anyway - hooks will fallback to API if database isn't ready
  }

  return <>{children}</>;
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const pendingDeepLink = useRef<string | null>(null);
  const hasHandledInitialLink = useRef(false);

  // Persist and restore navigation state (only when auth is ready)
  useNavigationPersistence(!isLoading);

  // Handle deep link navigation
  const handleDeepLink = useCallback((url: string) => {
    const parsed = parseDeepLink(url);
    if (parsed?.action === 'record') {
      // Navigate to recording screen with auto-start
      router.push({
        pathname: '/recording',
        params: { autoStart: 'true' },
      });
    }
  }, [router]);

  // Listen for deep links
  useEffect(() => {
    // Handle initial URL when app opens from deep link
    const handleInitialURL = async () => {
      if (hasHandledInitialLink.current) return;

      const initialURL = await Linking.getInitialURL();
      if (initialURL) {
        hasHandledInitialLink.current = true;
        if (isLoading) {
          // Store for later when auth is ready
          pendingDeepLink.current = initialURL;
        } else {
          handleDeepLink(initialURL);
        }
      }
    };

    handleInitialURL();

    // Listen for URL events while app is running
    const subscription = Linking.addEventListener('url', (event) => {
      if (isLoading) {
        pendingDeepLink.current = event.url;
      } else {
        handleDeepLink(event.url);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isLoading, handleDeepLink]);

  // Handle pending deep link after auth loads
  useEffect(() => {
    if (!isLoading && pendingDeepLink.current) {
      const url = pendingDeepLink.current;
      pendingDeepLink.current = null;
      // Small delay to ensure navigation is ready
      setTimeout(() => handleDeepLink(url), 100);
    }
  }, [isLoading, handleDeepLink]);

  useEffect(() => {
    // Skip auth redirect in dev mode (but still wait for loading)
    if (DEV_SKIP_AUTH) return;

    if (isLoading) return;

    const inAuthGroup = segments[0] === 'auth';

    if (!isAuthenticated && !inAuthGroup) {
      // Redirect to auth screen if not authenticated and not already there
      router.replace('/auth');
    } else if (isAuthenticated && inAuthGroup) {
      // Redirect to main app if authenticated and on auth screen
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isLoading, segments]);

  // Always show loading screen while auth is being checked
  // This ensures auto-login completes before showing the app
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={NotesColors.primary} />
      </View>
    );
  }

  return <>{children}</>;
}

function RootLayoutNav() {
  return (
    <ThemeProvider value={PurpleLightTheme}>
      <DatabaseInitializer>
        <SyncProvider>
          <AuthGuard>
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: NotesColors.background },
                headerTintColor: NotesColors.textPrimary,
                headerTitleStyle: { fontWeight: '600' },
                contentStyle: { backgroundColor: NotesColors.background },
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="notes" options={{ headerShown: false }} />
              <Stack.Screen name="recording" options={{ presentation: 'modal', headerShown: false }} />
              <Stack.Screen name="auth" options={{ headerShown: false }} />
            </Stack>
          </AuthGuard>
        </SyncProvider>
      </DatabaseInitializer>
      <StatusBar style="dark" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister: asyncStoragePersister }}
    >
      <NetworkProvider>
        <AuthProvider>
          <NotesProvider>
            <RootLayoutNav />
          </NotesProvider>
        </AuthProvider>
      </NetworkProvider>
    </PersistQueryClientProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: NotesColors.background,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: NotesColors.textSecondary,
  },
});
