'use strict';

/**
 * custom_hotkeys (Descall+): remap the Descall+ global hotkeys.
 * Bindings live in store 'custom_hotkeys' { bindings: { action: accel } }.
 * Saving validates first: invalid, duplicate, reserved (Descall's own F11 /
 * F12 / Ctrl+Shift+I) and bindings already held by this app or another app
 * are reported back to the settings UI as warnings.
 */

const { ACTIONS, normalizeAccelerator, findConflicts, RESERVED } = require('../hotkeyLogic.cjs');

let ctx = null;

function current() {
  const s = ctx.store.get('custom_hotkeys');
  return s && typeof s.bindings === 'object' ? s.bindings : {};
}

function clean(map) {
  const out = {};
  for (const [action, raw] of Object.entries(map || {})) {
    if (!ACTIONS[action]) continue;
    if (raw === '' || raw === null) { out[action] = ''; continue; }
    const a = normalizeAccelerator(String(raw));
    if (a) out[action] = a;
  }
  return out;
}

module.exports = {
  key: 'custom_hotkeys',
  start(c) {
    ctx = c;
    ctx.hotkeys.apply();
  },
  stop() {
    const c = ctx;
    ctx = null;
    c?.hotkeys.apply(); // back to the defaults
  },
  status() {
    return ctx ? { custom: current() } : null;
  },
  async call(method, args = {}) {
    if (!ctx) return { ok: false, error: 'stopped' };
    if (method === 'check') {
      const proposed = clean(args.bindings);
      return { ok: true, issues: ctx.hotkeys.check(proposed) };
    }
    if (method === 'probe') {
      return { ok: true, ...ctx.hotkeys.probe(String(args.accel || '')) };
    }
    if (method === 'save') {
      const proposed = clean(args.bindings);
      const merged = { ...ctx.hotkeys.bindings(), ...proposed };
      const issues = findConflicts(merged, { reserved: RESERVED });
      const hard = issues.filter((i) => i.reason !== 'registered');
      if (hard.length && !args.force) return { ok: false, issues: hard };
      ctx.store.set('custom_hotkeys', { bindings: { ...current(), ...proposed } });
      ctx.events.emit('settings', 'custom_hotkeys', ctx.store.get('custom_hotkeys'));
      const status = ctx.hotkeys.apply();
      return { ok: true, status, issues: status.failures };
    }
    if (method === 'reset') {
      ctx.store.set('custom_hotkeys', { bindings: {} });
      ctx.events.emit('settings', 'custom_hotkeys', ctx.store.get('custom_hotkeys'));
      return { ok: true, status: ctx.hotkeys.apply() };
    }
    return { ok: false, error: 'unknown_method' };
  },
};
