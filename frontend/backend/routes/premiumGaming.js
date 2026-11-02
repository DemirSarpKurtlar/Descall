'use strict';

/**
 * Premium gaming data (Descall+ / Ultra), mounted at /api/premium/gaming.
 * Reuses the existing activity tables (user_activity_log, user_presence,
 * user_activity_settings); nothing is duplicated. Every route checks the entitlement on
 * the server (lib/premium/entitlements.js), the UI gate is only a convenience.
 *
 *  GET /sessions?from=&to=&limit=   own game sessions (game_session_history or activity_timeline)
 *  GET /prefs, PUT /prefs           game status card visibility (game_status)
 *  GET /status/:userId              a member's game status card, only when THAT member has
 *                                   game_status and their visibility allows the viewer
 */

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireFeature, hasFeature } = require('../lib/premium/entitlements');

const router = express.Router();
const VISIBILITY = ['everyone', 'friends', 'nobody'];
const MAX_SESSIONS = 1000;
const MAX_RANGE_DAYS = 366;

let supabaseRef = null;
function db() {
  if (!supabaseRef) supabaseRef = require('../db/supabase');
  return supabaseRef;
}

function parseDate(v, fallback) {
  const t = Date.parse(String(v || ''));
  return Number.isFinite(t) ? new Date(t) : fallback;
}

/** Per-game totals for a list of sessions (pure). */
function summarize(rows) {
  const by = new Map();
  let totalSec = 0;
  for (const r of rows) {
    const sec = Math.max(0, Number(r.duration_sec) || 0);
    totalSec += sec;
    const k = r.app_name;
    const cur = by.get(k) || { game: k, totalSec: 0, count: 0 };
    cur.totalSec += sec;
    cur.count += 1;
    by.set(k, cur);
  }
  return { totalSec, byGame: [...by.values()].sort((a, b) => b.totalSec - a.totalSec) };
}

router.get('/sessions', requireAuth, requireFeature(['game_session_history', 'activity_timeline']), async (req, res) => {
  const now = new Date();
  const to = parseDate(req.query.to, now);
  let from = parseDate(req.query.from, new Date(to.getTime() - 30 * 86_400_000));
  if (to - from > MAX_RANGE_DAYS * 86_400_000) from = new Date(to.getTime() - MAX_RANGE_DAYS * 86_400_000);
  const limit = Math.min(MAX_SESSIONS, Math.max(1, Number(req.query.limit) || 500));
  const { data, error } = await db()
    .from('user_activity_log')
    .select('id,app_name,app_type,started_at,ended_at,duration_sec')
    .eq('user_id', req.user.id)
    .eq('app_type', 'game')
    .gte('started_at', from.toISOString())
    .lte('started_at', to.toISOString())
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) return res.status(500).json({ error: 'SESSIONS_FAILED' });
  const sessions = (data || []).map((r) => ({
    id: r.id,
    game: r.app_name,
    started_at: r.started_at,
    ended_at: r.ended_at,
    duration_sec: r.duration_sec,
  }));
  return res.json({ from: from.toISOString(), to: to.toISOString(), sessions, stats: summarize(data || []) });
});

async function readVisibility(userId) {
  const { data, error } = await db()
    .from('user_activity_settings')
    .select('privacy,game_card')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return { privacy: 'friends', gameCard: 'friends' };
  return {
    privacy: data?.privacy || 'friends',
    gameCard: VISIBILITY.includes(data?.game_card) ? data.game_card : 'friends',
  };
}

router.get('/prefs', requireAuth, requireFeature('game_status'), async (req, res) => {
  const v = await readVisibility(req.user.id);
  return res.json({ game_card: v.gameCard });
});

router.put('/prefs', requireAuth, requireFeature('game_status'), async (req, res) => {
  const gameCard = String(req.body?.game_card || '');
  if (!VISIBILITY.includes(gameCard)) return res.status(400).json({ error: 'INVALID_VISIBILITY' });
  const { error } = await db()
    .from('user_activity_settings')
    .upsert({ user_id: req.user.id, game_card: gameCard }, { onConflict: 'user_id' });
  if (error) return res.status(500).json({ error: 'PREFS_FAILED' });
  return res.json({ game_card: gameCard });
});

async function areFriends(a, b) {
  const { data, error } = await db()
    .from('friendships')
    .select('user_id')
    .or(`and(user_id.eq.${a},friend_id.eq.${b}),and(user_id.eq.${b},friend_id.eq.${a})`)
    .eq('status', 'accepted')
    .limit(1);
  return !error && Array.isArray(data) && data.length > 0;
}

router.get('/status/:userId', requireAuth, async (req, res) => {
  const target = String(req.params.userId || '');
  if (!/^[\w-]{1,64}$/.test(target)) return res.status(400).json({ error: 'INVALID_USER' });
  // The card is the subject's perk: the viewer can be on any plan.
  if (!(await hasFeature(target, 'game_status'))) return res.json({ status: null });
  const self = target === req.user.id;
  const v = await readVisibility(target);
  if (!self) {
    if (v.privacy === 'hidden' || v.privacy === 'only-me' || v.gameCard === 'nobody') return res.json({ status: null });
    if (v.gameCard === 'friends' && !(await areFriends(req.user.id, target))) return res.json({ status: null });
  }
  const { data, error } = await db()
    .from('user_presence')
    .select('app_name,app_type,started_at,is_manual')
    .eq('user_id', target)
    .maybeSingle();
  if (error || !data || data.app_type !== 'game' || data.is_manual) return res.json({ status: null, visibility: self ? v.gameCard : undefined });
  return res.json({ status: { game: data.app_name, started_at: data.started_at }, visibility: self ? v.gameCard : undefined });
});

module.exports = router;
module.exports._summarize = summarize;
module.exports._setDb = (d) => { supabaseRef = d; };
