"use strict";

/** Promosyon kodu (user side): redeem, history, gift popup. All routes need a signed-in user. */

const express = require("express");
const { requireAuth } = require("../middleware/auth");
const promo = require("../lib/promo");

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
