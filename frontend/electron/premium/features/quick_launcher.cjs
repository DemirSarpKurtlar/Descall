'use strict';

/**
 * quick_launcher (Descall+): a global hotkey opens a small frameless command
 * and search window. The main window's renderer does the searching (friends,
 * DMs, groups, servers, channels and actions; src/premium/launcher), so the
 * launcher reuses the app's own data and routing. This module owns the window
 * and relays: launcher -> main -> renderer -> main -> launcher.
 *
 * The window is created on first use and destroyed after a minute hidden, so
 * nothing stays resident when the launcher is not used. Off by default.
 * Settings: { enabled }
 */

const path = require('path');
const { kit } = require('../moduleKit.cjs');
const { getHotkeys } = require('../hotkeys.cjs');

const WIDTH = 640;
const HEIGHT = 420;
const IDLE_DESTROY_MS = 60 * 1000;
const QUERY_TIMEOUT_MS = 1500;

let ctx = null;
let k = null;
let hk = null;
let win = null;
let idleTimer = null;
let seq = 0;
const pending = new Map(); // id -> { resolve, timer }

function strings() {
  const et = k.et;
  let lang = 'en';
  try { lang = require('../../mainI18n.cjs').getLocale() || 'en'; } catch (_) { /* ignore */ }
  return {
    lang,
    placeholder: et('premium.launcher.placeholder'),
    empty: et('premium.launcher.empty'),
    hint: et('premium.launcher.hint'),
    loading: et('premium.launcher.loading'),
    title: et('premium.launcher.title'),
  };
}

function sanitize(results) {
  return (Array.isArray(results) ? results : []).slice(0, 30).map((r) => ({
    id: String(r?.id || '').slice(0, 200),
    kind: String(r?.kind || '').replace(/[^a-z_]/g, '').slice(0, 20),
    title: String(r?.title || '').slice(0, 120),
    subtitle: String(r?.subtitle || '').slice(0, 160),
    avatar: /^(https:\/\/|data:image\/)/i.test(String(r?.avatar || '')) ? String(r.avatar).slice(0, 4096) : '',
    focus: Boolean(r?.focus),
  })).filter((r) => r.id && r.title);
}

function query(q) {
  const id = ++seq;
  const text = String(q || '').slice(0, 120);
  return new Promise((resolve) => {
    const timer = setTimeout(() => { pending.delete(id); resolve({ ok: true, results: [], timeout: true }); }, QUERY_TIMEOUT_MS);
    pending.set(id, { resolve, timer });
    if (!ctx || !ctx.send('premium:launcher-query', { id, q: text })) {
      clearTimeout(timer);
      pending.delete(id);
      resolve({ ok: true, results: [], offline: true });
    }
  });
}

function createWindow() {
  // eslint-disable-next-line global-require
  const { BrowserWindow } = require('electron');
  win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    title: 'Descall',
    webPreferences: {
      preload: path.join(__dirname, '..', 'launcher', 'launcherPreload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  try { win.setAlwaysOnTop(true, 'pop-up-menu'); } catch (_) { /* ignore */ }
  try { win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); } catch (_) { /* ignore */ }
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.on('blur', () => { if (!process.env.DESCALL_LAUNCHER_KEEP_OPEN) hide(); });
  win.on('closed', () => { win = null; });
  ctx.windows.track(win, { kind: 'launcher', key: 'quick_launcher' });
  // App origin (descall://app or the dev server): the premium host only trusts app-origin senders.
  win.loadURL(ctx.appUrl('/premium-launcher/launcher.html'));
  return win;
}

function place() {
  try {
    // eslint-disable-next-line global-require
    const { screen } = require('electron');
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const x = Math.round(area.x + (area.width - WIDTH) / 2);
    const y = Math.round(area.y + Math.max(40, area.height * 0.18));
    win.setBounds({ x, y, width: WIDTH, height: HEIGHT });
  } catch (_) { /* ignore */ }
}

function show() {
  if (!ctx) return false;
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  if (!win || win.isDestroyed()) createWindow();
  place();
  const reveal = () => {
    if (!win || win.isDestroyed()) return;
    win.show();
    win.focus();
    win.webContents.send('premium:launcher:reset', strings());
  };
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', reveal);
  else reveal();
  return true;
}

function hide() {
  if (!win || win.isDestroyed()) return;
  try { win.hide(); } catch (_) { /* ignore */ }
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (win && !win.isDestroyed() && !win.isVisible()) win.destroy();
  }, IDLE_DESTROY_MS);
  if (typeof idleTimer.unref === 'function') idleTimer.unref();
}

function toggle() {
  if (win && !win.isDestroyed() && win.isVisible()) hide();
  else show();
}

function focusMain() {
  const w = ctx?.mainWindow();
  if (!w) return;
  try {
    if (w.isMinimized()) w.restore();
    w.show();
    w.focus();
  } catch (_) { /* ignore */ }
}

module.exports = {
  key: 'quick_launcher',
  defaultEnabled: false,
  start(c) {
    ctx = c;
    k = kit(ctx);
    hk = getHotkeys(ctx);
    hk.setHandler('quick_launcher', toggle);
    // Launcher window (tracked aux window) -> main.
    ctx.handle('premium:launcher:strings', () => strings(), { from: 'app' });
    ctx.handle('premium:launcher:query', (q) => query(q), { from: 'app' });
    ctx.handle('premium:launcher:run', (item) => {
      if (!item || typeof item.id !== 'string') return { ok: false };
      hide();
      if (item.focus) focusMain();
      ctx?.send('premium:launcher-run', { id: item.id.slice(0, 200) });
      return { ok: true };
    }, { from: 'app' });
    ctx.handle('premium:launcher:close', () => { hide(); return { ok: true }; }, { from: 'app' });
    // Main window renderer -> main.
    ctx.handle('premium:launcher:results', (payload = {}) => {
      const entry = pending.get(Number(payload.id));
      if (!entry) return { ok: false };
      pending.delete(Number(payload.id));
      clearTimeout(entry.timer);
      entry.resolve({ ok: true, results: sanitize(payload.results) });
      return { ok: true };
    });
    ctx.handle('premium:launcher:open', () => ({ ok: show() }));
  },
  stop() {
    hk?.setHandler('quick_launcher', null);
    for (const { resolve, timer } of pending.values()) { clearTimeout(timer); resolve({ ok: true, results: [] }); }
    pending.clear();
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    if (win && !win.isDestroyed()) win.destroy();
    win = null;
    k?.dispose();
    k = null;
    ctx = null;
  },
  sanitize,
  _toggle: toggle,
  _show: show,
  _window: () => win,
};
