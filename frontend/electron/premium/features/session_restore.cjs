'use strict';

/**
 * Descall+ session_restore: on launch, reopen the previous pop-outs, mini mode and
 * sidebar, and put the main window back where it was (bounds + maximised, fitted to the
 * monitors that exist now). Voice is never rejoined.
 *
 * Settings (features.session_restore): popouts, mini (mini + sidebar), bounds; all default on.
 * Saved under session.* in premium-settings.json whenever a Descall+ window opens or
 * closes, when the main window moves, and before quit.
 */

const kit = require('../windowKit.cjs');

let ctx = null;
let restoredThisRun = false;
let quitting = false;
let mainTimer = null;
let restoreTimer = null;
const offs = [];

function opt(name) {
  return ctx.store.get(`features.session_restore.${name}`, true) !== false;
}

function snapshot() {
  if (!ctx || quitting && snapshot.done) return;
  const entries = ctx.windows.list();
  ctx.store.set('session.popouts', entries.filter((e) => e.kind === 'popout').map((e) => ({ route: e.meta.route, bounds: e.win.getBounds() })));
  ctx.store.set('session.open', entries.filter((e) => e.kind === 'mini' || e.kind === 'sidebar').map((e) => e.kind));
}

function saveMain() {
  mainTimer = null;
  const w = ctx?.mainWindow();
  if (!w || w.isMinimized()) return;
  const maximized = w.isMaximized();
  const prev = ctx.store.get('session.main', null);
  ctx.store.set('session.main', { bounds: maximized && prev?.bounds ? prev.bounds : w.getBounds(), maximized });
}

function restore() {
  restoreTimer = null;
  if (!ctx || restoredThisRun) return;
  // The renderer host is up once it reported app state (it pushes on mount).
  if (!ctx.state.app?.ready) {
    restoreTimer = setTimeout(restore, 1000);
    return;
  }
  restoredThisRun = true;
  const main = ctx.mainWindow();
  const saved = ctx.store.get('session.main', null);
  if (opt('bounds') && main && saved?.bounds) {
    const b = kit.fit(saved.bounds);
    if (b) {
      try {
        if (saved.maximized) {
          main.setBounds(b);
          main.maximize();
        } else if (!main.isMaximized()) {
          main.setBounds(b);
        }
      } catch (_) { /* ignore */ }
    }
  }
  if (opt('popouts')) {
    for (const p of ctx.store.get('session.popouts', []) || []) ctx.bus.emit('popout:open', { route: p.route, bounds: p.bounds });
  }
  if (opt('mini')) {
    for (const kind of ctx.store.get('session.open', []) || []) {
      if (kind === 'mini' || kind === 'sidebar') ctx.send('premium:open', { kind });
    }
  }
  ctx.log.info('[premium] session restored');
}

module.exports = {
  key: 'session_restore',
  start(c) {
    ctx = c;
    quitting = false;
    snapshot.done = false;
    const onChange = () => { if (!quitting) snapshot(); };
    const onQuit = () => { snapshot(); saveMain(); quitting = true; snapshot.done = true; };
    ctx.bus.on('window-opened', onChange);
    ctx.bus.on('window-closed', onChange);
    ctx.bus.on('before-quit', onQuit);
    offs.push(() => ctx.bus.off('window-opened', onChange), () => ctx.bus.off('window-closed', onChange), () => ctx.bus.off('before-quit', onQuit));
    const main = ctx.mainWindow();
    if (main) {
      const schedule = () => {
        if (mainTimer) clearTimeout(mainTimer);
        mainTimer = setTimeout(saveMain, 800);
      };
      for (const ev of ['move', 'resize', 'maximize', 'unmaximize']) main.on(ev, schedule);
      offs.push(() => { for (const ev of ['move', 'resize', 'maximize', 'unmaximize']) main.removeListener(ev, schedule); });
    }
    if (!restoredThisRun) restoreTimer = setTimeout(restore, 1200);
  },
  stop() {
    while (offs.length) offs.pop()();
    if (mainTimer) clearTimeout(mainTimer);
    if (restoreTimer) clearTimeout(restoreTimer);
    mainTimer = null;
    restoreTimer = null;
    ctx = null;
  },
};
