/**
 * useNavigationPersistence - Persists and restores navigation state
 *
 * Saves the current route when app goes to background and restores it on launch.
 */

import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePathname, useRouter, useSegments } from 'expo-router';

const NAVIGATION_STATE_KEY = 'glide_last_route';

// Routes that should not be restored (modals, auth screens)
const NON_RESTORABLE_ROUTES = ['/recording', '/auth'];

// Routes that are always safe to restore to
const SAFE_ROUTES = ['/', '/(tabs)'];

export function useNavigationPersistence(isReady: boolean = true) {
  const pathname = usePathname();
  const segments = useSegments();
  const router = useRouter();
  const appState = useRef(AppState.currentState);
  const hasRestored = useRef(false);

  // Save current route to storage
  const saveRoute = useCallback(async (route: string) => {
    // Don't save non-restorable routes
    if (NON_RESTORABLE_ROUTES.some(r => route.startsWith(r))) {
      return;
    }

    try {
      await AsyncStorage.setItem(NAVIGATION_STATE_KEY, route);
    } catch (error) {
      console.warn('Failed to save navigation state:', error);
    }
  }, []);

  // Restore route from storage
  const restoreRoute = useCallback(async () => {
    if (hasRestored.current) return;
    hasRestored.current = true;

    try {
      const savedRoute = await AsyncStorage.getItem(NAVIGATION_STATE_KEY);

      // Don't restore routes to specific notes/details (they may not exist after DB change)
      if (savedRoute &&
          !NON_RESTORABLE_ROUTES.some(r => savedRoute.startsWith(r)) &&
          !savedRoute.includes('/detail/')) {
        // Small delay to ensure navigation is ready
        setTimeout(() => {
          router.replace(savedRoute as any);
        }, 100);
      }
    } catch (error) {
      console.warn('Failed to restore navigation state:', error);
    }
  }, [router]);

  // Clear saved route (useful for logout)
  const clearSavedRoute = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(NAVIGATION_STATE_KEY);
    } catch (error) {
      console.warn('Failed to clear navigation state:', error);
    }
  }, []);

  // Handle app state changes
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      // Save route when app goes to background or becomes inactive
      if (
        appState.current === 'active' &&
        (nextAppState === 'background' || nextAppState === 'inactive')
      ) {
        saveRoute(pathname);
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [pathname, saveRoute]);

  // Restore route on initial mount (when ready)
  useEffect(() => {
    if (isReady && !hasRestored.current) {
      restoreRoute();
    }
  }, [isReady, restoreRoute]);

  // Save route periodically while navigating (in case of crash)
  useEffect(() => {
    if (pathname && isReady) {
      saveRoute(pathname);
    }
  }, [pathname, isReady, saveRoute]);

  return {
    clearSavedRoute,
  };
}

export default useNavigationPersistence;
