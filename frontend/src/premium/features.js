/**
 * Descall+ / Ultra feature keys (docs/premium/CONTRACT.md, "Feature keys").
 * The backend mirrors this list. A key marked `plus` is also on `ultra`.
 * Free baseline keys are not listed: they stay free.
 *
 * NOTE: minimal compatible version written by the hotkey/audio/notification
 * agent; the coordinator reconciles it with the shared copy on merge.
 */

const P = "plus";
const U = "ultra";

function f(tier, desktop) {
  return Object.freeze({ tier, desktop: Boolean(desktop) });
}

export const FEATURES = Object.freeze({
  mini_mode: f(P, true),
  always_on_top: f(P, true),
  pip_call: f(P, true),
  multi_window: f(P, true),
  window_opacity: f(P, true),
  session_restore: f(P, true),
  tray_controls_plus: f(P, true),
  taskbar_plus: f(P, true),
  global_mute: f(P, true),
  global_ptt: f(P, true),
  custom_hotkeys: f(P, true),
  media_keys: f(P, true),
  quick_launcher: f(P, true),
  notification_history: f(P, false),
  focus_mode: f(P, false),
  notification_profiles: f(P, false),
  mic_presets: f(P, false),
  noise_gate: f(P, false),
  mic_monitor: f(P, false),
  voice_activity_monitor: f(P, false),
  auto_device_switch: f(P, false),
  audio_routing: f(P, false),
  audio_device_profiles: f(P, false),
  game_status: f(P, true),
  game_session_history: f(P, true),
  smart_game_notifications: f(P, true),
  clipboard_history: f(P, true),
  quick_file_drop: f(P, true),
  app_lock: f(P, true),
  quick_actions: f(P, false),
  desktop_sidebar: f(U, true),
  screen_edge_actions: f(U, true),
  window_layouts: f(U, true),
  advanced_window_mgmt: f(U, true),
  voice_hud: f(U, true),
  gaming_hud: f(U, true),
  instant_clip: f(U, true),
  per_user_volume_hotkeys: f(U, true),
  stream_audio_control: f(U, true),
  workspace_profiles: f(U, false),
  desktop_automations: f(U, true),
  activity_timeline: f(U, false),
  command_center: f(U, true),
  widgets: f(U, true),
  custom_layouts: f(U, true),
  multi_account: f(U, true),
  quick_reply: f(P, true),
});

export const FEATURE_KEYS = Object.freeze(Object.keys(FEATURES));

const RANK = Object.freeze({ plus: 1, ultra: 2 });

/** True when `plan` ('plus' | 'ultra' | null) includes feature `key`. */
export function tierAllows(plan, key) {
  const spec = FEATURES[key];
  if (!spec) return false;
  const have = RANK[plan] || 0;
  return have > 0 && have >= (RANK[spec.tier] || 99);
}

/** Every key the plan includes. */
export function featuresFor(plan) {
  return FEATURE_KEYS.filter((key) => tierAllows(plan, key));
}

export default FEATURES;
