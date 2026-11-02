'use strict';

/**
 * global_ptt (Descall+): push-to-talk from any app.
 *
 * Hold mode: Electron's globalShortcut has no key-up, so true hold-to-talk
 * uses uiohook-napi (MIT, N-API prebuilds for win32-x64 / darwin / linux,
 * ABI-independent, no compile step). It only observes input (keys still
 * reach the game) and supports mouse side buttons. It is required lazily,
 * only while the feature is on, and the hook runs only during a call, so
 * idle CPU is unchanged.
 *
 * Fallback: if the native module cannot load, the binding (keyboard only)
 * becomes a toggle through globalShortcut with an automatic timeout, and
 * status() reports mode 'toggle' with the reason.
 *
 * Settings: { enabled, releaseDelayMs, toggleTimeoutMs, forceToggle }
 */

const { bindingToHookSpec, matchHookEvent, createPttState } = require('../pttLogic.cjs');
const { isMouseBinding } = require('../hotkeyLogic.cjs');

let ctx = null;
let native = null; // { uIOhook, UiohookKey } once loaded
let nativeError = null;
let hookRunning = false;
let ptt = null;
let spec = null;
let offHandlers = [];

function settings() {
  const s = ctx ? ctx.store.get('global_ptt') : {};
  const n = (v, d, lo, hi) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Number(v))) : d);
  return {
    enabled: Boolean(s.enabled),
    releaseDelayMs: n(s.releaseDelayMs, 150, 0, 1000),
    toggleTimeoutMs: n(s.toggleTimeoutMs, 10000, 1000, 120000),
    forceToggle: Boolean(s.forceToggle),
  };
}

function loadNative() {
  if (native || nativeError) return native;
  try {
    // eslint-disable-next-line global-require
    const mod = require('uiohook-napi');
    if (!mod || !mod.uIOhook || typeof mod.uIOhook.start !== 'function') throw new Error('unexpected module shape');
    native = { uIOhook: mod.uIOhook, UiohookKey: mod.UiohookKey || {} };
  } catch (err) {
    nativeError = String(err?.message || err).slice(0, 200);
    ctx?.log.warn('[premium:ptt] native hook unavailable, using toggle mode:', nativeError);
  }
  return native;
}

function binding() {
  return ctx ? ctx.hotkeys.bindings().push_to_talk || '' : '';
}

function mode() {
  const s = settings();
  if (!s.enabled) return 'off';
  if (!s.forceToggle && loadNative() && bindingToHookSpec(binding(), native.UiohookKey)) return 'hold';
  return 'toggle';
}

function onTalk(talking) {
  ctx?.send('premium:ptt', { down: Boolean(talking) });
}

const handlers = {
  keydown: (e) => handle('keydown', e),
  keyup: (e) => handle('keyup', e),
  mousedown: (e) => handle('mousedown', e),
  mouseup: (e) => handle('mouseup', e),
};

function handle(type, e) {
  const edge = matchHookEvent(spec, type, e);
  if (edge === 'down') ptt.press();
  else if (edge === 'up') ptt.release();
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
  ptt = createPttState({ onChange: onTalk, releaseDelayMs: s.releaseDelayMs, timeoutMs: s.toggleTimeoutMs });
  stopHook();
  ctx.hotkeys.setHandler('push_to_talk', null);
  const m = mode();
  if (m === 'off') return;
  if (m === 'hold') {
    // Hook only while a call is live: no input hook at all otherwise.
    if (ctx.voice.inCall) startHook();
    return;
  }
  if (!isMouseBinding(binding())) ctx.hotkeys.setHandler('push_to_talk', () => ptt.toggle());
}

module.exports = {
  key: 'global_ptt',
  start(c) {
    ctx = c;
    const onSettings = (key) => { if (key === 'global_ptt' || key === 'custom_hotkeys') sync(); };
    // Only joining / leaving a call matters (mute changes while holding must not reset talk).
    let lastInCall = Boolean(ctx.voice.inCall);
    const onVoice = (v) => {
      if (Boolean(v?.inCall) === lastInCall) return;
      lastInCall = Boolean(v?.inCall);
      sync();
    };
    ctx.events.on('settings', onSettings);
    ctx.events.on('voice-state', onVoice);
    offHandlers = [() => ctx.events.off('settings', onSettings), () => ctx.events.off('voice-state', onVoice)];
    sync();
  },
  stop() {
    if (!ctx) return;
    stopHook();
    ptt?.reset();
    ctx.hotkeys.setHandler('push_to_talk', null);
    offHandlers.forEach((fn) => fn());
    offHandlers = [];
    ctx = null;
  },
  status() {
    if (!ctx) return null;
    const m = mode();
    return {
      enabled: settings().enabled,
      mode: m,
      binding: binding(),
      nativeAvailable: Boolean(native) && !nativeError,
      nativeError,
      hookRunning,
      mouseNeedsNative: isMouseBinding(binding()) && m === 'toggle',
    };
  },
};
