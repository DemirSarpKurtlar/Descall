'use strict';

/**
 * global_ptt (Descall+): push-to-talk from any app.
 *
 * Hold mode: Electron's globalShortcut has no key-up, so hold-to-talk uses
 * uiohook-napi (MIT; Node-API prebuilds for win32-x64, darwin and linux, so
 * no compile step and no Electron ABI rebuild). It only observes input (the
 * key still reaches the game) and supports mouse side buttons. It is required
 * lazily, only while this feature runs, and the hook runs only during a call,
 * so idle CPU is unchanged. The hook callback only flips a flag and posts an
 * IPC message: Windows drops low-level hooks whose callback takes over 1 s.
 *
 * Fallback: if the native module cannot load, a keyboard binding becomes a
 * toggle through globalShortcut with an automatic timeout, and the status
 * reports mode 'toggle' with the reason. Never fatal for the app.
 *
 * Elevated games (run as administrator) only deliver input to an elevated
 * hook, so PTT inside them needs Descall run as administrator too (UIPI).
 *
 * Settings: { enabled, releaseDelayMs, toggleTimeoutMs, forceToggle }
 * Renderer: premium:ptt { down }.
 */

const { kit } = require('../moduleKit.cjs');
const { getHotkeys } = require('../hotkeys.cjs');
const { bindingToHookSpec, matchHookEvent, createPttState } = require('../pttLogic.cjs');
const { isMouseBinding } = require('../hotkeyLogic.cjs');

let ctx = null;
let k = null;
let hk = null;
let native = null; // { uIOhook, UiohookKey }
let nativeError = null;
let hookRunning = false;
let ptt = null;
let spec = null;

function num(v, d, lo, hi) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
}

function settings() {
  const s = k ? k.settings() : {};
  return {
    releaseDelayMs: num(s.releaseDelayMs, 150, 0, 1000),
    toggleTimeoutMs: num(s.toggleTimeoutMs, 10000, 1000, 120000),
    forceToggle: Boolean(s.forceToggle),
  };
}

/** Lazy, guarded load of the native hook. Exported for the smoke test. */
function loadNative(requireFn = require) {
  if (native || nativeError) return native;
  try {
    const mod = requireFn('uiohook-napi');
    if (!mod || !mod.uIOhook || typeof mod.uIOhook.start !== 'function') throw new Error('unexpected module shape');
    native = { uIOhook: mod.uIOhook, UiohookKey: mod.UiohookKey || {} };
  } catch (err) {
    nativeError = String(err?.message || err).slice(0, 200);
    ctx?.log.warn('[premium:ptt] native hook unavailable, using toggle mode:', nativeError);
  }
  return native;
}

function binding() {
  return hk ? hk.bindings().push_to_talk || '' : '';
}

function mode() {
  if (!settings().forceToggle && loadNative() && bindingToHookSpec(binding(), native.UiohookKey)) return 'hold';
  return 'toggle';
}

const handlers = {
  keydown: (e) => edge('keydown', e),
  keyup: (e) => edge('keyup', e),
  mousedown: (e) => edge('mousedown', e),
  mouseup: (e) => edge('mouseup', e),
};

function edge(type, e) {
  const hit = matchHookEvent(spec, type, e);
  if (hit === 'down') ptt?.press();
  else if (hit === 'up') ptt?.release();
}

function stopHook() {
  if (!hookRunning || !native) return;
  for (const [type, fn] of Object.entries(handlers)) {
    try { native.uIOhook.off(type, fn); } catch (_) { /* ignore */ }
  }
  try { native.uIOhook.stop(); } catch (_) { /* ignore */ }
  hookRunning = false;
}

function startHook() {
  if (hookRunning || !native) return;
  spec = bindingToHookSpec(binding(), native.UiohookKey);
  if (!spec) return;
  for (const [type, fn] of Object.entries(handlers)) native.uIOhook.on(type, fn);
  try {
    native.uIOhook.start();
    hookRunning = true;
  } catch (err) {
    nativeError = String(err?.message || err).slice(0, 200);
    for (const [type, fn] of Object.entries(handlers)) {
      try { native.uIOhook.off(type, fn); } catch (_) { /* ignore */ }
    }
  }
}

function sync() {
  if (!ctx) return;
  const s = settings();
  ptt?.reset();
  ptt = createPttState({
    onChange: (talking) => ctx?.send('premium:ptt', { down: Boolean(talking) }),
    releaseDelayMs: s.releaseDelayMs,
    timeoutMs: s.toggleTimeoutMs,
  });
  stopHook();
  hk.setHandler('push_to_talk', null);
  if (mode() === 'hold') {
    if (k.inCall()) startHook(); // no input hook at all outside calls
    return;
  }
  if (!isMouseBinding(binding())) hk.setHandler('push_to_talk', () => ptt.toggle());
}

function status() {
  const m = mode();
  return {
    ok: true,
    mode: m,
    binding: binding(),
    nativeAvailable: Boolean(native),
    nativeError,
    hookRunning,
    mouseNeedsNative: m === 'toggle' && isMouseBinding(binding()),
  };
}

module.exports = {
  key: 'global_ptt',
  defaultEnabled: false,
  start(c) {
    ctx = c;
    k = kit(ctx);
    hk = getHotkeys(ctx);
    k.onSettings(['global_ptt', 'custom_hotkeys'], sync);
    k.onCallEdge(sync);
    ctx.handle('premium:global_ptt:status', () => status());
    sync();
  },
  stop() {
    stopHook();
    ptt?.reset();
    ptt = null;
    hk?.setHandler('push_to_talk', null);
    k?.dispose();
    k = null;
    ctx = null;
  },
  loadNative,
  _status: () => (ctx ? status() : null),
};
