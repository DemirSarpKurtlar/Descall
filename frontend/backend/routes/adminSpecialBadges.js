"use strict";

/**
 * Special badges, admin side (mounted inside routes/admin.js after requireAuth + requireAdmin):
 *   GET  /api/admin/special-badges                  KPIs + catalog with rules and counts
 *   GET  /api/admin/special-badges/audit            latest grants / take-backs
 *   GET  /api/admin/special-badges/:badgeId/holders holders by serial
 *   POST /api/admin/special-badges/:badgeId/grant   { userId, note? }
 *   POST /api/admin/special-badges/:badgeId/revoke  { userId, reason? }
 */

const express = require("express");
const state = require("../runtime/sharedState");
const specialBadges = require("../lib/specialBadges");
const { deliverPending, broadcastProfile } = require("../lib/specialBadgeNotify");

const router = express.Router();

function sendError(res, err, label) {
  if (err instanceof specialBadges.SpecialBadgeError && err.status < 500) {
    return res.status(err.status).json({ error: err.code });
  }
  console.error(`[admin special-badges] ${label}:`, err?.cause?.message || err?.message || err);
  return res.status(500).json({ error: "server_error" });
}

function audit(actor, action, target, meta) {
  try {
    return state.appendAudit(actor.id, actor.username, action, target, meta);
  } catch {
    return null;
  }
}

router.get("/special-badges", async (req, res) => {
  try {
    const [rows, kpis] = await Promise.all([specialBadges.catalog({ fresh: true }), specialBadges.overview()]);
    res.set("Cache-Control", "no-store");
    res.json({ kpis, badges: rows.map((row) => specialBadges.publicCatalogRow(row, { admin: true })) });
  } catch (err) {
    sendError(res, err, "overview");
  }
});

router.get("/special-badges/audit", async (req, res) => {
  try {
    const badgeId = req.query.badgeId ? String(req.query.badgeId) : null;
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    res.set("Cache-Control", "no-store");
    res.json({ entries: await specialBadges.auditLog({ limit, badgeId }) });
  } catch (err) {
    sendError(res, err, "audit");
  }
});

router.get("/special-badges/:badgeId/holders", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json({ holders: await specialBadges.holders(String(req.params.badgeId)) });
  } catch (err) {
    sendError(res, err, "holders");
  }
});

router.post("/special-badges/:badgeId/grant", async (req, res) => {
  try {
    const badgeId = String(req.params.badgeId);
    const userId = String(req.body?.userId || "");
    const result = await specialBadges.grant({ userId, badgeId, actorId: req.user.id, note: req.body?.note });
    audit(req.user, "special_badge_grant", userId, { badgeId, serial: result.serial });
    const io = req.app.get("io");
    if (io) await deliverPending(io, userId).catch(() => {});
    res.json({ ok: true, serial: result.serial });
  } catch (err) {
    sendError(res, err, "grant");
  }
});

router.post("/special-badges/:badgeId/revoke", async (req, res) => {
  try {
    const badgeId = String(req.params.badgeId);
    const userId = String(req.body?.userId || "");
    const result = await specialBadges.revoke({ userId, badgeId, actorId: req.user.id, reason: req.body?.reason });
    audit(req.user, "special_badge_revoke", userId, { badgeId, serial: result.serial });
    const io = req.app.get("io");
    if (io) {
      await deliverPending(io, userId).catch(() => {});
      if (result.wasEquipped) await broadcastProfile(io, userId);
    }
    res.json({ ok: true, serial: result.serial, wasEquipped: result.wasEquipped });
  } catch (err) {
    sendError(res, err, "revoke");
  }
});

module.exports = router;
