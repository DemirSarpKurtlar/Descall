/**
 * Every setting of every Descall+ feature, as the category pages show it (approved draft E).
 * Extends docs/design/premium-settings/category-drafts/checklist.json (2 categories) to all
 * 47 keys. Each entry is a `data-s="<key>.<item>"` the page must contain once the feature's
 * card is open: "enabled" is the card switch (story/StoryCategory.jsx), the rest come from
 * the panel (settings/<key>.jsx). Info lines (hints, notes) are listed too, so none is lost.
 *
 * A leading "?" marks an item that shows only in some states (an error, an empty or a
 * non-empty list, a mode, the web build ...); the page check reports it but does not fail.
 *
 * Checked by settingsChecklist.selftest.mjs (each item is named in its panel source) and by
 * docs/design/premium-settings/implemented-e/capture-e.cjs with CHECK=1 (each card opened
 * in the running app, desktop bridge mocked).
 */
export const SETTINGS_CHECKLIST = Object.freeze({
  // windows
  mini_mode: ["enabled", "dock", "info"],
  always_on_top: ["enabled", "lead", "main", "call", "sidebar", "popout"],
  pip_call: ["enabled", "open"],
  multi_window: ["enabled", "how", "list", "count", "closeAll"],
  window_opacity: ["enabled", "lead", "call", "sidebar", "popout"],
  session_restore: ["enabled", "popouts", "mini", "bounds"],
  tray_controls_plus: ["enabled", "lead"],
  taskbar_plus: ["enabled", "badge", "buttons"],
  window_layouts: ["enabled", "list", "?apply", "?delete", "name", "save"],
  advanced_window_mgmt: ["enabled", "snap", "keepVisible", "mainMonitor"],
  screen_edge_actions: ["enabled", "lead", "edge", "?needsSidebar", "delay"],
  custom_layouts: ["enabled", "list", "?apply", "?active", "?remove", "name", "save"],
  // shortcuts
  global_mute: ["enabled", "hint", "mute", "deafen", "?failures", "remap"],
  global_ptt: ["enabled", "hint", "binding", "releaseDelay", "forceToggle", "?toggleTimeout", "?mode", "elevated"],
  custom_hotkeys: [
    "enabled", "hint", "toggle_mute", "toggle_deafen", "push_to_talk", "quick_launcher", "volume_up", "volume_down",
    "save", "?saveAnyway", "cancel", "reset", "?failures", "?saved",
  ],
  media_keys: ["enabled", "hint", "playPause", "next", "previous", "stop", "?taken"],
  quick_launcher: ["enabled", "hint", "hotkey", "open"],
  quick_reply: ["enabled", "hint", "?mode"],
  per_user_volume_hotkeys: ["enabled", "hint", "up", "down", "step", "pinNote"],
  // notifications
  notification_history: ["enabled", "hint", "unread", "markAllRead", "clear", "list", "?open", "?delete"],
  focus_mode: ["enabled", "hint", "status", "?end", "durations", "allowCalls", "allowDms", "trayNote"],
  notification_profiles: ["enabled", "hint", "mode", "now", "schedule", "?start", "?end", "?days", "edit", "style", "matrix"],
  smart_game_notifications: ["enabled", "hint", "summary", "state", "detectNote"],
  // audio
  noise_gate: ["enabled", "hint", "threshold", "meter", "test", "?state", "hysteresis", "hold", "?micError"],
  mic_presets: ["enabled", "hint", "gain", "current", "list", "?apply", "?delete", "name", "save"],
  mic_monitor: ["enabled", "hint", "volume", "headphones"],
  voice_activity_monitor: ["enabled", "hint"],
  auto_device_switch: ["enabled", "hint", "headsetFirst", "inputOrder", "outputOrder", "?move", "?remove", "?add"],
  audio_routing: ["enabled", "hint", "callOutput", "notificationOutput", "test", "?unsupported"],
  audio_device_profiles: ["enabled", "hint", "list", "?apply", "?delete", "name", "input", "output", "preset", "create", "trayNote"],
  stream_audio_control: ["enabled", "sendHint", "sendVolume", "sendMuted", "viewHint", "viewVolume", "viewMuted", "note"],
  // gaming
  game_status: ["enabled", "desc", "now", "?share", "visibility", "help"],
  game_session_history: ["enabled", "desc", "range", "total", "?totals", "list"],
  voice_hud: ["enabled", "desc", "on", "corner", "size", "opacity", "margin", "help"],
  gaming_hud: ["enabled", "desc", "on", "showClock", "showPing", "showCall", "showFriends", "corner", "size", "opacity", "margin", "help", "noFps"],
  instant_clip: ["enabled", "source", "pick", "?sources", "length", "quality", "hotkey", "on", "?status", "help", "audioNote"],
  // productivity
  clipboard_history: ["enabled", "desc", "on", "help", "count", "list", "clear"],
  quick_file_drop: ["enabled", "desc", "on", "help"],
  app_lock: ["enabled", "desc", "?currentPin", "newPin", "setPin", "?removePin", "lock", "idle", "onMinimize", "onSystemLock", "lockNow", "help"],
  quick_actions: ["enabled", "desc", "type", "?choose", "add", "list", "help"],
  // desktop tools
  desktop_sidebar: ["enabled", "edge", "autoHide", "open"],
  widgets: ["enabled", "desc", "on", "add", "list", "help"],
  command_center: ["enabled", "desc", "open", "?hotkey", "help"],
  // automation
  workspace_profiles: ["enabled", "desc", "profiles", "switch", "status", "notifications", "audio", "layout", "hotkey", "help"],
  desktop_automations: ["enabled", "desc", "on", "when", "?gameFilter", "?between", "?afterMinutes", "then", "?thenArg", "add", "rules", "help"],
  activity_timeline: ["enabled", "desc", "day", "summary", "bar", "list"],
  multi_account: ["enabled", "desc", "list", "add", "help"],
});

/** Items that must be on the page: { key: ["key.item", ...] } (optional ones left out). */
export function requiredItems(key) {
  return (SETTINGS_CHECKLIST[key] || []).filter((i) => !i.startsWith("?")).map((i) => `${key}.${i}`);
}

/** Every item, optional ones included, without the "?" mark. */
export function allItems(key) {
  return (SETTINGS_CHECKLIST[key] || []).map((i) => `${key}.${i.replace(/^\?/, "")}`);
}
