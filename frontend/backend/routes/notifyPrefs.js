"use strict";

/**
 * Per-conversation notification options (messaging phase 4), lib/notifyPrefs.js.
 *   GET /api/notify-prefs → { prefs: [{ convType, convId, level, mutedUntil }] }
 *   PUT /api/notify-prefs { convType: "dm"|"group", convId, level: "all"|"mentions"|"none", mutedUntil?: ISO|null }
 *       → { ok, pref } | 400 { error } | 403 not_allowed (not a member / peer) | 429 | 503 { error: "not_ready" } before the migration
 * The caller's other devices get notify-prefs:update so their lists follow.
 */

const express = require("express");
const { requireAuth } = require("../middleware/auth");
const np = require("../lib/notifyPrefs");
const { recordFailure, rejectIfLimited } = require("../lib/rateLimit");

const router = express.Router();

/** Only a group member, or a DM peer (friend or existing conversation), may set options for it. */
async function isParticipant(userId, convType, convId) {
  const supabase = require("../db/supabase");
  if (convType === "group") {
    const { data } = await supabase.from("group_members").select("group_id").eq("group_id", convId).eq("user_id", userId).maybeSingle();
    return Boolean(data);
  }
  if (convId === userId) return false;
  if (await require("../lib/dmMessages").isAcceptedFriend(userId, convId)) return true;
  // Both ids are UUIDs here (validatePref + auth), safe inside the filter.
  const { data } = await supabase
    .from("dm_messages")
    .select("id")
    .or(`and(from_user_id.eq.${userId},to_user_id.eq.${convId}),and(from_user_id.eq.${convId},to_user_id.eq.${userId})`)
    .limit(1);
  return Boolean(data && data.length);
}

router.get("/", requireAuth, async (req, res) => {
  res.json({ prefs: await np.listPrefs(req.user.id) });
});

router.put("/", requireAuth, async (req, res) => {
  if (rejectIfLimited(res, [recordFailure(`notify-prefs:${req.user.id}`, { windowMs: 60000, max: 30 })])) return undefined;
  const v = np.validatePref(req.body);
  if (!v.ok) return res.status(400).json(v);
  if (!(await isParticipant(req.user.id, v.row.conv_type, v.row.conv_id).catch(() => false))) {
    return res.status(403).json({ ok: false, error: "not_allowed" });
  }
  const out = await np.savePref(req.user.id, v.row);
  if (!out.ok) return res.status(out.error === "not_ready" ? 503 : 500).json(out);
  try {
    req.app.get("io")?.to(`user:${req.user.id}`).emit("notify-prefs:update", out.pref);
  } catch { /* other devices refresh on their next load */ }
  return res.json(out);
});

module.exports = router;
