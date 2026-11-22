/**
 * Which desktop shell runs the page: the Electron app or the Rust / Tauri app (Windows).
 *
 * Both expose window.electronAPI: the Tauri shim (desktop/app/shim/electron-api-shim.js) maps
 * every member of the Electron preload, keeps isElectron: true and adds a non-enumerable
 * isTauri: true, so existing desktop branches run unchanged in both. Ask these helpers instead
 * of reading the Electron globals directly: they also know the Tauri shell when its bridge has
 * not loaded (window.__TAURI_INTERNALS__ is injected before any page script), so a missing
 * bridge no longer turns the desktop app into "a website at https://tauri.localhost".
 *
 * Dependency-free (main.jsx and the marketing entry import it through entryShell.js).
 */

function currentWindow(win) {
  if (win !== undefined) return win;
  return typeof window !== "undefined" ? window : null;
}

/** The Rust / Tauri desktop app (any of its windows). */
export function isTauriShell(win) {
  const w = currentWindow(win);
  if (!w) return false;
  try {
    if (w.__TAURI_INTERNALS__ && typeof w.__TAURI_INTERNALS__ === "object") return true;
    if (w.electronAPI && w.electronAPI.isTauri === true) return true;
  } catch {
    /* cross-origin or locked-down window */
  }
  return false;
}

/** The desktop bridge (window.electronAPI) when it is there, else null. */
export function desktopBridge(win) {
  const w = currentWindow(win);
  try {
    return (w && w.electronAPI) || null;
  } catch {
    return null;
  }
}

/**
 * The desktop bridge is loaded (Electron preload or the Tauri shim): exactly the old
 * `window.electronAPI?.isElectron` check. Use it where the code goes on to call bridge
 * members (window buttons, overlay, voice busy, notifications); use isDesktopShell() where
 * the question is only "is this the desktop app" (copy, platform tags, layout).
 */
export function hasDesktopBridge(win) {
  const api = desktopBridge(win);
  return Boolean(api && api.isElectron);
}

/** The Electron app proper (not the Tauri app that mirrors its bridge). */
export function isElectronAppShell(win) {
  const api = desktopBridge(win);
  return Boolean(api && api.isElectron) && !isTauriShell(win);
}

/**
 * Either desktop app (Electron or Tauri). Same answer as the old
 * `window.electronAPI?.isElectron` checks whenever the bridge is there.
 */
export function isDesktopShell(win) {
  const api = desktopBridge(win);
  return Boolean(api && api.isElectron) || isTauriShell(win);
}

/** "tauri", "electron" or "" (browser, PWA, Capacitor). */
export function desktopShellKind(win) {
  if (isTauriShell(win)) return "tauri";
  return isDesktopShell(win) ? "electron" : "";
}

/**
 * Desktop app, also before the Electron preload is visible (some early call sites ran before
 * contextBridge on old builds): the bridge, the Tauri globals, or an Electron user agent.
 */
export function isDesktopRuntime(win, userAgent) {
  if (isDesktopShell(win)) return true;
  const ua = userAgent !== undefined
    ? String(userAgent || "")
    : (typeof navigator !== "undefined" ? String(navigator.userAgent || "") : "");
  return /Electron/i.test(ua);
}

/** The Descall+ desktop bridge (window.descallPremium) in either shell, else null. */
export function premiumBridge(win) {
  const w = currentWindow(win);
  try {
    return (w && w.descallPremium) || null;
  } catch {
    return null;
  }
}
