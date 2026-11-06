'use strict';

const { wrapFeature } = require('../compat.cjs');

/**
 * Desktop automations (Ultra), main side: the OS idle signal for "idle" triggers. Polls
 * powerMonitor every 15 s only while at least one enabled rule uses the idle trigger.
 * The rule engine itself runs in the renderer (src/premium/gaming/ruleEngine.js) and can
 * only fire the fixed action list; no scripts or shell commands, ever.
 */

const { powerMonitor } = require('electron');

let ctx = null;
let timer = null;
let thresholdSec = 0;
let idle = false;

function setIdle(next, seconds) {
  if (next === idle) return;
  idle = next;
  ctx?.sendToRenderer('premium:desktop_automations:idle', { idle, seconds });
}

function onLock() { setIdle(true, thresholdSec); }
function onUnlock() { setIdle(false, 0); }

function arm(sec) {
  clearInterval(timer);
  timer = null;
  thresholdSec = Math.max(0, Math.min(24 * 3600, Math.round(Number(sec) || 0)));
  try { powerMonitor.removeListener('lock-screen', onLock); powerMonitor.removeListener('unlock-screen', onUnlock); } catch (_) { /* ignore */ }
  if (!thresholdSec) { idle = false; return; }
  try { powerMonitor.on('lock-screen', onLock); powerMonitor.on('unlock-screen', onUnlock); } catch (_) { /* ignore */ }
  timer = setInterval(() => {
    let s = 0;
    try { s = powerMonitor.getSystemIdleTime(); } catch (_) { return; }
    setIdle(s >= thresholdSec, s);
  }, 15000);
  timer.unref?.();
}

module.exports = wrapFeature({
  key: 'desktop_automations',
  start(c) {
    ctx = c;
    ctx.handle('premium:desktop_automations:watch-idle', (_e, sec) => { arm(sec); return { ok: true, thresholdSec }; });
  },
  stop() {
    arm(0);
    ctx = null;
  },
});
