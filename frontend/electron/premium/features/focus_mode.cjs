'use strict';

/**
 * focus_mode (Descall+), desktop part: tray entries to start / end focus.
 * The rule itself lives in the renderer (src/premium/notify), which works on
 * the web too; the renderer mirrors the current end time here with
 * call('state') so the tray label is right.
 */

let ctx = null;
let until = 0;

function minutesLeft(now = Date.now()) {
  return until > now ? Math.ceil((until - now) / 60000) : 0;
}

module.exports = {
  key: 'focus_mode',
  start(c) { ctx = c; },
  stop() {
    ctx = null;
    until = 0;
  },
  status() {
    return ctx ? { until, active: until > Date.now() } : null;
  },
  async call(method, args = {}) {
    if (method === 'state') {
      const n = Number(args.until);
      until = Number.isFinite(n) && n > Date.now() ? n : 0;
      ctx?.events.emit('tray-changed');
      return { ok: true };
    }
    return { ok: false, error: 'unknown_method' };
  },
  trayItems() {
    if (!ctx) return [];
    const et = ctx.et;
    const left = minutesLeft();
    const start = (minutes) => () => ctx?.send('premium:tray-action', { action: 'focus', minutes });
    return [{
      label: left ? et('premium.tray.focusOn', { minutes: String(left) }) : et('premium.tray.focus'),
      submenu: [
        { label: et('premium.tray.focus30'), click: start(30) },
        { label: et('premium.tray.focus60'), click: start(60) },
        { label: et('premium.tray.focus120'), click: start(120) },
        { type: 'separator' },
        { label: et('premium.tray.focusOff'), enabled: left > 0, click: start(0) },
      ],
    }];
  },
};
