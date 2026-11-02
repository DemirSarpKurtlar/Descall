'use strict';

/**
 * Custom layouts (Ultra): named widget layouts saved in the main process (userData/premium)
 * so they survive a cache wipe, applied through the widgets service.
 */

let ctx = null;
const MAX_LAYOUTS = 8;

function readAll() {
  const v = ctx.store('custom_layouts').read({ layouts: [], active: null });
  return { layouts: Array.isArray(v.layouts) ? v.layouts : [], active: v.active || null };
}

module.exports = {
  key: 'custom_layouts',
  start(c) {
    ctx = c;
    ctx.handle('premium:custom_layouts:list', () => ({ ok: true, ...readAll() }));
    ctx.handle('premium:custom_layouts:save', (_e, layout) => {
      const name = String(layout?.name || '').trim().slice(0, 40);
      if (!name) return { ok: false, error: 'name' };
      const all = readAll();
      const widgets = Array.isArray(layout.widgets) ? layout.widgets.slice(0, 4) : [];
      const id = String(layout.id || `l${Date.now().toString(36)}`).replace(/[^a-z0-9_-]/gi, '').slice(0, 32);
      const rest = all.layouts.filter((l) => l.id !== id);
      if (rest.length >= MAX_LAYOUTS) return { ok: false, error: 'limit' };
      const next = { layouts: [...rest, { id, name, widgets, savedAt: new Date().toISOString() }], active: id };
      ctx.store('custom_layouts').write(next);
      return { ok: true, ...next };
    });
    ctx.handle('premium:custom_layouts:remove', (_e, id) => {
      const all = readAll();
      const next = { layouts: all.layouts.filter((l) => l.id !== id), active: all.active === id ? null : all.active };
      ctx.store('custom_layouts').write(next);
      return { ok: true, ...next };
    });
    ctx.handle('premium:custom_layouts:apply', (_e, id) => {
      const all = readAll();
      const layout = all.layouts.find((l) => l.id === id);
      const widgets = ctx.shared.get('widgets');
      if (!layout || !widgets) return { ok: false, error: layout ? 'widgets_off' : 'missing' };
      ctx.store('custom_layouts').write({ ...all, active: id });
      return { ...widgets.apply(layout.widgets), layout };
    });
  },
  stop() {
    ctx = null;
  },
};
