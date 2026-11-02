'use strict';

/**
 * audio_device_profiles (Descall+), desktop part: switch a device profile
 * from the tray. Profiles (input, output, mic preset) live in the renderer
 * (src/premium/audio/audioProfiles.js); it mirrors their names here.
 */

let ctx = null;
let profiles = [];
let activeId = null;

module.exports = {
  key: 'audio_device_profiles',
  start(c) { ctx = c; },
  stop() {
    ctx = null;
    profiles = [];
    activeId = null;
  },
  status() {
    return ctx ? { count: profiles.length, activeId } : null;
  },
  async call(method, args = {}) {
    if (method === 'mirror') {
      profiles = (Array.isArray(args.profiles) ? args.profiles : []).slice(0, 12).map((p) => ({
        id: String(p?.id || '').slice(0, 64),
        name: String(p?.name || '').slice(0, 60),
      })).filter((p) => p.id && p.name);
      activeId = args.activeId ? String(args.activeId).slice(0, 64) : null;
      ctx?.events.emit('tray-changed');
      return { ok: true };
    }
    return { ok: false, error: 'unknown_method' };
  },
  trayItems() {
    if (!ctx || !profiles.length) return [];
    return [{
      label: ctx.et('premium.tray.audioProfile'),
      submenu: profiles.map((p) => ({
        label: p.name,
        type: 'radio',
        checked: p.id === activeId,
        click: () => ctx?.send('premium:tray-action', { action: 'audio-profile', id: p.id }),
      })),
    }];
  },
};
