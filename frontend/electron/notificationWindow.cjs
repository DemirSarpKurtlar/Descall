'use strict';

const { BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  NOTIF_WIDTH,
  NOTIF_HEIGHT,
  MAX_VISIBLE,
  SHADOW_PAD,
  buildNotificationHtml,
  cardHeightFor,
} = require('./notificationCard.cjs');

const { NOTIF_MARGIN, stackPositions, evictionsFor } = require('./notificationStack.cjs');
const DEFAULT_DURATION = 5000;
const SAFETY_GRACE_MS = 1500;

const activeNotifications = [];
const closers = new WeakMap();
const updaters = new WeakMap();
const notifWindows = new WeakSet();

/**
 * Monitor for the stack: the display of Descall's own (visible) window,
 * else the display under the mouse — the one the user is looking at —
 * else the primary display. Notification windows themselves never count.
 */
function getAnchorWorkArea() {
  const wins = BrowserWindow.getAllWindows().filter((w) => {
    try { return w && !w.isDestroyed() && !notifWindows.has(w) && w.isVisible() && !w.isMinimized() && !w.isAlwaysOnTop(); }
    catch (_) { return false; }
  });
  let display = null;
  try {
    const focused = wins.find((w) => w.isFocused());
    const anchor = focused || wins[0];
    if (anchor) display = screen.getDisplayMatching(anchor.getBounds());
    else display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  } catch (_) {
    display = null;
  }
  return (display || screen.getPrimaryDisplay()).workArea;
}

/** Ease a window to (x, y) — Windows ignores setPosition's animate flag. */
function moveWindow(win, x, y) {
  if (!win || win.isDestroyed()) return;
  const prev = win.__descallMove;
  if (prev) clearInterval(prev);
  let from;
  try { from = win.getPosition(); } catch (_) { return; }
  const [fx, fy] = from;
  if (fx === x && fy === y) return;
  if (Math.abs(fx - x) > 400 || Math.abs(fy - y) > 600) {
    // Other monitor / first placement: jump, don't fly across screens.
    try { win.setPosition(x, y, false); } catch (_) { /* ignore */ }
    return;
  }
  const start = Date.now();
  const DURATION = 240;
  win.__descallMove = setInterval(() => {
    if (win.isDestroyed()) { clearInterval(win.__descallMove); return; }
    const t = Math.min(1, (Date.now() - start) / DURATION);
    // Critically damped feel: fast start, soft landing, no overshoot.
    const k = 1 - Math.pow(1 - t, 3);
    try {
      win.setPosition(Math.round(fx + (x - fx) * k), Math.round(fy + (y - fy) * k), false);
    } catch (_) { /* ignore */ }
    if (t >= 1) {
      clearInterval(win.__descallMove);
      win.__descallMove = null;
    }
  }, 16);
}

function repositionAll() {
  const area = getAnchorWorkArea();
  const live = activeNotifications.filter((e) => e.win && !e.win.isDestroyed());
  for (const { entry, x, y } of stackPositions(area, live)) moveWindow(entry.win, x, y);
}

/**
 * Show a custom always-on-top notification window.
 * @param {object}   opts
 * @param {string}   opts.title
 * @param {string}   opts.body
 * @param {'default'|'call'|'mention'} opts.type
 * @param {string|null} opts.avatarUrl
 * @param {boolean}  opts.appIcon     Concept 2 mark instead of a letter
 * @param {string|null} opts.from     person name used for the letter fallback
 * @param {number}   opts.duration    ms before auto-dismiss (0 = never)
 * @param {function} opts.onClick
 * @param {function} opts.onAccept
 * @param {function} opts.onDecline
 */
function showNotificationWindow({
  title, body, type = 'default', avatarUrl = null, appIcon = false, from = null,
  duration = DEFAULT_DURATION, onClick, onAccept, onDecline, count = 1,
} = {}) {
  const isCall = type === 'call';
  const winHeight = cardHeightFor(type);
  // No wall of toasts: keep at most MAX_VISIBLE on screen.
  for (const old of evictionsFor(activeNotifications)) {
    const close = closers.get(old.win);
    if (typeof close === 'function') close('external');
  }
  const area = getAnchorWorkArea();
  const probe = { type, height: winHeight };
  const planned = stackPositions(area, [...activeNotifications, probe]).find((p) => p.entry === probe);
  const { x, y } = planned;

  // Same contract as the splash: the OS must not paint a square behind the
  // rounded card. Window material and the OS shadow are that square.
  const winOptions = {
    width: NOTIF_WIDTH + SHADOW_PAD * 2,
    height: winHeight + SHADOW_PAD * 2,
    x,
    y,
    frame: false,
    thickFrame: false,
    transparent: true,
    backgroundColor: '#00000000',
    roundedCorners: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    focusable: isCall,
    show: false,
    fullscreenable: false,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      zoomFactor: 1,
      backgroundThrottling: false,
      preload: path.join(__dirname, 'notifPreload.cjs'),
    },
  };

  const win = new BrowserWindow(winOptions);
  notifWindows.add(win);
  try { win.setBackgroundColor('#00000000'); } catch (_) { /* ignore */ }
  try { win.setHasShadow(false); } catch (_) { /* ignore */ }

  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setAlwaysOnTop(true, 'screen-saver');

  const html = buildNotificationHtml({
    title,
    body,
    type,
    avatarUrl,
    appIcon,
    from,
    count,
    duration: isCall ? 0 : duration,
  });

  const tmpFile = path.join(os.tmpdir(), `descall-notif-${Date.now()}-${Math.random().toString(16).slice(2)}.html`);
  fs.writeFileSync(tmpFile, html, 'utf8');
  win.loadFile(tmpFile);

  let safetyTimer = null;
  let dismissed = false;
  let paused = false;
  let shown = false;
  let remaining = (!isCall && duration > 0) ? duration : 0;

  const clearSafety = () => {
    if (safetyTimer) {
      clearTimeout(safetyTimer);
      safetyTimer = null;
    }
  };

  const armSafety = () => {
    clearSafety();
    if (dismissed || paused || shown === false || !(remaining > 0)) return;
    safetyTimer = setTimeout(() => dismiss('timeout'), remaining + SAFETY_GRACE_MS);
  };

  const dismiss = (action) => {
    if (dismissed) return;
    dismissed = true;
    closers.delete(win);
    clearSafety();
    const idx = activeNotifications.findIndex((entry) => entry.win === win);
    if (idx !== -1) activeNotifications.splice(idx, 1);
    try { if (!win.isDestroyed()) win.close(); } catch (_) {}
    setTimeout(() => { try { fs.unlinkSync(tmpFile); } catch (_) {} }, 2000);
    repositionAll();
    if (action === 'click' && onClick) onClick();
    if (action === 'accept' && onAccept) onAccept();
    if (action === 'decline' && onDecline) onDecline();
  };

  const onIpc = (channel, handler) => {
    const listener = (event, ...args) => {
      if (event.sender.id !== win.webContents.id) return;
      handler(...args);
    };
    ipcMain.on(channel, listener);
    win.once('closed', () => ipcMain.off(channel, listener));
  };

  onIpc('notif:click', () => dismiss('click'));
  onIpc('notif:close', () => dismiss('close'));
  onIpc('notif:accept', () => dismiss('accept'));
  onIpc('notif:decline', () => dismiss('decline'));
  onIpc('notif:pause', () => {
    paused = true;
    clearSafety();
  });
  onIpc('notif:resume', (ms) => {
    paused = false;
    if (typeof ms === 'number' && Number.isFinite(ms)) remaining = Math.max(0, ms);
    armSafety();
  });
  closers.set(win, dismiss);
  updaters.set(win, (payload = {}) => {
    if (dismissed || win.isDestroyed()) return false;
    try { win.webContents.send('notif:update', payload); } catch (_) { return false; }
    if (!isCall && duration > 0) {
      remaining = duration;
      armSafety();
    }
    return true;
  });

  const reveal = () => {
    if (shown || dismissed) return;
    shown = true;
    try {
      if (win.isDestroyed()) return;
      win.showInactive();
      win.setAlwaysOnTop(true, 'screen-saver');
    } catch (_) { return; }
    activeNotifications.push({ win, type, height: winHeight });
    repositionAll();
    armSafety();
  };
  win.once('ready-to-show', reveal);
  const revealFallback = setTimeout(reveal, 1500);
  win.once('closed', () => clearTimeout(revealFallback));

  return win;
}

/** Close a toast without firing click / accept / decline. */
function closeShownNotification(win) {
  if (!win) return false;
  const dismiss = closers.get(win);
  if (typeof dismiss === 'function') {
    dismiss('external');
    return true;
  }
  try {
    if (!win.isDestroyed()) win.close();
  } catch (_) { /* ignore */ }
  return false;
}

/** Update a shown toast in place (grouping). Returns false if it is gone. */
function updateShownNotification(win, payload) {
  if (!win) return false;
  const update = updaters.get(win);
  return typeof update === 'function' ? update(payload) : false;
}

module.exports = {
  showNotificationWindow,
  closeShownNotification,
  updateShownNotification,
  stackPositions,
  evictionsFor,
  NOTIF_HEIGHT,
};
