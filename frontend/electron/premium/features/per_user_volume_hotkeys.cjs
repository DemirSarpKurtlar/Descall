'use strict';

/**
 * per_user_volume_hotkeys (Ultra): global hotkeys raise / lower the local
 * playback volume of the pinned participant in the current voice session.
 * The renderer owns the volume (voiceProfile participant gains) and the pin;
 * main only forwards the key press. Registered only during a call.
 * Settings: { enabled, step } (step in percent, 5..50)
 */

let ctx = null;
let offHandlers = [];

function settings() {
  const s = ctx ? ctx.store.get('per_user_volume_hotkeys') : {};
  const step = Number(s.step);
  return { enabled: Boolean(s.enabled), step: Number.isFinite(step) ? Math.max(5, Math.min(50, Math.round(step))) : 10 };
}

function sync() {
  if (!ctx) return;
  const s = settings();
  const on = s.enabled && ctx.voice.inCall;
  const fire = (dir) => () => ctx?.send('premium:hotkey', { action: dir, step: settings().step, userId: ctx.voice.pinnedUserId });
  ctx.hotkeys.setHandler('volume_up', on ? fire('volume_up') : null);
  ctx.hotkeys.setHandler('volume_down', on ? fire('volume_down') : null);
}

module.exports = {
  key: 'per_user_volume_hotkeys',
  start(c) {
    ctx = c;
    let lastInCall = Boolean(ctx.voice.inCall);
    const onVoice = (v) => {
      if (Boolean(v?.inCall) === lastInCall) return;
      lastInCall = Boolean(v?.inCall);
      sync();
    };
    const onSettings = (key) => { if (key === 'per_user_volume_hotkeys' || key === 'custom_hotkeys') sync(); };
    ctx.events.on('voice-state', onVoice);
    ctx.events.on('settings', onSettings);
    offHandlers = [() => ctx.events.off('voice-state', onVoice), () => ctx.events.off('settings', onSettings)];
    sync();
  },
  stop() {
    if (!ctx) return;
    ctx.hotkeys.setHandler('volume_up', null);
    ctx.hotkeys.setHandler('volume_down', null);
    offHandlers.forEach((fn) => fn());
    offHandlers = [];
    ctx = null;
  },
  status() {
    return ctx ? { ...settings(), pinnedUserId: ctx.voice.pinnedUserId } : null;
  },
};
