'use strict';

/**
 * Descall Ultra screen_edge_actions: reveal the desktop sidebar when the pointer rests on
 * the chosen screen edge. Polls screen.getCursorScreenPoint() at a low rate, and only
 * while this module runs (feature on AND enabled; off by default) and the sidebar
 * feature is available. Settings: edge 'left'|'right' (default: the sidebar's edge),
 * delay in ms (default 250).
 */

const POLL_MS = 120;
let ctx = null;
let timer = null;
let since = 0;
let fired = false;

function edgeSetting() {
  const own = ctx.store.get('features.screen_edge_actions.edge', '');
  if (own === 'left' || own === 'right') return own;
  return ctx.store.get('features.desktop_sidebar.edge', 'right') === 'left' ? 'left' : 'right';
}

/** Pure: is the point on the edge of the display bounds? */
function atEdge(point, bounds, edge) {
  if (point.y < bounds.y || point.y >= bounds.y + bounds.height) return false;
  return edge === 'left' ? point.x <= bounds.x + 1 : point.x >= bounds.x + bounds.width - 2;
}

function tick() {
  if (!ctx || !ctx.gate.has('desktop_sidebar')) return;
  const { screen } = require('electron');
  const p = screen.getCursorScreenPoint();
  const d = screen.getDisplayNearestPoint(p);
  const delay = Math.min(1500, Math.max(0, Number(ctx.store.get('features.screen_edge_actions.delay', 250)) || 0));
  if (d && atEdge(p, d.bounds, edgeSetting())) {
    if (!since) since = Date.now();
    if (!fired && Date.now() - since >= delay) {
      fired = true;
      ctx.bus.emit('sidebar:reveal', p);
    }
  } else {
    since = 0;
    fired = false;
  }
}

module.exports = {
  key: 'screen_edge_actions',
  defaultEnabled: false,
  atEdge,
  start(c) {
    ctx = c;
    since = 0;
    fired = false;
    timer = setInterval(tick, POLL_MS);
    if (typeof timer.unref === 'function') timer.unref();
  },
  stop() {
    if (timer) clearInterval(timer);
    timer = null;
    ctx = null;
  },
};
