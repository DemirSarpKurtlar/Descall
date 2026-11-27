"use strict";

/**
 * "Bug Avcısı", admin side (mounted inside routes/admin.js after requireAuth + requireAdmin +
 * 2FA + step-up; every path is under /feedback, so it needs the "feedback" section):
 *   GET  /api/admin/feedback/bug-hunter              confirmations, leaderboard, totals, rules
 *   GET  /api/admin/feedback/bug-hunter/candidates   read-only list of past items that look like
 *                                                    confirmed bugs (nothing is granted)
 *   POST /api/admin/feedback/:id/bug-confirm         { severity, note?, duplicateOf? }
 *   POST /api/admin/feedback/:id/bug-undo            { reason }
 * Logic: lib/bugHunter/service.js. Both writes land in İşlem kaydı (feedback_bug_confirm,
 * feedback_bug_undo); the confirm can also be undone from there.
 */

const express = require("express");
const supabase = require("../db/supabase");
const service = require("../lib/bugHunter/service");
const candidates = require("../lib/bugHunter/candidates");
const { shapeFeedback } = require("../lib/feedbackAdmin");
const { apiError } = require("../lib/apiError");

const router = express.Router();

const MESSAGES = {
  NOT_FOUND: "Feedback not found.",
  NOT_CONFIRMED: "This feedback is not confirmed as a bug.",
  NOT_INSTALLED: "The bug hunter tables are not installed yet.",
  BAD_SEVERITY: "Pick a severity.",
  BAD_DUPLICATE: "Pick a confirmed bug to link to.",
  ROOT_NOT_CONFIRMED: "The bug you linked to is not confirmed.",
  SAME_REPORTER: "The same person reported the first bug; nothing to credit twice.",
  SELF_CONFIRM: "You can't confirm your own feedback.",
  NO_REPORTER: "This feedback has no sender.",
  REASON_REQUIRED: "Write a reason (at least 3 characters).",
  ALREADY_UNDONE: "This confirmation was already undone.",
  HAS_DUPLICATES: "Undo the linked duplicate reports first.",
};

function io(req) {
  return req.app?.get?.("io") || null;
}

function fail(res, err, label) {
  if (err instanceof service.BugHuntError) {
    return res.status(err.status).json({ error: MESSAGES[err.code] || err.code, code: err.code, ...(err.count ? { count: err.count } : {}) });
  }
  console.error(`[admin bug-hunter] ${label}:`, err?.message || err);
  return res.status(500).json(apiError("Something went wrong.", null, { code: "SERVER_ERROR" }));
}

async function reloadFeedback(id) {
  const { data } = await supabase.from("user_feedback").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const users = new Map();
  try {
    const { data: u } = await supabase.from("users").select("id, username, display_name, avatar_url, created_at").eq("id", data.user_id).maybeSingle();
    if (u) users.set(String(u.id), u);
  } catch {
    /* card falls back to the stored username */
  }
  return shapeFeedback(data, users);
}

router.get("/feedback/bug-hunter", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json(await service.workspace());
  } catch (err) {
    fail(res, err, "workspace");
  }
});

router.get("/feedback/bug-hunter/candidates", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json(await candidates.load({ supabase, limit: Number(req.query.limit) || 2000 }));
  } catch (err) {
    fail(res, err, "candidates");
  }
});

router.post("/feedback/:id/bug-confirm", async (req, res) => {
  try {
    const out = await service.confirm({ feedbackId: String(req.params.id), body: req.body || {}, actor: req.user, io: io(req) });
    try { io(req)?.to?.("admin")?.emit?.("feedback:bughunt", { feedbackId: String(req.params.id), action: "confirm" }); } catch { /* best effort */ }
    res.status(out.already ? 200 : 201).json({ ...out, feedback: await reloadFeedback(String(req.params.id)) });
  } catch (err) {
    fail(res, err, "confirm");
  }
});

router.post("/feedback/:id/bug-undo", async (req, res) => {
  try {
    const out = await service.undo({ feedbackId: String(req.params.id), reason: req.body?.reason, actor: req.user, io: io(req) });
    try { io(req)?.to?.("admin")?.emit?.("feedback:bughunt", { feedbackId: String(req.params.id), action: "undo" }); } catch { /* best effort */ }
    res.json({ ...out, feedback: await reloadFeedback(String(req.params.id)) });
  } catch (err) {
    fail(res, err, "undo");
  }
});

module.exports = router;
