'use strict';

/**
 * Tray panel (owner pick, draft B "Gelismis menu"): the pure rules both desktop shells share.
 * No electron import, so trayMenu.selftest.mjs can load it. The Tauri shell has the same rules
 * in desktop/crates/descall-shell/src/tray_panel.rs (keep the two in step).
 *
 *  - normalizeAppState: the compact state the main page pushes (electronAPI.setTrayState),
 *    cleaned and capped before the shell keeps it or forwards it to the panel window.
 *  - validateAction: the only actions the panel window may ask for, with their arguments.
 *    "shell" actions run in the shell; "app" actions are forwarded to the main page.
 *  - placePanel: where the panel window goes (tray icon rect + monitor work area), for a
 *    taskbar on any edge.
 *  - snooze: the desktop-level "mute notifications" until a timestamp.
 *  - serializeMenuTemplate: Descall+ tray entries (Electron Menu templates) as plain data.
 */

const STATUSES = Object.freeze(['online', 'idle', 'dnd', 'invisible']);
const SNOOZE_MINUTES = Object.freeze([30, 60, 480]);
const SNOOZE_MAX_MS = 24 * 60 * 60 * 1000;

/** Panel geometry in logical px (CSS px). The page reads it from the state it receives. */
const PANEL = Object.freeze({ card: 290, flyout: 232, gap: 6, pad: 14, maxHeight: 780 });

/** kind: shell | app. closes: the panel hides after it runs. arg: argument rule. */
const ACTIONS = Object.freeze({
  open: { kind: 'shell', closes: true },
  settings: { kind: 'shell', closes: true },
  autostart: { kind: 'shell', closes: false },
  quit: { kind: 'shell', closes: true },
  update: { kind: 'shell', closes: true },
  close: { kind: 'shell', closes: true },
  ack: { kind: 'shell', closes: false, arg: 'seq' },
  snooze: { kind: 'shell', closes: true, arg: 'snooze' },
  premium: { kind: 'shell', closes: true, arg: 'premium' },
  status: { kind: 'app', closes: true, arg: 'status' },
  mute: { kind: 'app', closes: false },
  deafen: { kind: 'app', closes: false },
  clip: { kind: 'app', closes: true },
  openDms: { kind: 'app', closes: true },
  openRequests: { kind: 'app', closes: true },
});

const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');
const count = (v) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 9999) : 0;
};
const time = (v) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** https: or data:image avatars only (the panel page loads nothing else). */
function safeImageUrl(v) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (/^https:\/\/[^\s"'<>]+$/i.test(s) && s.length <= 2048) return s;
  if (/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(s) && s.length <= 262144) return s;
  return '';
}

/** "Ctrl+Shift+M"-like hint, or "" (letters, digits, +, space and a few key names only). */
function safeHint(v) {
  const s = str(v, 32);
  return /^[\p{L}\p{N}+ ._\-←-↓⌘⌥⇧]+$/u.test(s) ? s : '';
}

function normalizeAppState(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const hints = r.hints && typeof r.hints === 'object' ? r.hints : {};
  const accent = str(r.accent, 20);
  return {
    signedIn: Boolean(r.signedIn),
    name: str(r.name, 64),
    avatarUrl: safeImageUrl(r.avatarUrl),
    status: STATUSES.includes(r.status) ? r.status : 'online',
    statusUntil: time(r.statusUntil),
    statusText: str(r.statusText, 80),
    unreadMessages: count(r.unreadMessages),
    friendRequests: count(r.friendRequests),
    micMuted: Boolean(r.micMuted),
    deafened: Boolean(r.deafened),
    inCall: Boolean(r.inCall),
    clipAvailable: Boolean(r.clipAvailable),
    notificationsMutedUntil: time(r.notificationsMutedUntil),
    hints: { open: safeHint(hints.open), mute: safeHint(hints.mute), deafen: safeHint(hints.deafen), clip: safeHint(hints.clip) },
    theme: r.theme === 'light' ? 'light' : 'dark',
    accent: /^\d{1,3},\d{1,3},\d{1,3}$/.test(accent.replace(/\s+/g, '')) && accent.replace(/\s+/g, '').split(',').every((n) => Number(n) <= 255)
      ? accent.replace(/\s+/g, '')
      : '',
    locale: str(r.locale, 16).replace(/[^A-Za-z-]/g, ''),
  };
}

function sameAppState(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * { action, arg, kind, closes } for an allowed request from the panel, else null.
 * premiumIds: the ids of the Descall+ entries the panel was last given.
 */
function validateAction(msg, { premiumIds = null } = {}) {
  if (!msg || typeof msg !== 'object') return null;
  const action = typeof msg.action === 'string' ? msg.action : '';
  if (!Object.prototype.hasOwnProperty.call(ACTIONS, action)) return null;
  const rule = ACTIONS[action];
  let arg = null;
  if (rule.arg === 'status') {
    if (!STATUSES.includes(msg.arg)) return null;
    arg = msg.arg;
  } else if (rule.arg === 'snooze') {
    const m = Number(msg.arg);
    if (m !== 0 && !SNOOZE_MINUTES.includes(m)) return null;
    arg = m;
  } else if (rule.arg === 'seq') {
    const n = Number(msg.arg);
    if (!Number.isSafeInteger(n) || n < 0) return null;
    arg = n;
  } else if (rule.arg === 'premium') {
    const id = typeof msg.arg === 'string' ? msg.arg : '';
    if (!id || id.length > 200 || !premiumIds || !premiumIds.has(id)) return null;
    arg = id;
  }
  return { action, arg, kind: rule.kind, closes: rule.closes };
}

// ---- notification snooze ----------------------------------------------------------------

/** Until when notifications stay quiet for a snooze choice (0 = off). */
function snoozeUntilFor(minutes, now) {
  const m = Number(minutes);
  if (!SNOOZE_MINUTES.includes(m)) return 0;
  return now + m * 60 * 1000;
}

/** A stored value that is still in the future (and not absurdly far), else 0. */
function activeSnooze(until, now) {
  const u = time(until);
  return u > now && u - now <= SNOOZE_MAX_MS ? u : 0;
}

/** Desktop cards stay quiet while snoozed; incoming calls (requireInteraction) still ring. */
function suppressNotification(options, until, now) {
  if (!activeSnooze(until, now)) return false;
  return !(options && options.requireInteraction);
}

// ---- placement ------------------------------------------------------------------------------

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Which edge of the monitor the tray (taskbar) is on. */
function taskbarEdge(tray, work) {
  const right = work.x + work.width;
  const bottom = work.y + work.height;
  if (tray.y >= bottom - 1) return 'bottom';
  if (tray.y + tray.height <= work.y + 1) return 'top';
  if (tray.x >= right - 1) return 'right';
  if (tray.x + tray.width <= work.x + 1) return 'left';
  // Auto-hide taskbar or the overflow flyout: the nearest edge of the work area.
  const cx = tray.x + tray.width / 2;
  const cy = tray.y + tray.height / 2;
  const d = [['bottom', bottom - cy], ['top', cy - work.y], ['right', right - cx], ['left', cx - work.x]];
  d.sort((a, b) => a[1] - b[1]);
  return d[0][0];
}

/**
 * Window rect for the panel. Units: whatever tray and work use (Electron: DIP, scale 1;
 * Tauri: physical px with the monitor scale). The window holds the card, a flyout lane on
 * one side and a shadow pad, and stays inside the work area. cardLeft is in logical px
 * from the window's left edge; vertical says which window edge the card sits on.
 */
function placePanel({ tray, work, scale = 1, geometry = PANEL } = {}) {
  const s = scale > 0 ? scale : 1;
  const g = geometry;
  const cw = g.card * s;
  const fw = g.flyout * s;
  const gap = g.gap * s;
  const pad = g.pad * s;
  const right = work.x + work.width;
  const bottom = work.y + work.height;
  const edge = taskbarEdge(tray, work);
  const cx = tray.x + tray.width / 2;

  let cardX;
  if (edge === 'left') cardX = work.x + pad;
  else if (edge === 'right') cardX = right - pad - cw;
  else cardX = clamp(cx - cw / 2, work.x + pad, right - pad - cw);

  const roomRight = right - (cardX + cw) - pad;
  const roomLeft = cardX - work.x - pad;
  let flyout;
  if (roomRight >= fw + gap) flyout = 'right';
  else if (roomLeft >= fw + gap) flyout = 'left';
  else flyout = roomRight >= roomLeft ? 'right' : 'left';

  let x = flyout === 'right' ? cardX - pad : cardX - gap - fw - pad;
  let width = pad + cw + gap + fw + pad;
  if (x < work.x) {
    width -= work.x - x;
    x = work.x;
  }
  if (x + width > right) width = right - x;

  const height = Math.min(g.maxHeight * s, work.height);
  let y;
  let vertical = 'bottom';
  if (edge === 'top') {
    y = work.y;
    vertical = 'top';
  } else if (edge === 'bottom') {
    y = bottom - height;
  } else {
    // Side taskbar: the card's bottom lines up with the icon, inside the work area.
    const cardBottom = clamp(tray.y + tray.height + pad, work.y + height, bottom);
    y = cardBottom - height;
  }
  const round = (v) => Math.round(v);
  return {
    x: round(x),
    y: round(y),
    width: round(width),
    height: round(height),
    cardLeft: Math.round((cardX - round(x)) / s),
    vertical,
    flyout,
    edge,
  };
}

// ---- Descall+ entries (Electron Menu templates) -------------------------------------------

/** Entries the panel already has rows for (tray_controls_plus status / mute / deafen). */
const PREMIUM_DUPLICATES = new Set(['premium-status', 'premium-call-mute', 'premium-call-deafen']);

/**
 * Menu template -> { items, handlers }: items are plain data for the panel
 * ({ type: item|radio|check|separator|submenu, id, label, enabled, checked, items }),
 * handlers maps an id to the template's click function. Leading, trailing and doubled
 * separators are dropped.
 */
function serializeMenuTemplate(template, prefix = 'p') {
  const handlers = new Map();
  function walk(list, path) {
    const out = [];
    (Array.isArray(list) ? list : []).forEach((it, i) => {
      if (!it || typeof it !== 'object') return;
      if (it.id && PREMIUM_DUPLICATES.has(it.id)) return;
      const id = `${path}.${i}`;
      if (it.type === 'separator') {
        if (out.length && out[out.length - 1].type !== 'separator') out.push({ type: 'separator' });
        return;
      }
      const label = str(it.label, 80);
      if (!label) return;
      if (Array.isArray(it.submenu)) {
        const items = walk(it.submenu, id);
        if (items.length) out.push({ type: 'submenu', id, label, enabled: it.enabled !== false, items });
        return;
      }
      const type = it.type === 'radio' ? 'radio' : it.type === 'checkbox' ? 'check' : 'item';
      const entry = { type, id, label, enabled: it.enabled !== false && typeof it.click === 'function' };
      if (type !== 'item') entry.checked = Boolean(it.checked);
      if (entry.enabled) handlers.set(id, { click: it.click, checked: Boolean(it.checked), type });
      out.push(entry);
    });
    while (out.length && out[out.length - 1].type === 'separator') out.pop();
    return out;
  }
  return { items: walk(template, prefix), handlers };
}

module.exports = {
  STATUSES,
  SNOOZE_MINUTES,
  PANEL,
  ACTIONS,
  PREMIUM_DUPLICATES,
  normalizeAppState,
  sameAppState,
  validateAction,
  snoozeUntilFor,
  activeSnooze,
  suppressNotification,
  taskbarEdge,
  placePanel,
  serializeMenuTemplate,
};
