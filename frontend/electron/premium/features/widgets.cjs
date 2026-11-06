'use strict';

const { wrapFeature } = require('../compat.cjs');

/**
 * Desktop widgets (Ultra): small frameless always-on-top windows (online friends, active
 * calls, notifications). The Widget Studio in the renderer places them; dragging a widget
 * by its title reports the new position back so the layout can be saved.
 * Each widget is its own small window (~30-50 MB). The studio caps the count at 4.
 */

const kit = require('../overlayKit.cjs');

const KINDS = new Set(['friends', 'calls', 'notifications']);
const MAX_WIDGETS = 4;
let ctx = null;
const lastByKind = new Map();

function normWidget(w, i) {
  const kind = KINDS.has(w && w.kind) ? w.kind : null;
  if (!kind) return null;
  const n = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);
  return {
    id: String(w.id || `${kind}-${i}`).replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || `${kind}-${i}`,
    kind,
    x: Math.round(n(w.x, -10000, 10000, 40 + i * 30)),
    y: Math.round(n(w.y, -10000, 10000, 80 + i * 30)),
    width: Math.round(n(w.width, 180, 420, 240)),
    height: Math.round(n(w.height, 120, 520, 220)),
    opacity: n(w.opacity, 0.3, 1, 0.95),
  };
}

function apply(widgets) {
  const list = (Array.isArray(widgets) ? widgets : []).slice(0, MAX_WIDGETS).map(normWidget).filter(Boolean);
  const keep = new Set(list.map((w) => `widget:${w.id}`));
  kit.closeWhere((o) => o.id.startsWith('widget:') && !keep.has(o.id));
  for (const w of list) {
    kit.open({
      id: `widget:${w.id}`,
      kind: 'widget',
      bounds: { x: w.x, y: w.y, width: w.width, height: w.height },
      opacity: w.opacity,
      clickThrough: false,
      focusable: false,
      state: lastByKind.get(w.kind) || null,
      onMoved: (b) => ctx?.sendToRenderer('premium:widgets:moved', { id: w.id, x: b.x, y: b.y, width: b.width, height: b.height }),
    }).widgetKind = w.kind;
  }
  return { ok: true, open: list.map((w) => w.id) };
}

function pushState(kind, state) {
  if (!KINDS.has(kind)) return { ok: false };
  lastByKind.set(kind, state || {});
  for (const o of kit.list()) if (o.widgetKind === kind) kit.send(o.id, state || {});
  return { ok: true };
}

function closeAll() {
  kit.closeWhere((o) => o.id.startsWith('widget:'));
  return { ok: true };
}

module.exports = wrapFeature({
  key: 'widgets',
  start(c) {
    ctx = c;
    ctx.shared.set('widgets', { apply, closeAll });
    ctx.handle('premium:widgets:apply', (_e, widgets) => apply(widgets));
    ctx.handle('premium:widgets:state', (_e, kind, state) => pushState(kind, state));
    ctx.handle('premium:widgets:close-all', () => closeAll());
    ctx.handle('premium:widgets:status', () => ({ ok: true, open: kit.list().filter((o) => o.id.startsWith('widget:')).map((o) => ({ id: o.id.slice(7), kind: o.widgetKind, bounds: o.win.getBounds() })) }));
  },
  stop() {
    closeAll();
    lastByKind.clear();
    ctx?.shared.delete('widgets');
    ctx = null;
  },
  _normWidget: normWidget,
});
