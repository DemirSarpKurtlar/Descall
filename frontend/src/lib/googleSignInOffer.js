/**
 * Google Identity Services only runs on an http(s) origin that is registered
 * in the Google client. The packaged Electron app is descall:// (and iOS uses
 * Sign in with Apple), so the button is omitted instead of showing a failed
 * script load.
 */
export function isGoogleSignInOffered(win) {
  const w = win !== undefined ? win : (typeof window !== "undefined" ? window : null);
  if (!w) return true;
  if (w.electronAPI && w.electronAPI.isElectron) return false;
  try {
    const cap = w.Capacitor;
    if (
      cap &&
      typeof cap.isNativePlatform === "function" &&
      cap.isNativePlatform() &&
      typeof cap.getPlatform === "function" &&
      cap.getPlatform() === "ios"
    ) {
      return false;
    }
  } catch {
    /* no native bridge */
  }
  return true;
}
