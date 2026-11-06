'use strict';

/**
 * Shared helpers for the Descall+ window modules: portal window options, bounds memory,
 * multi-monitor fitting, always-on-top and opacity behaviour.
 *
 * Portal windows (call, sidebar) are opened by the main renderer with
 * window.open('about:blank', 'descall-premium-<kind>') and rendered by it (same process,
 * see src/premium/desktop/AuxWindow.jsx). Pop-outs are separate app windows on a route.
 * Pure geometry helpers take plain objects so premium.selftest.mjs can test them.
 */

const FRAME_PREFIX = 'descall-premium-';
// Mini mode is no longer a window (it is the in-app floating call card); 'mini' sizes stay
// only as the geometry reference for where the call window sits.
const PORTAL_KINDS = Object.freeze(['call', 'sidebar']);

/** Behaviour defaults when always_on_top / window_opacity are not active. */
const DEFAULT_ON_TOP = Object.freeze({ main: false, mini: true, call: true, sidebar: true, popout: false });

const SIZES = Object.freeze({
  mini: { width: 300, height: 176, minWidth: 260, minHeight: 150, resizable: false },
  call: { width: 480, height: 300, minWidth: 260, minHeight: 170, resizable: true },
  sidebar: { width: 300, height: 640, minWidth: 260, minHeight: 300, resizable: false },
});

function kindForFrame(frameName) {
  const name = String(frameName || '');
  if (!name.startsWith(FRAME_PREFIX)) return null;
  const kind = name.slice(FRAME_PREFIX.length);
  return PORTAL_KINDS.includes(kind) ? kind : null;
}

function intersects(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function validBounds(b) {
  return b && [b.x, b.y, b.width, b.height].every((v) => Number.isFinite(Number(v))) && b.width > 40 && b.height > 40;
}

/**
 * Keep `bounds` usable on the current displays: at least 64x48 px of it must be on a
 * work area, else it moves (same size, clamped) onto the nearest / primary work area.
 */
function fitToWorkAreas(bounds, workAreas, primary) {
  if (!validBounds(bounds)) return null;
  const b = { x: Math.round(bounds.x), y: Math.round(bounds.y), width: Math.round(bounds.width), height: Math.round(bounds.height) };
  const areas = (workAreas || []).filter(Boolean);
  const visible = areas.some((a) => {
    const ix = Math.min(b.x + b.width, a.x + a.width) - Math.max(b.x, a.x);
    const iy = Math.min(b.y + b.height, a.y + a.height) - Math.max(b.y, a.y);
    return ix >= 64 && iy >= 48;
  });
  if (visible) return b;
  const target = primary || areas[0];
  if (!target) return b;
  const width = Math.min(b.width, target.width);
  const height = Math.min(b.height, target.height);
  return {
    x: Math.round(target.x + (target.width - width) / 2),
    y: Math.round(target.y + (target.height - height) / 2),
    width,
    height,
  };
}

/** Snap a window's bounds to work area edges within `threshold` px. */
function snapToEdges(bounds, area, threshold = 18) {
  const b = { ...bounds };
  if (Math.abs(b.x - area.x) <= threshold) b.x = area.x;
  if (Math.abs(b.y - area.y) <= threshold) b.y = area.y;
  const right = area.x + area.width;
  const bottom = area.y + area.height;
  if (Math.abs(b.x + b.width - right) <= threshold) b.x = right - b.width;
  if (Math.abs(b.y + b.height - bottom) <= threshold) b.y = bottom - b.height;
  return b;
}

/** Bounds docked to the left / right edge of a work area. */
function dockedBounds(area, edge, width) {
  const w = Math.min(width, area.width);
  return { x: edge === 'left' ? area.x : area.x + area.width - w, y: area.y, width: w, height: area.height };
}

/**
 * Map bounds saved on display `from` (its bounds at save time) onto display `to`,
 * keeping the relative position and size.
 */
function mapBetweenDisplays(bounds, from, to) {
  if (!from || !to || (from.x === to.x && from.y === to.y && from.width === to.width && from.height === to.height)) return { ...bounds };
  const sx = to.width / from.width;
  const sy = to.height / from.height;
  return {
    x: Math.round(to.x + (bounds.x - from.x) * sx),
    y: Math.round(to.y + (bounds.y - from.y) * sy),
    width: Math.max(200, Math.round(bounds.width * sx)),
    height: Math.max(120, Math.round(bounds.height * sy)),
  };
}

// ---- electron side -----------------------------------------------------------------------

function electron() {
  return require('electron');
}

function workAreas() {
  const { screen } = electron();
  return { areas: screen.getAllDisplays().map((d) => d.workArea), primary: screen.getPrimaryDisplay().workArea };
}

function fit(bounds) {
  const { areas, primary } = workAreas();
  return fitToWorkAreas(bounds, areas, primary);
}

function defaultBounds(kind, ctx) {
  const { screen } = electron();
  const size = SIZES[kind] || SIZES.mini;
  const area = screen.getPrimaryDisplay().workArea;
  if (kind === 'sidebar') {
    const edge = ctx?.store?.get('features.desktop_sidebar.edge', 'right') === 'left' ? 'left' : 'right';
    return dockedBounds(area, edge, size.width);
  }
  const margin = 18;
  const offset = kind === 'call' ? SIZES.mini.height + margin : 0;
  return {
    x: area.x + area.width - size.width - margin,
    y: Math.max(area.y + margin, area.y + area.height - size.height - margin - offset),
    width: size.width,
    height: size.height,
  };
}

function boundsKey(kind, route) {
  if (kind !== 'popout') return `bounds.${kind}`;
  const slug = String(route || '').replace(/[^a-z0-9]+/gi, '_').slice(0, 80) || 'route';
  return `bounds.popout_${slug}`;
}

function savedBounds(ctx, kind, route) {
  const b = ctx.store.get(boundsKey(kind, route), null);
  return b ? fit(b) : null;
}

function onTopFor(ctx, kind) {
  if (ctx.gate.has('always_on_top') && ctx.store.get('features.always_on_top.enabled', true) !== false) {
    const v = ctx.store.get(`features.always_on_top.${kind}`, undefined);
    if (typeof v === 'boolean') return v;
  }
  return Boolean(DEFAULT_ON_TOP[kind]);
}

function opacityFor(ctx, kind) {
  if (!ctx.gate.has('window_opacity') || kind === 'main') return 1;
  if (ctx.store.get('features.window_opacity.enabled', true) === false) return 1;
  const v = Number(ctx.store.get(`features.window_opacity.${kind}`, 1));
  return Number.isFinite(v) ? Math.min(1, Math.max(0.3, v)) : 1;
}

/** Re-apply always-on-top and opacity to one window (or the main window when kind 'main'). */
function applyBehaviour(ctx, win, kind) {
  if (!win || win.isDestroyed()) return;
  const top = onTopFor(ctx, kind);
  try { win.setAlwaysOnTop(top, top && kind !== 'main' && kind !== 'popout' ? 'floating' : 'normal'); } catch (_) { /* ignore */ }
  try { win.setOpacity(opacityFor(ctx, kind)); } catch (_) { /* Linux: not supported */ }
}

/** Every Descall+ window plus the main window, as [win, kind]. */
function allWindows(ctx) {
  const out = [];
  const main = ctx.mainWindow();
  if (main) out.push([main, 'main']);
  for (const e of ctx.windows.list()) out.push([e.win, e.kind]);
  return out;
}

function applyAll(ctx) {
  for (const [win, kind] of allWindows(ctx)) applyBehaviour(ctx, win, kind);
}

/** Remember a window's bounds under `key` (debounced) while it lives. */
function rememberBounds(ctx, win, key) {
  let timer = null;
  const save = () => {
    timer = null;
    if (win.isDestroyed() || win.isMinimized() || (win.isMaximized && win.isMaximized())) return;
    ctx.store.set(key, win.getBounds());
  };
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, 500);
  };
  win.on('move', schedule);
  win.on('resize', schedule);
  win.once('closed', () => { if (timer) clearTimeout(timer); });
}

/** setWindowOpenHandler answer for a portal window. */
function portalOpen(ctx, kind, { title } = {}) {
  const size = SIZES[kind];
  const b = savedBounds(ctx, kind) || defaultBounds(kind, ctx);
  const transparent = kind === 'mini';
  return {
    action: 'allow',
    overrideBrowserWindowOptions: {
      ...b,
      minWidth: size.minWidth,
      minHeight: size.minHeight,
      resizable: size.resizable,
      frame: false,
      transparent,
      backgroundColor: transparent ? '#00000000' : '#14151e',
      hasShadow: !transparent,
      alwaysOnTop: onTopFor(ctx, kind),
      skipTaskbar: kind !== 'call',
      minimizable: kind === 'call',
      maximizable: false,
      fullscreenable: false,
      show: true,
      title: title || 'Descall',
      icon: ctx.icon || undefined,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false,
      },
    },
  };
}

/** did-create-window for a portal window: lock it down, track it, apply behaviour. */
function setupPortal(ctx, win, kind, featureKey) {
  try { win.setMenu(null); } catch (_) { /* ignore */ }
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  ctx.windows.track(win, { kind, key: featureKey });
  applyBehaviour(ctx, win, kind);
  if (kind !== 'sidebar') rememberBounds(ctx, win, boundsKey(kind));
  try { win.setVisibleOnAllWorkspaces(kind !== 'call', { visibleOnFullScreen: true }); } catch (_) { /* ignore */ }
  // The main renderer draws this window: if it reloads or crashes, the window is orphaned.
  const main = ctx.mainWindow();
  if (main) {
    const wc = main.webContents;
    const close = () => { try { if (!win.isDestroyed()) win.close(); } catch (_) { /* gone */ } };
    // Router pushState is a same-document navigation and keeps the window.
    const onNav = (e, _url, inPlace, isMainFrame) => {
      const sameDoc = e && typeof e.isSameDocument === 'boolean' ? e.isSameDocument : Boolean(inPlace);
      const mainFrame = e && typeof e.isMainFrame === 'boolean' ? e.isMainFrame : isMainFrame !== false;
      if (!sameDoc && mainFrame) close();
    };
    wc.on('did-start-navigation', onNav);
    wc.on('render-process-gone', close);
    win.once('closed', () => {
      try { wc.removeListener('did-start-navigation', onNav); wc.removeListener('render-process-gone', close); } catch (_) { /* gone */ }
    });
  }
}

/** Close every tracked window of a kind. */
function closeKind(ctx, kind) {
  for (const e of ctx.windows.list(kind)) {
    try { e.win.close(); } catch (_) { /* ignore */ }
  }
}

function displayFor(bounds) {
  const { screen } = electron();
  try {
    const d = screen.getDisplayMatching(bounds);
    return d ? { id: d.id, bounds: d.bounds, workArea: d.workArea } : null;
  } catch (_) {
    return null;
  }
}

module.exports = {
  FRAME_PREFIX,
  PORTAL_KINDS,
  DEFAULT_ON_TOP,
  SIZES,
  kindForFrame,
  intersects,
  fitToWorkAreas,
  snapToEdges,
  dockedBounds,
  mapBetweenDisplays,
  fit,
  defaultBounds,
  boundsKey,
  savedBounds,
  onTopFor,
  opacityFor,
  applyBehaviour,
  applyAll,
  allWindows,
  rememberBounds,
  portalOpen,
  setupPortal,
  closeKind,
  displayFor,
};
