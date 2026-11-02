'use strict';

/**
 * Descall+ taskbar_plus:
 *  - unread badge on the app icon: Windows overlay icon (generated, badgeIcon.cjs),
 *    macOS dock badge, Linux launcher count (where the desktop supports it);
 *  - during a call, mute / deafen / leave buttons in the Windows taskbar thumbnail.
 * Settings (features.taskbar_plus): badge, buttons (both default on).
 * Updates only when the unread count or the call state changes.
 */

const icons = require('../badgeIcon.cjs');
const { et } = require('../../mainI18n.cjs');

let ctx = null;
let lastBadge = -1;
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

function setBadge(count) {
  const { app } = require('electron');
  const main = ctx?.mainWindow();
  const n = opt('badge') ? Math.max(0, count | 0) : 0;
  if (n === lastBadge) return;
  lastBadge = n;
  try {
    if (process.platform === 'win32') {
      if (main) main.setOverlayIcon(n ? icons.toNativeImage(icons.unreadBadge(n, 16)) : null, n ? et('premium.taskbar.unread', { n }) : '');
    } else if (process.platform === 'darwin') {
      app.dock?.setBadge(n ? (n > 99 ? '99+' : String(n)) : '');
    } else {
      app.setBadgeCount(n);
    }
  } catch (err) {
    ctx?.log.warn('[premium] taskbar badge failed:', err?.message || err);
  }
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
    lastBadge = -1;
    lastButtons = '';
    setBadge(ctx.state.app?.unread || 0);
    setButtons(true);
    const onApp = (a) => setBadge(a?.unread || 0);
    const onCall = () => setButtons();
    const onSettings = (key) => {
      if (key !== 'taskbar_plus') return;
      lastBadge = -1;
      setBadge(ctx.state.app?.unread || 0);
      setButtons(true);
    };
    ctx.bus.on('app', onApp);
    ctx.bus.on('call', onCall);
    ctx.bus.on('settings', onSettings);
    offs.push(() => ctx.bus.off('app', onApp), () => ctx.bus.off('call', onCall), () => ctx.bus.off('settings', onSettings));
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
    if (ctx) {
      lastBadge = -1;
      const saved = ctx;
      try {
        const main = saved.mainWindow();
        const { app } = require('electron');
        if (process.platform === 'win32') {
          main?.setOverlayIcon(null, '');
          main?.setThumbarButtons([]);
        } else if (process.platform === 'darwin') app.dock?.setBadge('');
        else app.setBadgeCount(0);
      } catch (_) { /* ignore */ }
    }
    ctx = null;
  },
};
