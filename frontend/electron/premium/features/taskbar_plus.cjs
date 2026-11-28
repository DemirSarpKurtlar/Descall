'use strict';

/**
 * Descall+ taskbar_plus: during a call, mute / deafen / leave buttons in the Windows taskbar
 * thumbnail. Setting (features.taskbar_plus): buttons (default on). Updates only when the
 * call state changes. The unread badge on the app icon (overlay, dock, launcher count) is
 * free for every user now and has one owner, electron/taskbarBadge.cjs (main.cjs); this
 * feature no longer touches it.
 */

const icons = require('../badgeIcon.cjs');
const { et } = require('../../mainI18n.cjs');

let ctx = null;
let lastButtons = '';
const offs = [];
const glyphCache = new Map();

function opt(name) {
  return ctx.store.get(`features.taskbar_plus.${name}`, true) !== false;
}

function glyph(name) {
  if (!glyphCache.has(name)) glyphCache.set(name, icons.toNativeImage(icons.glyph(name)));
  return glyphCache.get(name);
}

function setButtons(force = false) {
  if (process.platform !== 'win32') return;
  const main = ctx?.mainWindow();
  if (!main) return;
  const call = ctx.state.call || {};
  const on = opt('buttons') && call.active;
  const key = on ? `${call.muted}|${call.deafened}` : '';
  if (!force && key === lastButtons) return;
  lastButtons = key;
  const act = (action) => () => ctx?.send('premium:action', { action });
  try {
    main.setThumbarButtons(on ? [
      { tooltip: call.muted ? et('premium.tray.unmute') : et('premium.tray.mute'), icon: glyph(call.muted ? 'micOff' : 'mic'), click: act('mute') },
      { tooltip: call.deafened ? et('premium.tray.undeafen') : et('premium.tray.deafen'), icon: glyph(call.deafened ? 'headphonesOff' : 'headphones'), click: act('deafen') },
      { tooltip: et('premium.tray.hangup'), icon: glyph('hangup'), click: act('leave') },
    ] : []);
  } catch (err) {
    ctx?.log.warn('[premium] thumbar failed:', err?.message || err);
  }
}

module.exports = {
  key: 'taskbar_plus',
  start(c) {
    ctx = c;
    lastButtons = '';
    setButtons(true);
    const onCall = () => setButtons();
    const onSettings = (key) => {
      if (key === 'taskbar_plus') setButtons(true);
    };
    ctx.bus.on('call', onCall);
    ctx.bus.on('settings', onSettings);
    offs.push(() => ctx.bus.off('call', onCall), () => ctx.bus.off('settings', onSettings));
    // Windows drops thumbnail buttons when the window is hidden to the tray and shown again.
    const main = ctx.mainWindow();
    if (main) {
      const onShow = () => setButtons(true);
      main.on('show', onShow);
      offs.push(() => main.removeListener('show', onShow));
    }
  },
  stop() {
    while (offs.length) offs.pop()();
    if (ctx && process.platform === 'win32') {
      try { ctx.mainWindow()?.setThumbarButtons([]); } catch (_) { /* ignore */ }
    }
    ctx = null;
  },
};
