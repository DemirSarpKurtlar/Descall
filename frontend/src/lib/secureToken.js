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

/**
 * Decide what the memory cache should hold after a Keychain read.
 * keychain wins. A localStorage value with an empty Keychain is migrated.
 * clearLocal is true only when the Keychain already has the token.
 * writeKeychain is the value to store when migrating.
 */
export function planSecureTokenHydration({ keychainValue = null, localValue = null } = {}) {
  const keychain = typeof keychainValue === "string" && keychainValue ? keychainValue : null;
  const local = typeof localValue === "string" && localValue ? localValue : null;
  if (keychain) {
    return { memory: keychain, clearLocal: Boolean(local), writeKeychain: null };
  }
  if (local) {
    return { memory: local, clearLocal: false, writeKeychain: local };
  }
  return { memory: null, clearLocal: false, writeKeychain: null };
}
