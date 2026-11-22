/**
 * Pure origin rules for error reporting in the desktop shells (tested by
 * sentryShell.selftest.mjs; no SDK, no window access).
 *
 * The packaged Tauri app serves the page from https://tauri.localhost (WebView2 custom
 * scheme, use_https_scheme). That host ends in ".localhost", so the dev-origin check used
 * to treat the shipped Tauri app as a dev run and kept Sentry off there entirely: no
 * renderer errors and no main-process (onMainError) reports from Tauri users.
 */

/** The packaged Tauri app origin (desktop/app/src-tauri main.rs, use_https_scheme(true)). */
export const TAURI_APP_HOST = "tauri.localhost";

export function isLocalHost(hostname) {
  const h = String(hostname || "").toLowerCase();
  return (
    h === "localhost" ||
    h === "0.0.0.0" ||
    h === "[::1]" ||
    h === "::1" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h)
  );
}

export function isPackagedTauriOrigin(protocol, hostname) {
  return (protocol === "https:" || protocol === "http:") && String(hostname || "").toLowerCase() === TAURI_APP_HOST;
}

/**
 * A desktop shell page that is a developer run: Electron or Tauri loading the Vite dev
 * server (http://localhost:5173). Packaged Electron (descall://app) and packaged Tauri
 * (https://tauri.localhost) are not.
 */
export function isDesktopDevOrigin(protocol, hostname) {
  if (isPackagedTauriOrigin(protocol, hostname)) return false;
  return String(protocol || "").startsWith("http") && isLocalHost(hostname);
}

/** Sentry tag for the desktop shell kind ("tauri" | "electron"), null outside desktop. */
export function desktopShellTag(api) {
  if (!api || !api.isElectron) return null;
  return api.isTauri ? "tauri" : "electron";
}
