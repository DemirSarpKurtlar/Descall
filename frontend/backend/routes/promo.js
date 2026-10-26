"use strict";

/** Promosyon kodu (user side): redeem, history, gift popup. All routes need a signed-in user. */

const express = require("express");
const { requireAuth } = require("../middleware/auth");
const promo = require("../lib/promo");
const { recordFailure, rejectIfLimited } = require("../lib/rateLimit");

const router = express.Router();
router.use(requireAuth);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function send(res, err) {
  const status = err?.status || 500;
  if (status >= 500) console.error("[promo]", err?.cause?.message || err?.message || "error");
  if (status === 429 && err.extra?.retryAfter) res.set("Retry-After", String(err.extra.retryAfter));
  res.status(status).json({ error: err?.code || "server_error", code: err?.code || "server_error", ...(err?.extra || {}) });
}

router.post("/redeem", async (req, res) => {
  try {
    const raw = typeof req.body?.code === "string" ? req.body.code.slice(0, 64) : "";
    const out = await promo.redeem(req.user.id, raw, { ip: req.ip });
    const io = req.app.get("io");
    if (typeof out.balance === "number") {
      io?.to(`user:${req.user.id}`)?.emit("descoin:balance", { balance: out.balance, reason: "promo" });
    }
    res.set("Cache-Control", "no-store");
    res.json(out);
  } catch (err) {
    send(res, err);
  }
});

router.get("/history", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json({ items: await promo.history(req.user.id) });
  } catch (err) {
    send(res, err);
  }
});

// Listing is cheap but it hands out codes, so keep it bounded: 30/min per account, 120/min per IP.
function listLimited(req, res, name) {
  return rejectIfLimited(res, [
    recordFailure(`promo:${name}:u:${req.user.id}`, { max: 30, windowMs: 60 * 1000 }),
    recordFailure(`promo:${name}:ip:${req.ip}`, { max: 120, windowMs: 60 * 1000 }),
  ]);
}

/**
 * Codes this account can use right now. The database decides (promo_available_for): never a code
 * for someone else, never a hidden ('none') code, never a used / full / expired / locked one.
 * ?summary=1 answers only { count, unseen } for the settings badge (no codes).
 */
router.get("/available", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    if (listLimited(req, res, "available")) return;
    const out = await promo.available(req.user.id);
    if (req.query.summary === "1") return res.json({ count: out.count, unseen: out.unseen, serverNow: out.serverNow });
    res.json(out);
  } catch (err) {
    send(res, err);
  }
});

router.post("/available/seen", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    if (listLimited(req, res, "seen")) return;
    res.json(await promo.markAvailableSeen(req.user.id, req.body?.ids));
  } catch (err) {
    send(res, err);
  }
});

router.get("/popup", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json({ popup: await promo.popupFor(req.user.id) });
  } catch (err) {
    send(res, err);
  }
});

router.post("/popup/:id/seen", async (req, res) => {
  try {
    if (!UUID.test(req.params.id)) throw new promo.PromoError("not_found", 404);
    await promo.markPopup(req.user.id, req.params.id, req.body?.snooze === true);
    res.json({ ok: true });
  } catch (err) {
    send(res, err);
  }
});

module.exports = router;
