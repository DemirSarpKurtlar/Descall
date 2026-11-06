'use strict';

/**
 * focus_mode (Descall+), desktop part: tray entries to start / end focus.
 * The rule itself runs in the renderer (src/premium/notify), which also works
 * on the web; the renderer mirrors the end time here so the tray label is right.
 * Renderer: premium:tray-action { action: 'focus', minutes } (0 ends it).
 */

const { kit } = require('../moduleKit.cjs');

let ctx = null;
let k = null;
let until = 0;
let refreshTimer = null;

function minutesLeft(now = Date.now()) {
  return until > now ? Math.ceil((until - now) / 60000) : 0;
}

function scheduleRefresh() {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  if (!until) return;
  // Refresh the "N min left" label once a minute, only while focus is on.
  refreshTimer = setInterval(() => {
    if (!minutesLeft()) { until = 0; clearInterval(refreshTimer); refreshTimer = null; }
    ctx?.refreshTray();
  }, 60 * 1000);
  if (typeof refreshTimer.unref === 'function') refreshTimer.unref();
}

function items() {
  if (!ctx) return [];
  const left = minutesLeft();
  const start = (minutes) => () => ctx?.send('premium:tray-action', { action: 'focus', minutes });
  return [{
    label: left ? k.et('premium.tray.focusOn', { minutes: String(left) }) : k.et('premium.tray.focus'),
    submenu: [
      { label: k.et('premium.tray.focus30'), click: start(30) },
      { label: k.et('premium.tray.focus60'), click: start(60) },
      { label: k.et('premium.tray.focus120'), click: start(120) },
      { type: 'separator' },
      { label: k.et('premium.tray.focusOff'), enabled: left > 0, click: start(0) },
    ],
  }];
}

module.exports = {
  key: 'focus_mode',
  start(c) {
    ctx = c;
    k = kit(ctx);
    ctx.handle('premium:focus_mode:state', (payload = {}) => {
      const n = Number(payload.until);
      until = Number.isFinite(n) && n > Date.now() ? n : 0;
      scheduleRefresh();
      ctx.refreshTray();
      return { ok: true };
    });
    ctx.setTrayItems(items);
  },
  stop() {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    until = 0;
    k?.dispose();
    k = null;
    ctx = null;
  },
  _items: items,
};
