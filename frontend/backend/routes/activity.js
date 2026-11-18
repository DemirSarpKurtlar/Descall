'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const supabase = require('../db/supabase');
const { apiError } = require('../lib/apiError');

const router = express.Router();

const VALID_PRIVACY = ['friends', 'only-me', 'hidden'];
const MAX_HISTORY_ROWS = 200;
const sessionLib = import('../lib/activitySessions.mjs');

async function groupedHistory(rows) {
  const { groupActivitySessions } = await sessionLib;
  return groupActivitySessions(rows || []);
}

// ─── GET own activity history ─────────────────────────────────────────────────
router.get('/history', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('user_activity_log')
    .select('id,app_name,app_type,display_name,started_at,ended_at,duration_sec,is_manual')
    .eq('user_id', req.user.id)
    .order('started_at', { ascending: false })
    .limit(MAX_HISTORY_ROWS);

  if (error) {
    console.error('[activity] history failed:', error.message);
    return res.status(500).json(apiError('Could not load the activity history.'));
  }
  return res.json({ history: await groupedHistory(data) });
});

// ─── Friend activity access (security scan 17 Nov 2026) ─────────────────────
// Presence used to be readable by any signed-in user (no friendship check), and both
// routes leaked raw database errors. Access rules, in order:
//   self → everything; privacy hidden → nothing; only-me → restricted;
//   friends (default) → an accepted friendship is required;
//   show_game_activity / show_app_activity / show_browser hide those kinds of rows;
//   an invisible user shows no live presence.
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const ACTIVITY_DEFAULTS = { privacy: 'friends', show_game_activity: true, show_app_activity: true, show_browser: false };

async function loadActivitySettings(userId) {
  const { data } = await supabase
    .from('user_activity_settings')
    .select('privacy, show_game_activity, show_app_activity, show_browser')
    .eq('user_id', userId)
    .maybeSingle();
  return { ...ACTIVITY_DEFAULTS, ...(data || {}) };
}

/** { ok: true, settings } when viewerId may see targetId's activity, else { ok: false, reason }. */
async function activityAccess(viewerId, targetId) {
  const settings = await loadActivitySettings(targetId);
  if (String(viewerId) === String(targetId)) return { ok: true, self: true, settings };
  if (settings.privacy === 'hidden') return { ok: false, reason: 'hidden' };
  if (settings.privacy === 'only-me') return { ok: false, reason: 'only-me' };
  const { areAcceptedFriends } = require('../lib/groupMembership');
  let friends = false;
  try {
    friends = await areAcceptedFriends(viewerId, targetId);
  } catch {
    friends = false;
  }
  if (!friends) return { ok: false, reason: 'not_friends' };
  return { ok: true, self: false, settings };
}

/** The kinds of rows the target chose to show (game / browser / everything else). */
function kindVisible(row, settings) {
  const type = String(row?.app_type || 'app').toLowerCase();
  if (type === 'game') return settings.show_game_activity !== false;
  if (type === 'browser') return settings.show_browser === true;
  return settings.show_app_activity !== false;
}

async function isInvisible(userId) {
  const { presence } = require('../runtime/sharedState');
  const live = presence.get(userId);
  if (live && live.status) return live.status === 'invisible';
  const { data } = await supabase.from('users').select('presence_status').eq('id', userId).maybeSingle();
  return String(data?.presence_status || '') === 'invisible';
}

// ─── GET friend's activity history (privacy-gated) ───────────────────────────
router.get('/friend/:userId/history', requireAuth, async (req, res) => {
  const { userId } = req.params;
  if (!SAFE_ID.test(String(userId))) return res.status(400).json(apiError('Invalid user.'));
  try {
    const access = await activityAccess(req.user.id, userId);
    if (!access.ok) return res.json({ history: [], restricted: true });

    const { data, error } = await supabase
      .from('user_activity_log')
      .select('id,app_name,app_type,display_name,started_at,ended_at,duration_sec,is_manual')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    const rows = access.self ? data : (data || []).filter((row) => kindVisible(row, access.settings));
    return res.json({ history: await groupedHistory(rows) });
  } catch (err) {
    console.error('[activity] friend history failed:', err?.message || err);
    return res.status(500).json(apiError('Could not load the activity history.'));
  }
});

// ─── GET friend's current presence (privacy-gated) ───────────────────────────
router.get('/friend/:userId/presence', requireAuth, async (req, res) => {
  const { userId } = req.params;
  if (!SAFE_ID.test(String(userId))) return res.status(400).json(apiError('Invalid user.'));
  try {
    const access = await activityAccess(req.user.id, userId);
    if (!access.ok) {
      return res.json({ presence: access.reason === 'only-me' ? { privacy: 'only-me' } : null });
    }
    if (!access.self && (await isInvisible(userId))) return res.json({ presence: null });

    const { data, error } = await supabase
      .from('user_presence')
      .select('app_name,app_type,display_name,started_at,is_manual,updated_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') throw error;
    if (data && !access.self && !kindVisible(data, access.settings)) return res.json({ presence: null });
    return res.json({ presence: data || null });
  } catch (err) {
    console.error('[activity] friend presence failed:', err?.message || err);
    return res.status(500).json(apiError('Could not load the activity.'));
  }
});

// ─── GET own settings ────────────────────────────────────────────────────────
router.get('/settings', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('user_activity_settings')
    .select('*')
    .eq('user_id', req.user.id)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[activity] settings read failed:', error.message);
    return res.status(500).json(apiError('Could not load the activity settings.'));
  }

  const defaults = {
    privacy: 'friends',
    show_game_activity: true,
    show_app_activity: true,
    show_browser: false,
    show_descall_time: true,
  };

  return res.json({ settings: data ? { ...defaults, ...data } : defaults });
});

// ─── POST update settings ────────────────────────────────────────────────────
router.post('/settings', requireAuth, async (req, res) => {
  const { privacy, show_game_activity, show_app_activity, show_browser, show_descall_time } = req.body;

  if (privacy && !VALID_PRIVACY.includes(privacy)) {
    return res.status(400).json({ error: 'Invalid privacy value' });
  }

  const patch = { user_id: req.user.id, updated_at: new Date().toISOString() };
  if (privacy !== undefined) patch.privacy = privacy;
  if (show_game_activity !== undefined) patch.show_game_activity = !!show_game_activity;
  if (show_app_activity !== undefined) patch.show_app_activity = !!show_app_activity;
  if (show_browser !== undefined) patch.show_browser = !!show_browser;
  if (show_descall_time !== undefined) patch.show_descall_time = !!show_descall_time;

  const { error } = await supabase
    .from('user_activity_settings')
    .upsert(patch, { onConflict: 'user_id' });

  if (error) {
    console.error('[activity] settings save failed:', error.message);
    return res.status(500).json(apiError('Could not save the activity settings.'));
  }
  return res.json({ success: true });
});

// ─── POST log a completed session (called by client on activity end) ─────────
router.post('/session', requireAuth, async (req, res) => {
  const { app_name, app_type, display_name, started_at, ended_at, duration_sec, is_manual } = req.body;

  if (!app_name || !started_at) {
    return res.status(400).json({ error: 'app_name and started_at are required' });
  }

  const incoming = {
    app_name: String(app_name).slice(0, 100),
    app_type: String(app_type || 'app').slice(0, 32),
    display_name: String(display_name || app_name).slice(0, 120),
    started_at,
    ended_at: ended_at || new Date().toISOString(),
    duration_sec: Number(duration_sec) || 0,
    is_manual: !!is_manual,
  };

  // Extend the latest same-game row when this session continues it.
  // Older fragment rows stay in the table; history reads group them.
  const { findExtendTarget, mergeSessionFields } = await sessionLib;
  const { data: recent, error: recentError } = await supabase
    .from('user_activity_log')
    .select('id,app_name,app_type,display_name,started_at,ended_at,duration_sec,is_manual')
    .eq('user_id', req.user.id)
    .eq('app_name', incoming.app_name)
    .order('started_at', { ascending: false })
    .limit(40);

  if (recentError) return res.status(500).json({ error: recentError.message });

  const target = findExtendTarget(recent || [], incoming);
  if (target) {
    const merged = mergeSessionFields(target, incoming);
    const { error: updateError } = await supabase
      .from('user_activity_log')
      .update({
        started_at: merged.started_at,
        ended_at: merged.ended_at,
        duration_sec: merged.duration_sec,
        display_name: merged.display_name,
      })
      .eq('id', target.id)
      .eq('user_id', req.user.id);

    if (updateError) return res.status(500).json({ error: updateError.message });
    return res.json({ success: true, merged: true });
  }

  const { error: insertError } = await supabase
    .from('user_activity_log')
    .insert({
      user_id: req.user.id,
      ...incoming,
    });

  if (insertError) return res.status(500).json({ error: insertError.message });

  // Prune oldest rows beyond MAX_HISTORY_ROWS
  const { data: rows } = await supabase
    .from('user_activity_log')
    .select('id')
    .eq('user_id', req.user.id)
    .order('started_at', { ascending: false })
    .range(MAX_HISTORY_ROWS, MAX_HISTORY_ROWS + 50);

  if (rows?.length) {
    const ids = rows.map(r => r.id);
    await supabase.from('user_activity_log').delete().in('id', ids);
  }

  return res.json({ success: true });
});

module.exports = router;
