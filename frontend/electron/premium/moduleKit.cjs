'use strict';

/**
 * Small helpers shared by the hotkey / audio / notification desktop modules.
 *   const k = kit(ctx);
 *   k.settings()               this feature's settings (store features.<key>)
 *   k.on(event, fn)            bus subscription, dropped by k.dispose()
 *   k.onSettings(keys, fn)     fn() when one of these features' settings change
 *   k.inCall()                 renderer-reported call state (premium:call-state)
 *   k.et(key, vars)            main-process i18n
 */

const { et } = require('../mainI18n.cjs');

function kit(ctx) {
  const offs = [];
  return {
    settings: () => ctx.store.feature(ctx.key),
    on(event, fn) {
      ctx.bus.on(event, fn);
      offs.push(() => ctx.bus.off(event, fn));
    },
    onSettings(keys, fn) {
      const set = new Set(Array.isArray(keys) ? keys : [keys]);
      const h = (key) => { if (set.has(key)) fn(); };
      ctx.bus.on('settings', h);
      offs.push(() => ctx.bus.off('settings', h));
    },
    /** fn(active) only when the call starts or ends (mute changes do not count). */
    onCallEdge(fn) {
      let last = Boolean(ctx.state?.call?.active);
      const h = (call) => {
        const now = Boolean(call?.active);
        if (now === last) return;
        last = now;
        fn(now);
      };
      ctx.bus.on('call', h);
      offs.push(() => ctx.bus.off('call', h));
    },
    inCall: () => Boolean(ctx.state?.call?.active),
    et,
    dispose() {
      while (offs.length) {
        try { offs.pop()(); } catch (_) { /* ignore */ }
      }
    },
  };
}

module.exports = { kit };
