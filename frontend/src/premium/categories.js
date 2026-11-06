/**
 * Ayarlar > Descall+ groups the 47 feature keys into 8 categories (approved draft A,
 * docs/design/premium-settings/real/real-a1.png). Every key of FEATURES is in exactly
 * one category (categories.selftest.mjs). `icon` names an export of
 * components/ui/Icon.jsx; `color` is a pp-ico colour class.
 */
export const PREMIUM_CATEGORIES = Object.freeze([
  {
    id: "windows",
    icon: "Monitor",
    color: "blue",
    keys: [
      "mini_mode", "always_on_top", "pip_call", "multi_window", "window_opacity", "session_restore",
      "tray_controls_plus", "taskbar_plus", "window_layouts", "advanced_window_mgmt", "screen_edge_actions", "custom_layouts",
    ],
  },
  {
    id: "shortcuts",
    icon: "Keyboard",
    color: "indigo",
    keys: ["global_mute", "global_ptt", "custom_hotkeys", "media_keys", "quick_launcher", "quick_reply", "per_user_volume_hotkeys"],
  },
  {
    id: "notifications",
    icon: "Bell",
    color: "red",
    keys: ["notification_history", "focus_mode", "notification_profiles", "smart_game_notifications"],
  },
  {
    id: "audio",
    icon: "Mic",
    color: "green",
    keys: [
      "noise_gate", "mic_presets", "mic_monitor", "voice_activity_monitor", "auto_device_switch",
      "audio_routing", "audio_device_profiles", "stream_audio_control",
    ],
  },
  {
    id: "gaming",
    icon: "Gamepad2",
    color: "orange",
    keys: ["game_status", "game_session_history", "voice_hud", "gaming_hud", "instant_clip"],
  },
  {
    id: "productivity",
    icon: "Zap",
    color: "teal",
    keys: ["clipboard_history", "quick_file_drop", "app_lock", "quick_actions"],
  },
  {
    id: "desktop_tools",
    icon: "LayoutDashboard",
    color: "purple",
    keys: ["desktop_sidebar", "widgets", "command_center"],
  },
  {
    id: "automation",
    icon: "Wand2",
    color: "pink",
    keys: ["workspace_profiles", "desktop_automations", "activity_timeline", "multi_account"],
  },
]);

/** Category id of a feature key, or null. */
export function categoryOf(key) {
  const hit = PREMIUM_CATEGORIES.find((c) => c.keys.includes(key));
  return hit ? hit.id : null;
}

/** Days until `iso` (rounded up, never below 0), or null without a date. */
export function daysUntil(iso, now = Date.now()) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.ceil((t - now) / 86400000));
}
