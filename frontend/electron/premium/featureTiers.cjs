'use strict';

/**
 * Main-process mirror of src/premium/features.js (tier per key). Only used when
 * /api/premium/me answers without a `features` list. premium.selftest.mjs keeps the
 * two tables identical. No electron import.
 */

const PLAN_RANK = Object.freeze({ plus: 1, ultra: 2 });

const TIERS = Object.freeze({
  mini_mode: 'plus', always_on_top: 'plus', pip_call: 'plus', multi_window: 'plus',
  window_opacity: 'plus', session_restore: 'plus', tray_controls_plus: 'plus', taskbar_plus: 'plus',
  global_mute: 'plus', global_ptt: 'plus', custom_hotkeys: 'plus', media_keys: 'plus',
  quick_launcher: 'plus', notification_history: 'plus', focus_mode: 'plus', notification_profiles: 'plus',
  mic_presets: 'plus', noise_gate: 'plus', mic_monitor: 'plus', voice_activity_monitor: 'plus',
  auto_device_switch: 'plus', audio_routing: 'plus', audio_device_profiles: 'plus', game_status: 'plus',
  game_session_history: 'plus', smart_game_notifications: 'plus', clipboard_history: 'plus',
  quick_file_drop: 'plus', app_lock: 'plus', quick_actions: 'plus',
  desktop_sidebar: 'ultra', screen_edge_actions: 'ultra', window_layouts: 'ultra',
  advanced_window_mgmt: 'ultra', voice_hud: 'ultra', gaming_hud: 'ultra', instant_clip: 'ultra',
  per_user_volume_hotkeys: 'ultra', stream_audio_control: 'ultra', workspace_profiles: 'ultra',
  desktop_automations: 'ultra', activity_timeline: 'ultra', command_center: 'ultra', widgets: 'ultra',
  custom_layouts: 'ultra', multi_account: 'ultra', quick_reply: 'plus',
});

function normalizePlan(plan) {
  const p = String(plan || '').toLowerCase();
  return PLAN_RANK[p] ? p : null;
}

function tierAllows(plan, key) {
  const p = normalizePlan(plan);
  const tier = Object.prototype.hasOwnProperty.call(TIERS, key) ? TIERS[key] : null;
  return Boolean(p && tier && PLAN_RANK[p] >= PLAN_RANK[tier]);
}

function featuresForPlan(plan) {
  return Object.keys(TIERS).filter((k) => tierAllows(plan, k));
}

module.exports = { PLAN_RANK, TIERS, normalizePlan, tierAllows, featuresForPlan };
