'use strict';

/**
 * Descall+ pip_call: the call in a resizable, always-on-top window. The main renderer
 * renders it (portal window, AuxViews.jsx CallView) and puts the live call video in it
 * by sharing the MediaStream (same process, no re-encode). Also the "pop out a call"
 * target of multi_window, since a call cannot move to a second renderer.
 */

const kit = require('../windowKit.cjs');
const { et } = require('../../mainI18n.cjs');

const KIND = 'call';
let ctx = null;

module.exports = {
  key: 'pip_call',
  start(c) {
    ctx = c;
    ctx.onWindowOpen((d) => (kit.kindForFrame(d.frameName) === KIND && d.url === 'about:blank'
      ? kit.portalOpen(ctx, KIND, { title: et('premium.window.call') })
      : null));
    ctx.onDidCreateWindow((win, d) => {
      if (kit.kindForFrame(d?.frameName) !== KIND) return false;
      kit.setupPortal(ctx, win, KIND, 'pip_call');
      return true;
    });
    ctx.handle('premium:pip:toggle', () => ({ ok: ctx.send('premium:toggle', { kind: KIND }) }), { from: 'app' });
  },
  stop() {
    if (ctx) {
      ctx.send('premium:close', { kind: KIND });
      kit.closeKind(ctx, KIND);
    }
    ctx = null;
  },
};
