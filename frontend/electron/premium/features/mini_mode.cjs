'use strict';

/**
 * Descall+ mini_mode: a compact, draggable, always-on-top window with the current call
 * controls and the unread count. The main renderer renders it (portal window,
 * src/premium/desktop/AuxViews.jsx MiniView); this module only lets the window open,
 * places it and applies behaviour. Optional: open it when Descall is minimised during a call.
 */

const kit = require('../windowKit.cjs');
const { et } = require('../../mainI18n.cjs');

const KIND = 'mini';
let ctx = null;
let offMinimize = null;

module.exports = {
  key: 'mini_mode',
  start(c) {
    ctx = c;
    ctx.onWindowOpen((d) => (kit.kindForFrame(d.frameName) === KIND && d.url === 'about:blank'
      ? kit.portalOpen(ctx, KIND, { title: et('premium.window.mini') })
      : null));
    ctx.onDidCreateWindow((win, d) => {
      if (kit.kindForFrame(d?.frameName) !== KIND) return false;
      kit.setupPortal(ctx, win, KIND, 'mini_mode');
      return true;
    });
    ctx.handle('premium:mini:toggle', () => ({ ok: ctx.send('premium:toggle', { kind: KIND }) }), { from: 'app' });

    const main = ctx.mainWindow();
    if (main) {
      const onMin = () => {
        if (ctx.store.get('features.mini_mode.autoOnMinimize', false) && ctx.state.call?.active) {
          ctx.send('premium:open', { kind: KIND });
        }
      };
      main.on('minimize', onMin);
      offMinimize = () => { try { main.removeListener('minimize', onMin); } catch (_) { /* gone */ } };
    }
  },
  stop() {
    if (offMinimize) offMinimize();
    offMinimize = null;
    if (ctx) {
      ctx.send('premium:close', { kind: KIND });
      kit.closeKind(ctx, KIND);
    }
    ctx = null;
  },
};
