'use strict';

/**
 * Descall Ultra desktop_sidebar: a slim, frameless, topmost panel docked to the left or
 * right screen edge with online friends, recent DMs and the active call. A normal window
 * (no native AppBar: other windows are not pushed aside). Rendered by the main renderer
 * (portal window, AuxViews.jsx SidebarView).
 *
 * Settings (features.desktop_sidebar): edge 'left'|'right' (default right),
 * autoHide (default true: hides when it loses focus; screen_edge_actions or the
 * settings button brings it back).
 * Bus: listens to 'sidebar:reveal' (screen_edge_actions) and emits 'sidebar:state'.
 */

const kit = require('../windowKit.cjs');
const { et } = require('../../mainI18n.cjs');

const KIND = 'sidebar';
const WIDTH = 300;
let ctx = null;
const offs = [];

function settings() {
  const s = ctx.store.feature('desktop_sidebar');
  return { edge: s.edge === 'left' ? 'left' : 'right', autoHide: s.autoHide !== false };
}

function sidebarWin() {
  return ctx.windows.find(KIND)?.win || null;
}

function targetArea(point) {
  const { screen } = require('electron');
  const d = point ? screen.getDisplayNearestPoint(point) : screen.getDisplayMatching(ctx.mainWindow()?.getBounds() || screen.getPrimaryDisplay().bounds);
  return (d || screen.getPrimaryDisplay()).workArea;
}

function dock(win, point) {
  if (!win || win.isDestroyed()) return;
  const b = kit.dockedBounds(targetArea(point), settings().edge, WIDTH);
  try { win.setBounds(b); } catch (_) { /* ignore */ }
}

function reveal(point) {
  const win = sidebarWin();
  if (!win) {
    ctx.send('premium:open', { kind: KIND });
    return;
  }
  dock(win, point);
  if (!win.isVisible()) win.showInactive();
  try { win.focus(); } catch (_) { /* ignore */ }
  ctx.bus.emit('sidebar:state', { visible: true });
}

module.exports = {
  key: 'desktop_sidebar',
  start(c) {
    ctx = c;
    ctx.onWindowOpen((d) => {
      if (kit.kindForFrame(d.frameName) !== KIND || d.url !== 'about:blank') return null;
      const out = kit.portalOpen(ctx, KIND, { title: et('premium.window.sidebar') });
      Object.assign(out.overrideBrowserWindowOptions, kit.dockedBounds(targetArea(), settings().edge, WIDTH), { movable: false });
      return out;
    });
    ctx.onDidCreateWindow((win, d) => {
      if (kit.kindForFrame(d?.frameName) !== KIND) return false;
      kit.setupPortal(ctx, win, KIND, 'desktop_sidebar');
      let hideTimer = null;
      win.on('blur', () => {
        if (!settings().autoHide) return;
        hideTimer = setTimeout(() => {
          if (!win.isDestroyed() && !win.isFocused()) {
            win.hide();
            ctx?.bus.emit('sidebar:state', { visible: false });
          }
        }, 350);
      });
      win.on('focus', () => { if (hideTimer) clearTimeout(hideTimer); });
      ctx.bus.emit('sidebar:state', { visible: true });
      return true;
    });
    ctx.handle('premium:sidebar:toggle', () => {
      const win = sidebarWin();
      if (win && win.isVisible()) {
        win.hide();
        return { ok: true, visible: false };
      }
      reveal();
      return { ok: true, visible: true };
    }, { from: 'app' });

    const onReveal = (point) => reveal(point);
    ctx.bus.on('sidebar:reveal', onReveal);
    offs.push(() => ctx.bus.off('sidebar:reveal', onReveal));
    const onSettings = (key) => { if (key === 'desktop_sidebar') dock(sidebarWin()); };
    ctx.bus.on('settings', onSettings);
    offs.push(() => ctx.bus.off('settings', onSettings));
    const { screen } = require('electron');
    const redock = () => dock(sidebarWin());
    screen.on('display-metrics-changed', redock);
    screen.on('display-removed', redock);
    offs.push(() => { screen.removeListener('display-metrics-changed', redock); screen.removeListener('display-removed', redock); });
  },
  stop() {
    while (offs.length) {
      try { offs.pop()(); } catch (_) { /* ignore */ }
    }
    if (ctx) {
      ctx.send('premium:close', { kind: KIND });
      kit.closeKind(ctx, KIND);
    }
    ctx = null;
  },
};
