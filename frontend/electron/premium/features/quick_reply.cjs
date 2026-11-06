'use strict';

/**
 * quick_reply (Descall+): reply to a DM straight from the notification.
 *
 * Windows / macOS: a replyable DM is shown as a native toast with an inline
 * reply field (Electron 42: Notification `hasReply` / `replyPlaceholder`, the
 * `reply` event, and Notification.handleActivation on Windows). Every other
 * notification keeps Descall's own capsule windows, which also keep their
 * Focus Assist behaviour.
 *
 * Windows requirements (see toastIdentity.cjs and electron/installer.nsh):
 *   - app.setAppUserModelId('com.descall.app') = electron-builder appId, which
 *     NSIS writes on the Start Menu shortcut (WinShell::SetLnkAUMI);
 *   - a FIXED toast activator CLSID (app.setToastActivatorCLSID), which the
 *     installer writes on the same shortcut (ToastActivatorCLSID property)
 *     and registers under HKCU\Software\Classes\CLSID for cold starts.
 * Without a Start Menu shortcut (portable build, dev run) Windows may not
 * deliver the reply; Linux has no inline reply. In both cases the toast falls
 * back to the normal capsule, and status() says why.
 *
 * The typed text goes to the main renderer, which posts it through the
 * existing POST /api/messages/quick-reply route (built for iOS).
 * Settings: { enabled }
 */

const { Notification } = require('electron');
const { TOAST_CLSID, toastIdentityReady } = require('../toastIdentity.cjs');
const notifyHooks = require('../notifyHooks.cjs');
const { et } = require('../../mainI18n.cjs');

const KEEP_MS = 10 * 60 * 1000;
const MAX_LIVE = 20;

let ctx = null;
const live = new Map(); // id -> { n, conv, at, replied }
let seq = 0;
let activationBound = false;

let offFilter = null;

/** conv id for the quick-reply route ("dm:<peerId>"), or null when not replyable. */
function replyTarget(data = {}) {
  const type = String(data?.type || '');
  if (type === 'dm' || (type === 'mention' && data.dmConversationId)) {
    const peer = data.fromId || data.conversationId || data.dmConversationId;
    return peer ? `dm:${String(peer).slice(0, 64)}` : null;
  }
  return null;
}

function nativeSupport(platform = process.platform) {
  if (platform === 'darwin') return { ok: true };
  if (platform !== 'win32') return { ok: false, reason: 'platform' };
  if (!toastIdentityReady()) return { ok: false, reason: 'identity' };
  return { ok: true };
}

function supported() {
  try {
    if (!Notification || !Notification.isSupported()) return { ok: false, reason: 'unsupported' };
  } catch (_) { return { ok: false, reason: 'unsupported' }; }
  return nativeSupport();
}

function deliver(conv, text) {
  const body = String(text || '').trim().slice(0, 2000);
  if (!ctx || !conv || !body) return false;
  return ctx.send('premium:quick-reply', { conv, text: body });
}

function prune(now = Date.now()) {
  for (const [id, entry] of live) {
    if (now - entry.at > KEEP_MS) live.delete(id);
  }
  while (live.size > MAX_LIVE) live.delete(live.keys().next().value);
}

function bindActivation() {
  if (activationBound || process.platform !== 'win32' || typeof Notification?.handleActivation !== 'function') return;
  activationBound = true;
  try {
    Notification.handleActivation((details = {}) => {
      if (!ctx || details.type !== 'reply') return;
      const args = String(details.arguments || '');
      for (const [id, entry] of live) {
        if (!args.includes(id)) continue;
        if (!entry.replied) {
          entry.replied = true;
          deliver(entry.conv, details.reply || details.userInputs?.reply || '');
        }
        return;
      }
    });
  } catch (_) { activationBound = false; }
}

/**
 * Show a replyable DM as a native toast. Returns true when shown; false means
 * the caller shows the capsule instead.
 */
function showNative({ title, body, conv, onClick }) {
  if (!ctx) return false;
  const can = supported();
  if (!can.ok) return false;
  prune();
  const id = `descall-qr-${Date.now().toString(36)}-${(++seq).toString(36)}`;
  let n;
  try {
    n = new Notification({
      title: String(title || 'Descall').slice(0, 120),
      body: String(body || '').slice(0, 300),
      hasReply: true,
      replyPlaceholder: et('premium.quickReply.placeholder'),
      silent: false,
      id,
    });
  } catch (_) { return false; }
  const entry = { n, conv, at: Date.now(), replied: false };
  live.set(id, entry);
  // The text is on the event (NotificationReplyEventParams); the positional string argument
  // is deprecated and Electron 45 warns when a listener declares it.
  // (...legacy keeps listener.length at 1, so no warning, and still reads an old build's string.)
  n.on('reply', (event, ...legacy) => {
    if (entry.replied) return;
    entry.replied = true;
    deliver(conv, event?.reply ?? legacy[0] ?? '');
  });
  n.on('click', () => { try { onClick && onClick(); } catch (_) { /* ignore */ } });
  n.on('close', () => { setTimeout(() => live.delete(id), 5000); });
  n.on('failed', () => { live.delete(id); });
  try { n.show(); } catch (_) { live.delete(id); return false; }
  return true;
}

function status() {
  const can = supported();
  return { ok: true, mode: can.ok ? 'native' : 'unavailable', reason: can.ok ? null : can.reason, clsid: TOAST_CLSID };
}

/** Marks replyable DMs; main.cjs then shows them with showNative() when possible. */
function filterNotification(payload) {
  if (!ctx) return payload;
  const data = payload?.options?.data || {};
  const conv = replyTarget(data);
  if (!conv) return payload;
  return { ...payload, quickReply: { conv } };
}

module.exports = {
  key: 'quick_reply',
  start(c) {
    ctx = c;
    bindActivation();
    offFilter = notifyHooks.register('quick_reply', filterNotification);
    notifyHooks.setQuickReplyHandler(showNative);
    ctx.handle('premium:quick_reply:status', () => status());
  },
  stop() {
    offFilter?.();
    offFilter = null;
    notifyHooks.setQuickReplyHandler(null);
    for (const { n } of live.values()) {
      try { n.close(); } catch (_) { /* ignore */ }
    }
    live.clear();
    ctx = null;
  },
  filterNotification,
  showNative,
  replyTarget,
  nativeSupport,
};
