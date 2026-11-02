'use strict';

/**
 * global_mute (Descall+): global hotkeys toggle mute and deafen from any app.
 * Off by default (globalShortcut takes the key away from other apps, so the
 * user opts in). Settings: { enabled, deafen }
 * Renderer: premium:hotkey { action: 'toggle_mute' | 'toggle_deafen' }.
 */

const { kit } = require('../moduleKit.cjs');
const { getHotkeys } = require('../hotkeys.cjs');

let k = null;
let hk = null;

function sync(ctx) {
  const s = k.settings();
  hk.setHandler('toggle_mute', () => ctx.send('premium:hotkey', { action: 'toggle_mute', source: 'hotkey' }));
  hk.setHandler('toggle_deafen', s.deafen === false ? null : () => ctx.send('premium:hotkey', { action: 'toggle_deafen', source: 'hotkey' }));
}

module.exports = {
  key: 'global_mute',
  defaultEnabled: false,
  start(ctx) {
    k = kit(ctx);
    hk = getHotkeys(ctx);
    k.onSettings(['global_mute'], () => sync(ctx));
    ctx.handle('premium:global_mute:status', () => ({ ok: true, hotkeys: hk.status() }));
    sync(ctx);
  },
  stop() {
    hk?.setHandler('toggle_mute', null);
    hk?.setHandler('toggle_deafen', null);
    k?.dispose();
    k = null;
  },
};
