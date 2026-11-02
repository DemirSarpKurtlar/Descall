'use strict';

/**
 * per_user_volume_hotkeys (Ultra): global hotkeys raise / lower the local
 * playback volume of the pinned participant in the current voice session.
 * The renderer owns the volumes and the pin (src/premium/audio); main only
 * forwards the key press, and only while a call is live. Off by default.
 * Settings: { enabled, step } (percent, 5..50)
 * Renderer: premium:hotkey { action: 'volume_up' | 'volume_down', step }.
 */

const { kit } = require('../moduleKit.cjs');
const { getHotkeys } = require('../hotkeys.cjs');

let ctx = null;
let k = null;
let hk = null;

function step() {
  const n = Number(k?.settings().step);
  return Number.isFinite(n) ? Math.max(5, Math.min(50, Math.round(n))) : 10;
}

function sync() {
  if (!ctx) return;
  const on = k.inCall();
  const fire = (action) => () => ctx?.send('premium:hotkey', { action, step: step(), source: 'hotkey' });
  hk.setHandler('volume_up', on ? fire('volume_up') : null);
  hk.setHandler('volume_down', on ? fire('volume_down') : null);
}

module.exports = {
  key: 'per_user_volume_hotkeys',
  defaultEnabled: false,
  start(c) {
    ctx = c;
    k = kit(ctx);
    hk = getHotkeys(ctx);
    k.onCallEdge(sync);
    k.onSettings(['per_user_volume_hotkeys', 'custom_hotkeys'], sync);
    ctx.handle('premium:per_user_volume_hotkeys:status', () => ({ ok: true, step: step(), inCall: k.inCall(), bindings: hk.bindings() }));
    sync();
  },
  stop() {
    hk?.setHandler('volume_up', null);
    hk?.setHandler('volume_down', null);
    k?.dispose();
    k = null;
    ctx = null;
  },
};
