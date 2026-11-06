'use strict';

/**
 * Descall+ window_opacity: see-through mini, call, sidebar and pop-out windows
 * (features.window_opacity.<kind>, 0.3 .. 1). Windows and macOS; Linux ignores
 * setOpacity. Stopping puts every window back to fully opaque.
 */

const kit = require('../windowKit.cjs');

let ctx = null;
const offs = [];

module.exports = {
  key: 'window_opacity',
  start(c) {
    ctx = c;
    kit.applyAll(ctx);
    const onOpened = ({ win, kind }) => kit.applyBehaviour(ctx, win, kind);
    const onSettings = (key) => { if (key === 'window_opacity') kit.applyAll(ctx); };
    ctx.bus.on('window-opened', onOpened);
    ctx.bus.on('settings', onSettings);
    offs.push(() => ctx.bus.off('window-opened', onOpened), () => ctx.bus.off('settings', onSettings));
  },
  stop() {
    while (offs.length) offs.pop()();
    const c = ctx;
    ctx = null;
    if (c) {
      for (const [win] of kit.allWindows(c)) {
        try { win.setOpacity(1); } catch (_) { /* ignore */ }
      }
    }
  },
};
