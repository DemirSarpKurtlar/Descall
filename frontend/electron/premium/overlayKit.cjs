'use strict';

/**
 * Small always-on-top windows for the premium HUDs, widgets and the quick drop zone.
 * No injection, no hooks into other processes: a transparent frameless BrowserWindow at
 * the 'screen-saver' level. That shows over borderless / windowed games; an exclusive
 * fullscreen game owns the display and nothing (Descall included) can draw over it
 * without injecting into the game, which anti-cheat systems flag. So we do not.
 */

const { BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const { hudDataUrl } = require('./hudHtml.cjs');

const overlays = new Map(); // id -> { win, kind, onAction, last }
let actionHooked = false;

function hookActions() {
  if (actionHooked) return;
  actionHooked = true;
  ipcMain.on('premium:hud:action', (event, msg) => {
    for (const o of overlays.values()) {
      if (!o.win || o.win.isDestroyed() || o.win.webContents !== event.sender) continue;
      const type = msg && typeof msg.type === 'string' ? msg.type : '';
      if (type === 'ready') {
        if (o.last) o.win.webContents.send('premium:hud:state', o.last);
        if (!o.win.isVisible() && o.showOnReady) o.win.showInactive();
        return;
      }
      try { o.onAction?.(type, msg.payload, o); } catch (_) { /* ignore */ }
      return;
    }
  });
}

/** Clamp a rectangle inside the work area of the display nearest to it. */
function clampToWorkArea(b) {
  try {
    const d = screen.getDisplayMatching({ x: b.x, y: b.y, width: b.width, height: b.height });
    const wa = d.workArea;
    const width = Math.min(b.width, wa.width);
    const height = Math.min(b.height, wa.height);
    return {
      x: Math.min(Math.max(b.x, wa.x), wa.x + wa.width - width),
      y: Math.min(Math.max(b.y, wa.y), wa.y + wa.height - height),
      width,
      height,
    };
  } catch (_) {
    return b;
  }
}

/** Position from a corner preset ('tl' | 'tr' | 'bl' | 'br') plus margins, on the primary display. */
function cornerBounds(corner, width, height, margin = 16) {
  let wa = { x: 0, y: 0, width: 1280, height: 720 };
  try { wa = screen.getPrimaryDisplay().workArea; } catch (_) { /* ignore */ }
  const left = corner === 'tl' || corner === 'bl';
  const top = corner === 'tl' || corner === 'tr';
  return {
    x: Math.round(left ? wa.x + margin : wa.x + wa.width - width - margin),
    y: Math.round(top ? wa.y + margin : wa.y + wa.height - height - margin),
    width: Math.round(width),
    height: Math.round(height),
  };
}

/**
 * open({ id, kind, bounds, clickThrough, opacity, focusable, onAction, onMoved }) -> overlay
 * Reuses the window when it already exists (only bounds / opacity / click-through change).
 */
function open(opts) {
  hookActions();
  const id = String(opts.id);
  let o = overlays.get(id);
  const bounds = clampToWorkArea(opts.bounds || cornerBounds('tr', 260, 200));
  if (o && o.win && !o.win.isDestroyed()) {
    o.onAction = opts.onAction || o.onAction;
    o.onMoved = opts.onMoved || o.onMoved;
    try { o.win.setBounds(bounds); } catch (_) { /* ignore */ }
    apply(o, opts);
    if (!o.win.isVisible()) o.win.showInactive();
    return o;
  }
  const win = new BrowserWindow({
    ...bounds,
    frame: false,
    thickFrame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: Boolean(opts.focusable),
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'hudPreload.cjs'),
      backgroundThrottling: true,
      spellcheck: false,
    },
  });
  o = { id, win, kind: opts.kind, onAction: opts.onAction, onMoved: opts.onMoved, last: opts.state || null, showOnReady: true };
  overlays.set(id, o);
  try { win.setAlwaysOnTop(true, 'screen-saver'); } catch (_) { /* ignore */ }
  try { win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); } catch (_) { /* ignore */ }
  apply(o, opts);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  let moveTimer = null;
  win.on('moved', () => {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
      if (win.isDestroyed()) return;
      try { o.onMoved?.(win.getBounds(), o); } catch (_) { /* ignore */ }
    }, 250);
  });
  win.once('closed', () => {
    clearTimeout(moveTimer);
    if (overlays.get(id) === o) overlays.delete(id);
  });
  win.loadURL(hudDataUrl(opts.kind)).catch(() => {});
  return o;
}

function apply(o, opts) {
  const win = o.win;
  if (typeof opts.opacity === 'number') {
    try { win.setOpacity(Math.min(1, Math.max(0.2, opts.opacity))); } catch (_) { /* ignore */ }
  }
  if (typeof opts.clickThrough === 'boolean') {
    try { win.setIgnoreMouseEvents(opts.clickThrough, opts.clickThrough ? { forward: true } : undefined); } catch (_) { /* ignore */ }
  }
}

function send(id, state) {
  const o = overlays.get(String(id));
  if (!o || !o.win || o.win.isDestroyed()) return false;
  o.last = state;
  try { o.win.webContents.send('premium:hud:state', state); } catch (_) { return false; }
  return true;
}

function close(id) {
  const o = overlays.get(String(id));
  overlays.delete(String(id));
  if (o && o.win && !o.win.isDestroyed()) {
    try { o.win.destroy(); } catch (_) { /* ignore */ }
  }
}

function closeWhere(pred) {
  for (const [id, o] of [...overlays]) if (pred(o)) close(id);
}

function get(id) {
  const o = overlays.get(String(id));
  return o && o.win && !o.win.isDestroyed() ? o : null;
}

function list() {
  return [...overlays.values()].filter((o) => o.win && !o.win.isDestroyed());
}

module.exports = { open, send, close, closeWhere, get, list, cornerBounds, clampToWorkArea };
