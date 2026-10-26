"use strict";

/**
 * Special badges, signed-in side:
 *   GET  /api/special-badges/catalog          36 badges with live holder counts
 *   GET  /api/special-badges/users/:userId    someone's badges (read-only for others)
 *   PUT  /api/special-badges/me/equipped      { badgeId | null } wear one or none
 * There is no purchase route on purpose: special badges cannot be bought with DesCoin.
 */

const express = require("express");
const { requireAuth } = require("../middleware/auth");
const specialBadges = require("../lib/specialBadges");
const { broadcastProfile } = require("../lib/specialBadgeNotify");

const router = express.Router();
router.use(requireAuth);

function sendError(res, err, label) {
  if (err instanceof specialBadges.SpecialBadgeError && err.status < 500) {
    return res.status(err.status).json({ error: err.code });
  }
  console.error(`[special-badges] ${label}:`, err?.cause?.message || err?.message || err);
  return res.status(500).json({ error: "server_error" });
}

router.get("/catalog", async (req, res) => {
  try {
    const rows = await specialBadges.catalog();
    res.set("Cache-Control", "private, max-age=30");
    res.json({ badges: rows.map((row) => specialBadges.publicCatalogRow(row)) });
  } catch (err) {
    sendError(res, err, "catalog");
  }
});

router.get("/users/:userId", async (req, res) => {
  try {
    const userId = req.params.userId === "me" ? req.user.id : req.params.userId;
    if (!specialBadges.isUuid(userId)) return res.status(400).json({ error: "invalid_input" });
    const rows = await specialBadges.badgesForUser(userId);
    const equipped = rows.find((row) => row.equipped)?.id || null;
    res.set("Cache-Control", "private, no-store");
    res.json({
      userId,
      equipped,
      badges: rows.map((row) => ({
        id: row.id,
        serial: row.serial,
        grantedAt: row.grantedAt,
        via: row.via === "promo" ? "promo" : "admin",
        grantedBy: row.grantedBy ? { id: row.grantedBy.id, username: row.grantedBy.username, displayName: row.grantedBy.displayName || null } : null,
        equipped: Boolean(row.equipped),
      })),
    });
  } catch (err) {
    sendError(res, err, "user badges");
  }
});

router.put("/me/equipped", async (req, res) => {
  try {
    const raw = req.body?.badgeId;
    const badgeId = raw === null || raw === undefined || raw === "" ? null : String(raw);
    const result = await specialBadges.equip(req.user.id, badgeId);
    const io = req.app.get("io");
    if (io) {
      io.to(`user:${req.user.id}`).emit("special-badge:equipped", { badgeId: result.equipped });
      await broadcastProfile(io, req.user.id);
    }
    res.json({ ok: true, equipped: result.equipped, previous: result.previous });
  } catch (err) {
    sendError(res, err, "equip");
  }
});

module.exports = router;
