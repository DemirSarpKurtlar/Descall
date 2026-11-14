"use strict";

/**
 * Yönetici Paneli › Moderasyon › İtirazlar (ban experience, CONTRACT section 7).
 * Mounted inside routes/admin.js (requireAdmin + 2FA + step-up + section "moderation").
 *   GET  /appeals?status=pending|accepted|rejected&type=account|access -> { appeals }
 *   POST /appeals/:id/decide { decision: "accept" | "reject", note }  -> { ok, appeal }
 * Accept lifts the account ban (lib/moderation.js revokeBan) or the access ban
 * (lib/accessBans.js revokeBan). The person is emailed the result when an
 * email is known. public.ban_appeals missing = 503 APPEALS_UNAVAILABLE.
 */

const express = require("express");
const supabase = require("../db/supabase");
const moderation = require("../lib/moderation");
const accessBans = require("../lib/accessBans");
const banExperience = require("../lib/banExperience");
const { appendAudit } = require("../runtime/sharedState");
const { notifyAdminRoom } = require("../socket/adminHandlers");
const { apiError } = require("../lib/apiError");

const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function unavailable(res) {
  return res.status(503).json({ ...banExperience.APPEALS_UNAVAILABLE });
}

function notify(req, payload) {
  try {
    const io = req.app?.get?.("io");
    if (io?.to) notifyAdminRoom(io, payload);
  } catch {
    /* best effort */
  }
}

router.get("/appeals", async (req, res) => {
  try {
    const status = String(req.query.status || "");
    const type = String(req.query.type || "");
    const appeals = await banExperience.listAppeals({ status, type, limit: req.query.limit });
    res.set("Cache-Control", "no-store");
    return res.json({ appeals });
  } catch (err) {
    if (err?.status === 503) return unavailable(res);
    console.error("[appeals] list:", err?.message || err);
    return res.status(500).json(apiError("Could not load appeals."));
  }
});

router.post("/appeals/:id/decide", async (req, res) => {
  const id = String(req.params.id || "");
  if (!UUID_RE.test(id)) return res.status(400).json(apiError("Invalid appeal."));
  const decision = req.body?.decision;
  if (decision !== "accept" && decision !== "reject") {
    return res.status(400).json(apiError("Choose accept or reject.", null, { code: "BAD_DECISION" }));
  }
  const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 1000) || null : null;
  try {
    const { data: appeal, error } = await supabase.from("ban_appeals").select("*").eq("id", id).maybeSingle();
    if (error) {
      if (banExperience.isMissingTable(error)) return unavailable(res);
      throw new Error(error.message);
    }
    if (!appeal) return res.status(404).json(apiError("Appeal not found."));
    if (appeal.status !== "pending") {
      return res.status(409).json(apiError("This appeal was already decided.", null, { code: "APPEAL_DECIDED" }));
    }

    // Claim the row first so two admins never act on the same appeal.
    const decidedAt = new Date().toISOString();
    const { data: claimed, error: claimErr } = await supabase
      .from("ban_appeals")
      .update({
        status: decision === "accept" ? "accepted" : "rejected",
        decided_by: req.user.id,
        decided_note: note,
        decided_at: decidedAt,
      })
      .eq("id", id)
      .eq("status", "pending")
      .select("*");
    if (claimErr) throw new Error(claimErr.message);
    const row = (claimed || [])[0];
    if (!row) return res.status(409).json(apiError("This appeal was already decided.", null, { code: "APPEAL_DECIDED" }));

    let username = null;
    let email = appeal.email || null;
    let lifted = false;
    try {
      if (appeal.type === "account" && appeal.user_id) {
        const { data: user } = await supabase
          .from("users")
          .select("id, username, email, email_confirmed_at, is_banned")
          .eq("id", appeal.user_id)
          .maybeSingle();
        username = user?.username || null;
        if (!email && user?.email && user.email_confirmed_at) email = user.email;
        if (decision === "accept" && user?.is_banned) {
          await moderation.revokeBan({ targetUserId: appeal.user_id, actorUserId: req.user.id, note: note || "Appeal accepted" });
          lifted = true;
        }
      } else if (appeal.type === "access" && appeal.access_ban_id && decision === "accept") {
        try {
          await accessBans.revokeBan({ id: appeal.access_ban_id, actor: req.user });
          lifted = true;
        } catch (err) {
          if (err?.code !== "NOT_FOUND") throw err; // already lifted or expired
        }
      }
    } catch (liftErr) {
      // The ban could not be lifted: put the appeal back so it can be decided again.
      await supabase
        .from("ban_appeals")
        .update({ status: "pending", decided_by: null, decided_note: null, decided_at: null })
        .eq("id", id);
      throw liftErr;
    }

    let emailed = false;
    if (email) {
      emailed = await banExperience.sendPlainEmail(
        email,
        banExperience.buildAppealResultEmail({
          type: appeal.type,
          decision,
          note,
          accessCode: appeal.access_code || null,
          username,
        })
      );
    }

    appendAudit(req.user.id, req.user.username, decision === "accept" ? "appeal_accept" : "appeal_reject", appeal.user_id || appeal.access_code || id, {
      appealId: id,
      type: appeal.type,
      lifted,
      emailed,
    });
    notify(req, { type: "ban_appeal_decided", id, decision });
    const [publicRow] = await banExperience.listAppealsByIds([id]).catch(() => [null]);
    return res.json({ ok: true, lifted, emailed, appeal: publicRow || banExperience.publicAdminAppeal(row) });
  } catch (err) {
    console.error("[appeals] decide:", err?.message || err);
    return res.status(500).json(apiError("Could not save the decision."));
  }
});

module.exports = router;
