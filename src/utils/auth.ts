/**
 * auth.ts
 * Secure PIN authentication for Wealth OS — React Native.
 *
 * Security fix vs web version:
 *   OLD — verifyPin() compared plaintext input to plaintext storage.
 *         If setPin() had ever been called (which hashes), verification
 *         would silently fail because it compared "1234" to the hash.
 *
 *   NEW — Both setPin() and verifyPin() use SHA-256 exclusively.
 *         The stored value is ALWAYS a hex digest; plaintext never
 *         leaves the function boundary.
 *
 * Dependency: expo-crypto (Expo SDK ≥ 47)
 *   npm install expo-crypto
 *
 * For bare React Native (no Expo) replace hashPin() with:
 *   import CryptoJS from 'crypto-js';
 *   const hashPin = (pin: string) =>
 *     Promise.resolve(CryptoJS.SHA256(pin).toString(CryptoJS.enc.Hex));
 */

import * as ExpoC from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Storage keys ──────────────────────────────────────────────────────────────

const PIN_HASH_KEY = 'wos_pin_hash';
const AUTH_FLAG_KEY = 'wos_authenticated';

// ─── Hashing ──────────────────────────────────────────────────────────────────

/**
 * Returns the SHA-256 hex digest of a PIN string.
 * Always async so callers can swap crypto implementations without refactoring.
 */
export const hashPin = async (pin: string): Promise<string> => {
  return ExpoC.digestStringAsync(
    ExpoC.CryptoDigestAlgorithm.SHA256,
    pin,
    { encoding: ExpoC.CryptoEncoding.HEX },
  );
};

// ─── PIN Storage ──────────────────────────────────────────────────────────────

/**
 * Hashes and persists a new PIN.
 * Call this on first launch or when the user changes their PIN.
 */
export const setPin = async (pin: string): Promise<void> => {
  if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    throw new Error('PIN must be exactly 4 digits.');
  }
  const hash = await hashPin(pin);
  await AsyncStorage.setItem(PIN_HASH_KEY, hash);
};

/**
 * Returns true if a PIN hash has been stored (i.e. user has set a PIN).
 */
export const hasPinSet = async (): Promise<boolean> => {
  const stored = await AsyncStorage.getItem(PIN_HASH_KEY);
  return stored !== null;
};

// ─── PIN Verification ─────────────────────────────────────────────────────────

/**
 * Hashes the input and compares it to the stored hash.
 *
 * BOTH sides are always hashed — this fixes the bug in the web version
 * where verifyPin() compared plaintext to a stored hash (or fallback
 * plaintext "1234"), making them mutually incompatible.
 *
 * Returns true if the PIN is correct, false otherwise.
 */
export const verifyPin = async (inputPin: string): Promise<boolean> => {
  const storedHash = await AsyncStorage.getItem(PIN_HASH_KEY);

  // No PIN set yet — first-run scenario, require setup first.
  if (!storedHash) return false;

  const inputHash = await hashPin(inputPin);

  // Constant-time comparison to prevent timing attacks.
  return timingSafeEqual(inputHash, storedHash);
};

/**
 * Constant-time string comparison so an attacker cannot measure how many
 * characters matched by timing the response.
 */
const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
};

// ─── Session Management ────────────────────────────────────────────────────────

const SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/** Marks the current session as authenticated with an expiry timestamp. */
export const setAuthenticated = async (): Promise<void> => {
  const expiry = (Date.now() + SESSION_TIMEOUT_MS).toString();
  await AsyncStorage.setItem(AUTH_FLAG_KEY, expiry);
};

/** Returns true if a valid, non-expired session exists. */
export const isAuthenticated = async (): Promise<boolean> => {
  const expiry = await AsyncStorage.getItem(AUTH_FLAG_KEY);
  if (!expiry) return false;
  return Date.now() < parseInt(expiry, 10);
};

/** Clears the session (logout / lock). */
export const clearSession = async (): Promise<void> => {
  await AsyncStorage.removeItem(AUTH_FLAG_KEY);
};

/** Extends the session expiry (call on user activity). */
export const refreshSession = async (): Promise<void> => {
  const isValid = await isAuthenticated();
  if (isValid) {
    await setAuthenticated();
  }
};

// ─── PIN Change ───────────────────────────────────────────────────────────────

/**
 * Validates the old PIN before setting a new one.
 * Returns false if the current PIN is wrong.
 */
export const changePin = async (
  currentPin: string,
  newPin: string,
): Promise<boolean> => {
  const valid = await verifyPin(currentPin);
  if (!valid) return false;
  await setPin(newPin);
  return true;
};
