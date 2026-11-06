'use strict';

/**
 * Descall+ always_on_top: per-window "keep on top" for the main window, the
 * call window, the sidebar and pop-outs (features.always_on_top.<kind>, booleans).
 * The pin button in the mini / call / sidebar bar flips its own window kind.
 * Without this feature the defaults apply (windowKit.DEFAULT_ON_TOP).
 */

const kit = require('../windowKit.cjs');

const KINDS = ['main', 'call', 'sidebar', 'popout'];
let ctx = null;
const offs = [];

function kindOfSender(event) {
  const wc = event?.sender;
  const main = ctx.mainWindow();
  if (main && wc === main.webContents) return 'main';
  const entry = ctx.windows.list().find((e) => e.win.webContents === wc);
  return entry ? entry.kind : null;
}

module.exports = {
  key: 'always_on_top',
  start(c) {
    ctx = c;
    kit.applyAll(ctx);
    ctx.handle('premium:window:pinned', (kind) => {
      const k = KINDS.includes(kind) ? kind : null;
      return k ? { ok: true, pinned: kit.onTopFor(ctx, k) } : { ok: false, error: 'bad-kind' };
    }, { from: 'app' });
    ctx.handle('premium:window:pin', (kind, value, event) => {
      // Portal windows are rendered by the main window, so their pin button arrives from it;
      // a pop-out can only pin itself.
      const sender = kindOfSender(event);
      const k = sender === 'popout' ? 'popout' : KINDS.includes(kind) ? kind : null;
      if (!k) return { ok: false, error: 'bad-kind' };
      ctx.store.patchFeature('always_on_top', { [k]: Boolean(value) });
      kit.applyAll(ctx);
      return { ok: true, pinned: kit.onTopFor(ctx, k) };
    }, { from: 'app' });
    const onOpened = ({ win, kind }) => kit.applyBehaviour(ctx, win, kind);
    const onSettings = (key) => { if (key === 'always_on_top') kit.applyAll(ctx); };
    ctx.bus.on('window-opened', onOpened);
    ctx.bus.on('settings', onSettings);
    offs.push(() => ctx.bus.off('window-opened', onOpened), () => ctx.bus.off('settings', onSettings));
  },
  stop() {
    while (offs.length) offs.pop()();
    const c = ctx;
    ctx = null;
    // Back to the defaults (gate.has('always_on_top') is already false, or the switch is off).
    if (c) setImmediate(() => kit.applyAll(c));
  },
};
