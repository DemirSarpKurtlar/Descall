'use strict';

/**
 * App lock (Descall+): PIN lock with a salted scrypt hash, stored encrypted with safeStorage
 * (userData/premium/app-lock.bin). Locks on system idle, on minimize and on OS lock, each
 * optional. The lock screen is drawn by the renderer; main holds the locked flag so a
 * reload stays locked. Windows Hello is not offered: Electron has no API for it and it
 * would need a native WinRT addon or helper exe (see docs/premium/GAMING_PRODUCTIVITY.md).
 * It is a UI lock, not encryption at rest.
 */

const { safeStorage, powerMonitor } = require('electron');
const fs = require('fs');
const path = require('path');
const { hashPin, verifyPin, validPin, lockoutMs } = require('../pinHash.cjs');

let ctx = null;
let locked = false;
let failures = 0;
let blockedUntil = 0;
let idleTimer = null;
let config = { enabled: false, idleMinutes: 10, onMinimize: true, onSystemLock: true };
let minimizeHook = null;
let hookedWin = null;

function pinFile() {
  return path.join(ctx.storeDir(), 'app-lock.bin');
}

function readRecord() {
  try {
    const buf = fs.readFileSync(pinFile());
    const txt = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8');
    return JSON.parse(txt);
  } catch (_) {
    return null;
  }
}

function writeRecord(rec) {
  const txt = JSON.stringify(rec);
  const buf = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(txt) : Buffer.from(txt, 'utf8');
  fs.writeFileSync(pinFile(), buf);
}

function lock(reason) {
  if (!config.enabled || !readRecord()) return { ok: false, error: 'no_pin' };
  locked = true;
  ctx?.sendToRenderer('premium:app_lock:locked', { locked: true, reason: String(reason || 'manual') });
  return { ok: true, locked: true };
}

function status() {
  return {
    ok: true,
    hasPin: Boolean(readRecord()),
    locked,
    config,
    encrypted: safeStorage.isEncryptionAvailable(),
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

module.exports = {
  key: 'app_lock',
  start(c) {
    ctx = c;
    const saved = ctx.store('app_lock').read({});
    config = { ...config, ...saved, enabled: Boolean(saved.enabled) && Boolean(readRecord()) };
    ctx.handle('premium:app_lock:status', () => status());
    ctx.handle('premium:app_lock:set-pin', (_e, pin, currentPin) => {
      if (!validPin(pin)) return { ok: false, error: 'invalid' };
      const rec = readRecord();
      if (rec && !verifyPin(currentPin, rec)) return { ok: false, error: 'wrong_pin' };
      writeRecord(hashPin(pin));
      return { ok: true };
    });
    ctx.handle('premium:app_lock:clear-pin', (_e, currentPin) => {
      const rec = readRecord();
      if (rec && !verifyPin(currentPin, rec)) return { ok: false, error: 'wrong_pin' };
      try { fs.unlinkSync(pinFile()); } catch (_) { /* ignore */ }
      config = { ...config, enabled: false };
      ctx.store('app_lock').write(config);
      locked = false;
      armTimers();
      return { ok: true };
    });
    ctx.handle('premium:app_lock:config', (_e, raw = {}) => {
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
    ctx.handle('premium:app_lock:lock', () => lock('manual'));
    ctx.handle('premium:app_lock:unlock', (_e, pin) => {
      const now = Date.now();
      if (now < blockedUntil) return { ok: false, error: 'blocked', retryInMs: blockedUntil - now };
      const rec = readRecord();
      if (!rec) { locked = false; return { ok: true, locked: false }; }
      if (!verifyPin(pin, rec)) {
        failures += 1;
        blockedUntil = now + lockoutMs(failures);
        return { ok: false, error: 'wrong_pin', retryInMs: Math.max(0, blockedUntil - now) };
      }
      failures = 0;
      blockedUntil = 0;
      locked = false;
      ctx.sendToRenderer('premium:app_lock:locked', { locked: false });
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
    // Membership gone: the lock is released (a premium feature must not lock people out).
    if (locked) ctx?.sendToRenderer('premium:app_lock:locked', { locked: false });
    locked = false;
    ctx = null;
  },
};
