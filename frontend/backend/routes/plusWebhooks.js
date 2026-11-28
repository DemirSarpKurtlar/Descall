"use strict";

/**
 * Descall+ payment webhooks. Mounted in server.js BEFORE express.json() so the raw bytes reach the
 * signature checks. Nothing is fulfilled unless the signature (or, for Apple, the certificate chain)
 * verifies. Unknown / unconfigured providers answer 503 (the provider retries later), bad signatures
 * 401, permanent problems 200 with ok:false (logged, visible in the admin console) so a provider
 * does not hammer us, transient errors 500 (the provider retries).
 *
 *   POST /api/plus/webhooks/apple        App Store Server Notifications V2 { signedPayload }
 *   POST /api/plus/webhooks/paddle       Paddle-Signature
 *   POST /api/plus/webhooks/iyzico       X-IYZ-SIGNATURE-V3 (re-read from the API before fulfilment)
 *   POST /api/plus/webhooks/iyzico/callback?checkout=<id>   iyzico checkout form return (token)
 *   POST /api/plus/webhooks/revenuecat   Authorization
 */

const express = require("express");
const config = require("../lib/plus/config");
const providers = require("../lib/plus/payments");
const { fulfil } = require("../lib/plus/payments/fulfil");

const { burstLimit } = require("../lib/burstLimit");

const router = express.Router();
// Coarse per-IP burst cap: providers retry and batch, so the ceiling is generous; signature
// checks and event-id idempotency below are the real guards.
router.use(burstLimit({ name: "plus-webhooks", limit: 600 }));
const raw = express.raw({ type: () => true, limit: "512kb" });

function parseJson(buf) {
  try {
    return JSON.parse(Buffer.isBuffer(buf) ? buf.toString("utf8") : String(buf || "{}"));
  } catch {
    return null;
  }
}

async function run(res, ev, cfg) {
  try {
    const out = await fulfil(ev, { cfg });
    if (out.duplicate) return res.json({ ok: true, duplicate: true });
    if (out.status === "failed") {
      console.warn(`[plus/webhook] ${ev.provider} ${ev.type} not applied: ${out.error || "failed"}`);
      return res.json({ ok: false, error: out.error || "failed" });
    }
    return res.json({ ok: true, status: out.status });
  } catch (err) {
    console.error(`[plus/webhook] ${ev.provider} error:`, err?.code || "error");
    return res.status(500).json({ ok: false, error: "retry" });
  }
}

function refuse(res, err) {
  const status = err?.status || 400;
  return res.status(status).json({ ok: false, error: err?.code || "bad_request" });
}

router.post("/apple", raw, async (req, res) => {
  if (!providers.isConfigured("apple")) return res.status(503).json({ ok: false, error: "not_configured" });
  const body = parseJson(req.body);
  if (!body) return res.status(400).json({ ok: false, error: "bad_json" });
  const cfg = await config.load();
  let ev;
  try {
    ev = providers.apple.normalizeNotification(body, cfg);
  } catch (err) {
    return refuse(res, { status: 401, code: err?.code || "bad_signature" });
  }
  return run(res, ev, cfg);
});

router.post("/paddle", raw, async (req, res) => {
  if (!providers.isConfigured("paddle")) return res.status(503).json({ ok: false, error: "not_configured" });
  try {
    providers.paddle.verify(req.body, req.get("Paddle-Signature"), process.env.PADDLE_WEBHOOK_SECRET);
  } catch (err) {
    return refuse(res, err);
  }
  const body = parseJson(req.body);
  if (!body) return res.status(400).json({ ok: false, error: "bad_json" });
  const cfg = await config.load();
  return run(res, providers.paddle.normalize(body, cfg), cfg);
});

/** Confirm an iyzico payment / subscription from the API (authoritative) and build the event. */
async function confirmIyzico({ token, checkoutId, cfg }) {
  const { data: checkout } = await require("../db/supabase").from("premium_checkouts").select("*").eq("id", checkoutId).maybeSingle();
  if (!checkout) return null;
  // While the checkout waits for payment, provider_ref is the token its initialize call returned.
  if (checkout.status !== "paid" && checkout.provider_ref && checkout.provider_ref !== token) return { mismatch: true };
  const key = checkout.kind === "self" ? `${checkout.plan}_${checkout.period}` : `gift_${checkout.plan}_${checkout.months}`;
  const res = checkout.kind === "self" ? await providers.iyzico.retrieveSubscription(token) : await providers.iyzico.retrievePayment(token);
  // The callback is unsigned (checkout id from the URL, token from the form): the token must be
  // one iyzico issued for THIS checkout, or a cheap paid token would pay a dear checkout. A
  // one-time payment carries our basketId (= checkout id); a subscription carries the pricing
  // plan, which must be this checkout's. "status: success" alone only means the call worked.
  const bound = checkout.kind === "self"
    ? Boolean(res?.data?.pricingPlanReferenceCode) && res.data.pricingPlanReferenceCode === cfg?.products?.iyzico?.[key]
    : String(res?.basketId || "") === String(checkout.id);
  if (!bound) return { mismatch: true };
  const ok = checkout.kind === "self" ? res?.data?.subscriptionStatus === "ACTIVE" : res?.paymentStatus === "SUCCESS";
  if (!ok) return { provider: "iyzico", eventId: `cb:${token}`, type: "payment_failed", checkoutId: checkout.id };
  return {
    provider: "iyzico",
    eventId: `cb:${token}`,
    type: checkout.trial ? "trial_start" : "purchase",
    checkoutId: checkout.id,
    productKey: key,
    amountMinor: checkout.amount_minor,
    currency: checkout.currency,
    transactionRef: String(res?.paymentId || res?.data?.referenceCode || token),
    subscriptionRef: res?.data?.referenceCode || null,
    endsAt: res?.data?.endDate ? new Date(Number(res.data.endDate)).toISOString() : null,
    platform: checkout.platform,
  };
}

router.post("/iyzico", raw, async (req, res) => {
  if (!providers.isConfigured("iyzico")) return res.status(503).json({ ok: false, error: "not_configured" });
  const body = parseJson(req.body);
  if (!body) return res.status(400).json({ ok: false, error: "bad_json" });
  try {
    providers.iyzico.verify(body, req.get("X-IYZ-SIGNATURE-V3"));
  } catch (err) {
    return refuse(res, err);
  }
  const cfg = await config.load();
  const ev = providers.iyzico.normalize(body);
  if (ev.token && ev.checkoutId && ev.type === "purchase") {
    const confirmed = await confirmIyzico({ token: ev.token, checkoutId: ev.checkoutId, cfg }).catch(() => null);
    if (!confirmed) return res.status(500).json({ ok: false, error: "retry" });
    if (confirmed.mismatch) return res.json({ ok: false, error: "token_mismatch" });
    return run(res, confirmed, cfg);
  }
  return run(res, ev, cfg);
});

// The hosted page posts the token back here (in the Descall+ window's frame or the system browser).
// We confirm from the API and fulfil; the app sees it through its checkout status poll. The answer
// is a plain page (no script) telling the buyer they can go back to Descall.
const DONE_COPY = require("../lib/plus/donePage.copy.json");

function pageLang(req) {
  const want = String(req.get("accept-language") || "").toLowerCase();
  if (want.startsWith("pt")) return "pt-BR";
  const two = want.slice(0, 2);
  return DONE_COPY[two] ? two : "tr";
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function donePage(ok, lang = "tr") {
  const c = DONE_COPY[lang] || DONE_COPY.tr;
  const head = escapeHtml(ok ? c.okTitle : c.failTitle);
  const line = escapeHtml(ok ? c.okBody : c.failBody);
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${head}</title></head>`
    + `<body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#111214;color:#f2f3f5;font:15px -apple-system,system-ui,sans-serif;text-align:center">`
    + `<div><h1 style="font-size:19px">${head}</h1><p style="color:#b5bac1">${line}</p></div></body></html>`;
}

router.post("/iyzico/callback", express.urlencoded({ extended: false, limit: "16kb" }), async (req, res) => {
  const checkoutId = String(req.query.checkout || "");
  const token = String(req.body?.token || "");
  res.set("Cache-Control", "no-store");
  res.type("html");
  if (!providers.isConfigured("iyzico") || !/^[0-9a-f-]{36}$/i.test(checkoutId) || !token) return res.status(400).send(donePage(false, pageLang(req)));
  try {
    const cfg = await config.load();
    const ev = await confirmIyzico({ token, checkoutId, cfg });
    if (!ev || ev.mismatch) return res.status(400).send(donePage(false, pageLang(req)));
    await fulfil(ev, { cfg });
    return res.send(donePage(ev.type !== "payment_failed", pageLang(req)));
  } catch (err) {
    console.warn("[plus/webhook] iyzico callback:", err?.code || "error");
    return res.status(500).send(donePage(false, pageLang(req)));
  }
});

router.post("/revenuecat", raw, async (req, res) => {
  if (!providers.isConfigured("revenuecat")) return res.status(503).json({ ok: false, error: "not_configured" });
  try {
    providers.revenuecat.verify(req.get("Authorization"));
  } catch (err) {
    return refuse(res, err);
  }
  const body = parseJson(req.body);
  if (!body) return res.status(400).json({ ok: false, error: "bad_json" });
  const cfg = await config.load();
  return run(res, providers.revenuecat.normalize(body, cfg), cfg);
});

module.exports = router;
