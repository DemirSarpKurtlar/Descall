'use strict';

/**
 * Global hotkey manager shared by the Descall+ desktop modules.
 * Feature modules switch actions on with setHandler(action, fn); the manager
 * registers only those actions with globalShortcut and only Descall's own
 * shortcuts are ever unregistered. Nothing is registered while every action
 * is off, so free users see no change.
 */

const {
  ACTIONS,
  RESERVED,
  normalizeAccelerator,
  isMouseBinding,
  resolveBindings,
  findConflicts,
} = require('./hotkeyLogic.cjs');

function createHotkeyManager({ globalShortcut, store, gate, log = console } = {}) {
  const handlers = new Map();
  const owned = new Map(); // accel -> action
  let failures = [];
  const listeners = new Set();

  function customMap() {
    const s = store ? store.get('custom_hotkeys') : {};
    return s && typeof s.bindings === 'object' ? s.bindings : {};
  }

  function bindings() {
    const allowCustom = Boolean(gate && gate.has('custom_hotkeys'));
    return resolveBindings(customMap(), { allowCustom });
  }

  function unregisterOwned() {
    for (const accel of owned.keys()) {
      try { globalShortcut.unregister(accel); } catch (_) { /* ignore */ }
    }
    owned.clear();
  }

  function apply() {
    unregisterOwned();
    failures = [];
    const map = bindings();
    const active = {};
    for (const [action, accel] of Object.entries(map)) {
      if (!handlers.has(action) || !accel) continue;
      active[action] = accel;
    }
    // Duplicates / reserved / invalid are not registered at all.
    const issues = findConflicts(active, { reserved: RESERVED });
    const blocked = new Set(issues.map((i) => i.action));
    failures = issues.slice();
    for (const [action, accel] of Object.entries(active)) {
      if (blocked.has(action) || isMouseBinding(accel)) continue;
      let ok = false;
      try {
        ok = globalShortcut.register(accel, () => {
          const fn = handlers.get(action);
          if (fn) {
            try { fn({ action, accel }); } catch (err) { log.warn('[premium:hotkeys] handler failed', action, err?.message || err); }
          }
        });
      } catch (err) {
        ok = false;
      }
      if (ok) owned.set(accel, action);
      else failures.push({ action, accel, reason: 'taken' });
    }
    if (failures.length) log.info('[premium:hotkeys] not registered:', failures.map((f) => `${f.action}=${f.accel} (${f.reason})`).join(', '));
    for (const fn of listeners) {
      try { fn(status()); } catch (_) { /* ignore */ }
    }
    return status();
  }

  function setHandler(action, fn) {
    if (!ACTIONS[action]) return;
    if (typeof fn === 'function') handlers.set(action, fn);
    else handlers.delete(action);
    apply();
  }

  function status() {
    return {
      bindings: bindings(),
      active: [...handlers.keys()],
      registered: [...owned.entries()].map(([accel, action]) => ({ action, accel })),
      failures: failures.slice(),
    };
  }

  /**
   * Check a proposed map before saving it (settings UI). Accelerators held by
   * Descall itself for the same action do not count as taken.
   */
  function check(proposed = {}) {
    const merged = { ...bindings(), ...proposed };
    const mine = new Set([...owned.keys()]);
    return findConflicts(merged, {
      isRegistered: (accel) => {
        if (mine.has(accel)) return false;
        try { return globalShortcut.isRegistered(accel); } catch (_) { return false; }
      },
    });
  }

  /**
   * Probe whether another app holds an accelerator: register and release it
   * right away. Only used from the settings UI on demand.
   */
  function probe(accel) {
    const a = normalizeAccelerator(accel);
    if (!a || isMouseBinding(a)) return { accel: a, free: Boolean(a) };
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

  return { setHandler, apply, status, bindings, check, probe, onStatus, dispose };
}

module.exports = { createHotkeyManager };
