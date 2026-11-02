'use strict';

/**
 * media_keys (Descall+): keyboard media keys control the call, only while a
 * call is live (outside calls the keys stay with the music player).
 * Settings: { enabled, playPause, next, previous, stop } each an action:
 *   toggle_mute | toggle_deafen | none
 */

const { globalShortcut } = require('electron');

const KEYS = { playPause: 'MediaPlayPause', next: 'MediaNextTrack', previous: 'MediaPreviousTrack', stop: 'MediaStop' };
const DEFAULTS = { playPause: 'toggle_mute', next: 'toggle_deafen', previous: 'none', stop: 'none' };
const ALLOWED = new Set(['toggle_mute', 'toggle_deafen', 'none']);

let ctx = null;
let offHandlers = [];
const registered = new Set();
let failed = [];

function settings() {
  const s = ctx ? ctx.store.get('media_keys') : {};
  const map = {};
  for (const k of Object.keys(KEYS)) map[k] = ALLOWED.has(s[k]) ? s[k] : DEFAULTS[k];
  return { enabled: Boolean(s.enabled), map };
}

function release() {
  for (const accel of registered) {
    try { globalShortcut.unregister(accel); } catch (_) { /* ignore */ }
  }
  registered.clear();
}

function sync() {
  release();
  failed = [];
  if (!ctx) return;
  const s = settings();
  if (!s.enabled || !ctx.voice.inCall) return;
  for (const [name, accel] of Object.entries(KEYS)) {
    const action = s.map[name];
    if (action === 'none') continue;
    let ok = false;
    try {
      ok = globalShortcut.register(accel, () => ctx?.send('premium:hotkey', { action, source: 'media' }));
    } catch (_) { ok = false; }
    if (ok) registered.add(accel);
    else failed.push(accel);
  }
}

module.exports = {
  key: 'media_keys',
  start(c) {
    ctx = c;
    let lastInCall = Boolean(ctx.voice.inCall);
    const onVoice = (v) => {
      if (Boolean(v?.inCall) === lastInCall) return;
      lastInCall = Boolean(v?.inCall);
      sync();
    };
    const onSettings = (key) => { if (key === 'media_keys') sync(); };
    ctx.events.on('voice-state', onVoice);
    ctx.events.on('settings', onSettings);
    offHandlers = [() => ctx.events.off('voice-state', onVoice), () => ctx.events.off('settings', onSettings)];
    sync();
  },
  stop() {
    release();
    offHandlers.forEach((fn) => fn());
    offHandlers = [];
    ctx = null;
  },
  status() {
    return ctx ? { enabled: settings().enabled, active: [...registered], failed } : null;
  },
  _KEYS: KEYS,
};
