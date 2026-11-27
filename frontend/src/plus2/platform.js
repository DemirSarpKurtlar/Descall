/**
 * Which selling platform this client is (the server decides prices / switches per platform):
 * "ios" (Capacitor iOS app), "android" (Capacitor Android), "desktop" (Electron or Tauri), "web".
 * Sent as X-Descall-Platform on Descall+ requests and on avatar / banner uploads.
 */
import { isNativeAndroid, isNativeIOS } from "../lib/platform.js";
import { isDesktopShell } from "../lib/desktopShell.js";

export const PLUS_PLATFORMS = Object.freeze(["web", "desktop", "ios", "android"]);

let override = null;

/** Tests / harness only. */
export function setPlatformOverride(p) {
  override = PLUS_PLATFORMS.includes(p) ? p : null;
}

export function plusPlatform() {
  if (override) return override;
  try {
    if (isNativeIOS()) return "ios";
    if (isNativeAndroid()) return "android";
    if (typeof window !== "undefined" && isDesktopShell()) return "desktop";
  } catch {
    /* web */
  }
  return "web";
}

export function platformHeaders() {
  return { "X-Descall-Platform": plusPlatform() };
}
