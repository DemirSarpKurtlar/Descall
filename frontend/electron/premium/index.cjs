'use strict';

/**
 * Premium desktop feature loader. Every file in ./features exports { key, start(ctx), stop() }.
 * A feature starts only while the gate (gate.cjs) holds its key and stops as soon as the
 * key goes away. start() must be cheap: windows, timers and hotkeys are created only when
 * the user turns the feature on from the renderer (everything is off by default).
 *
 * Renderer bridge: window.descallPremium.invoke/on, channels prefixed "premium:" (preload.cjs).
 * Handlers registered through ctx.handle() accept the main window only, unless anySender.
 */

const { ipcMain, BrowserWindow, app, globalShortcut } = require('electron');
const fs = require('fs');
const path = require('path');
const gate = require('./gate.cjs');

const FEATURE_DIR = path.join(__dirname, 'features');
const modules = new Map(); // key -> module
const running = new Map(); // key -> ctx
const shared = new Map(); // cross-feature services (name -> object)
const trayItems = new Map(); // key -> [{ label, click, submenu }]
let host = null;
let started = false;

function log(...a) {
  try { host?.log?.info?.('[premium]', ...a); } catch (_) { /* ignore */ }
}

function mainWindow() {
  try {
    const w = host?.getMainWindow?.();
    return w && !w.isDestroyed() ? w : null;
  } catch (_) {
    return null;
  }
}

function isMainSender(event) {
  const w = mainWindow();
  return Boolean(w && event && event.sender === w.webContents);
}

function sendToRenderer(channel, payload) {
  const w = mainWindow();
  if (!w || !String(channel).startsWith('premium:')) return false;
  try { w.webContents.send(channel, payload); return true; } catch (_) { return false; }
}

function storeDir() {
  const dir = path.join(app.getPath('userData'), 'premium');
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) { /* ignore */ }
  return dir;
}

function jsonStore(name) {
  const file = path.join(storeDir(), `${String(name).replace(/[^a-z0-9_-]/gi, '')}.json`);
  return {
    file,
    read(fallback) {
      try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; }
    },
    write(value) {
      try { fs.writeFileSync(file, JSON.stringify(value)); return true; } catch (_) { return false; }
    },
  };
}

function makeCtx(key) {
  const channels = [];
  const listeners = [];
  const hotkeys = new Set();
  const ctx = {
    key,
    gate,
    log: (...a) => log(`[${key}]`, ...a),
    getMainWindow: mainWindow,
    isMainSender,
    sendToRenderer,
    store: jsonStore,
    storeDir,
    shared,
    host: () => host,
    handle(channel, fn, { anySender = false } = {}) {
      if (!channel.startsWith(`premium:${key}:`)) throw new Error(`channel ${channel} outside premium:${key}:`);
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, async (event, ...args) => {
        if (!anySender && !isMainSender(event)) return { ok: false, error: 'sender' };
        if (!gate.has(key)) return { ok: false, error: 'not_entitled' };
        return fn(event, ...args);
      });
      channels.push(channel);
    },
    on(channel, fn) {
      const h = (event, ...args) => { if (gate.has(key)) fn(event, ...args); };
      ipcMain.on(channel, h);
      listeners.push([channel, h]);
    },
    registerHotkey(accel, fn) {
      if (!accel) return false;
      try {
        if (hotkeys.has(accel)) globalShortcut.unregister(accel);
        const ok = globalShortcut.register(accel, () => { if (gate.has(key)) fn(); });
        if (ok) hotkeys.add(accel);
        return ok;
      } catch (_) {
        return false;
      }
    },
    unregisterHotkeys() {
      for (const a of hotkeys) { try { globalShortcut.unregister(a); } catch (_) { /* ignore */ } }
      hotkeys.clear();
    },
    setTrayItems(items) {
      if (items && items.length) trayItems.set(key, items);
      else trayItems.delete(key);
      try { host?.rebuildTray?.(); } catch (_) { /* ignore */ }
    },
    dispose() {
      for (const c of channels) ipcMain.removeHandler(c);
      for (const [c, h] of listeners) ipcMain.removeListener(c, h);
      ctx.unregisterHotkeys();
      if (trayItems.delete(key)) { try { host?.rebuildTray?.(); } catch (_) { /* ignore */ } }
    },
  };
  return ctx;
}

function loadModules() {
  if (modules.size) return;
  let files = [];
  try { files = fs.readdirSync(FEATURE_DIR).filter((f) => f.endsWith('.cjs') && !/\.(selftest|test)\./.test(f)); } catch (_) { files = []; }
  for (const f of files.sort()) {
    try {
      const mod = require(path.join(FEATURE_DIR, f));
      if (mod && typeof mod.key === 'string' && typeof mod.start === 'function' && typeof mod.stop === 'function') modules.set(mod.key, mod);
    } catch (err) {
      log(`feature ${f} failed to load: ${err?.message || err}`);
    }
  }
}

function sync() {
  for (const [key, mod] of modules) {
    const want = gate.has(key);
    if (want && !running.has(key)) {
      const ctx = makeCtx(key);
      running.set(key, ctx);
      try { mod.start(ctx); log(`started ${key}`); } catch (err) { log(`start ${key} failed: ${err?.message || err}`); }
    } else if (!want && running.has(key)) {
      const ctx = running.get(key);
      running.delete(key);
      try { mod.stop(); } catch (err) { log(`stop ${key} failed: ${err?.message || err}`); }
      ctx.dispose();
      log(`stopped ${key}`);
    }
  }
}

/**
 * Called once from main.cjs after the main window exists.
 * opts: { getMainWindow, log, rebuildTray, registerAppProtocolOn(session), mediaPermissions[] }
 */
function initPremium(opts = {}) {
  host = opts;
  if (started) return;
  started = true;
  loadModules();
  ipcMain.removeHandler('premium:entitlements');
  ipcMain.handle('premium:entitlements', (event, payload) => {
    if (!isMainSender(event)) return { ok: false, error: 'sender' };
    gate.setEntitlements(payload || {});
    return { ok: true, plan: gate.plan() };
  });
  ipcMain.removeHandler('premium:status');
  ipcMain.handle('premium:status', (event) => ({
    ok: true,
    plan: gate.plan(),
    main: isMainSender(event),
    running: [...running.keys()],
    available: [...modules.keys()],
  }));
  gate.onChange(sync);
  sync();
}

/** Extra tray menu items from running features (labels come localized from the renderer). */
function trayMenuItems() {
  const out = [];
  for (const items of trayItems.values()) out.push(...items);
  return out.length ? [{ type: 'separator' }, ...out] : [];
}

/** Token file for a non-default session (multi_account partitions), or null for the main one. */
function tokenFileForSender(sender) {
  const svc = shared.get('multi_account');
  if (!svc || !sender) return null;
  try { return svc.tokenFileForSession(sender.session); } catch (_) { return null; }
}

function stopAll() {
  for (const key of [...running.keys()]) {
    try { modules.get(key).stop(); } catch (_) { /* ignore */ }
    running.get(key).dispose();
    running.delete(key);
  }
}

module.exports = { initPremium, trayMenuItems, tokenFileForSender, stopAll, gate, _modules: modules, _running: running, _sync: sync, BrowserWindow };
