'use strict';

/**
 * Premium entitlements (docs/premium/CONTRACT.md, "Entitlements"). Minimal helper:
 *  - featuresFor(plan): feature keys a plan unlocks (mirror of src/premium/features.js,
 *    kept equal by entitlements.selftest.cjs)
 *  - hasFeature(userId, feature): reads the user's current user_subscriptions row, cached 30 s
 *  - requireFeature(feature): Express middleware, 403 PREMIUM_REQUIRED otherwise
 * A missing table or row means no plan (fail closed).
 */

const PLUS = [
  'mini_mode', 'always_on_top', 'pip_call', 'multi_window', 'window_opacity', 'session_restore',
  'tray_controls_plus', 'taskbar_plus', 'global_mute', 'global_ptt', 'custom_hotkeys', 'media_keys',
  'quick_launcher', 'notification_history', 'focus_mode', 'notification_profiles', 'mic_presets',
  'noise_gate', 'mic_monitor', 'voice_activity_monitor', 'auto_device_switch', 'audio_routing',
  'audio_device_profiles', 'game_status', 'game_session_history', 'smart_game_notifications',
  'clipboard_history', 'quick_file_drop', 'app_lock', 'quick_actions', 'quick_reply',
];
const ULTRA_ONLY = [
  'desktop_sidebar', 'screen_edge_actions', 'window_layouts', 'advanced_window_mgmt', 'voice_hud',
  'gaming_hud', 'instant_clip', 'per_user_volume_hotkeys', 'stream_audio_control', 'workspace_profiles',
  'desktop_automations', 'activity_timeline', 'command_center', 'widgets', 'custom_layouts', 'multi_account',
];
const FEATURE_TIER = Object.freeze(Object.fromEntries([
  ...PLUS.map((k) => [k, 'plus']),
  ...ULTRA_ONLY.map((k) => [k, 'ultra']),
]));
const RANK = { plus: 1, ultra: 2 };
const CACHE_MS = 30_000;
const cache = new Map(); // userId -> { at, plan }

function featuresFor(plan) {
  const have = RANK[plan] || 0;
  if (!have) return [];
  return Object.keys(FEATURE_TIER).filter((k) => RANK[FEATURE_TIER[k]] <= have);
}

function activePlan(row, now = Date.now()) {
  if (!row || row.status !== 'active' || !RANK[row.plan_id]) return null;
  if (!row.unlimited && row.ends_at && Date.parse(row.ends_at) <= now) return null;
  return row.plan_id;
}

let supabaseRef = null;
function db() {
  if (!supabaseRef) supabaseRef = require('../../db/supabase');
  return supabaseRef;
}

async function planFor(userId) {
  if (!userId) return null;
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.plan;
  let plan = null;
  try {
    const { data, error } = await db()
      .from('user_subscriptions')
      .select('plan_id,status,ends_at,unlimited')
      .eq('user_id', userId)
      .maybeSingle();
    if (!error) plan = activePlan(data);
  } catch (_) {
    plan = null;
  }
  cache.set(userId, { at: Date.now(), plan });
  return plan;
}

async function hasFeature(userId, feature) {
  const tier = FEATURE_TIER[feature];
  if (!tier) return false;
  const plan = await planFor(userId);
  return (RANK[plan] || 0) >= RANK[tier];
}

function invalidate(userId) {
  if (userId) cache.delete(userId);
  else cache.clear();
}

/** Express middleware: the signed-in user must hold one of the features. */
function requireFeature(feature) {
  const list = Array.isArray(feature) ? feature : [feature];
  return async (req, res, next) => {
    const uid = req.user && req.user.id;
    for (const f of list) {
      if (await hasFeature(uid, f)) return next();
    }
    return res.status(403).json({ error: 'PREMIUM_REQUIRED', feature: list[0] });
  };
}

module.exports = { featuresFor, hasFeature, requireFeature, planFor, invalidate, activePlan, FEATURE_TIER, _cache: cache, _setDb: (d) => { supabaseRef = d; } };
