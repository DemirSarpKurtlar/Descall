'use strict';

/**
 * media_keys (Descall+): keyboard media keys control the call.
 * Registered ONLY while a call is live and released when it ends, because
 * Chromium's media-key registration takes play/pause away from Spotify and
 * other players. Off by default.
 * Settings: { enabled, playPause, next, previous, stop }, each one of
 *   toggle_mute | toggle_deafen | none
 */

const { kit } = require('../moduleKit.cjs');

const KEYS = Object.freeze({ playPause: 'MediaPlayPause', next: 'MediaNextTrack', previous: 'MediaPreviousTrack', stop: 'MediaStop' });
const DEFAULTS = Object.freeze({ playPause: 'toggle_mute', next: 'toggle_deafen', previous: 'none', stop: 'none' });
const ALLOWED = new Set(['toggle_mute', 'toggle_deafen', 'none']);

let ctx = null;
let k = null;
let gs = null;
const registered = new Set();
let failed = [];

function mapping(s = {}) {
  const out = {};
  for (const name of Object.keys(KEYS)) out[name] = ALLOWED.has(s[name]) ? s[name] : DEFAULTS[name];
  return out;
}

function release() {
  for (const accel of registered) {
    try { gs.unregister(accel); } catch (_) { /* ignore */ }
  }
  registered.clear();
}

function sync() {
  release();
  failed = [];
  if (!ctx || !k.inCall()) return;
  const map = mapping(k.settings());
  for (const [name, accel] of Object.entries(KEYS)) {
    const action = map[name];
    if (action === 'none') continue;
    let ok = false;
    try {
      ok = gs.register(accel, () => ctx?.send('premium:hotkey', { action, source: 'media' }));
    } catch (_) { ok = false; }
    if (ok) registered.add(accel);
    else failed.push(accel);
  }
}

module.exports = {
  key: 'media_keys',
  defaultEnabled: false,
  start(c) {
    ctx = c;
    k = kit(ctx);
    // eslint-disable-next-line global-require
    gs = require('electron').globalShortcut;
    k.onCallEdge(sync);
    k.onSettings(['media_keys'], sync);
    ctx.handle('premium:media_keys:status', () => ({ ok: true, inCall: k.inCall(), active: [...registered], failed: failed.slice(), mapping: mapping(k.settings()) }));
    sync();
  },
  stop() {
    if (gs) release();
    k?.dispose();
    k = null;
    ctx = null;
  },
  mapping,
  KEYS,
};
