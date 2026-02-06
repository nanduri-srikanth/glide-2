/**
 * Rate Limiting Utility
 *
 * Provides client-side rate limiting for sensitive operations like login.
 * Uses AsyncStorage for persistence across app restarts.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'glide_ratelimit_failed_attempts';

export interface FailedAttempt {
  count: number;
  lastAttempt: string; // ISO timestamp
}

export interface RateLimitStatus {
  isLockedOut: boolean;
  remainingAttempts: number;
  lockoutRemainingSeconds: number;
  lockoutUntil?: string;
}

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_SECONDS = 300; // 5 minutes

/**
 * Load failed attempts from storage
 */
async function loadFailedAttempts(): Promise<Record<string, FailedAttempt>> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.error('[RateLimit] Failed to load attempts:', error);
    return {};
  }
}

/**
 * Save failed attempts to storage
 */
async function saveFailedAttempts(attempts: Record<string, FailedAttempt>): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(attempts));
  } catch (error) {
    console.error('[RateLimit] Failed to save attempts:', error);
  }
}

/**
 * Check if a user is currently locked out
 */
export async function checkRateLimit(email: string): Promise<RateLimitStatus> {
  const attempts = await loadFailedAttempts();
  const attempt = attempts[email.toLowerCase()];

  if (!attempt) {
    return {
      isLockedOut: false,
      remainingAttempts: MAX_ATTEMPTS,
      lockoutRemainingSeconds: 0,
    };
  }

  const lastAttemptTime = new Date(attempt.lastAttempt).getTime();
  const now = Date.now();
  const timeSinceLastAttempt = (now - lastAttemptTime) / 1000;

  // If lockout period has expired, clear the attempts
  if (attempt.count >= MAX_ATTEMPTS && timeSinceLastAttempt >= LOCKOUT_DURATION_SECONDS) {
    await clearAttempts(email);
    return {
      isLockedOut: false,
      remainingAttempts: MAX_ATTEMPTS,
      lockoutRemainingSeconds: 0,
    };
  }

  // Check if locked out
  if (attempt.count >= MAX_ATTEMPTS) {
    const remainingSeconds = Math.ceil(LOCKOUT_DURATION_SECONDS - timeSinceLastAttempt);
    const lockoutUntil = new Date(lastAttemptTime + LOCKOUT_DURATION_SECONDS * 1000).toISOString();
    return {
      isLockedOut: true,
      remainingAttempts: 0,
      lockoutRemainingSeconds: remainingSeconds,
      lockoutUntil,
    };
  }

  // Not locked out, show remaining attempts
  return {
    isLockedOut: false,
    remainingAttempts: MAX_ATTEMPTS - attempt.count,
    lockoutRemainingSeconds: 0,
  };
}

/**
 * Record a failed login attempt
 */
export async function recordFailedAttempt(email: string): Promise<RateLimitStatus> {
  const attempts = await loadFailedAttempts();
  const normalizedEmail = email.toLowerCase();

  const current = attempts[normalizedEmail] || { count: 0, lastAttempt: new Date().toISOString() };
  const updated: FailedAttempt = {
    count: current.count + 1,
    lastAttempt: new Date().toISOString(),
  };

  attempts[normalizedEmail] = updated;
  await saveFailedAttempts(attempts);

  return checkRateLimit(email);
}

/**
 * Clear failed attempts (called on successful login)
 */
export async function clearAttempts(email: string): Promise<void> {
  const attempts = await loadFailedAttempts();
  delete attempts[email.toLowerCase()];
  await saveFailedAttempts(attempts);
}

/**
 * Get lockout end time as Date object (if locked out)
 */
export async function getLockoutEndTime(email: string): Promise<Date | null> {
  const status = await checkRateLimit(email);
  if (status.isLockedOut && status.lockoutUntil) {
    return new Date(status.lockoutUntil);
  }
  return null;
}
