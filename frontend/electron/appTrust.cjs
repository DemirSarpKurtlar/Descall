'use strict';

/**
 * Which pages main trusts. Pure, tested by appTrust.selftest.mjs.
 *
 * App origin: descall://app (the packaged app, protocol.handle in main.cjs) and, in a dev
 * run only, the Vite server http://localhost:5173. Origins are compared exactly after
 * parsing, never by substring: before, will-navigate let through any URL that contained
 * "localhost" (https://evil.example/?localhost) or started with file://.
 *
 * IPC: assertTrustedSender(event) accepts a message only when the sending frame is the top
 * frame of a known Descall window (main window, Kayıt İstatistikleri, Yönetici Paneli) and
 * its URL has the app origin. Every sensitive channel (token, file system, download,
 * settings, auth, and every future premium:* channel) goes through it.
 */

const APP_ORIGIN = 'descall://app';
const DEV_ORIGIN = 'http://localhost:5173';

function appOrigins({ isDev = false } = {}) {
  return isDev ? [APP_ORIGIN, DEV_ORIGIN] : [APP_ORIGIN];
}

/**
 * Normalized origin of a URL, or null. http(s) use the WHATWG origin; descall: is a
 * Chromium "standard" scheme but not a special one for Node's URL (origin "null"), so it is
 * rebuilt from protocol + host. URLs with credentials have no trusted origin.
 */
function originOf(url) {
  let u;
  try {
    u = new URL(String(url || ''));
  } catch (_) {
    return null;
  }
  if (u.username || u.password) return null;
  if (u.protocol === 'http:' || u.protocol === 'https:') return u.origin;
  if (u.protocol === 'descall:') return u.host ? `descall://${u.host.toLowerCase()}` : null;
  return null;
}

/** True when url is a page of the app itself (exact origin match). */
function isAppUrl(url, opts = {}) {
  const origin = originOf(url);
  return Boolean(origin) && appOrigins(opts).includes(origin);
}

/** Schemes main may hand to the OS (shell.openExternal). Never file:, never custom schemes. */
function isSafeExternalUrl(url) {
  let u;
  try {
    u = new URL(String(url || ''));
  } catch (_) {
    return false;
  }
  if (u.protocol === 'mailto:') return true;
  return (u.protocol === 'https:' || u.protocol === 'http:') && Boolean(u.hostname);
}

function frameUrl(frame) {
  try {
    return String(frame?.url || '');
  } catch (_) {
    return '';
  }
}

/**
 * { ok, reason } for an ipcMain event. isKnownWebContents(webContents) says whether the
 * sender belongs to one of our windows (main.cjs passes the live window list).
 */
function checkTrustedSender(event, { isDev = false, isKnownWebContents = () => false } = {}) {
  if (!event || typeof event !== 'object') return { ok: false, reason: 'no-event' };
  const sender = event.sender;
  if (!sender) return { ok: false, reason: 'no-sender' };
  try {
    if (typeof sender.isDestroyed === 'function' && sender.isDestroyed()) return { ok: false, reason: 'sender-destroyed' };
  } catch (_) {
    return { ok: false, reason: 'sender-destroyed' };
  }
  let known = false;
  try {
    known = Boolean(isKnownWebContents(sender));
  } catch (_) {
    known = false;
  }
  if (!known) return { ok: false, reason: 'unknown-window' };
  let frame = null;
  try {
    frame = event.senderFrame || null;
  } catch (_) {
    frame = null;
  }
  if (!frame) return { ok: false, reason: 'no-frame' };
  // Only the top frame runs our preload; a subframe never speaks for the window.
  try {
    if (frame.parent) return { ok: false, reason: 'subframe' };
  } catch (_) {
    return { ok: false, reason: 'no-frame' };
  }
  const url = frameUrl(frame);
  if (!isAppUrl(url, { isDev })) return { ok: false, reason: `origin ${originOf(url) || 'none'}` };
  return { ok: true, reason: '' };
}

/**
 * Builds the guard main.cjs uses. assertTrustedSender throws (ipcMain.handle turns that
 * into a rejected invoke); isTrustedSender returns a boolean for ipcMain.on listeners,
 * where a throw would surface as an uncaught main-process error.
 */
function createSenderGuard({ isDev = false, isKnownWebContents, log = null } = {}) {
  const warned = new Set();
  const report = (channel, reason) => {
    const key = `${channel}|${reason}`;
    if (warned.has(key) || !log) return;
    warned.add(key);
    try { log.warn(`[ipc] refused ${channel || 'message'} from an untrusted sender (${reason})`); } catch (_) { /* ignore */ }
  };
  function isTrustedSender(event, channel = '') {
    const res = checkTrustedSender(event, { isDev, isKnownWebContents });
    if (!res.ok) report(channel, res.reason);
    return res.ok;
  }
  function assertTrustedSender(event, channel = '') {
    if (isTrustedSender(event, channel)) return;
    const err = new Error(`Untrusted IPC sender${channel ? ` for ${channel}` : ''}`);
    err.code = 'E_UNTRUSTED_SENDER';
    throw err;
  }
  return { isTrustedSender, assertTrustedSender };
}

module.exports = {
  APP_ORIGIN,
  DEV_ORIGIN,
  appOrigins,
  originOf,
  isAppUrl,
  isSafeExternalUrl,
  checkTrustedSender,
  createSenderGuard,
};
