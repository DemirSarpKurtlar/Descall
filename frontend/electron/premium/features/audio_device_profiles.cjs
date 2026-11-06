'use strict';

/**
 * audio_device_profiles (Descall+), desktop part: switch a device profile
 * (input, output, mic preset) from the tray. Profiles live in the renderer
 * (src/premium/audio/audioProfiles.js), which mirrors their names here.
 * Renderer: premium:tray-action { action: 'audio-profile', id }.
 */

const { kit } = require('../moduleKit.cjs');

let ctx = null;
let k = null;
let profiles = [];
let activeId = null;

function items() {
  if (!ctx || !profiles.length) return [];
  return [{
    label: k.et('premium.tray.audioProfile'),
    submenu: profiles.map((p) => ({
      label: p.name,
      type: 'radio',
      checked: p.id === activeId,
      click: () => ctx?.send('premium:tray-action', { action: 'audio-profile', id: p.id }),
    })),
  }];
}

module.exports = {
  key: 'audio_device_profiles',
  start(c) {
    ctx = c;
    k = kit(ctx);
    ctx.handle('premium:audio_device_profiles:mirror', (payload = {}) => {
      profiles = (Array.isArray(payload.profiles) ? payload.profiles : []).slice(0, 12).map((p) => ({
        id: String(p?.id || '').slice(0, 64),
        name: String(p?.name || '').slice(0, 60),
      })).filter((p) => p.id && p.name);
      activeId = payload.activeId ? String(payload.activeId).slice(0, 64) : null;
      ctx.refreshTray();
      return { ok: true };
    });
    ctx.setTrayItems(items);
  },
  stop() {
    profiles = [];
    activeId = null;
    k?.dispose();
    k = null;
    ctx = null;
  },
  _items: items,
};
