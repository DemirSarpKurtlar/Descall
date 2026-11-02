'use strict';

/**
 * quick_launcher (Descall+): a global hotkey opens a small frameless command
 * and search window. The main window's renderer does the searching (friends,
 * DMs, groups, servers, channels and actions, see
 * src/premium/launcher/launcherSearch.js) so the launcher reuses the app's own
 * data and routing; this module only owns the window and relays messages.
 *
 * The window is created on first use and destroyed after a minute hidden, so
 * nothing stays resident while the launcher is not used.
 * Settings: { enabled }
 */

const path = require('path');
const { BrowserWindow, screen, ipcMain } = require('electron');

const WIDTH = 640;
const HEIGHT = 420;
const IDLE_DESTROY_MS = 60 * 1000;
const QUERY_TIMEOUT_MS = 1500;

let ctx = null;
let win = null;
let idleTimer = null;
let seq = 0;
const pending = new Map(); // id -> { resolve, timer }
let offHandlers = [];
let ipcBound = false;

function settings() {
  const s = ctx ? ctx.store.get('quick_launcher') : {};
  return { enabled: Boolean(s.enabled) };
}

function strings() {
  const et = ctx?.et || ((k) => k);
  return {
    placeholder: et('premium.launcher.placeholder'),
    empty: et('premium.launcher.empty'),
    hint: et('premium.launcher.hint'),
    loading: et('premium.launcher.loading'),
    title: et('premium.launcher.title'),
  };
}

function fromLauncher(event) {
  return Boolean(win && !win.isDestroyed() && event && event.sender === win.webContents);
}

function bindIpc() {
  if (ipcBound) return;
  ipcBound = true;
  ipcMain.handle('premium:launcher:strings', (event) => (fromLauncher(event) ? strings() : null));
  ipcMain.handle('premium:launcher:query', (event, q) => {
    if (!fromLauncher(event) || !ctx) return { results: [] };
    const id = ++seq;
    const query = String(q || '').slice(0, 120);
    return new Promise((resolve) => {
      const timer = setTimeout(() => { pending.delete(id); resolve({ results: [], timeout: true }); }, QUERY_TIMEOUT_MS);
      pending.set(id, { resolve, timer });
      if (!ctx.send('premium:launcher-query', { id, q: query })) {
        clearTimeout(timer);
        pending.delete(id);
        resolve({ results: [], offline: true });
      }
    });
  });
  ipcMain.on('premium:launcher:run', (event, item) => {
    if (!fromLauncher(event) || !ctx || !item || typeof item.id !== 'string') return;
    hide();
    if (item.focus) {
      const w = ctx.mainWindow();
      if (w) {
        try { if (w.isMinimized()) w.restore(); w.show(); w.focus(); } catch (_) { /* ignore */ }
      }
    }
    ctx.send('premium:launcher-run', { id: item.id.slice(0, 200) });
  });
  ipcMain.on('premium:launcher:close', (event) => { if (fromLauncher(event)) hide(); });
}

function unbindIpc() {
  if (!ipcBound) return;
  ipcBound = false;
  try { ipcMain.removeHandler('premium:launcher:strings'); } catch (_) { /* ignore */ }
  try { ipcMain.removeHandler('premium:launcher:query'); } catch (_) { /* ignore */ }
  ipcMain.removeAllListeners('premium:launcher:run');
  ipcMain.removeAllListeners('premium:launcher:close');
}

function createWindow() {
  win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: true,
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
      backgroundThrottling: true,
    },
  });
  win.setAlwaysOnTop(true, 'pop-up-menu');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.on('blur', () => hide());
  win.on('closed', () => { win = null; });
  win.loadFile(path.join(__dirname, '..', 'launcher', 'launcher.html'));
  return win;
}

function place() {
  try {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const area = display.workArea;
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
}

function toggle() {
  if (win && !win.isDestroyed() && win.isVisible()) hide();
  else show();
}

function sync() {
  if (!ctx) return;
  const s = settings();
  ctx.hotkeys.setHandler('quick_launcher', s.enabled ? toggle : null);
  if (s.enabled) bindIpc();
  else { hide(); unbindIpc(); }
}

module.exports = {
  key: 'quick_launcher',
  start(c) {
    ctx = c;
    const onSettings = (key) => { if (key === 'quick_launcher' || key === 'custom_hotkeys') sync(); };
    ctx.events.on('settings', onSettings);
    offHandlers = [() => ctx.events.off('settings', onSettings)];
    sync();
  },
  stop() {
    if (ctx) ctx.hotkeys.setHandler('quick_launcher', null);
    offHandlers.forEach((fn) => fn());
    offHandlers = [];
    for (const { resolve, timer } of pending.values()) { clearTimeout(timer); resolve({ results: [] }); }
    pending.clear();
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    if (win && !win.isDestroyed()) win.destroy();
    win = null;
    unbindIpc();
    ctx = null;
  },
  status() {
    return ctx ? { enabled: settings().enabled, open: Boolean(win && !win.isDestroyed() && win.isVisible()) } : null;
  },
  async call(method, args = {}) {
    if (method === 'results') {
      const entry = pending.get(Number(args.id));
      if (!entry) return { ok: false };
      pending.delete(Number(args.id));
      clearTimeout(entry.timer);
      const results = Array.isArray(args.results) ? args.results.slice(0, 30).map((r) => ({
        id: String(r?.id || '').slice(0, 200),
        kind: String(r?.kind || '').slice(0, 20),
        title: String(r?.title || '').slice(0, 120),
        subtitle: String(r?.subtitle || '').slice(0, 160),
        avatar: /^(https:\/\/|data:image\/)/i.test(String(r?.avatar || '')) ? String(r.avatar).slice(0, 2048) : '',
        focus: Boolean(r?.focus),
      })).filter((r) => r.id) : [];
      entry.resolve({ results });
      return { ok: true };
    }
    if (method === 'open') return { ok: show() };
    if (method === 'close') { hide(); return { ok: true }; }
    return { ok: false, error: 'unknown_method' };
  },
  _toggle: toggle,
  _window: () => win,
};
