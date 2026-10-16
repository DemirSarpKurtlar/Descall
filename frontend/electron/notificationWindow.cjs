'use strict';

const { BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  NOTIF_WIDTH,
  NOTIF_HEIGHT,
  SHADOW_PAD,
  buildNotificationHtml,
  cardHeightFor,
} = require('./notificationCard.cjs');

const NOTIF_MARGIN = 12;
const DEFAULT_DURATION = 5000;
const SAFETY_GRACE_MS = 1500;

const activeNotifications = [];
const closers = new WeakMap();

function getAnchorWorkArea() {
  const wins = BrowserWindow.getAllWindows().filter((w) => {
    try { return w && !w.isDestroyed() && w.isVisible() && !w.isAlwaysOnTop(); }
    catch (_) { return false; }
  });
  const display = wins.length
    ? screen.getDisplayMatching(wins[0].getBounds())
    : screen.getPrimaryDisplay();
  return display.workArea;
}

function windowOrigin(area, cardY) {
  return {
    x: Math.round(area.x + area.width - NOTIF_WIDTH - NOTIF_MARGIN - SHADOW_PAD),
    y: Math.round(cardY - SHADOW_PAD),
  };
}

function repositionAll() {
  const area = getAnchorWorkArea();
  let cardY = area.y + NOTIF_MARGIN;
  activeNotifications.forEach((entry) => {
    const { win, height } = entry;
    if (!win || win.isDestroyed()) return;
    const { x, y } = windowOrigin(area, cardY);
    win.setPosition(x, y, true);
    cardY += height + NOTIF_MARGIN;
  });
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
  duration = DEFAULT_DURATION, onClick, onAccept, onDecline,
} = {}) {
  const isCall = type === 'call';
  const winHeight = cardHeightFor(type);
  const area = getAnchorWorkArea();
  const stackOffset = activeNotifications.reduce((sum, entry) => sum + entry.height + NOTIF_MARGIN, 0);
  const cardY = area.y + NOTIF_MARGIN + stackOffset;
  const { x, y } = windowOrigin(area, cardY);

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
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'notifPreload.cjs'),
    },
  };

  const win = new BrowserWindow(winOptions);
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

module.exports = { showNotificationWindow, closeShownNotification, NOTIF_HEIGHT };
