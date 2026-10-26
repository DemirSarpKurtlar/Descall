/**
 * iOS session token plan. getToken() stays synchronous: main.jsx awaits
 * hydrateSecureToken() before the first getToken() and before render, which
 * fills an in-memory copy from the Keychain (or migrates the localStorage
 * copy once). Web, Android, and Electron never take this path.
 */

export const SECURE_TOKEN_KEY = "descall_token";

/** Native iOS app only. Uses the bridge global so this file does not import Capacitor. */
export function isIosKeychainShell(win) {
  const w = win !== undefined ? win : typeof window !== "undefined" ? window : null;
  try {
    const cap = w && w.Capacitor;
    if (!cap || typeof cap.isNativePlatform !== "function" || !cap.isNativePlatform()) return false;
    return typeof cap.getPlatform === "function" && cap.getPlatform() === "ios";
  } catch {
    return false;
  }
}

/** Set on sign-out so a Keychain copy is never resurrected after logout. */
export const SIGNED_OUT_KEY = "descall_token_signed_out";

/**
 * Decide what the memory cache should hold after a Keychain read.
 *
 * 2.13.12 migration release: localStorage stays the source of truth and is
 * never cleared here (kept as a fallback for one release). Every write goes to
 * localStorage first, so when both exist and differ, localStorage is newer.
 *
 * - local present: memory = local; copy it to the Keychain if the Keychain
 *   does not already hold the same value.
 * - local empty, Keychain present: restore it (WebKit storage eviction), unless
 *   the user signed out, in which case the stale Keychain copy is removed.
 * - neither: no session.
 */
export function planSecureTokenHydration({ keychainValue = null, localValue = null, signedOut = false } = {}) {
  const keychain = typeof keychainValue === "string" && keychainValue ? keychainValue : null;
  const local = typeof localValue === "string" && localValue ? localValue : null;
  if (local) {
    return { memory: local, writeKeychain: keychain === local ? null : local, restoreLocal: null, removeKeychain: false };
  }
  if (keychain && !signedOut) {
    return { memory: keychain, writeKeychain: null, restoreLocal: keychain, removeKeychain: false };
  }
  return { memory: null, writeKeychain: null, restoreLocal: null, removeKeychain: Boolean(keychain) };
}
