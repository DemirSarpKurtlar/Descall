"use strict";

/**
 * Descall+ 2.0 user API (owner pick 5B "Sunucu ve Hediye"). All routes need a signed-in user.
 * The platform comes from X-Descall-Platform (web | desktop | ios | android), default web.
 *
 *   GET  /offer                      prices, switches, limits for this platform
 *   GET  /me                         membership with trial / renewal / origin
 *   GET  /hub                        the Descall+ center (plans, boosts, servers, friends, gifts, tickets)
 *   GET  /limits?serverId=           effective limits incl. the screen share ceiling
 *   POST /paywall/decide             { moment, serverId? } -> { show: full|compact|none }
 *   POST /paywall/track              { moment, action, serverId?, meta? }
 *   POST /boosts                     { serverId }            POST /boosts/:id/move { serverId }
 *   POST /boosts/:id/cancel-move     PATCH /boosts/:id { showOnWall }
 *   GET  /servers/:id                server level page       PUT /servers/:id/settings (owner)
 *   POST /servers/:id/thanks         { toUserId?, message }
 *   POST /checkout                   GET /checkout/:id       POST /apple/transactions { jws }
 *   GET  /gifts                      POST /gifts/:id/open | /recall    PATCH /gifts/:id { deliverAt }
 *   GET  /groups/:id
 *   GET  /tickets                    POST /tickets/:id/send { userId }   POST /tickets/:id/redeem
 *   GET  /cancel/impact              POST /cancel { reason, note }       POST /resume
 *   GET  /asks   POST /asks { toUserId }   POST /asks/:id/dismiss   GET|PUT /prefs
 */

const express = require("express");
const { requireAuth } = require("../middleware/auth");
const config = require("../lib/plus/config");
const service = require("../lib/plus/service");
const paywall = require("../lib/plus/paywall");
const checkout = require("../lib/plus/checkout");
const notify = require("../lib/plus/notify");
const providers = require("../lib/plus/payments");
const { fulfil } = require("../lib/plus/payments/fulfil");
const { platformOf } = require("../lib/plus/animatedProfile");
const { recordFailure, rejectIfLimited } = require("../lib/rateLimit");

const router = express.Router();
router.use(requireAuth);
router.use((req, _res, next) => {
  notify.bind(req.app?.get?.("io"));
  next();
});

const WRITE_LIMIT = { windowMs: 60 * 1000, max: 30 };
const CHECKOUT_LIMIT = { windowMs: 10 * 60 * 1000, max: 15 };
const TRACK_LIMIT = { windowMs: 60 * 1000, max: 60 };

function send(res, err, label) {
  const status = err?.status || 500;
  if (status >= 500) console.error(`[plus] ${label}:`, err?.code || err?.message || "error");
  res.status(status).json({ error: err?.code || "server_error", code: err?.code || "server_error", ...(err?.extra && typeof err.extra === "object" ? { detail: pickDetail(err.extra) } : {}) });
}

function pickDetail(extra) {
  const out = {};
  for (const k of ["nextAt", "available_at", "move_at", "used", "slots", "provider", "key"]) if (extra[k] !== undefined) out[k] = extra[k];
  return out;
}

function handle(label, fn, { limit = null } = {}) {
  return async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (limit && rejectIfLimited(res, [recordFailure(`plus:${label}:${req.user.id}`, limit)])) return;
    try {
      res.json(await fn(req));
    } catch (err) {
      send(res, err, label);
    }
  };
}

router.get("/offer", handle("offer", async (req) => {
  const cfg = await config.load();
  return { offer: config.publicOffer(cfg, platformOf(req), req.user.id), moments: paywall.rules(cfg).map((m) => ({ id: m.id, n: m.n, kind: m.kind, who: m.who })) };
}));

router.get("/me", handle("me", async (req) => ({ me: await service.plusMe(req.user.id) })));

router.get("/hub", handle("hub", async (req) => service.hub(req.user.id, { platform: platformOf(req) })));

router.get("/limits", handle("limits", async (req) => ({ limits: await service.limitsFor(req.user.id, { serverId: req.query.serverId || null, platform: platformOf(req) }) })));

router.post("/paywall/decide", handle("decide", async (req) => {
  const cfg = await config.load();
  const moment = String(req.body?.moment || "");
  const platform = platformOf(req);
  const [recent, plan, created] = await Promise.all([
    paywall.recentFor(req.user.id),
    require("../lib/premium/entitlements").planFor(req.user.id),
    require("../db/supabase").from("users").select("created_at").eq("id", req.user.id).maybeSingle().then((r) => r.data?.created_at || null),
  ]);
  const verdict = paywall.decide({ moment, cfg, platform, userId: req.user.id, plan, accountCreatedAt: created, recent });
  if (verdict.show !== "none" && paywall.MOMENTS.find((m) => m.id === moment)?.kind !== "info") {
    await paywall.track(req.user.id, { moment, action: verdict.show === "full" ? "shown" : "compact", platform, serverId: req.body?.serverId || null });
  }
  return verdict;
}, { limit: TRACK_LIMIT }));

router.post("/paywall/track", handle("track", async (req) => {
  const b = req.body || {};
  if (!["clicked", "dismissed", "first_frame", "gift_requested"].includes(b.action)) return { ok: false };
  return { ok: await paywall.track(req.user.id, { moment: b.moment, action: b.action, platform: platformOf(req), serverId: b.serverId || null, meta: b.meta }) };
}, { limit: TRACK_LIMIT }));

/* boosts */
router.post("/boosts", handle("boost", (req) => service.assignBoost(req.user.id, String(req.body?.serverId || ""), { requestId: req.body?.requestId || null, platform: platformOf(req) }), { limit: WRITE_LIMIT }));
router.post("/boosts/:id/move", handle("boost-move", (req) => service.moveBoost(req.user.id, String(req.params.id), String(req.body?.serverId || "")), { limit: WRITE_LIMIT }));
router.post("/boosts/:id/cancel-move", handle("boost-cancel", (req) => service.cancelMove(req.user.id, String(req.params.id)), { limit: WRITE_LIMIT }));
router.patch("/boosts/:id", handle("boost-wall", (req) => service.setBoostWall(req.user.id, String(req.params.id), req.body?.showOnWall !== false), { limit: WRITE_LIMIT }));

/* servers */
router.get("/servers/:id", handle("server", (req) => service.serverBoostPage(req.user.id, String(req.params.id))));
router.put("/servers/:id/settings", handle("server-settings", (req) => service.saveServerSettings(req.user.id, String(req.params.id), req.body), { limit: WRITE_LIMIT }));
router.post("/servers/:id/thanks", handle("thanks", (req) => service.thank(req.user.id, String(req.params.id), { toUserId: req.body?.toUserId || null, message: req.body?.message || "" }), { limit: WRITE_LIMIT }));

/* checkout */
router.post("/checkout", handle("checkout", (req) => checkout.create(req.user.id, req.body || {}, {
  platform: platformOf(req),
  ip: req.ip,
  origin: `${req.protocol}://${req.get("host")}`,
  user: req.user,
}), { limit: CHECKOUT_LIMIT }));
router.get("/checkout/:id", handle("checkout-get", (req) => checkout.get(req.user.id, String(req.params.id))));

/** StoreKit 2: the app posts Transaction.jwsRepresentation right after a purchase (verified here). */
router.post("/apple/transactions", handle("apple-tx", async (req) => {
  const cfg = await config.load();
  if (!providers.isConfigured("apple")) {
    const e = new Error("provider_not_configured");
    e.code = "provider_not_configured";
    e.status = 503;
    throw e;
  }
  const ev = providers.apple.normalizeTransaction(String(req.body?.jws || ""), cfg);
  if (ev.checkoutId) {
    const { data: c } = await require("../db/supabase").from("premium_checkouts").select("user_id").eq("id", ev.checkoutId).maybeSingle();
    if (!c || c.user_id !== req.user.id) {
      const e = new Error("not_found");
      e.code = "not_found";
      e.status = 404;
      throw e;
    }
  } else {
    ev.userId = req.user.id;
  }
  const out = await fulfil(ev, { cfg });
  return { ok: true, duplicate: Boolean(out.duplicate), status: out.status || "processed" };
}, { limit: CHECKOUT_LIMIT }));

/* gifts */
router.get("/gifts", handle("gifts", (req) => service.listGifts(req.user.id)));
router.post("/gifts/:id/open", handle("gift-open", (req) => service.openGift(req.user.id, String(req.params.id)), { limit: WRITE_LIMIT }));
router.post("/gifts/:id/recall", handle("gift-recall", (req) => service.recallGift(req.user.id, String(req.params.id)), { limit: WRITE_LIMIT }));
router.patch("/gifts/:id", handle("gift-reschedule", (req) => service.rescheduleGift(req.user.id, String(req.params.id), req.body?.deliverAt), { limit: WRITE_LIMIT }));
router.get("/groups/:id", handle("group", (req) => service.getGroup(req.user.id, String(req.params.id))));

/* tickets */
router.get("/tickets", handle("tickets", (req) => service.listTickets(req.user.id)));
router.post("/tickets/:id/send", handle("ticket-send", (req) => service.sendTicket(req.user.id, String(req.params.id), String(req.body?.userId || "")), { limit: WRITE_LIMIT }));
router.post("/tickets/:id/redeem", handle("ticket-redeem", (req) => service.redeemTicket(req.user.id, String(req.params.id)), { limit: WRITE_LIMIT }));

/* cancel / resume */
async function providerCancel(me) {
  if (me.provider === "paddle" && me.provider_sub_ref) await providers.paddle.cancelAtPeriodEnd(me.provider_sub_ref);
  else if (me.provider === "iyzico" && me.provider_sub_ref) await providers.iyzico.cancelSubscription(me.provider_sub_ref);
}
async function providerResume(me) {
  if (me.provider === "paddle" && me.provider_sub_ref) await providers.paddle.resume(me.provider_sub_ref);
}
router.get("/cancel/impact", handle("impact", (req) => service.cancelImpact(req.user.id)));
router.post("/cancel", handle("cancel", (req) => service.cancel(req.user.id, { reason: req.body?.reason, note: req.body?.note }, { providerCancel }), { limit: WRITE_LIMIT }));
router.post("/resume", handle("resume", (req) => service.resume(req.user.id, { providerResume }), { limit: WRITE_LIMIT }));

/* asks / prefs */
router.get("/asks", handle("asks", (req) => service.listAsks(req.user.id)));
router.post("/asks", handle("ask", (req) => service.askForGift(req.user.id, String(req.body?.toUserId || ""), { kind: req.body?.kind }), { limit: WRITE_LIMIT }));
router.post("/asks/:id/dismiss", handle("ask-dismiss", (req) => service.dismissAsk(req.user.id, String(req.params.id)), { limit: WRITE_LIMIT }));
router.get("/prefs", handle("prefs", (req) => service.getPrefs(req.user.id)));
router.put("/prefs", handle("prefs-set", (req) => service.setPrefs(req.user.id, req.body), { limit: WRITE_LIMIT }));

module.exports = router;
