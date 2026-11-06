"use strict";

/**
 * Descall+ / Ultra, user side (docs/premium/CONTRACT.md). All routes need a signed-in user.
 *   GET  /api/premium/me      { plan, status, ends_at, unlimited, features, monthly_descoin, next_coin_at }
 *   GET  /api/premium/plans   visible plans with their features; no prices in phase 1
 *   POST /api/premium/redeem  { code } -> free_membership campaigns only (rate limited)
 * Membership state comes from the database (premium_me), never from the client.
 */

const express = require("express");
const { requireAuth } = require("../middleware/auth");
const premium = require("../lib/premium/service");
const entitlements = require("../lib/premium/entitlements");
const { emitPremiumUpdated } = require("../socket/premium");
const { recordFailure, peek, rejectIfLimited } = require("../lib/rateLimit");

const router = express.Router();
router.use(requireAuth);

// Every redeem try counts (10 per 10 min per account, 60 per hour per IP); wrong or expired
// codes lock the account sooner (5 per 10 min).
const REDEEM_USER = { windowMs: 10 * 60 * 1000, max: 10 };
const REDEEM_IP = { windowMs: 60 * 60 * 1000, max: 60 };
const REDEEM_BAD = { windowMs: 10 * 60 * 1000, max: 5 };
const BAD_CODES = new Set(["invalid", "expired"]);

function send(res, err, label) {
  const status = err?.status || 500;
  if (status >= 500) console.error(`[premium] ${label}:`, err?.code || "error");
  res.status(status).json({ error: err?.code || "server_error", code: err?.code || "server_error" });
}

router.get("/me", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const me = await entitlements.loadMe(req.user.id, { fresh: true });
    res.json(entitlements.publicMe(me));
  } catch (err) {
    send(res, err, "me");
  }
});

router.get("/plans", async (_req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const rows = await premium.listPlans({ visibleOnly: true });
    res.json({ plans: rows.map(premium.publicPlan), payments_integrated: false });
  } catch (err) {
    send(res, err, "plans");
  }
});

router.post("/redeem", async (req, res) => {
  const uid = req.user.id;
  if (rejectIfLimited(res, [
    peek(`premium:redeem:bad:${uid}`, REDEEM_BAD),
    recordFailure(`premium:redeem:u:${uid}`, REDEEM_USER),
    recordFailure(`premium:redeem:ip:${req.ip}`, REDEEM_IP),
  ])) return;
  try {
    const code = typeof req.body?.code === "string" ? req.body.code.slice(0, 64) : "";
    const out = await premium.redeem(uid, code);
    emitPremiumUpdated(req.app.get("io"), uid, { kind: "campaign_redeem" });
    const me = await entitlements.loadMe(uid, { fresh: true });
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, plan: out.plan, days: out.days, premium: entitlements.publicMe(me) });
  } catch (err) {
    if (BAD_CODES.has(err?.code)) recordFailure(`premium:redeem:bad:${uid}`, REDEEM_BAD);
    send(res, err, "redeem");
  }
});

module.exports = router;
