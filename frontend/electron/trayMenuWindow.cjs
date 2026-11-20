'use strict';

/**
 * Tray panel window (owner pick, draft B "Gelismis menu"). A frameless, transparent,
 * always-on-top window that opens above the tray icon on right click and shows
 * dist/tray-menu/tray-menu.html. The page talks through trayMenuPreload.cjs only
 * (getState / onState / act); every action is checked with trayMenuModel.validateAction.
 *
 * The window is shown only after the page acknowledged the state it was given, so a page
 * that failed to load or crashed never shows as an empty box: the caller pops the old
 * native menu instead (onFail), and right click keeps using the native menu for a while.
 * The window is created on first use (or when the pointer enters the tray icon) and is
 * destroyed after a few idle minutes to free its renderer.
 */

const { BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const { PANEL, placePanel, validateAction, serializeMenuTemplate } = require('./trayMenuModel.cjs');

const ACK_TIMEOUT_WARM_MS = 1500;
const ACK_TIMEOUT_COLD_MS = 6000;
const NATIVE_AFTER_FAIL_MS = 10 * 60 * 1000;
const IDLE_DESTROY_MS = 5 * 60 * 1000;
// The click on the tray icon that blurred the panel must close it, not reopen it.
const REOPEN_GUARD_MS = 300;

/**
 * opts: url, isDev, log,
 *   shellState(): { lang, strings, app, shell } (shell: version, updateVersion, autostart,
 *     autostartKey, snoozeUntil),
 *   premiumTemplate(): Descall+ Menu template items,
 *   onAction(validated): runs shell and app actions (not ack / close / premium),
 *   onFail(): pop the native menu now.
 */
function createTrayPanel(opts) {
  const log = opts.log || console;
  let win = null;
  let loaded = false;
  let seq = 0;
  let openSeq = 0;
  let pendingSeq = null;
  let ackTimer = null;
  let idleTimer = null;
  let failedUntil = 0;
  let hadFocus = false;
  let hiddenAt = 0;
  let placement = null;
  let lastState = null;
  let premium = { items: [], handlers: new Map() };
  let premiumIds = new Set();

  const alive = () => Boolean(win && !win.isDestroyed());
  const visible = () => alive() && win.isVisible();

  function buildState() {
    const s = opts.shellState();
    try {
      premium = serializeMenuTemplate(opts.premiumTemplate());
    } catch (err) {
      log.warn('[tray-menu] Descall+ entries failed:', err?.message || err);
      premium = { items: [], handlers: new Map() };
    }
    premiumIds = new Set(premium.handlers.keys());
    seq += 1;
    const p = placement || { cardLeft: PANEL.pad, vertical: 'bottom', flyout: 'left' };
    lastState = {
      seq,
      openSeq,
      lang: s.lang,
      strings: s.strings,
      app: s.app,
      shell: s.shell,
      premium: premium.items,
      placement: { cardLeft: p.cardLeft, vertical: p.vertical, flyout: p.flyout, pad: PANEL.pad, gap: PANEL.gap, card: PANEL.card, flyoutWidth: PANEL.flyout },
    };
    return lastState;
  }

  function send(state) {
    if (!alive() || !loaded) return;
    try { win.webContents.send('tray-menu:state', state); } catch (_) { /* renderer gone */ }
  }

  function clearAck() {
    if (ackTimer) clearTimeout(ackTimer);
    ackTimer = null;
  }

  function scheduleIdleDestroy() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idleTimer = null;
      if (alive() && !win.isVisible() && pendingSeq === null) destroy();
    }, IDLE_DESTROY_MS);
  }

  function destroy() {
    clearAck();
    pendingSeq = null;
    if (alive()) {
      try { win.destroy(); } catch (_) { /* gone */ }
    }
    win = null;
    loaded = false;
  }

  function fail(reason) {
    const wasOpening = pendingSeq !== null || visible();
    log.warn(`[tray-menu] panel failed (${reason})${wasOpening ? ', native menu for now' : ''}`);
    destroy();
    if (!wasOpening) return;
    failedUntil = Date.now() + NATIVE_AFTER_FAIL_MS;
    try { opts.onFail(); } catch (err) { log.warn('[tray-menu] native fallback failed:', err?.message || err); }
  }

  function isPanelSender(event) {
    return alive() && event && event.sender === win.webContents && (!event.senderFrame || event.senderFrame === win.webContents.mainFrame);
  }

  function ensureWindow() {
    if (alive()) return win;
    loaded = false;
    win = new BrowserWindow({
      width: PANEL.pad * 2 + PANEL.card + PANEL.gap + PANEL.flyout,
      height: PANEL.maxHeight,
      show: false,
      frame: false,
      thickFrame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      roundedCorners: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      title: 'Descall',
      webPreferences: {
        preload: path.join(__dirname, 'trayMenuPreload.cjs'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        spellcheck: false,
        devTools: Boolean(opts.isDev),
      },
    });
    const w = win;
    try { w.setAlwaysOnTop(true, 'pop-up-menu'); } catch (_) { /* ignore */ }
    try { w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); } catch (_) { /* ignore */ }
    const wc = w.webContents;
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    wc.on('will-navigate', (e) => e.preventDefault());
    wc.on('did-finish-load', () => { if (w === win) loaded = true; });
    wc.on('did-fail-load', (_e, code, desc, _url, isMainFrame) => {
      if (isMainFrame && w === win) fail(`load ${code} ${desc}`);
    });
    wc.on('render-process-gone', (_e, details) => { if (w === win) fail(`renderer ${details?.reason || 'gone'}`); });
    wc.on('unresponsive', () => { if (w === win) fail('unresponsive'); });
    wc.on('preload-error', (_e, _p, err) => { if (w === win) fail(`preload ${err?.message || err}`); });
    w.on('focus', () => { hadFocus = true; });
    w.on('blur', () => { if (w === win && hadFocus) hide('blur'); });
    w.on('closed', () => {
      if (w === win) {
        win = null;
        loaded = false;
      }
    });
    w.loadURL(opts.url).catch((err) => { if (w === win) fail(`load ${err?.message || err}`); });
    return w;
  }

  function reveal() {
    clearAck();
    pendingSeq = null;
    if (!alive()) return;
    try { win.setAlwaysOnTop(true, 'pop-up-menu'); } catch (_) { /* ignore */ }
    try { win.show(); } catch (_) { /* ignore */ }
    try { win.moveTop(); } catch (_) { /* ignore */ }
    try { win.focus(); } catch (_) { /* ignore */ }
  }

  function hide(why) {
    clearAck();
    pendingSeq = null;
    if (!alive()) return;
    if (win.isVisible()) {
      hiddenAt = Date.now();
      try { win.hide(); } catch (_) { /* ignore */ }
      if (why && why !== 'blur') log.info?.(`[tray-menu] closed (${why})`);
    }
    hadFocus = false;
    scheduleIdleDestroy();
  }

  function trayRect(bounds) {
    const b = bounds || {};
    if (Number(b.width) > 0 && Number(b.height) > 0) return { x: b.x, y: b.y, width: b.width, height: b.height };
    const p = screen.getCursorScreenPoint();
    return { x: p.x, y: p.y, width: 1, height: 1 };
  }

  /** Right click on the tray icon. False: use the native menu instead. */
  function open(bounds) {
    if (Date.now() < failedUntil) return false;
    if (visible() || pendingSeq !== null) {
      hide('toggle');
      return true;
    }
    if (Date.now() - hiddenAt < REOPEN_GUARD_MS) return true;
    try {
      const tray = trayRect(bounds);
      const display = screen.getDisplayNearestPoint({ x: Math.round(tray.x + tray.width / 2), y: Math.round(tray.y + tray.height / 2) });
      placement = placePanel({ tray, work: display.workArea });
      const cold = !alive();
      const w = ensureWindow();
      if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
      w.setBounds({ x: placement.x, y: placement.y, width: placement.width, height: placement.height });
      openSeq += 1;
      hadFocus = false;
      const state = buildState();
      pendingSeq = state.seq;
      send(state);
      clearAck();
      ackTimer = setTimeout(() => fail('no answer from the page'), cold ? ACK_TIMEOUT_COLD_MS : ACK_TIMEOUT_WARM_MS);
      return true;
    } catch (err) {
      log.warn('[tray-menu] open failed:', err?.message || err);
      destroy();
      failedUntil = Date.now() + NATIVE_AFTER_FAIL_MS;
      return false;
    }
  }

  /** Something the panel shows changed (app state, update, language, Descall+ entries). */
  function refresh() {
    if (!alive() || !loaded) return;
    if (!win.isVisible() && pendingSeq === null) return;
    send(buildState());
  }

  /** Load the page ahead of the first right click (pointer over the tray icon). */
  function warm() {
    if (Date.now() < failedUntil || alive()) return;
    try {
      ensureWindow();
      scheduleIdleDestroy();
    } catch (err) {
      log.warn('[tray-menu] warm-up failed:', err?.message || err);
    }
  }

  function getState(event) {
    if (!isPanelSender(event)) throw new Error('E_UNTRUSTED_SENDER');
    return lastState || buildState();
  }

  function act(event, msg) {
    if (!isPanelSender(event)) return;
    const v = validateAction(msg, { premiumIds });
    if (!v) {
      log.warn('[tray-menu] refused action:', String(msg?.action || '').slice(0, 32));
      return;
    }
    if (v.action === 'ack') {
      if (pendingSeq !== null && v.arg >= pendingSeq) reveal();
      return;
    }
    if (v.action === 'close') {
      hide('close');
      return;
    }
    if (v.action === 'premium') {
      const h = premium.handlers.get(v.arg);
      hide('premium');
      try { h?.click?.({ checked: h.type === 'item' ? false : !h.checked }, undefined, {}); } catch (err) {
        log.warn('[tray-menu] Descall+ entry failed:', err?.message || err);
      }
      return;
    }
    if (v.closes) hide(v.action);
    try { opts.onAction(v); } catch (err) { log.warn(`[tray-menu] ${v.action} failed:`, err?.message || err); }
  }

  const panel = {
    open,
    hide: () => hide('external'),
    refresh,
    warm,
    destroy,
    isVisible: visible,
    // IPC routing (registerIpc): only the panel that owns the sender answers.
    owns: (event) => isPanelSender(event),
    getState,
    act,
  };
  panels.add(panel);
  registerIpc();
  return panel;
}

/** The panel IPC channels, registered once and routed to the panel that owns the sender. */
const panels = new Set();
let ipcRegistered = false;
function registerIpc() {
  if (ipcRegistered) return;
  ipcRegistered = true;
  ipcMain.handle('tray-menu:get-state', (event) => {
    for (const p of panels) if (p.owns(event)) return p.getState(event);
    throw new Error('E_UNTRUSTED_SENDER');
  });
  ipcMain.on('tray-menu:act', (event, msg) => {
    for (const p of panels) if (p.owns(event)) return p.act(event, msg);
    return undefined;
  });
}

module.exports = { createTrayPanel };
