'use strict';

/**
 * global_mute (Descall+): a global hotkey toggles mute (and one toggles
 * deafen) from any app. globalShortcut is registered only while the user has
 * switched the feature on.
 * Settings: { enabled: boolean, deafen: boolean }
 */

let ctx = null;
let offSettings = null;

function settings() {
  const s = ctx ? ctx.store.get('global_mute') : {};
  return { enabled: Boolean(s.enabled), deafen: s.deafen !== false };
}

function sync() {
  if (!ctx) return;
  const s = settings();
  ctx.hotkeys.setHandler('toggle_mute', s.enabled ? () => ctx.send('premium:hotkey', { action: 'toggle_mute' }) : null);
  ctx.hotkeys.setHandler('toggle_deafen', s.enabled && s.deafen ? () => ctx.send('premium:hotkey', { action: 'toggle_deafen' }) : null);
}

module.exports = {
  key: 'global_mute',
  start(c) {
    ctx = c;
    const onSettings = (key) => { if (key === 'global_mute' || key === 'custom_hotkeys') sync(); };
    ctx.events.on('settings', onSettings);
    offSettings = () => ctx.events.off('settings', onSettings);
    sync();
  },
  stop() {
    if (!ctx) return;
    ctx.hotkeys.setHandler('toggle_mute', null);
    ctx.hotkeys.setHandler('toggle_deafen', null);
    offSettings?.();
    offSettings = null;
    ctx = null;
  },
  status() {
    return ctx ? { enabled: settings().enabled } : null;
  },
};
