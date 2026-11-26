'use strict';

/**
 * POST /api/activity/presence/batch: the live activity of many friends in one call.
 *
 * The client used to send GET /api/activity/friend/:id/presence once per friend, all at
 * once, at boot and on every socket (re)connect (150 friends = 150 requests). This answers
 * the same thing with two queries. Same rules as the single-friend route in activity.js:
 * only accepted friends of the caller; privacy hidden → null, only-me → { privacy };
 * show_game_activity / show_app_activity / show_browser hide those kinds; an invisible
 * friend shows no live presence.
 *
 * Body { ids?: string[] }: without ids, every accepted friend (max 500).
 * Answer { presence: { [friendId]: row | null | { privacy: 'only-me' } } }.
 */

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const supabase = require('../db/supabase');
const { apiError } = require('../lib/apiError');

const router = express.Router();

const MAX_PRESENCE_BATCH = 500;
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const DEFAULTS = { privacy: 'friends', show_game_activity: true, show_app_activity: true, show_browser: false };

function kindVisible(row, settings) {
  const type = String(row?.app_type || 'app').toLowerCase();
  if (type === 'game') return settings.show_game_activity !== false;
  if (type === 'browser') return settings.show_browser === true;
  return settings.show_app_activity !== false;
}

async function acceptedFriendIds(userId) {
  const { listAcceptedFriendIds } = require('../lib/dmMessages');
  return new Set(await listAcceptedFriendIds(userId));
}

async function invisibleIds(ids) {
  const { presence } = require('../runtime/sharedState');
  const out = new Set();
  const unknown = [];
  for (const id of ids) {
    const live = presence.get(id);
    if (live && live.status) {
      if (live.status === 'invisible') out.add(id);
    } else unknown.push(id);
  }
  if (unknown.length) {
    const { data } = await supabase.from('users').select('id,presence_status').in('id', unknown);
    for (const row of data || []) if (String(row.presence_status || '') === 'invisible') out.add(row.id);
  }
  return out;
}

/**
 * The live activity rows these (already friend-checked) users let their friends see:
 * { [id]: row | null | { privacy: 'only-me' } }. Also used by /api/native (widget faces).
 */
async function visibleActivityRows(ids) {
  const [settingsRes, presenceRes, hidden] = await Promise.all([
    supabase
      .from('user_activity_settings')
      .select('user_id,privacy,show_game_activity,show_app_activity,show_browser')
      .in('user_id', ids),
    supabase
      .from('user_presence')
      .select('user_id,app_name,app_type,display_name,started_at,is_manual,updated_at')
      .in('user_id', ids),
    invisibleIds(ids),
  ]);
  if (presenceRes.error) throw presenceRes.error;

  const settingsById = new Map((settingsRes.data || []).map((r) => [r.user_id, { ...DEFAULTS, ...r }]));
  const rowById = new Map((presenceRes.data || []).map((r) => [r.user_id, r]));
  const presence = {};
  for (const id of ids) {
    const settings = settingsById.get(id) || DEFAULTS;
    if (settings.privacy === 'hidden') presence[id] = null;
    else if (settings.privacy === 'only-me') presence[id] = { privacy: 'only-me' };
    else if (hidden.has(id)) presence[id] = null;
    else {
      const row = rowById.get(id);
      if (!row || !kindVisible(row, settings)) presence[id] = null;
      else {
        const { user_id: _uid, ...rest } = row;
        presence[id] = rest;
      }
    }
  }
  return presence;
}

router.post('/presence/batch', requireAuth, async (req, res) => {
  const me = req.user?.id;
  if (!me) return res.sendStatus(401);
  try {
    const friends = await acceptedFriendIds(me);
    const asked = Array.isArray(req.body?.ids) ? req.body.ids : null;
    const pool = asked ? asked.filter((id) => typeof id === 'string' && SAFE_ID.test(id) && friends.has(id)) : [...friends];
    const ids = [...new Set(pool)].slice(0, MAX_PRESENCE_BATCH);
    if (!ids.length) return res.json({ presence: {} });

    const presence = await visibleActivityRows(ids);
    return res.json({ presence });
  } catch (err) {
    console.error('[activity] presence batch failed:', err?.message || err);
    return res.status(500).json(apiError('Could not load the activity.'));
  }
});

module.exports = router;
module.exports.MAX_PRESENCE_BATCH = MAX_PRESENCE_BATCH;
module.exports.visibleActivityRows = visibleActivityRows;
