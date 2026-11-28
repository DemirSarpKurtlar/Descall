"use strict";

/**
 * Yönetici Paneli > Genel > Davet ödülleri (growth phase 4, owner pick 4A). Mounted inside
 * routes/admin.js (admin + 2FA + step-up + section "invites", lib/adminPermissions.js).
 *
 *   GET  /invites/overview?range=24h|7d|30d&sort=active|signups   control board
 *   GET  /invites/log?limit=50                                    full action log
 *   GET  /invites/inviter/:id                                     right panel
 *   GET  /invites/preview?inviterId=&kind=&count=&amount=&reason=&note=   the user's text
 *   POST /invites/inviter/:id/hold      { ids?, reason, note?, notify? }
 *   POST /invites/inviter/:id/release   { ids?, notify? }
 *   POST /invites/inviter/:id/revoke    { ids?, reason, note?, message?, notifyInviter?, notifyInvitees? }
 *   POST /invites/inviter/:id/pause     { paused, reason?, note?, notify? }
 *   POST /invites/actions/:id/undo      10 minute undo
 *   GET  /invites/rules                 versions
 *   PUT  /invites/rules                 { rules, note? } -> new version
 *   POST /invites/alerts/:id            { decision: "review" | "ignore" }
 *   GET  /invites/export.csv?range=     referral rows of the period
 * Every write is in the admin audit log (state.appendAudit, codes invite_*).
 */

const express = require("express");
const { apiError } = require("../lib/apiError");
const engine = require("../lib/referrals/engine");
const views = require("../lib/referrals/views");
const store = require("../lib/referrals/store");
const texts = require("../lib/referrals/texts");
const model = require("../lib/referrals/model");
const state = require("../runtime/sharedState");

const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOTICE_KINDS = ["revokeInviter", "revokeInvitee", "holdInviter", "releaseInviter", "pausedInviter", "resumedInviter"];

function actorOf(req) {
  return { id: String(req.user.id), username: req.user.username || null };
}

function idsOf(body) {
  if (!Array.isArray(body?.ids)) return null;
  const ids = body.ids.map(String).filter((x) => UUID_RE.test(x)).slice(0, 500);
  return ids.length ? ids : null;
}

function noteOf(body) {
  return String(body?.note || "").replace(/\s+/g, " ").trim().slice(0, 300);
}

function messageOf(body) {
  const m = String(body?.message || "").trim();
  return m ? m.slice(0, 600) : null;
}

function fail(res, err, where) {
  if (err?.status && err.status < 500) return res.status(err.status).json(apiError(err.message || "Request failed.", undefined, { code: err.code, field: err.field }));
  if (err?.code === "RULES_INVALID") return res.status(400).json(apiError(err.message, undefined, { code: err.code, field: err.field }));
  console.error(`[admin-invites] ${where}:`, err?.message || err);
  return res.status(500).json(apiError("Could not load invite rewards."));
}

function validInviter(req, res) {
  const id = String(req.params.id || "");
  if (!UUID_RE.test(id)) {
    res.status(400).json(apiError("Invalid user."));
    return null;
  }
  return id;
}

router.get("/invites/overview", async (req, res) => {
  try {
    const range = ["24h", "7d", "30d"].includes(String(req.query.range)) ? String(req.query.range) : "30d";
    const sort = req.query.sort === "signups" ? "signups" : "active";
    const data = await views.adminOverview({ range, sort });
    res.set("Cache-Control", "no-store");
    return res.json(data);
  } catch (err) {
    return fail(res, err, "overview");
  }
});

router.get("/invites/log", async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const actions = await store.listActions({ limit });
    const users = await store.usersByIds(actions.map((a) => a.inviter_id).filter(Boolean));
    return res.json({
      items: actions.map((a) => ({
        id: a.id,
        at: a.created_at,
        kind: a.action,
        actor: a.actor_username || "system",
        system: !a.actor_id,
        inviter: users.get(String(a.inviter_id))?.username || null,
        inviterId: a.inviter_id || null,
        count: Array.isArray(a.referral_ids) ? a.referral_ids.length : 0,
        amount: a.amount || 0,
        reason: a.reason_code || null,
        note: a.note || null,
        message: a.user_message || null,
        diff: a.action === "rules" ? a.payload?.diff || [] : null,
        undoable: !a.undone_at && a.undo_until && new Date(a.undo_until).getTime() > Date.now(),
        undoUntil: a.undo_until || null,
        undone: Boolean(a.undone_at),
      })),
    });
  } catch (err) {
    return fail(res, err, "log");
  }
});

router.get("/invites/inviter/:id", async (req, res) => {
  const id = validInviter(req, res);
  if (!id) return undefined;
  try {
    const data = await views.adminInviter({ inviterId: id });
    if (!data) return res.status(404).json(apiError("User not found."));
    return res.json(data);
  } catch (err) {
    return fail(res, err, "inviter");
  }
});

router.get("/invites/preview", async (req, res) => {
  const userId = String(req.query.inviterId || req.query.userId || "");
  if (!UUID_RE.test(userId)) return res.status(400).json(apiError("Invalid user."));
  const kind = NOTICE_KINDS.includes(String(req.query.kind)) ? String(req.query.kind) : "revokeInviter";
  try {
    const out = await engine.previewNotice({
      userId,
      kind,
      count: Math.max(0, Math.min(10000, Number(req.query.count) || 0)),
      amount: Math.max(0, Math.min(10_000_000, Number(req.query.amount) || 0)),
      reasonCode: String(req.query.reason || "other"),
      note: String(req.query.note || "").slice(0, 300),
    });
    return res.json(out);
  } catch (err) {
    return fail(res, err, "preview");
  }
});

router.post("/invites/inviter/:id/hold", async (req, res) => {
  const id = validInviter(req, res);
  if (!id) return undefined;
  try {
    const out = await engine.holdRewards({
      actor: actorOf(req),
      inviterId: id,
      ids: idsOf(req.body),
      reasonCode: String(req.body?.reason || "other"),
      note: noteOf(req.body),
      message: messageOf(req.body),
      notifyInviter: req.body?.notify === true,
      io: req.app.get("io"),
    });
    return res.json(out);
  } catch (err) {
    return fail(res, err, "hold");
  }
});

router.post("/invites/inviter/:id/release", async (req, res) => {
  const id = validInviter(req, res);
  if (!id) return undefined;
  try {
    const out = await engine.releaseRewards({ actor: actorOf(req), inviterId: id, ids: idsOf(req.body), notifyInviter: req.body?.notify === true, io: req.app.get("io") });
    return res.json(out);
  } catch (err) {
    return fail(res, err, "release");
  }
});

router.post("/invites/inviter/:id/revoke", async (req, res) => {
  const id = validInviter(req, res);
  if (!id) return undefined;
  const reason = String(req.body?.reason || "");
  if (!reason) return res.status(400).json(apiError("Choose a reason.", undefined, { code: "REASON_REQUIRED" }));
  try {
    const out = await engine.revokeRewards({
      actor: actorOf(req),
      inviterId: id,
      ids: idsOf(req.body),
      reasonCode: reason,
      note: noteOf(req.body),
      message: messageOf(req.body),
      notifyInviter: req.body?.notifyInviter !== false,
      notifyInvitees: req.body?.notifyInvitees === true,
      io: req.app.get("io"),
    });
    return res.json(out);
  } catch (err) {
    return fail(res, err, "revoke");
  }
});

router.post("/invites/inviter/:id/pause", async (req, res) => {
  const id = validInviter(req, res);
  if (!id) return undefined;
  try {
    const out = await engine.setLinkPaused({
      actor: actorOf(req),
      inviterId: id,
      paused: req.body?.paused !== false,
      reasonCode: String(req.body?.reason || "other"),
      note: noteOf(req.body),
      notifyInviter: req.body?.notify === true,
      io: req.app.get("io"),
    });
    return res.json(out);
  } catch (err) {
    return fail(res, err, "pause");
  }
});

router.post("/invites/actions/:id/undo", async (req, res) => {
  const id = String(req.params.id || "");
  if (!UUID_RE.test(id)) return res.status(400).json(apiError("Invalid action."));
  try {
    const out = await engine.undoAction({ actor: actorOf(req), actionId: id, io: req.app.get("io") });
    return res.json(out);
  } catch (err) {
    return fail(res, err, "undo");
  }
});

router.get("/invites/rules", async (_req, res) => {
  try {
    const [current, versions] = await Promise.all([store.getRules({ fresh: true }), store.listRuleVersions(20)]);
    return res.json({
      current,
      versions: versions.map((v) => ({ version: v.version, at: v.created_at, note: v.note || null, createdBy: v.created_by || null })),
      reasons: texts.REASON_CODES,
    });
  } catch (err) {
    return fail(res, err, "rules");
  }
});

router.put("/invites/rules", async (req, res) => {
  try {
    const out = await engine.publishRules({ actor: actorOf(req), input: req.body?.rules || {}, note: noteOf(req.body) });
    return res.json(out);
  } catch (err) {
    return fail(res, err, "rules-save");
  }
});

router.post("/invites/alerts/:id", async (req, res) => {
  const id = String(req.params.id || "");
  if (!UUID_RE.test(id)) return res.status(400).json(apiError("Invalid alert."));
  const decision = req.body?.decision === "ignore" ? "ignore" : "review";
  try {
    const out = await engine.handleAlert({ actor: actorOf(req), alertId: id, decision, io: req.app.get("io") });
    return res.json(out);
  } catch (err) {
    return fail(res, err, "alert");
  }
});

function csvCell(v) {
  const s = v == null ? "" : String(v);
  // Formula injection guard for spreadsheet apps.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

router.get("/invites/export.csv", async (req, res) => {
  try {
    const range = ["24h", "7d", "30d"].includes(String(req.query.range)) ? String(req.query.range) : "30d";
    const since = new Date(Date.now() - views.rangeDays(range) * model.DAY).toISOString();
    const rows = await store.listReferrals({ since });
    const users = await store.usersByIds(rows.flatMap((r) => [r.inviter_id, r.invitee_id]));
    const name = (id) => users.get(String(id))?.username || "";
    const head = ["signup_at", "inviter", "invitee", "channel", "status", "first_message_at", "returned_at", "paid_at", "inviter_amount", "invitee_amount", "inviter_skip", "risk", "signals", "hold_reason", "revoke_reason"];
    const lines = [head.join(",")];
    for (const r of rows) {
      lines.push(
        [
          r.signup_at || r.created_at,
          name(r.inviter_id),
          name(r.invitee_id),
          r.channel || "",
          r.status,
          r.first_message_at || "",
          r.returned_at || "",
          r.paid_at || "",
          r.inviter_amount,
          r.invitee_amount,
          r.inviter_skip || "",
          r.risk_score || 0,
          (r.risk_signals || []).map((s) => s.code).join(" "),
          r.hold_reason || "",
          r.revoke_reason || "",
        ]
          .map(csvCell)
          .join(",")
      );
    }
    state.appendAudit(req.user.id, req.user.username, "invite_export", null, { range, rows: rows.length });
    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", `attachment; filename="davet-odulleri-${range}.csv"`);
    return res.send(`﻿${lines.join("\n")}\n`);
  } catch (err) {
    return fail(res, err, "export");
  }
});

module.exports = router;
