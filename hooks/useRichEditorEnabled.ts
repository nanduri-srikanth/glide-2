import { Platform } from 'react-native';

/**
 * Feature flag for the native iOS rich text editor.
 * Gated by platform (iOS only) and env var.
 */
export function useRichEditorEnabled(): boolean {
  if (Platform.OS !== 'ios') return false;
  // Enable in dev by default; in prod, check env var
  if (__DEV__) return true;
  return process.env.EXPO_PUBLIC_RICH_EDITOR_ENABLED === 'true';
}
