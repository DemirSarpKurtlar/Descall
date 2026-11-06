'use strict';

const { wrapFeature } = require('../compat.cjs');

// Command center (Ultra), main side: a global hotkey that brings Descall forward and opens the panel.
let ctx = null;

module.exports = wrapFeature({
  key: 'command_center',
  start(c) {
    ctx = c;
    ctx.handle('premium:command_center:hotkey', (_e, accel) => {
      ctx.unregisterHotkeys();
      if (!accel) return { ok: true, hotkey: '' };
      const ok = ctx.registerHotkey(String(accel).slice(0, 40), () => {
        const win = ctx.getMainWindow();
        try { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } } catch (_) { /* ignore */ }
        ctx.sendToRenderer('premium:command_center:toggle', { via: 'hotkey' });
      });
      return { ok, hotkey: ok ? String(accel) : '' };
    });
  },
  stop() {
    ctx = null;
  },
});
