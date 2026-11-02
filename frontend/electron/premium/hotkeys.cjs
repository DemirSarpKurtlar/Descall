'use strict';

/**
 * Global hotkey manager shared by the Descall+ hotkey modules (one per process).
 * A module switches an action on with setHandler(action, fn); the manager
 * registers only those actions with globalShortcut, and only Descall's own
 * registrations are ever released. With every action off nothing is
 * registered, so free users and switched-off features see no change.
 *
 * Custom bindings (store features.custom_hotkeys.bindings) apply only while the
 * custom_hotkeys module runs (it calls setCustomAllowed(true)).
 */

const {
  ACTIONS,
  RESERVED,
  normalizeAccelerator,
  isMouseBinding,
  resolveBindings,
  findConflicts,
} = require('./hotkeyLogic.cjs');

function createHotkeyManager({ globalShortcut, store = null, log = console } = {}) {
  const handlers = new Map();
  const owned = new Map(); // accel -> action
  let failures = [];
  let customAllowed = false;
  const listeners = new Set();

  function customMap() {
    const s = store ? store.feature('custom_hotkeys') : {};
    return s && s.bindings && typeof s.bindings === 'object' ? s.bindings : {};
  }

  function bindings() {
    return resolveBindings(customMap(), { allowCustom: customAllowed });
  }

  function unregisterOwned() {
    for (const accel of owned.keys()) {
      try { globalShortcut.unregister(accel); } catch (_) { /* ignore */ }
    }
    owned.clear();
  }

  function status() {
    return {
      bindings: bindings(),
      customAllowed,
      active: [...handlers.keys()],
      registered: [...owned.entries()].map(([accel, action]) => ({ action, accel })),
      failures: failures.slice(),
    };
  }

  function apply() {
    unregisterOwned();
    failures = [];
    const map = bindings();
    const active = {};
    for (const [action, accel] of Object.entries(map)) {
      if (handlers.has(action) && accel) active[action] = accel;
    }
    // Duplicates / reserved / invalid bindings are not registered at all.
    const issues = findConflicts(active, { reserved: RESERVED });
    const blocked = new Set(issues.map((i) => i.action));
    failures = issues.slice();
    for (const [action, accel] of Object.entries(active)) {
      if (blocked.has(action) || isMouseBinding(accel)) continue;
      let ok = false;
      try {
        ok = globalShortcut.register(accel, () => {
          const fn = handlers.get(action);
          if (!fn) return;
          try { fn({ action, accel }); } catch (err) { log.warn('[premium:hotkeys] handler failed', action, err?.message || err); }
        });
      } catch (_) {
        ok = false;
      }
      if (ok) owned.set(accel, action);
      else failures.push({ action, accel, reason: 'taken' });
    }
    if (failures.length) {
      log.info('[premium:hotkeys] not registered:', failures.map((f) => `${f.action}=${f.accel} (${f.reason})`).join(', '));
    }
    const snap = status();
    for (const fn of listeners) {
      try { fn(snap); } catch (_) { /* ignore */ }
    }
    return snap;
  }

  function setHandler(action, fn) {
    if (!ACTIONS[action]) return;
    const had = handlers.has(action);
    if (typeof fn === 'function') handlers.set(action, fn);
    else handlers.delete(action);
    if (had || handlers.has(action)) apply();
  }

  function setCustomAllowed(on) {
    if (customAllowed === Boolean(on)) return;
    customAllowed = Boolean(on);
    apply();
  }

  /** Validate a proposed map (settings UI). Descall's own registrations are not "taken". */
  function check(proposed = {}) {
    const merged = { ...bindings(), ...proposed };
    return findConflicts(merged, {
      isRegistered: (accel) => {
        if (owned.has(accel)) return false;
        try { return globalShortcut.isRegistered(accel); } catch (_) { return false; }
      },
    });
  }

  /**
   * Does another app hold this accelerator? Register and release it at once
   * (globalShortcut.register returns false when the OS refuses it).
   */
  function probe(accel) {
    const a = normalizeAccelerator(String(accel || ''));
    if (!a) return { accel: '', free: false, invalid: true };
    if (isMouseBinding(a)) return { accel: a, free: true, mouse: true };
    if (owned.has(a)) return { accel: a, free: true, ours: true };
    let free = false;
    try {
      if (globalShortcut.isRegistered(a)) return { accel: a, free: false };
      free = globalShortcut.register(a, () => {});
      if (free) globalShortcut.unregister(a);
    } catch (_) { free = false; }
    return { accel: a, free };
  }

  function onStatus(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function dispose() {
    handlers.clear();
    unregisterOwned();
  }

  return { setHandler, setCustomAllowed, apply, status, bindings, check, probe, onStatus, dispose };
}

let shared = null;

/** The process-wide manager (created on first use by a running module). */
function getHotkeys(ctx) {
  if (!shared) {
    // eslint-disable-next-line global-require
    const { globalShortcut } = require('electron');
    shared = createHotkeyManager({ globalShortcut, store: ctx.store, log: ctx.log });
    try { ctx.bus.once('before-quit', () => shared?.dispose()); } catch (_) { /* ignore */ }
  }
  return shared;
}

module.exports = { createHotkeyManager, getHotkeys };
