'use strict';

/**
 * Descall Ultra advanced_window_mgmt: window behaviour across monitors.
 *  - snap (default on): Descall windows snap to work-area edges when dropped within 18 px.
 *  - keepVisible (default on): when a monitor goes away or changes, windows left
 *    off-screen come back to a visible work area.
 *  - mainMonitor (default on): the main window opens on the monitor it was last on.
 * Event driven: no timers while idle.
 */

const kit = require('../windowKit.cjs');

let ctx = null;
const offs = [];
const hooked = new WeakSet();

function opt(name) {
  return ctx.store.get(`features.advanced_window_mgmt.${name}`, true) !== false;
}

function snapWindow(win) {
  if (!ctx || !opt('snap') || win.isDestroyed() || win.isMaximized() || win.isFullScreen()) return;
  const { screen } = require('electron');
  const b = win.getBounds();
  const area = screen.getDisplayMatching(b).workArea;
  const next = kit.snapToEdges(b, area);
  if (next.x !== b.x || next.y !== b.y) {
    try { win.setPosition(next.x, next.y); } catch (_) { /* ignore */ }
  }
}

function hook(win, kind) {
  if (!win || win.isDestroyed() || hooked.has(win) || kind === 'sidebar') return;
  hooked.add(win);
  let timer = null;
  // 'moved' fires once at the end of a drag on Windows and macOS; Linux only has 'move'.
  const onMoved = () => snapWindow(win);
  const onMove = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => snapWindow(win), 300);
  };
  if (process.platform === 'linux') win.on('move', onMove);
  else win.on('moved', onMoved);
  offs.push(() => {
    hooked.delete(win);
    if (win.isDestroyed()) return;
    win.removeListener('moved', onMoved);
    win.removeListener('move', onMove);
  });
}

function rescue() {
  if (!ctx || !opt('keepVisible')) return;
  for (const [win] of kit.allWindows(ctx)) {
    if (win.isDestroyed() || win.isMaximized()) continue;
    const b = win.getBounds();
    const f = kit.fit(b);
    if (f && (f.x !== b.x || f.y !== b.y || f.width !== b.width || f.height !== b.height)) {
      try { win.setBounds(f); } catch (_) { /* ignore */ }
    }
  }
}

function rememberMainDisplay() {
  const main = ctx?.mainWindow();
  if (!main || main.isMinimized()) return;
  const d = kit.displayFor(main.getBounds());
  if (d) ctx.store.set('advanced.mainDisplay', { id: d.id, bounds: d.bounds });
}

function restoreMainDisplay() {
  if (!opt('mainMonitor')) return;
  const main = ctx.mainWindow();
  const saved = ctx.store.get('advanced.mainDisplay', null);
  if (!main || !saved) return;
  const { screen } = require('electron');
  const target = screen.getAllDisplays().find((d) => d.id === saved.id);
  const current = kit.displayFor(main.getBounds());
  if (!target || !current || current.id === target.id) return;
  const wasMax = main.isMaximized();
  if (wasMax) main.unmaximize();
  const b = kit.fit(kit.mapBetweenDisplays(main.getBounds(), current.bounds, target.bounds));
  if (b) main.setBounds(b);
  if (wasMax) main.maximize();
}

module.exports = {
  key: 'advanced_window_mgmt',
  start(c) {
    ctx = c;
    const main = ctx.mainWindow();
    if (main) {
      hook(main, 'main');
      restoreMainDisplay();
      const onMain = () => rememberMainDisplay();
      main.on('moved', onMain);
      main.on('maximize', onMain);
      offs.push(() => { main.removeListener('moved', onMain); main.removeListener('maximize', onMain); });
    }
    for (const e of ctx.windows.list()) hook(e.win, e.kind);
    const onOpened = ({ win, kind }) => hook(win, kind);
    ctx.bus.on('window-opened', onOpened);
    offs.push(() => ctx.bus.off('window-opened', onOpened));
    const { screen } = require('electron');
    const onDisplays = () => setTimeout(rescue, 300);
    screen.on('display-removed', onDisplays);
    screen.on('display-metrics-changed', onDisplays);
    offs.push(() => { screen.removeListener('display-removed', onDisplays); screen.removeListener('display-metrics-changed', onDisplays); });
    ctx.handle('premium:windows:rescue', () => { rescue(); return { ok: true }; }, { from: 'app' });
  },
  stop() {
    while (offs.length) {
      try { offs.pop()(); } catch (_) { /* ignore */ }
    }
    ctx = null;
  },
};
