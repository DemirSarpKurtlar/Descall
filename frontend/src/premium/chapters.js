/**
 * Chapters of the Descall+ category pages (approved draft E, "Hikaye":
 * docs/design/premium-settings/category-drafts/e-windows.png, e-audio.png).
 * A category page opens with a scene of the whole category, then its features in numbered
 * chapters. Every key of a category is in exactly one of its chapters
 * (chapters.selftest.mjs). Titles and leads: premiumStory.ch.<category>.<chapter>.
 * `pins`: feature keys marked with their number on the hero scene, in reading order.
 */
export const PREMIUM_CHAPTERS = Object.freeze({
  windows: Object.freeze([
    { id: "call", keys: ["mini_mode", "pip_call", "always_on_top", "window_opacity"] },
    { id: "windows", keys: ["multi_window", "window_layouts", "custom_layouts", "advanced_window_mgmt", "screen_edge_actions"] },
    { id: "system", keys: ["session_restore", "tray_controls_plus", "taskbar_plus"] },
  ]),
  shortcuts: Object.freeze([
    { id: "voice", keys: ["global_mute", "global_ptt", "per_user_volume_hotkeys"] },
    { id: "keys", keys: ["custom_hotkeys", "media_keys"] },
    { id: "fast", keys: ["quick_launcher", "quick_reply"] },
  ]),
  notifications: Object.freeze([
    { id: "quiet", keys: ["focus_mode", "notification_profiles"] },
    { id: "games", keys: ["smart_game_notifications"] },
    { id: "missed", keys: ["notification_history"] },
  ]),
  audio: Object.freeze([
    { id: "mic", keys: ["noise_gate", "mic_presets", "mic_monitor", "voice_activity_monitor"] },
    { id: "devices", keys: ["auto_device_switch", "audio_routing", "audio_device_profiles"] },
    { id: "stream", keys: ["stream_audio_control"] },
  ]),
  gaming: Object.freeze([
    { id: "overlay", keys: ["voice_hud", "gaming_hud"] },
    { id: "moments", keys: ["instant_clip"] },
    { id: "profile", keys: ["game_status", "game_session_history"] },
  ]),
  productivity: Object.freeze([
    { id: "faster", keys: ["quick_actions", "clipboard_history", "quick_file_drop"] },
    { id: "safe", keys: ["app_lock"] },
  ]),
  desktop_tools: Object.freeze([
    { id: "desk", keys: ["desktop_sidebar", "widgets"] },
    { id: "command", keys: ["command_center"] },
  ]),
  automation: Object.freeze([
    { id: "modes", keys: ["workspace_profiles", "desktop_automations"] },
    { id: "day", keys: ["activity_timeline"] },
    { id: "accounts", keys: ["multi_account"] },
  ]),
});

/** Feature keys of a category in page order (chapter by chapter). */
export function storyOrder(catId) {
  return (PREMIUM_CHAPTERS[catId] || []).flatMap((c) => c.keys);
}

/** "01", "02" ... number of a feature on its category page, or "" when not in it. */
export function storyNumber(catId, key) {
  const i = storyOrder(catId).indexOf(key);
  return i < 0 ? "" : String(i + 1).padStart(2, "0");
}
