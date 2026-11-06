'use strict';

/**
 * Descall+ tray_controls_plus: tray menu entries for the call (mute, deafen, leave),
 * your status, and mini mode. Actions go to the main renderer as premium:action,
 * which runs the same handlers as the call UI. The menu is rebuilt only when the
 * call state, the status or the mini mode entitlement changes.
 */

const { et } = require('../../mainI18n.cjs');

const STATUSES = ['online', 'idle', 'dnd', 'invisible'];
let ctx = null;
let lastKey = '';
const offs = [];

function items() {
  const call = ctx.state.call || {};
  const status = STATUSES.includes(ctx.state.app?.status) ? ctx.state.app.status : 'online';
  const act = (action, value) => () => {
    ctx?.send('premium:action', { action, value });
  };
  const out = [];
  if (call.active) {
    out.push(
      { label: et('premium.tray.inCall', { title: call.title || '' }), enabled: false },
      { label: call.muted ? et('premium.tray.unmute') : et('premium.tray.mute'), click: act('mute') },
      { label: call.deafened ? et('premium.tray.undeafen') : et('premium.tray.deafen'), click: act('deafen') },
      { label: et('premium.tray.hangup'), click: act('leave') },
      { type: 'separator' },
    );
  }
  out.push({
    label: et('premium.tray.status'),
    submenu: STATUSES.map((s) => ({ label: et(`premium.tray.${s}`), type: 'radio', checked: s === status, click: act('status', s) })),
  });
  if (ctx.gate.has('mini_mode')) {
    out.push({ label: et('premium.tray.mini'), click: () => { ctx?.send('premium:open', { kind: 'mini' }); } });
  }
  return out;
}

function maybeRefresh() {
  if (!ctx) return;
  const c = ctx.state.call || {};
  const key = [c.active, c.title, c.muted, c.deafened, ctx.state.app?.status, ctx.gate.has('mini_mode')].join('|');
  if (key === lastKey) return;
  lastKey = key;
  ctx.refreshTray();
}

module.exports = {
  key: 'tray_controls_plus',
  start(c) {
    ctx = c;
    lastKey = '';
    ctx.setTrayItems(items);
    for (const ev of ['call', 'app', 'modules-changed']) {
      ctx.bus.on(ev, maybeRefresh);
      offs.push(() => ctx.bus.off(ev, maybeRefresh));
    }
    maybeRefresh();
  },
  stop() {
    while (offs.length) offs.pop()();
    ctx = null;
  },
};
