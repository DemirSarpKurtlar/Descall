'use strict';

const { wrapFeature } = require('../compat.cjs');

/**
 * App lock (Descall+): PIN lock with a salted scrypt hash, stored encrypted with safeStorage
 * (userData/premium/app-lock.bin). Locks on system idle, on minimize and on OS lock, each
 * optional. The lock screen is drawn by the renderer; main holds the locked flag so a
 * reload stays locked. Windows Hello is not offered: Electron has no API for it and it
 * would need a native WinRT addon or helper exe (see docs/premium/GAMING_PRODUCTIVITY.md).
 * It is a UI lock, not encryption at rest.
 */

const { safeStorage, powerMonitor, BrowserWindow, app } = require('electron');
const fs = require('fs');
const path = require('path');
const { hashPin, verifyPin, validPin, lockoutMs } = require('../pinHash.cjs');
const { encryptionAvailable, encryptText, readEncryptedFile, looksLikeJsonObject } = require('../../tokenCrypto.cjs');
const notifyHooks = require('../notifyHooks.cjs');
const { isAppUrl } = require('../../appTrust.cjs');
const { redactLockedNotification } = require('../appLockRedact.cjs');
let et = (k) => k;
try { ({ et } = require('../../mainI18n.cjs')); } catch (_) { /* selftests without electron */ }

let ctx = null;
let locked = false;
let failures = 0;
let blockedUntil = 0;
let idleTimer = null;
let config = { enabled: false, idleMinutes: 10, onMinimize: true, onSystemLock: true };
let minimizeHook = null;
let hookedWin = null;
let offNotifyFilter = null;
/** App windows (pop-outs, extra accounts, Yönetici Paneli) hidden while locked. */
const hiddenForLock = new Set();
let onWindowCreated = null;

function pinFile() {
  return path.join(ctx.storeDir(), 'app-lock.bin');
}

// Electron 45: safeStorage is async (tokenCrypto.cjs; the sync methods go away in 46). The
// record is decrypted once on start() and kept in memory, so lock() (timers, minimize, OS
// lock) stays synchronous; writes update the cache and then the encrypted file.
let record = null;
let encrypted = false;
let loaded = null;

async function loadRecord() {
  encrypted = await encryptionAvailable(safeStorage);
  try {
    const txt = await readEncryptedFile(safeStorage, fs, pinFile(), { legacyPlain: looksLikeJsonObject });
    record = JSON.parse(txt);
  } catch (_) {
    record = null;
  }
  return record;
}

function readRecord() {
  return record;
}

async function writeRecord(rec) {
  const buf = await encryptText(safeStorage, JSON.stringify(rec));
  await fs.promises.writeFile(pinFile(), buf);
  record = rec;
}

/** Every Descall app window except the main one (it shows the lock screen itself). */
function otherAppWindows() {
  const main = ctx?.getMainWindow();
  try {
    return BrowserWindow.getAllWindows().filter((w) => {
      if (!w || w.isDestroyed() || w === main) return false;
      try { return isAppUrl(w.webContents.getURL(), { isDev: Boolean(ctx?.base?.isDev) }); } catch (_) { return false; }
    });
  } catch (_) {
    return [];
  }
}

/** The lock covers every window: other app windows are hidden until the PIN is entered. */
function hideOtherWindows() {
  for (const w of otherAppWindows()) {
    try {
      if (w.isVisible()) { w.hide(); hiddenForLock.add(w); }
    } catch (_) { /* window gone */ }
  }
}

function restoreOtherWindows() {
  for (const w of hiddenForLock) {
    try { if (!w.isDestroyed()) w.showInactive(); } catch (_) { /* window gone */ }
  }
  hiddenForLock.clear();
}

function lock(reason) {
  if (!config.enabled || !readRecord()) return { ok: false, error: 'no_pin' };
  locked = true;
  ctx?.sendToRenderer('premium:app_lock:locked', { locked: true, reason: String(reason || 'manual') });
  hideOtherWindows();
  return { ok: true, locked: true };
}

/** Locked: toasts carry no sender, preview or quick reply (appLockRedact.cjs). */
function notificationFilter(payload) {
  return locked ? redactLockedNotification(payload, { lockedText: et('notif.locked') }) : payload;
}

/** Digits in the PIN, so the lock screen can draw exactly that many dots. PINs saved before
 *  3.7.40 have no length; it is learned on the next successful unlock. */
function pinLength() {
  const n = Number(readRecord()?.len);
  return Number.isInteger(n) && n >= 4 && n <= 12 ? n : null;
}

function status() {
  return {
    ok: true,
    hasPin: Boolean(readRecord()),
    pinLength: pinLength(),
    locked,
    config,
    encrypted,
    retryInMs: Math.max(0, blockedUntil - Date.now()),
    hello: false,
  };
}

function armTimers() {
  clearInterval(idleTimer);
  idleTimer = null;
  if (config.enabled && config.idleMinutes > 0) {
    idleTimer = setInterval(() => {
      if (locked) return;
      try {
        if (powerMonitor.getSystemIdleTime() >= config.idleMinutes * 60) lock('idle');
      } catch (_) { /* ignore */ }
    }, 15000);
    idleTimer.unref?.();
  }
  const win = ctx?.getMainWindow();
  if (hookedWin && minimizeHook) { try { hookedWin.removeListener('minimize', minimizeHook); } catch (_) { /* ignore */ } }
  hookedWin = null;
  if (win && config.enabled && config.onMinimize) {
    minimizeHook = () => lock('minimize');
    win.on('minimize', minimizeHook);
    hookedWin = win;
  }
}

function onSystemLock() {
  if (config.enabled && config.onSystemLock) lock('system');
}

module.exports = wrapFeature({
  key: 'app_lock',
  start(c) {
    ctx = c;
    const saved = ctx.store('app_lock').read({});
    // Until the PIN record is decrypted the lock stays off; every handler waits for it.
    config = { ...config, ...saved, enabled: false };
    record = null;
    loaded = loadRecord().then(() => {
      if (!ctx) return;
      config = { ...config, enabled: Boolean(saved.enabled) && Boolean(readRecord()) };
      armTimers();
      // A restart must not open the app unlocked (before, quitting and starting again skipped the PIN).
      if (config.enabled) lock('launch');
    });
    offNotifyFilter = notifyHooks.registerFinal('app_lock', notificationFilter);
    // Windows opened while locked (session restore, a pop-out) are hidden as soon as they load.
    onWindowCreated = (_e, win) => {
      try {
        win.webContents.once('did-finish-load', () => {
          if (!locked || win.isDestroyed() || win === ctx?.getMainWindow()) return;
          if (!isAppUrl(win.webContents.getURL(), { isDev: Boolean(ctx?.base?.isDev) })) return;
          try { win.hide(); hiddenForLock.add(win); } catch (_) { /* gone */ }
        });
      } catch (_) { /* ignore */ }
    };
    try { app.on('browser-window-created', onWindowCreated); } catch (_) { /* ignore */ }
    ctx.handle('premium:app_lock:status', async () => { await loaded; return status(); });
    ctx.handle('premium:app_lock:set-pin', async (_e, pin, currentPin) => {
      await loaded;
      if (!validPin(pin)) return { ok: false, error: 'invalid' };
      const rec = readRecord();
      if (rec && !verifyPin(currentPin, rec)) return { ok: false, error: 'wrong_pin' };
      try { await writeRecord({ ...hashPin(pin), len: String(pin).length }); } catch (_) { return { ok: false, error: 'write_failed' }; }
      return { ok: true };
    });
    ctx.handle('premium:app_lock:clear-pin', async (_e, currentPin) => {
      await loaded;
      const rec = readRecord();
      if (rec && !verifyPin(currentPin, rec)) return { ok: false, error: 'wrong_pin' };
      try { fs.unlinkSync(pinFile()); } catch (_) { /* ignore */ }
      record = null;
      config = { ...config, enabled: false };
      ctx.store('app_lock').write(config);
      locked = false;
      restoreOtherWindows();
      armTimers();
      return { ok: true };
    });
    ctx.handle('premium:app_lock:config', async (_e, raw = {}) => {
      await loaded;
      const idle = Number(raw.idleMinutes);
      config = {
        enabled: Boolean(raw.enabled) && Boolean(readRecord()),
        idleMinutes: Number.isFinite(idle) ? Math.min(240, Math.max(0, Math.round(idle))) : config.idleMinutes,
        onMinimize: raw.onMinimize !== false,
        onSystemLock: raw.onSystemLock !== false,
      };
      ctx.store('app_lock').write(config);
      armTimers();
      return status();
    });
    ctx.handle('premium:app_lock:lock', async () => { await loaded; return lock('manual'); });
    ctx.handle('premium:app_lock:unlock', async (_e, pin) => {
      await loaded;
      const now = Date.now();
      if (now < blockedUntil) return { ok: false, error: 'blocked', retryInMs: blockedUntil - now };
      const rec = readRecord();
      if (!rec) { locked = false; restoreOtherWindows(); return { ok: true, locked: false }; }
      if (!verifyPin(pin, rec)) {
        failures += 1;
        blockedUntil = now + lockoutMs(failures);
        return { ok: false, error: 'wrong_pin', retryInMs: Math.max(0, blockedUntil - now) };
      }
      failures = 0;
      blockedUntil = 0;
      locked = false;
      if (!pinLength()) { try { await writeRecord({ ...rec, len: String(pin).length }); } catch (_) { /* ignore */ } }
      ctx.sendToRenderer('premium:app_lock:locked', { locked: false });
      restoreOtherWindows();
      return { ok: true, locked: false };
    });
    try { powerMonitor.on('lock-screen', onSystemLock); } catch (_) { /* ignore */ }
    armTimers();
  },
  stop() {
    clearInterval(idleTimer);
    idleTimer = null;
    if (hookedWin && minimizeHook) { try { hookedWin.removeListener('minimize', minimizeHook); } catch (_) { /* ignore */ } }
    hookedWin = null;
    try { powerMonitor.removeListener('lock-screen', onSystemLock); } catch (_) { /* ignore */ }
    try { offNotifyFilter?.(); } catch (_) { /* ignore */ }
    offNotifyFilter = null;
    try { if (onWindowCreated) app.removeListener('browser-window-created', onWindowCreated); } catch (_) { /* ignore */ }
    onWindowCreated = null;
    // Membership gone: the lock is released (a premium feature must not lock people out).
    if (locked) ctx?.sendToRenderer('premium:app_lock:locked', { locked: false });
    locked = false;
    restoreOtherWindows();
    ctx = null;
  },
});
