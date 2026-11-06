'use strict';

const { wrapFeature } = require('../compat.cjs');

/**
 * Workspace profiles (Ultra), main side: global hotkeys and tray entries that switch the
 * active profile. The profiles themselves (notification profile, layout, status, audio
 * profile) live in the renderer, which applies them.
 */

let ctx = null;

module.exports = wrapFeature({
  key: 'workspace_profiles',
  start(c) {
    ctx = c;
    ctx.handle('premium:workspace_profiles:bind', (_e, payload = {}) => {
      ctx.unregisterHotkeys();
      const profiles = (Array.isArray(payload.profiles) ? payload.profiles : []).slice(0, 8)
        .map((p) => ({ id: String(p.id || '').slice(0, 40), label: String(p.label || '').slice(0, 40), hotkey: String(p.hotkey || '').slice(0, 40), active: Boolean(p.active) }))
        .filter((p) => p.id);
      const bound = [];
      for (const p of profiles) {
        if (p.hotkey && ctx.registerHotkey(p.hotkey, () => ctx.sendToRenderer('premium:workspace_profiles:switch', { id: p.id, via: 'hotkey' }))) bound.push(p.id);
      }
      const title = String(payload.trayTitle || '').slice(0, 40);
      ctx.setTrayItems(title && profiles.length ? [{
        label: title,
        submenu: profiles.map((p) => ({
          label: p.label || p.id,
          type: 'radio',
          checked: p.active,
          click: () => ctx.sendToRenderer('premium:workspace_profiles:switch', { id: p.id, via: 'tray' }),
        })),
      }] : []);
      return { ok: true, bound };
    });
  },
  stop() {
    ctx = null;
  },
});
