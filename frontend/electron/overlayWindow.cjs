'use strict';

/**
 * Always-on-top mini voice overlay (Discord-style "always-on voice" surface).
 * Shows current voice status (channel/call name) plus mute / deafen / leave
 * controls that round-trip through IPC back to the renderer.
 */

const { BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

const { buildOverlayHtml, OVERLAY_WIDTH, OVERLAY_HEIGHT } = require('./overlayHtml.cjs');
const OVERLAY_MARGIN = 16;

let overlayWin  = null;
let overlayFile = null;
let currentState = { title: '', muted: false, deafened: false, connected: false, pending: false, kind: 'dm', since: 0, lang: 'tr', avatarUrl: '', brandRgb: '' };

function getDefaultPosition() {
  try {
    const display = screen.getPrimaryDisplay();
    const { width } = display.workAreaSize;
    // The window carries a transparent shadow margin around the card; keep the card itself 16px from the edge.
    return { x: Math.max(0, width - OVERLAY_WIDTH - OVERLAY_MARGIN + 14), y: Math.max(0, OVERLAY_MARGIN - 14) };
  } catch (_) {
    return { x: 100, y: 100 };
  }
}

// Markup lives in overlayHtml.cjs (2.11.8 Liquid Glass card; selftested without electron).
const buildHtml = buildOverlayHtml;

function ensureOverlayWindow() {
  if (overlayWin && !overlayWin.isDestroyed()) return overlayWin;

  const { x, y } = getDefaultPosition();
  overlayWin = new BrowserWindow({
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT,
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
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    movable: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'overlayPreload.cjs'),
    },
  });

  try {
    overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } catch (_) { /* ignore */ }
  try { overlayWin.setBackgroundColor('#00000000'); } catch (_) { /* ignore */ }
  try { overlayWin.setHasShadow(false); } catch (_) { /* ignore */ }
  overlayWin.setAlwaysOnTop(true, 'screen-saver');

  overlayFile = path.join(os.tmpdir(), `descall-overlay-${Date.now()}.html`);
  fs.writeFileSync(overlayFile, buildHtml(), 'utf8');
  overlayWin.loadFile(overlayFile).catch(() => {});

  overlayWin.once('closed', () => {
    overlayWin = null;
    if (overlayFile) {
      try { fs.unlinkSync(overlayFile); } catch (_) { /* ignore */ }
      overlayFile = null;
    }
  });

  return overlayWin;
}

function pushState() {
  if (!overlayWin || overlayWin.isDestroyed()) return;
  try {
    const js = `window.__overlayUpdate && window.__overlayUpdate(${JSON.stringify(currentState)});`;
    overlayWin.webContents.executeJavaScript(js, true).catch(() => {});
  } catch (_) { /* ignore */ }
}

function showOverlayWindow(payload = {}) {
  currentState = { ...currentState, ...payload, connected: true };
  const win = ensureOverlayWindow();

  const reveal = () => {
    if (win.isDestroyed()) return;
    if (!win.isVisible()) win.showInactive();
    pushState();
  };

  if (win.webContents.isLoadingMainFrame()) {
    win.webContents.once('did-finish-load', reveal);
  } else {
    reveal();
  }
}

function updateOverlayWindow(payload = {}) {
  currentState = { ...currentState, ...payload };
  if (!overlayWin || overlayWin.isDestroyed() || !overlayWin.isVisible()) return;
  pushState();
}

function hideOverlayWindow() {
  currentState = { ...currentState, connected: false };
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.hide();
  }
}

function destroyOverlayWindow() {
  if (overlayWin && !overlayWin.isDestroyed()) {
    try { overlayWin.close(); } catch (_) { /* ignore */ }
  }
  overlayWin = null;
}

function isOverlayWindowVisible() {
  return Boolean(overlayWin && !overlayWin.isDestroyed() && overlayWin.isVisible());
}

/**
 * Wires the descall:overlay:* IPC channels. `getMainWindow` is a lazy
 * accessor so this can be registered before the main window is created.
 */
function registerOverlayIPC(getMainWindow) {
  ipcMain.on('descall:overlay:show', (_event, payload) => showOverlayWindow(payload));
  ipcMain.on('descall:overlay:hide', () => hideOverlayWindow());
  ipcMain.on('descall:overlay:update', (_event, payload) => updateOverlayWindow(payload));
  ipcMain.on('descall:overlay:action', (_event, action) => {
    const mainWindow = typeof getMainWindow === 'function' ? getMainWindow() : null;
    mainWindow?.webContents?.send('descall:overlay:action', action);
  });
}

module.exports = {
  showOverlayWindow,
  hideOverlayWindow,
  updateOverlayWindow,
  destroyOverlayWindow,
  isOverlayWindowVisible,
  registerOverlayIPC,
};
