/**
 * useAuth.ts
 * React hook for PIN authentication state in Wealth OS.
 *
 * Handles:
 *  - First-run PIN setup
 *  - PIN verification (SHA-256, both sides)
 *  - Session validity checks
 *  - Activity-based session refresh
 *  - Logout / lock
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  verifyPin,
  setPin,
  hasPinSet,
  setAuthenticated,
  isAuthenticated,
  clearSession,
  refreshSession,
} from '../utils/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuthStatus =
  | 'loading'      // checking AsyncStorage on mount
  | 'setup'        // no PIN set yet — first run
  | 'locked'       // PIN set but session expired / app locked
  | 'unlocked';    // valid session

export interface UseAuthReturn {
  status: AuthStatus;
  /** Attempt to verify a PIN. Returns true on success. */
  unlock: (pin: string) => Promise<boolean>;
  /** Set a new PIN (first-run or change). */
  setupPin: (pin: string) => Promise<void>;
  /** Lock the app immediately. */
  lock: () => Promise<void>;
  /** Call this on user interaction to keep the session alive. */
  onActivity: () => void;
  /** Non-null when the last unlock attempt failed. */
  errorMessage: string | null;
  /** True while an async auth operation is in progress. */
  loading: boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useAuth = (): UseAuthReturn => {
  const [status, setStatus]           = useState<AuthStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading]         = useState(false);
  const appStateRef                   = useRef(AppState.currentState);

  // ── Bootstrap: check stored session on mount ──────────────────────────────
  useEffect(() => {
    (async () => {
      const pinExists = await hasPinSet();
      if (!pinExists) {
        setStatus('setup');
        return;
      }
      const sessionValid = await isAuthenticated();
      setStatus(sessionValid ? 'unlocked' : 'locked');
    })();
  }, []);

  // ── Lock when app goes to background ─────────────────────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;

      // Moving to background/inactive
      if (prev === 'active' && next !== 'active') {
        await clearSession();
        setStatus('locked');
      }
    });

    return () => sub.remove();
  }, []);

  // ── Unlock ────────────────────────────────────────────────────────────────
  const unlock = useCallback(async (pin: string): Promise<boolean> => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const correct = await verifyPin(pin);
      if (correct) {
        await setAuthenticated();
        setStatus('unlocked');
        return true;
      } else {
        setErrorMessage('Incorrect PIN. Try again.');
        return false;
      }
    } catch {
      setErrorMessage('Authentication error. Please try again.');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Setup (first-run) ─────────────────────────────────────────────────────
  const setupPin = useCallback(async (pin: string): Promise<void> => {
    setLoading(true);
    try {
      await setPin(pin);
      await setAuthenticated();
      setStatus('unlocked');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Lock ──────────────────────────────────────────────────────────────────
  const lock = useCallback(async (): Promise<void> => {
    await clearSession();
    setStatus('locked');
    setErrorMessage(null);
  }, []);

  // ── Activity refresh ──────────────────────────────────────────────────────
  const onActivity = useCallback(() => {
    if (status === 'unlocked') {
      refreshSession(); // fire-and-forget
    }
  }, [status]);

  return { status, unlock, setupPin, lock, onActivity, errorMessage, loading };
};
