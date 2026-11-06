"use strict";

/**
 * Backend mirror of frontend/src/premium/features.js (CommonJS). Keep the two lists identical:
 * features.selftest.cjs compares them. A "plus" key is also on "ultra"; desktop = desktop app only.
 */

const TIERS = Object.freeze(["plus", "ultra"]);

const FEATURES = Object.freeze([
  { key: "mini_mode", tier: "plus", desktop: false },
  { key: "always_on_top", tier: "plus", desktop: true },
  { key: "pip_call", tier: "plus", desktop: true },
  { key: "multi_window", tier: "plus", desktop: true },
  { key: "window_opacity", tier: "plus", desktop: true },
  { key: "session_restore", tier: "plus", desktop: true },
  { key: "tray_controls_plus", tier: "plus", desktop: true },
  { key: "taskbar_plus", tier: "plus", desktop: true },
  { key: "global_mute", tier: "plus", desktop: true },
  { key: "global_ptt", tier: "plus", desktop: true },
  { key: "custom_hotkeys", tier: "plus", desktop: true },
  { key: "media_keys", tier: "plus", desktop: true },
  { key: "quick_launcher", tier: "plus", desktop: true },
  { key: "notification_history", tier: "plus", desktop: false },
  { key: "focus_mode", tier: "plus", desktop: false },
  { key: "notification_profiles", tier: "plus", desktop: false },
  { key: "mic_presets", tier: "plus", desktop: false },
  { key: "noise_gate", tier: "plus", desktop: false },
  { key: "mic_monitor", tier: "plus", desktop: false },
  { key: "voice_activity_monitor", tier: "plus", desktop: false },
  { key: "auto_device_switch", tier: "plus", desktop: false },
  { key: "audio_routing", tier: "plus", desktop: false },
  { key: "audio_device_profiles", tier: "plus", desktop: false },
  { key: "game_status", tier: "plus", desktop: true },
  { key: "game_session_history", tier: "plus", desktop: true },
  { key: "smart_game_notifications", tier: "plus", desktop: true },
  { key: "clipboard_history", tier: "plus", desktop: true },
  { key: "quick_file_drop", tier: "plus", desktop: true },
  { key: "app_lock", tier: "plus", desktop: true },
  { key: "quick_actions", tier: "plus", desktop: false },
  { key: "desktop_sidebar", tier: "ultra", desktop: true },
  { key: "screen_edge_actions", tier: "ultra", desktop: true },
  { key: "window_layouts", tier: "ultra", desktop: true },
  { key: "advanced_window_mgmt", tier: "ultra", desktop: true },
  { key: "voice_hud", tier: "ultra", desktop: true },
  { key: "gaming_hud", tier: "ultra", desktop: true },
  { key: "instant_clip", tier: "ultra", desktop: true },
  { key: "per_user_volume_hotkeys", tier: "ultra", desktop: true },
  { key: "stream_audio_control", tier: "ultra", desktop: true },
  { key: "workspace_profiles", tier: "ultra", desktop: false },
  { key: "desktop_automations", tier: "ultra", desktop: true },
  { key: "activity_timeline", tier: "ultra", desktop: false },
  { key: "command_center", tier: "ultra", desktop: true },
  { key: "widgets", tier: "ultra", desktop: true },
  { key: "custom_layouts", tier: "ultra", desktop: true },
  { key: "multi_account", tier: "ultra", desktop: true },
  { key: "quick_reply", tier: "plus", desktop: true },
].map((f) => Object.freeze(f)));

const KEYS = new Set(FEATURES.map((f) => f.key));

/** Feature keys a plan unlocks ("ultra" includes every "plus" key). Unknown or no plan: []. */
function featuresFor(plan) {
  if (plan === "ultra") return FEATURES.map((f) => f.key);
  if (plan === "plus") return FEATURES.filter((f) => f.tier === "plus").map((f) => f.key);
  return [];
}

function isFeatureKey(key) {
  return KEYS.has(String(key));
}

module.exports = { TIERS, FEATURES, featuresFor, isFeatureKey };
