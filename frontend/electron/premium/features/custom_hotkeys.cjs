'use strict';

/**
 * custom_hotkeys (Descall+): remap the Descall+ global hotkeys.
 * Bindings: store features.custom_hotkeys.bindings { action: accelerator }
 * ("" switches an action off). While this module runs the custom map
 * applies; without it the defaults do.
 *
 * Saving validates first: invalid, duplicate, reserved (Descall's own F11 /
 * F12 / Ctrl+Shift+I), bare keys that would swallow typing, and accelerators
 * already held by this app (globalShortcut.isRegistered) or by another app
 * (register() refused) come back to the settings UI as warnings.
 */

const { getHotkeys } = require('../hotkeys.cjs');
const { ACTIONS, RESERVED, normalizeAccelerator, findConflicts } = require('../hotkeyLogic.cjs');

let ctx = null;
let hk = null;

function current() {
  const s = ctx.store.feature('custom_hotkeys');
  return s && s.bindings && typeof s.bindings === 'object' ? s.bindings : {};
}

function clean(map) {
  const out = {};
  for (const [action, raw] of Object.entries(map || {})) {
    if (!Object.prototype.hasOwnProperty.call(ACTIONS, action)) continue;
    if (raw === '' || raw === null) { out[action] = ''; continue; }
    const a = normalizeAccelerator(String(raw));
    if (a) out[action] = a;
  }
  return out;
}

function save(proposedRaw = {}, force = false) {
  const proposed = clean(proposedRaw);
  const merged = { ...hk.bindings(), ...proposed };
  const hard = findConflicts(merged, { reserved: RESERVED });
  if (hard.length && !force) return { ok: false, issues: hard };
  ctx.store.patchFeature('custom_hotkeys', { bindings: { ...current(), ...proposed } });
  const status = hk.apply();
  ctx.send('premium:hotkeys-changed', status);
  return { ok: true, status, issues: status.failures };
}

module.exports = {
  key: 'custom_hotkeys',
  start(c) {
    ctx = c;
    hk = getHotkeys(ctx);
    hk.setCustomAllowed(true);
    ctx.handle('premium:hotkeys:status', () => ({ ok: true, ...hk.status(), actions: ACTIONS, reserved: RESERVED }));
    ctx.handle('premium:hotkeys:check', (bindings) => ({ ok: true, issues: hk.check(clean(bindings)) }));
    ctx.handle('premium:hotkeys:probe', (accel) => ({ ok: true, ...hk.probe(accel) }));
    ctx.handle('premium:hotkeys:save', (bindings, opts = {}) => save(bindings, Boolean(opts && opts.force)));
    ctx.handle('premium:hotkeys:reset', () => {
      ctx.store.patchFeature('custom_hotkeys', { bindings: {} });
      const status = hk.apply();
      ctx.send('premium:hotkeys-changed', status);
      return { ok: true, status };
    });
  },
  stop() {
    hk?.setCustomAllowed(false); // back to the defaults
    ctx = null;
  },
  _clean: clean,
};
