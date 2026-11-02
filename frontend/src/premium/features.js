/**
 * Descall+ / Descall Ultra feature keys (docs/premium/CONTRACT.md, "Feature keys").
 * One list shared by the client and mirrored by backend/lib/premium/entitlements.js.
 * A key marked "plus" is also available on "ultra". Free baseline features are not listed.
 */
export const TIERS = ["plus", "ultra"];

const P = (key, desktop) => ({ key, tier: "plus", desktop: Boolean(desktop) });
const U = (key, desktop) => ({ key, tier: "ultra", desktop: Boolean(desktop) });

export const FEATURES = [
  P("mini_mode", true), P("always_on_top", true), P("pip_call", true), P("multi_window", true),
  P("window_opacity", true), P("session_restore", true), P("tray_controls_plus", true), P("taskbar_plus", true),
  P("global_mute", true), P("global_ptt", true), P("custom_hotkeys", true), P("media_keys", true),
  P("quick_launcher", true), P("notification_history", false), P("focus_mode", false),
  P("notification_profiles", false), P("mic_presets", false), P("noise_gate", false), P("mic_monitor", false),
  P("voice_activity_monitor", false), P("auto_device_switch", false), P("audio_routing", false),
  P("audio_device_profiles", false), P("game_status", true), P("game_session_history", true),
  P("smart_game_notifications", true), P("clipboard_history", true), P("quick_file_drop", true),
  P("app_lock", true), P("quick_actions", false),
  U("desktop_sidebar", true), U("screen_edge_actions", true), U("window_layouts", true),
  U("advanced_window_mgmt", true), U("voice_hud", true), U("gaming_hud", true), U("instant_clip", true),
  U("per_user_volume_hotkeys", true), U("stream_audio_control", true), U("workspace_profiles", false),
  U("desktop_automations", true), U("activity_timeline", false), U("command_center", true), U("widgets", true),
  U("custom_layouts", true), U("multi_account", true),
  P("quick_reply", true),
];

export const FEATURE_MAP = Object.fromEntries(FEATURES.map((f) => [f.key, f]));

const RANK = { plus: 1, ultra: 2 };

/** True when a plan ("plus" | "ultra" | null) includes a feature of the given tier. */
export function tierAllows(plan, tier) {
  const have = RANK[String(plan || "")] || 0;
  const need = RANK[String(tier || "")] || 0;
  return have > 0 && need > 0 && have >= need;
}

/** Feature keys a plan unlocks. */
export function featuresForPlan(plan) {
  return FEATURES.filter((f) => tierAllows(plan, f.tier)).map((f) => f.key);
}
