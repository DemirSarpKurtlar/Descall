'use strict';

/**
 * Descall+ multi_window: pop a DM, group or server channel out into its own window.
 *
 * A pop-out is the same app document on a route (descall://app/direct/<name>?popout=1),
 * sandboxed, with the normal preload; html.descall-popout hides the side lists. RAM:
 * the same route is focused instead of opened twice, and at most MAX pop-outs exist.
 * Calls do not move between renderers, so "pop out the call" is the pip_call window.
 *
 * IPC: premium:popout:open (route) -> { ok, error?: 'limit'|'bad-route' },
 *      premium:popout:list, premium:popout:close-all.
 * Bus: 'popout:open' { route, bounds } (session_restore, window_layouts).
 */

const kit = require('../windowKit.cjs');

const MAX = 4;
const ROUTE = /^\/(direct\/[^/?#\s]{1,64}|groups\/[^/?#\s]{1,64}|servers\/[^/?#\s]{1,64}\/[^/?#\s]{1,64})$/;
let ctx = null;
let offBus = null;

function validRoute(route) {
  const r = String(route || '');
  return ROUTE.test(r) && !r.includes('..') ? r : null;
}

function popouts() {
  return ctx.windows.list('popout');
}

function isOwnUrl(url, route) {
  try {
    const u = new URL(url);
    const base = new URL(ctx.appUrl('/'));
    return u.protocol === base.protocol && u.host === base.host;
  } catch (_) {
    return false;
  }
}

function open(route, bounds) {
  const r = validRoute(route);
  if (!r) return { ok: false, error: 'bad-route' };
  const existing = ctx.windows.find('popout', (e) => e.meta.route === r);
  if (existing) {
    if (existing.win.isMinimized()) existing.win.restore();
    existing.win.show();
    existing.win.focus();
    return { ok: true, reused: true };
  }
  if (popouts().length >= MAX) return { ok: false, error: 'limit', max: MAX };
  const { BrowserWindow } = require('electron');
  const b = (bounds && kit.fit(bounds)) || kit.savedBounds(ctx, 'popout', r) || (() => {
    const main = ctx.mainWindow()?.getBounds();
    const n = popouts().length + 1;
    return main ? kit.fit({ x: main.x + 40 * n, y: main.y + 40 * n, width: 860, height: 680 }) : { width: 860, height: 680 };
  })();
  const win = new BrowserWindow({
    ...b,
    minWidth: 420,
    minHeight: 360,
    show: false,
    frame: false,
    title: 'Descall',
    backgroundColor: '#14151e',
    icon: ctx.icon || undefined,
    autoHideMenuBar: true,
    fullscreenable: false,
    alwaysOnTop: kit.onTopFor(ctx, 'popout'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: ctx.preload,
      backgroundThrottling: true,
    },
  });
  try { win.setMenu(null); } catch (_) { /* ignore */ }
  ctx.windows.track(win, { kind: 'popout', key: 'multi_window', meta: { route: r } });
  kit.applyBehaviour(ctx, win, 'popout');
  kit.rememberBounds(ctx, win, kit.boundsKey('popout', r));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if (!isOwnUrl(url, r)) e.preventDefault(); });
  win.on('maximize', () => win.webContents.send('window:maximized', true));
  win.on('unmaximize', () => win.webContents.send('window:maximized', false));
  win.once('ready-to-show', () => win.show());
  win.loadURL(ctx.appUrl(`${r}?popout=1`)).catch((err) => ctx.log.warn('[premium] pop-out load failed:', err?.message || err));
  return { ok: true };
}

module.exports = {
  key: 'multi_window',
  MAX,
  validRoute,
  start(c) {
    ctx = c;
    ctx.handle('premium:popout:open', (route) => open(route), { from: 'app' });
    ctx.handle('premium:popout:list', () => ({ ok: true, max: MAX, windows: popouts().map((e) => ({ route: e.meta.route })) }), { from: 'app' });
    ctx.handle('premium:popout:close-all', () => {
      for (const e of popouts()) e.win.close();
      return { ok: true };
    });
    const onOpen = (msg) => open(msg?.route, msg?.bounds);
    ctx.bus.on('popout:open', onOpen);
    offBus = () => ctx.bus.off('popout:open', onOpen);
  },
  stop() {
    if (offBus) offBus();
    offBus = null;
    if (ctx) for (const e of popouts()) { try { e.win.close(); } catch (_) { /* ignore */ } }
    ctx = null;
  },
};
