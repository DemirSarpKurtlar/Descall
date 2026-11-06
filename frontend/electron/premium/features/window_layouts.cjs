'use strict';

/**
 * Descall Ultra window_layouts: save the current arrangement (main window, mini mode,
 * call window, sidebar, pop-outs) under a name and put it back later. Each window keeps
 * the monitor it was on; if that monitor is gone, its position maps proportionally onto
 * the primary monitor. Applying opens missing windows and moves open ones; it never
 * closes anything.
 *
 * IPC: premium:layouts:list | save(name) | apply(id) | delete(id). Max 12 layouts.
 */

const kit = require('../windowKit.cjs');

const MAX_LAYOUTS = 12;
let ctx = null;

function layouts() {
  const list = ctx.store.get('layouts', []);
  return Array.isArray(list) ? list : [];
}

function describe(win) {
  const b = win.getBounds();
  const d = kit.displayFor(b);
  return { bounds: b, display: d ? { id: d.id, bounds: d.bounds } : null, maximized: Boolean(win.isMaximized?.()) };
}

function capture(name) {
  const main = ctx.mainWindow();
  const windows = ctx.windows.list().map((e) => ({ kind: e.kind, route: e.meta.route || null, ...describe(e.win) }));
  return {
    id: `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: String(name || '').trim().slice(0, 40) || 'Layout',
    createdAt: new Date().toISOString(),
    main: main ? describe(main) : null,
    windows,
  };
}

/** Saved bounds -> bounds on today's monitors. */
function place(entry) {
  const { screen } = require('electron');
  const displays = screen.getAllDisplays();
  const same = entry.display && displays.find((d) => d.id === entry.display.id);
  const target = same || screen.getPrimaryDisplay();
  const mapped = same ? entry.bounds : kit.mapBetweenDisplays(entry.bounds, entry.display?.bounds, target.bounds);
  return kit.fit(mapped);
}

function apply(layout) {
  const main = ctx.mainWindow();
  if (main && layout.main) {
    const b = place(layout.main);
    try {
      if (main.isMaximized()) main.unmaximize();
      if (b) main.setBounds(b);
      if (layout.main.maximized) main.maximize();
    } catch (_) { /* ignore */ }
  }
  for (const w of layout.windows || []) {
    const b = place(w);
    if (!b) continue;
    if (w.kind === 'popout') {
      const open = ctx.windows.find('popout', (e) => e.meta.route === w.route);
      if (open) open.win.setBounds(b);
      else ctx.bus.emit('popout:open', { route: w.route, bounds: b });
      continue;
    }
    if (!kit.PORTAL_KINDS.includes(w.kind)) continue;
    ctx.store.set(kit.boundsKey(w.kind), b);
    const open = ctx.windows.find(w.kind);
    if (open) open.win.setBounds(b);
    else ctx.send('premium:open', { kind: w.kind });
  }
}

module.exports = {
  key: 'window_layouts',
  MAX_LAYOUTS,
  start(c) {
    ctx = c;
    ctx.handle('premium:layouts:list', () => ({
      ok: true,
      layouts: layouts().map((l) => ({ id: l.id, name: l.name, createdAt: l.createdAt, windows: (l.windows || []).length + (l.main ? 1 : 0) })),
    }), { from: 'app' });
    ctx.handle('premium:layouts:save', (name) => {
      const list = layouts();
      if (list.length >= MAX_LAYOUTS) return { ok: false, error: 'limit', max: MAX_LAYOUTS };
      const l = capture(name);
      ctx.store.set('layouts', [...list, l]);
      return { ok: true, id: l.id };
    });
    ctx.handle('premium:layouts:apply', (id) => {
      const l = layouts().find((x) => x.id === id);
      if (!l) return { ok: false, error: 'not-found' };
      apply(l);
      return { ok: true };
    });
    ctx.handle('premium:layouts:delete', (id) => {
      ctx.store.set('layouts', layouts().filter((x) => x.id !== id));
      return { ok: true };
    });
  },
  stop() {
    ctx = null;
  },
};
