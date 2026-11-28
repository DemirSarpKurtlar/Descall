'use strict';

/**
 * Text copy for the app windows, and the permission rule that lets the renderer's own
 * navigator.clipboard.writeText work.
 *
 * Root cause of "NotAllowedError: Failed to execute 'writeText' on 'Clipboard': Write
 * permission denied" (Windows app, Nov 2026): Chromium asks the session's permission
 * handlers for 'clipboard-sanitized-write' on every navigator.clipboard.writeText. Our
 * handlers in main.cjs (and the multi_account partitions) answered true only for the media
 * list, so every copy in the app was refused, whatever the user gesture.
 *
 * isPermissionAllowed grants the media list and clipboard-sanitized-write to the app's own
 * origin only (descall://app, plus the Vite origin in a dev run): no clipboard-read, and no
 * other origin (an iframe in the main window gets no camera or microphone).
 *
 * writeClipboardText backs the `clipboard:write-text` IPC (preload electronAPI.writeClipboardText),
 * the renderer's fallback when the web API still refuses (src/lib/copyText.js). Strings only,
 * capped, never throws.
 */

const MAX_CLIPBOARD_TEXT_CHARS = 1_000_000;
const APP_CLIPBOARD_PERMISSIONS = ['clipboard-sanitized-write'];

/**
 * Permission decision shared by setPermissionRequestHandler and setPermissionCheckHandler.
 * `url` is the requesting URL or origin; `isAppUrl` comes from appTrust.cjs.
 */
function isPermissionAllowed(permission, url, { mediaPermissions = [], isAppUrl, isDev = false } = {}) {
  const p = String(permission || '');
  // Media and clipboard write: the app origin only. Media used to go to any requesting frame
  // (a cross-origin iframe in the main window got camera and microphone without a prompt);
  // the Tauri shell and iOS already checked the origin.
  if (!mediaPermissions.includes(p) && !APP_CLIPBOARD_PERMISSIONS.includes(p)) return false;
  if (typeof isAppUrl !== 'function') return false;
  try { return Boolean(isAppUrl(url, { isDev })); } catch (_) { return false; }
}

/** The URL to judge a permission by: the requesting URL/origin, else the frame's page. */
function permissionUrl(webContents, ...candidates) {
  for (const c of candidates) {
    if (typeof c === 'string' && c) return c;
  }
  try { return webContents && typeof webContents.getURL === 'function' ? webContents.getURL() : ''; } catch (_) { return ''; }
}

/** Writes text to the OS clipboard. Resolves { ok } and never rejects. */
async function writeClipboardText({ clipboard, text, maxChars = MAX_CLIPBOARD_TEXT_CHARS }) {
  if (typeof text !== 'string') return { ok: false, error: 'not_a_string' };
  if (text.length > maxChars) return { ok: false, error: 'too_long' };
  if (!clipboard || typeof clipboard.writeText !== 'function') return { ok: false, error: 'unavailable' };
  try {
    await clipboard.writeText(text);
    return { ok: true };
  } catch (_) {
    return { ok: false, error: 'write_failed' };
  }
}

module.exports = {
  MAX_CLIPBOARD_TEXT_CHARS,
  APP_CLIPBOARD_PERMISSIONS,
  isPermissionAllowed,
  permissionUrl,
  writeClipboardText,
};
