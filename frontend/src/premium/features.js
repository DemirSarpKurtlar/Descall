/**
 * Descall+ / Descall Ultra feature keys (phase 1). Single source for the client; the
 * backend (lib/premium/entitlements.js) and Electron main (electron/premium/featureTiers.cjs)
 * mirror it, and features.selftest.mjs checks both against docs/premium/CONTRACT.md.
 *
 * tier:    the lowest plan that unlocks the key ('plus' keys are also on 'ultra').
 * desktop: true when the key only works in the desktop app.
 * Free baseline keys stay free and are not listed. No imports: the backend can load it as is.
 */

export const PLANS = Object.freeze(["plus", "ultra"]);

/** Plan rank; a higher plan includes every key of the lower ones. Unknown plans rank 0 (free). */
export const PLAN_RANK = Object.freeze({ plus: 1, ultra: 2 });

/** DesCoin gifted on every 30-day cycle of an active membership. */
export const PLAN_COIN = Object.freeze({ plus: 5000, ultra: 15000 });

const f = (tier, desktop) => Object.freeze({ tier, desktop });

export const FEATURES = Object.freeze({
  mini_mode: f("plus", true),
  always_on_top: f("plus", true),
  pip_call: f("plus", true),
  multi_window: f("plus", true),
  window_opacity: f("plus", true),
  session_restore: f("plus", true),
  tray_controls_plus: f("plus", true),
  taskbar_plus: f("plus", true),
  global_mute: f("plus", true),
  global_ptt: f("plus", true),
  custom_hotkeys: f("plus", true),
  media_keys: f("plus", true),
  quick_launcher: f("plus", true),
  notification_history: f("plus", false),
  focus_mode: f("plus", false),
  notification_profiles: f("plus", false),
  mic_presets: f("plus", false),
  noise_gate: f("plus", false),
  mic_monitor: f("plus", false),
  voice_activity_monitor: f("plus", false),
  auto_device_switch: f("plus", false),
  audio_routing: f("plus", false),
  audio_device_profiles: f("plus", false),
  game_status: f("plus", true),
  game_session_history: f("plus", true),
  smart_game_notifications: f("plus", true),
  clipboard_history: f("plus", true),
  quick_file_drop: f("plus", true),
  app_lock: f("plus", true),
  quick_actions: f("plus", false),
  desktop_sidebar: f("ultra", true),
  screen_edge_actions: f("ultra", true),
  window_layouts: f("ultra", true),
  advanced_window_mgmt: f("ultra", true),
  voice_hud: f("ultra", true),
  gaming_hud: f("ultra", true),
  instant_clip: f("ultra", true),
  per_user_volume_hotkeys: f("ultra", true),
  stream_audio_control: f("ultra", true),
  workspace_profiles: f("ultra", false),
  desktop_automations: f("ultra", true),
  activity_timeline: f("ultra", false),
  command_center: f("ultra", true),
  widgets: f("ultra", true),
  custom_layouts: f("ultra", true),
  multi_account: f("ultra", true),
  quick_reply: f("plus", true),
});

export const FEATURE_KEYS = Object.freeze(Object.keys(FEATURES));

/** Normalised plan id, or null for free / unknown. */
export function normalizePlan(plan) {
  const p = String(plan || "").toLowerCase();
  return PLAN_RANK[p] ? p : null;
}

/** True when `plan` unlocks feature `key`. Unknown keys and free plans are never allowed. */
export function tierAllows(plan, key) {
  const def = Object.prototype.hasOwnProperty.call(FEATURES, key) ? FEATURES[key] : null;
  const p = normalizePlan(plan);
  if (!def || !p) return false;
  return PLAN_RANK[p] >= PLAN_RANK[def.tier];
}

/** Every key a plan unlocks, in table order. */
export function featuresForPlan(plan) {
  return FEATURE_KEYS.filter((k) => tierAllows(plan, k));
}
