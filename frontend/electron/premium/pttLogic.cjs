'use strict';

/**
 * Push-to-talk logic shared by the native hold mode (uiohook-napi) and the
 * toggle fallback (globalShortcut has no key-up). Pure, no electron import.
 */

const { normalizeAccelerator } = require('./hotkeyLogic.cjs');

// Accelerator key name -> UiohookKey property name.
const KEY_ALIASES = {
  Return: 'Enter',
  Esc: 'Escape',
  Up: 'ArrowUp',
  Down: 'ArrowDown',
  Left: 'ArrowLeft',
  Right: 'ArrowRight',
  Plus: 'Equal',
  num0: 'Numpad0', num1: 'Numpad1', num2: 'Numpad2', num3: 'Numpad3', num4: 'Numpad4',
  num5: 'Numpad5', num6: 'Numpad6', num7: 'Numpad7', num8: 'Numpad8', num9: 'Numpad9',
  numdec: 'NumpadDecimal', numadd: 'NumpadAdd', numsub: 'NumpadSubtract', nummult: 'NumpadMultiply', numdiv: 'NumpadDivide',
  '`': 'Backquote', '-': 'Minus', '=': 'Equal', '[': 'BracketLeft', ']': 'BracketRight', ';': 'Semicolon',
  "'": 'Quote', ',': 'Comma', '.': 'Period', '/': 'Slash', '\\': 'Backslash',
};

/** uiohook mouse button numbers (1 left, 2 right, 3 middle, 4 / 5 side buttons). */
const MOUSE_BUTTONS = { Mouse3: 3, Mouse4: 4, Mouse5: 5 };

/**
 * Hook spec for an accelerator, or null when the native hook cannot match it.
 * { kind: 'mouse', button } | { kind: 'key', keycode, ctrl, alt, shift, meta }
 */
function bindingToHookSpec(accel, UiohookKey = {}) {
  const a = normalizeAccelerator(String(accel || ''));
  if (!a) return null;
  if (MOUSE_BUTTONS[a]) return { kind: 'mouse', button: MOUSE_BUTTONS[a] };
  const parts = a.split('+');
  const key = parts.pop();
  const name = KEY_ALIASES[key] || key;
  const keycode = UiohookKey[name];
  if (typeof keycode !== 'number') return null;
  const mods = new Set(parts);
  return {
    kind: 'key',
    keycode,
    ctrl: mods.has('Control') || mods.has('CommandOrControl'),
    alt: mods.has('Alt') || mods.has('AltGr'),
    shift: mods.has('Shift'),
    meta: mods.has('Super') || mods.has('Command'),
  };
}

/** Does a uiohook event press / release the binding? type: keydown|keyup|mousedown|mouseup */
function matchHookEvent(spec, type, e = {}) {
  if (!spec || !e) return null;
  if (spec.kind === 'mouse') {
    if (type !== 'mousedown' && type !== 'mouseup') return null;
    if (Number(e.button) !== spec.button) return null;
    return type === 'mousedown' ? 'down' : 'up';
  }
  if (type !== 'keydown' && type !== 'keyup') return null;
  if (Number(e.keycode) !== spec.keycode) return null;
  if (type === 'keyup') return 'up'; // releasing the key ends talk, whatever modifiers are still held
  if (spec.ctrl && !e.ctrlKey) return null;
  if (spec.alt && !e.altKey) return null;
  if (spec.shift && !e.shiftKey) return null;
  if (spec.meta && !e.metaKey) return null;
  return 'down';
}

/**
 * Talk state with a short release tail (so the last syllable is not cut) and
 * key-repeat suppression. onChange(talking) fires on transitions only.
 * Toggle mode (fallback): each press flips; auto-off after timeoutMs.
 */
function createPttState({ onChange, releaseDelayMs = 150, timeoutMs = 10000, timers = { setTimeout, clearTimeout } } = {}) {
  let talking = false;
  let releaseTimer = null;
  let timeoutTimer = null;

  function set(next) {
    if (talking === next) return;
    talking = next;
    try { onChange && onChange(talking); } catch (_) { /* ignore */ }
  }
  function clearRelease() {
    if (releaseTimer) { timers.clearTimeout(releaseTimer); releaseTimer = null; }
  }
  function clearTimeoutTimer() {
    if (timeoutTimer) { timers.clearTimeout(timeoutTimer); timeoutTimer = null; }
  }

  return {
    press() {
      clearRelease();
      set(true);
    },
    release() {
      if (!talking) return;
      clearRelease();
      if (releaseDelayMs <= 0) { set(false); return; }
      releaseTimer = timers.setTimeout(() => { releaseTimer = null; set(false); }, releaseDelayMs);
    },
    toggle() {
      clearRelease();
      clearTimeoutTimer();
      if (talking) { set(false); return; }
      set(true);
      if (timeoutMs > 0) timeoutTimer = timers.setTimeout(() => { timeoutTimer = null; set(false); }, timeoutMs);
    },
    reset() {
      clearRelease();
      clearTimeoutTimer();
      set(false);
    },
    get talking() { return talking; },
  };
}

module.exports = { bindingToHookSpec, matchHookEvent, createPttState, MOUSE_BUTTONS };
