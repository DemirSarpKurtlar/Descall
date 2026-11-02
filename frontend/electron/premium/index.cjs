'use strict';

/**
 * Descall+ desktop feature host (main process).
 *
 * - Loads every module in ./features/*.cjs. A module exports
 *     { key, start(ctx), stop(), defaultEnabled? }
 *   and runs only while gate.has(key) AND its "enabled" setting is not false
 *   (defaultEnabled, true when omitted). Losing access or switching it off stops it.
 * - ctx = { app, mainWindow(), gate, ipcMain, store, log,
 *           handle(channel, fn, { from }), send(channel, ...args), bus, state,
 *           windows, onWindowOpen(fn), onDidCreateWindow(fn), setTrayItems(fn), refreshTray(),
 *           appUrl(route), preload, icon, isDev, settings() }
 *   handle/onWindowOpen/onDidCreateWindow/setTrayItems registrations are dropped on stop().
 * - Settings: userData/premium-settings.json (store.cjs).
 * - Renderer bridge: preload exposes window.descallPremium.invoke/on for 'premium:*' only.
 *
 * main.cjs wires it with: init(), windowOpen(), didCreateWindow(), trayMenuItems(),
 * isAuxWindow() and flush() (see the "Descall+" lines there).
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const gate = require('./gate.cjs');
const { createStore } = require('./store.cjs');
const { TIERS } = require('./featureTiers.cjs');

const FEATURE_DIR = path.join(__dirname, 'features');
const DEFAULT_API = 'https://des-call.onrender.com';

let electron = null;
let opts = null;
let store = null;
let log = console;
const bus = new EventEmitter();
bus.setMaxListeners(50);
const state = { call: { active: false }, app: { unread: 0 } };
const modules = [];
const running = new Map(); // key -> registrations
const channels = new Map(); // channel -> { owner, fn, from }
const registeredChannels = new Set();
const auxWindows = new Map(); // webContents.id -> { win, kind, key, meta }

function mainWindow() {
  try {
    const w = opts?.getMainWindow?.();
    return w && !w.isDestroyed() ? w : null;
  } catch (_) {
    return null;
  }
}

function send(channel, ...args) {
  const w = mainWindow();
  if (!w || !String(channel).startsWith('premium:')) return false;
  try { w.webContents.send(channel, ...args); return true; } catch (_) { return false; }
}

/** Sender check: 'main' = the main app window only; 'app' = main or a tracked Descall+ window. */
function senderAllowed(event, from) {
  const w = mainWindow();
  const wc = event?.sender;
  if (!wc) return false;
  if (w && wc === w.webContents) return true;
  if (from === 'app') return auxWindows.has(wc.id);
  return false;
}

function dispatcher(channel) {
  return async (event, ...args) => {
    const entry = channels.get(channel);
    if (!entry) return { ok: false, error: 'locked' };
    if (!senderAllowed(event, entry.from)) return { ok: false, error: 'forbidden' };
    return entry.fn(...args, event);
  };
}

function registerChannel(owner, channel, fn, { from = 'main' } = {}) {
  if (!String(channel).startsWith('premium:')) throw new Error(`premium channel expected: ${channel}`);
  channels.set(channel, { owner, fn, from });
  if (!registeredChannels.has(channel)) {
    registeredChannels.add(channel);
    electron.ipcMain.handle(channel, dispatcher(channel));
  }
}

function dropOwner(owner) {
  for (const [ch, entry] of channels) if (entry.owner === owner) channels.delete(ch);
}

// ---- aux window registry ---------------------------------------------------------------

const windows = {
  track(win, { kind, key, meta = {} } = {}) {
    if (!win || win.isDestroyed()) return;
    const id = win.webContents.id;
    auxWindows.set(id, { win, kind, key, meta });
    bus.emit('window-opened', { win, kind, key, meta });
    win.once('closed', () => {
      auxWindows.delete(id);
      bus.emit('window-closed', { kind, key, meta });
    });
  },
  list(kind) {
    return [...auxWindows.values()].filter((e) => !e.win.isDestroyed() && (!kind || e.kind === kind));
  },
  find(kind, pred = () => true) {
    return windows.list(kind).find(pred) || null;
  },
  isAux(wc) {
    return Boolean(wc && auxWindows.has(wc.id));
  },
  entry(win) {
    return win && !win.isDestroyed() ? auxWindows.get(win.webContents.id) || null : null;
  },
};

// ---- token + server check --------------------------------------------------------------

function readToken() {
  try {
    const file = opts?.tokenFile?.();
    if (!file || !fs.existsSync(file)) return '';
    const buf = fs.readFileSync(file);
    const { safeStorage } = electron;
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8');
  } catch (err) {
    log.warn('[premium] token read failed:', err?.message || err);
    return '';
  }
}

function apiBase() {
  const env = String(process.env.DESCALL_API_URL || '').trim().replace(/\/$/, '');
  return /^https:\/\//.test(env) ? env : DEFAULT_API;
}

async function fetchMe() {
  const token = readToken();
  if (!token) {
    const err = new Error('no token');
    err.code = 'no-token';
    throw err;
  }
  const res = await electron.net.fetch(`${apiBase()}/api/premium/me`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// ---- module lifecycle ------------------------------------------------------------------

function enabledFor(mod) {
  const v = store.get(`features.${mod.key}.enabled`, undefined);
  if (typeof v === 'boolean') return v;
  return mod.defaultEnabled !== false;
}

function makeCtx(mod) {
  const reg = { windowOpen: [], didCreate: [], tray: null };
  running.set(mod.key, reg);
  return {
    key: mod.key,
    app: electron.app,
    mainWindow,
    gate,
    ipcMain: electron.ipcMain,
    store,
    log,
    bus,
    state,
    windows,
    isDev: Boolean(opts.isDev),
    preload: opts.preloadPath,
    icon: opts.iconPath,
    appUrl: (route) => opts.appUrl(route),
    settings: () => ({ ...store.feature(mod.key) }),
    showMain,
    handle: (channel, fn, o) => registerChannel(mod.key, channel, fn, o),
    send,
    onWindowOpen: (fn) => { reg.windowOpen.push(fn); },
    onDidCreateWindow: (fn) => { reg.didCreate.push(fn); },
    setTrayItems: (fn) => { reg.tray = fn; refreshTray(); },
    refreshTray,
  };
}

function startModule(mod) {
  if (running.has(mod.key)) return;
  try {
    mod.start(makeCtx(mod));
    log.info(`[premium] started ${mod.key}`);
  } catch (err) {
    log.error(`[premium] ${mod.key} failed to start:`, err?.stack || err);
    stopModule(mod);
  }
  bus.emit('modules-changed');
}

function stopModule(mod) {
  if (!running.has(mod.key)) return;
  const reg = running.get(mod.key);
  running.delete(mod.key);
  dropOwner(mod.key);
  try { mod.stop(); } catch (err) { log.warn(`[premium] ${mod.key} stop failed:`, err?.message || err); }
  if (reg?.tray) refreshTray();
  log.info(`[premium] stopped ${mod.key}`);
  bus.emit('modules-changed');
}

function reconcile() {
  for (const mod of modules) {
    const want = gate.has(mod.key) && enabledFor(mod);
    if (want) startModule(mod);
    else stopModule(mod);
  }
}

function loadModules() {
  let files = [];
  try {
    files = fs.readdirSync(FEATURE_DIR).filter((f) => f.endsWith('.cjs') && !/\.(selftest|test)\.cjs$/.test(f)).sort();
  } catch (_) {
    files = [];
  }
  for (const f of files) {
    try {
      const mod = require(path.join(FEATURE_DIR, f));
      if (!mod || typeof mod.key !== 'string' || typeof mod.start !== 'function' || typeof mod.stop !== 'function') {
        log.warn(`[premium] ${f} is not a feature module, skipped`);
        continue;
      }
      if (modules.some((m) => m.key === mod.key)) {
        log.warn(`[premium] duplicate module key ${mod.key} in ${f}, skipped`);
        continue;
      }
      modules.push(mod);
    } catch (err) {
      log.error(`[premium] could not load ${f}:`, err?.stack || err);
    }
  }
}

function showMain() {
  try {
    if (opts?.showMain) return opts.showMain();
    const w = mainWindow();
    if (!w) return undefined;
    if (w.isMinimized()) w.restore();
    w.show();
    w.focus();
  } catch (_) { /* ignore */ }
  return undefined;
}

function refreshTray() {
  try { opts?.rebuildTray?.(); } catch (_) { /* ignore */ }
}

// ---- core IPC --------------------------------------------------------------------------

const SETTINGS_KEY = /^[a-z][a-z0-9_]{1,40}$/;

function registerCore() {
  registerChannel('core', 'premium:entitlements', (payload = {}) => {
    const snap = gate.setEntitlements(Array.isArray(payload.keys) ? payload.keys : [], payload.plan || null);
    return { ok: true, ...snap };
  });
  registerChannel('core', 'premium:status', () => ({
    ok: true,
    ...gate.snapshot(),
    running: [...running.keys()],
    modules: modules.map((m) => m.key),
    platform: process.platform,
  }), { from: 'app' });
  registerChannel('core', 'premium:settings:get', (key) => {
    if (key == null) return { ok: true, features: store.get('features', {}) };
    if (!SETTINGS_KEY.test(String(key))) return { ok: false, error: 'bad-key' };
    return { ok: true, settings: store.feature(String(key)) };
  }, { from: 'app' });
  registerChannel('core', 'premium:settings:set', (key, patch) => {
    const k = String(key || '');
    if (!SETTINGS_KEY.test(k) || !Object.prototype.hasOwnProperty.call(TIERS, k)) return { ok: false, error: 'bad-key' };
    const text = JSON.stringify(patch || {});
    if (text.length > 16 * 1024) return { ok: false, error: 'too-large' };
    const next = store.patchFeature(k, JSON.parse(text));
    bus.emit('settings', k, next);
    send('premium:settings-changed', { key: k, settings: next });
    return { ok: true, settings: next };
  });
  registerChannel('core', 'premium:focus-main', () => {
    showMain();
    return { ok: true };
  }, { from: 'app' });
  registerChannel('core', 'premium:call-state', (snap = {}) => {
    state.call = {
      active: Boolean(snap.active),
      title: String(snap.title || '').slice(0, 120),
      muted: Boolean(snap.muted),
      deafened: Boolean(snap.deafened),
      pending: Boolean(snap.pending),
      kind: String(snap.kind || '').slice(0, 16),
      since: Number(snap.since) || 0,
    };
    bus.emit('call', state.call);
    return { ok: true };
  });
  registerChannel('core', 'premium:app-state', (snap = {}) => {
    state.app = {
      unread: Math.max(0, Math.min(99999, Number(snap.unread) || 0)),
      status: String(snap.status || '').slice(0, 16),
      ready: true,
    };
    bus.emit('app', state.app);
    return { ok: true };
  });
}

// ---- public API ------------------------------------------------------------------------

/**
 * @param {object} o
 * @param {object} o.electron   the electron module
 * @param {() => BrowserWindow|null} o.getMainWindow
 * @param {(route:string) => string} o.appUrl   app document URL for a route
 * @param {() => string} o.tokenFile            path of auth-token.bin
 */
function init(o) {
  if (opts) return api;
  opts = o;
  electron = o.electron;
  log = o.log || console;
  store = createStore(path.join(electron.app.getPath('userData'), 'premium-settings.json'), { log });
  gate.configure({ fetchMe, log });
  registerCore();
  loadModules();
  gate.onChange(() => reconcile());
  store.onChange((p) => { if (/^features\.[a-z0-9_]+(\.enabled)?$/.test(p)) reconcile(); });
  log.info(`[premium] host ready: ${modules.length} desktop modules`);
  return api;
}

/** setWindowOpenHandler hook: a module's answer, or null to fall through. */
function windowOpen(details) {
  for (const reg of running.values()) {
    for (const fn of reg.windowOpen) {
      try {
        const r = fn(details);
        if (r) return r;
      } catch (err) {
        log.warn('[premium] windowOpen hook failed:', err?.message || err);
      }
    }
  }
  return null;
}

function didCreateWindow(win, details) {
  for (const reg of running.values()) {
    for (const fn of reg.didCreate) {
      try {
        if (fn(win, details)) return true;
      } catch (err) {
        log.warn('[premium] didCreateWindow hook failed:', err?.message || err);
      }
    }
  }
  return false;
}

/** Extra tray menu entries from running modules (Menu template items). */
function trayMenuItems() {
  const items = [];
  for (const reg of running.values()) {
    if (!reg.tray) continue;
    try {
      const add = reg.tray() || [];
      if (add.length) items.push(...add);
    } catch (err) {
      log.warn('[premium] tray items failed:', err?.message || err);
    }
  }
  return items.length ? [...items, { type: 'separator' }] : [];
}

function isAuxWindow(webContents) {
  return windows.isAux(webContents);
}

function flush() {
  bus.emit('before-quit');
  try { store?.flush(); } catch (_) { /* ignore */ }
}

const api = {
  init,
  windowOpen,
  didCreateWindow,
  trayMenuItems,
  isAuxWindow,
  flush,
  gate,
  bus,
  state,
  windows,
  get store() { return store; },
  runningKeys: () => [...running.keys()],
  __reconcile: reconcile,
};

module.exports = api;
