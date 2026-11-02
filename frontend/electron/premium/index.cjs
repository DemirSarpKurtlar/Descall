'use strict';

/**
 * Descall+ / Ultra desktop features, main process.
 *
 * Every file in ./features/<key>.cjs exports { key, start(ctx), stop() } and
 * is loaded here. A module starts only while the entitlement list from the
 * renderer (IPC `premium:entitlements`) includes its key, and stops when it
 * goes away. Each module also keeps itself idle until the user switches it
 * on in Settings, so free users and unused features cost nothing.
 *
 * ctx = { app, mainWindow(), gate, ipcMain, store, log } plus helpers:
 *   hotkeys  shared global hotkey manager (hotkeys.cjs)
 *   send     (channel, payload) to the main window, `premium:` channels only
 *   events   EventEmitter: 'voice-state', 'activity', 'settings'
 *   voice    last voice state from the renderer { inCall, muted, deafened, pinnedUserId }
 *   et       main-process i18n
 *
 * NOTE: the coordinator reconciles this loader with the shared copy on merge.
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const gate = require('./gate.cjs');
const { createStore } = require('./store.cjs');
const { createHotkeyManager } = require('./hotkeys.cjs');

const FEATURE_DIR = path.join(__dirname, 'features');
const modules = new Map();
const running = new Set();
let ctx = null;

function loadModules(dir = FEATURE_DIR, log = console) {
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.cjs') && !/\.(selftest|test)\./.test(f)); } catch (_) { files = []; }
  for (const file of files.sort()) {
    try {
      const mod = require(path.join(dir, file));
      if (mod && typeof mod.key === 'string' && typeof mod.start === 'function' && typeof mod.stop === 'function') {
        modules.set(mod.key, mod);
      }
    } catch (err) {
      // A broken module never takes the app down; it simply is not offered.
      log.warn('[premium] module failed to load', file, err?.message || err);
    }
  }
  return modules;
}

function reconcile() {
  if (!ctx) return;
  for (const [key, mod] of modules) {
    const want = gate.has(key);
    if (want && !running.has(key)) {
      try { mod.start(ctx); running.add(key); ctx.log.info('[premium] started', key); }
      catch (err) { ctx.log.warn('[premium] start failed', key, err?.message || err); }
    } else if (!want && running.has(key)) {
      try { mod.stop(); } catch (err) { ctx.log.warn('[premium] stop failed', key, err?.message || err); }
      running.delete(key);
      ctx.log.info('[premium] stopped', key);
    }
  }
  // custom_hotkeys changes which bindings apply.
  try { ctx.hotkeys.apply(); } catch (_) { /* ignore */ }
}

function initPremium({ app, ipcMain, getMainWindow, log = console, globalShortcut, et = (k) => k, userDataDir } = {}) {
  if (ctx) return ctx;
  const store = createStore({ dir: userDataDir || (app && app.getPath ? app.getPath('userData') : null) });
  const events = new EventEmitter();
  events.setMaxListeners(50);
  const mainWindow = () => {
    const w = typeof getMainWindow === 'function' ? getMainWindow() : null;
    return w && !w.isDestroyed() ? w : null;
  };
  const send = (channel, payload) => {
    if (typeof channel !== 'string' || !channel.startsWith('premium:')) return false;
    const w = mainWindow();
    if (!w) return false;
    try { w.webContents.send(channel, payload); return true; } catch (_) { return false; }
  };
  const hotkeys = createHotkeyManager({ globalShortcut, store, gate, log });
  ctx = {
    app,
    mainWindow,
    gate,
    ipcMain,
    store,
    log,
    hotkeys,
    send,
    events,
    et,
    voice: { inCall: false, muted: false, deafened: false, pinnedUserId: null },
    activity: { appType: null, appName: null },
  };

  loadModules(FEATURE_DIR, log);

  const fromMain = (event) => {
    const w = mainWindow();
    return Boolean(w && event && event.sender === w.webContents);
  };

  ipcMain.handle('premium:entitlements', (event, payload = {}) => {
    if (!fromMain(event)) return { ok: false };
    gate.setEntitlements(payload.keys, payload.plan);
    return { ok: true, plan: gate.plan() };
  });

  ipcMain.handle('premium:settings:get', (event, key) => {
    if (!fromMain(event)) return {};
    return store.get(String(key || ''));
  });

  ipcMain.handle('premium:settings:set', (event, payload = {}) => {
    if (!fromMain(event)) return { ok: false, error: 'sender' };
    const key = String(payload.key || '');
    if (!gate.has(key)) return { ok: false, error: 'not_entitled' };
    const value = store.set(key, payload.value);
    events.emit('settings', key, value);
    return { ok: true, value };
  });

  ipcMain.handle('premium:status', (event) => {
    if (!fromMain(event)) return null;
    const features = {};
    for (const [key, mod] of modules) {
      let info = null;
      try { info = typeof mod.status === 'function' ? mod.status() : null; } catch (_) { info = null; }
      features[key] = { running: running.has(key), ...(info || {}) };
    }
    return { plan: gate.plan(), features, hotkeys: hotkeys.status() };
  });

  ipcMain.handle('premium:call', async (event, payload = {}) => {
    if (!fromMain(event)) return { ok: false, error: 'sender' };
    const key = String(payload.key || '');
    const mod = modules.get(key);
    if (!mod || !running.has(key) || typeof mod.call !== 'function') return { ok: false, error: 'unavailable' };
    try {
      return await mod.call(String(payload.method || ''), payload.args);
    } catch (err) {
      return { ok: false, error: String(err?.message || err).slice(0, 200) };
    }
  });

  ipcMain.on('premium:voice-state', (event, state = {}) => {
    if (!fromMain(event)) return;
    const next = {
      inCall: Boolean(state.inCall),
      muted: Boolean(state.muted),
      deafened: Boolean(state.deafened),
      pinnedUserId: state.pinnedUserId ? String(state.pinnedUserId).slice(0, 64) : null,
      sharing: Boolean(state.sharing),
    };
    const changed = JSON.stringify(next) !== JSON.stringify(ctx.voice);
    ctx.voice = next;
    if (changed) events.emit('voice-state', next);
  });

  ipcMain.on('premium:activity', (event, state = {}) => {
    if (!fromMain(event)) return;
    ctx.activity = {
      appType: typeof state.appType === 'string' ? state.appType.slice(0, 32) : null,
      appName: typeof state.appName === 'string' ? state.appName.slice(0, 128) : null,
    };
    events.emit('activity', ctx.activity);
  });

  gate.onChange(() => reconcile());
  reconcile();
  return ctx;
}

/** Extra tray menu entries from running modules (each returns MenuItem templates). */
function premiumTrayItems() {
  const out = [];
  for (const key of running) {
    const mod = modules.get(key);
    if (typeof mod?.trayItems !== 'function') continue;
    try {
      const items = mod.trayItems();
      if (Array.isArray(items) && items.length) out.push(...items);
    } catch (_) { /* ignore */ }
  }
  return out.length ? [{ type: 'separator' }, ...out] : [];
}

/**
 * Notification pipeline hook (main.cjs showAppNotification). Running modules
 * may drop, defer or decorate a toast. Returns the (possibly changed) payload,
 * or null to skip showing it.
 */
function premiumNotificationHook(payload) {
  let current = payload;
  for (const key of running) {
    const mod = modules.get(key);
    if (typeof mod?.filterNotification !== 'function') continue;
    try {
      const next = mod.filterNotification(current, ctx);
      if (next === null) return null;
      if (next && typeof next === 'object') current = next;
    } catch (_) { /* a failing module never blocks notifications */ }
  }
  return current;
}

function stopAll() {
  for (const key of [...running]) {
    try { modules.get(key)?.stop(); } catch (_) { /* ignore */ }
    running.delete(key);
  }
  try { ctx?.hotkeys.dispose(); } catch (_) { /* ignore */ }
  try { ctx?.store.flush(); } catch (_) { /* ignore */ }
}

module.exports = {
  initPremium,
  premiumTrayItems,
  premiumNotificationHook,
  stopAll,
  loadModules,
  _modules: modules,
  _running: running,
  _ctx: () => ctx,
};
