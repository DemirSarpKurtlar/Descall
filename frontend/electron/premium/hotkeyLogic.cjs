'use strict';

/**
 * Pure hotkey logic for the Descall+ global hotkeys (no electron import, so
 * selftests load it). The manager in hotkeys.cjs owns globalShortcut.
 *
 * Accelerators use Electron's syntax ("CommandOrControl+Alt+M"). Mouse
 * buttons ("Mouse4", "Mouse5") are only valid for hold-to-talk, which uses a
 * low-level hook instead of globalShortcut.
 */

const MODIFIER_ORDER = ['CommandOrControl', 'Control', 'Command', 'Alt', 'AltGr', 'Shift', 'Super'];
const MODIFIER_ALIASES = {
  cmdorctrl: 'CommandOrControl',
  commandorcontrol: 'CommandOrControl',
  mod: 'CommandOrControl',
  ctrl: 'Control',
  control: 'Control',
  cmd: 'Command',
  command: 'Command',
  alt: 'Alt',
  option: 'Alt',
  altgr: 'AltGr',
  shift: 'Shift',
  super: 'Super',
  meta: 'Super',
  win: 'Super',
};

const NAMED_KEYS = [
  'Space', 'Tab', 'Backspace', 'Delete', 'Insert', 'Return', 'Enter', 'Up', 'Down', 'Left', 'Right',
  'Home', 'End', 'PageUp', 'PageDown', 'Escape', 'Esc', 'Plus', 'CapsLock', 'NumLock', 'ScrollLock',
  'PrintScreen', 'VolumeUp', 'VolumeDown', 'VolumeMute', 'MediaNextTrack', 'MediaPreviousTrack',
  'MediaStop', 'MediaPlayPause', 'Backquote', 'Minus', 'Equal', 'BracketLeft', 'BracketRight',
  'Semicolon', 'Quote', 'Comma', 'Period', 'Slash', 'Backslash',
  'num0', 'num1', 'num2', 'num3', 'num4', 'num5', 'num6', 'num7', 'num8', 'num9',
  'numdec', 'numadd', 'numsub', 'nummult', 'numdiv',
];
const NAMED_LOWER = new Map(NAMED_KEYS.map((k) => [k.toLowerCase(), k]));
const MEDIA_KEYS = new Set(['MediaNextTrack', 'MediaPreviousTrack', 'MediaStop', 'MediaPlayPause', 'VolumeUp', 'VolumeDown', 'VolumeMute']);
const MOUSE_KEYS = new Set(['Mouse3', 'Mouse4', 'Mouse5']);

/** Shortcuts Descall already registers itself (main.cjs). */
const RESERVED = Object.freeze(['F12', 'CommandOrControl+Shift+I', 'F11']);

/** Action ids, the feature that owns each, and the default binding. */
const ACTIONS = Object.freeze({
  toggle_mute: { feature: 'global_mute', default: 'CommandOrControl+Alt+M' },
  toggle_deafen: { feature: 'global_mute', default: 'CommandOrControl+Alt+D' },
  push_to_talk: { feature: 'global_ptt', default: 'Mouse4', hold: true },
  quick_launcher: { feature: 'quick_launcher', default: 'CommandOrControl+Shift+K' },
  volume_up: { feature: 'per_user_volume_hotkeys', default: 'CommandOrControl+Alt+Up' },
  volume_down: { feature: 'per_user_volume_hotkeys', default: 'CommandOrControl+Alt+Down' },
});

function normalizeKey(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const lower = s.toLowerCase();
  if (/^mouse[345]$/.test(lower)) return `Mouse${lower.slice(5)}`;
  if (/^f([1-9]|1[0-9]|2[0-4])$/.test(lower)) return lower.toUpperCase();
  if (/^[a-z0-9]$/.test(lower)) return lower.toUpperCase();
  if (NAMED_LOWER.has(lower)) return NAMED_LOWER.get(lower);
  if (s.length === 1 && /[`\-=[\];',./\\]/.test(s)) return s;
  return '';
}

/**
 * Canonical form ("ctrl+shift+m" -> "Control+Shift+M"), or "" when invalid.
 * Exactly one non-modifier key; modifiers deduplicated in a fixed order.
 */
function normalizeAccelerator(input) {
  if (typeof input !== 'string') return '';
  const parts = input.split('+').map((p) => p.trim()).filter(Boolean);
  if (!parts.length || parts.length > 5) return '';
  const mods = new Set();
  let key = '';
  for (const part of parts) {
    const mod = MODIFIER_ALIASES[part.toLowerCase()];
    if (mod) { mods.add(mod); continue; }
    if (key) return '';
    key = normalizeKey(part);
    if (!key) return '';
  }
  if (!key) return '';
  if (MOUSE_KEYS.has(key) && mods.size) return '';
  const ordered = MODIFIER_ORDER.filter((m) => mods.has(m));
  return [...ordered, key].join('+');
}

function isMouseBinding(accel) {
  return MOUSE_KEYS.has(accel);
}

function isMediaKey(accel) {
  return MEDIA_KEYS.has(accel);
}

/**
 * A bare letter / digit without a modifier would swallow normal typing in
 * every other app (globalShortcut takes the key away from them).
 */
function needsModifier(accel) {
  if (!accel || isMouseBinding(accel) || isMediaKey(accel)) return false;
  const parts = accel.split('+');
  if (parts.length > 1) return false;
  return /^[A-Z0-9]$/.test(parts[0]) || ['Space', 'Tab', 'Backspace', 'Return', 'Enter', 'Escape', 'Esc'].includes(parts[0]);
}

/** Bare-key aliases compare as equals ("CommandOrControl" covers "Control" on Windows/Linux). */
function comparable(accel, platform = process.platform) {
  if (!accel) return '';
  if (platform === 'darwin') return accel.replace('CommandOrControl', 'Command');
  return accel.replace('CommandOrControl', 'Control');
}

/**
 * Bindings in effect: defaults, overridden by the user's map when custom
 * hotkeys are allowed. A user value of "" disables that action.
 */
function resolveBindings(custom = {}, { allowCustom = false, actions = ACTIONS } = {}) {
  const out = {};
  for (const [id, spec] of Object.entries(actions)) {
    let accel = spec.default;
    if (allowCustom && custom && Object.prototype.hasOwnProperty.call(custom, id)) {
      const raw = custom[id];
      accel = raw === '' || raw === null ? '' : normalizeAccelerator(String(raw)) || spec.default;
    }
    out[id] = accel;
  }
  return out;
}

/**
 * Problems with a binding map, for the settings UI and the manager.
 *   isRegistered(accel): true when this app already holds it outside the map
 *   (globalShortcut.isRegistered), checked for every non-mouse binding.
 * Returns [{ action, accel, reason, other? }], reason one of
 *   invalid | duplicate | reserved | needs_modifier | mouse_not_allowed | registered
 */
function findConflicts(bindings = {}, { isRegistered = null, reserved = RESERVED, platform = process.platform, actions = ACTIONS } = {}) {
  const issues = [];
  const seen = new Map();
  const reservedSet = new Set(reserved.map((r) => comparable(normalizeAccelerator(r), platform)));
  for (const [action, raw] of Object.entries(bindings)) {
    if (!raw) continue;
    const accel = normalizeAccelerator(String(raw));
    if (!accel) { issues.push({ action, accel: String(raw), reason: 'invalid' }); continue; }
    const spec = actions[action] || {};
    if (isMouseBinding(accel) && !spec.hold) { issues.push({ action, accel, reason: 'mouse_not_allowed' }); continue; }
    if (needsModifier(accel) && !spec.hold) { issues.push({ action, accel, reason: 'needs_modifier' }); continue; }
    const key = comparable(accel, platform);
    if (seen.has(key)) {
      issues.push({ action, accel, reason: 'duplicate', other: seen.get(key) });
      continue;
    }
    seen.set(key, action);
    if (reservedSet.has(key)) { issues.push({ action, accel, reason: 'reserved' }); continue; }
    if (typeof isRegistered === 'function' && !isMouseBinding(accel)) {
      let taken = false;
      try { taken = Boolean(isRegistered(accel)); } catch (_) { taken = false; }
      if (taken) issues.push({ action, accel, reason: 'registered' });
    }
  }
  return issues;
}

module.exports = {
  ACTIONS,
  RESERVED,
  normalizeAccelerator,
  isMouseBinding,
  isMediaKey,
  needsModifier,
  comparable,
  resolveBindings,
  findConflicts,
};
