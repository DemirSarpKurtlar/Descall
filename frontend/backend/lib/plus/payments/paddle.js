"use strict";

/**
 * Paddle Billing (merchant of record) for web and desktop.
 *   Checkout: the client opens Paddle.js inline in the Descall+ window with the public client
 *   token, the price id from config.products.paddle and custom_data.checkout_id.
 *   Webhooks: header `Paddle-Signature: ts=<unix>;h1=<hex>`; h1 = HMAC-SHA256(secret, `${ts}:${raw}`).
 *   Old timestamps (> 5 min) are refused (replay protection).
 * Env: PADDLE_WEBHOOK_SECRET (secret), PADDLE_CLIENT_TOKEN (public), PADDLE_ENV (sandbox|production),
 * PADDLE_API_KEY (secret, cancel / refund calls).
 */

const crypto = require("crypto");
const { keyFor } = require("./products");

const TOLERANCE_S = 300;

function status(env = process.env) {
  const missing = ["PADDLE_WEBHOOK_SECRET", "PADDLE_CLIENT_TOKEN", "PADDLE_API_KEY"].filter((k) => !env[k]);
  return { id: "paddle", configured: missing.length === 0, missing, webhook: "/api/plus/webhooks/paddle" };
}

// Paddle-Signature is "ts=<unix>;h1=<hex>". Only those two keys are read; the header is
// attacker-controlled, so other keys (e.g. "__proto__") are never written to an object.
function parseHeader(h) {
  const out = { ts: undefined, h1: undefined };
  for (const part of String(h || "").split(";")) {
    const [k, v] = part.split("=");
    const key = String(k || "").trim();
    if ((key === "ts" || key === "h1") && v) out[key] = v.trim();
  }
  return out;
}

function timingEqualHex(a, b) {
  const x = Buffer.from(String(a), "hex");
  const y = Buffer.from(String(b), "hex");
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

/** Throws { code } when the signature is missing, wrong or too old. */
function verify(rawBody, header, secret, { now = Date.now() } = {}) {
  if (!secret) throw Object.assign(new Error("not_configured"), { code: "not_configured", status: 503 });
  const h = parseHeader(header);
  if (!h.ts || !h.h1) throw Object.assign(new Error("bad_signature"), { code: "bad_signature", status: 401 });
  const ts = Number(h.ts);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > TOLERANCE_S) throw Object.assign(new Error("stale"), { code: "stale_signature", status: 401 });
  const raw = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody || "");
  const want = crypto.createHmac("sha256", secret).update(`${h.ts}:${raw}`).digest("hex");
  if (!timingEqualHex(want, h.h1)) throw Object.assign(new Error("bad_signature"), { code: "bad_signature", status: 401 });
  return true;
}

/** Signature header for a body (tests and local tools). */
function sign(rawBody, secret, ts = Math.floor(Date.now() / 1000)) {
  const h1 = crypto.createHmac("sha256", secret).update(`${ts}:${rawBody}`).digest("hex");
  return `ts=${ts};h1=${h1}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A verified webhook body -> normalized event. */
function normalize(body, cfg) {
  const type = String(body?.event_type || "");
  const d = body?.data || {};
  const custom = d.custom_data || {};
  const base = {
    provider: "paddle",
    eventId: String(body?.event_id || ""),
    checkoutId: UUID.test(String(custom.checkout_id || "")) ? String(custom.checkout_id).toLowerCase() : null,
    userId: UUID.test(String(custom.user_id || "")) ? String(custom.user_id).toLowerCase() : null,
    platform: custom.platform === "desktop" ? "desktop" : "web",
  };
  if (type === "transaction.completed") {
    const priceId = d.items?.[0]?.price?.id || d.items?.[0]?.price_id || null;
    const product = priceId ? keyFor(cfg, "paddle", priceId) : null;
    const total = Number(d.details?.totals?.total);
    return {
      ...base,
      type: d.origin === "subscription_recurring" ? "renewal" : "purchase",
      productKey: product?.key || null,
      product,
      amountMinor: Number.isFinite(total) ? total : null,
      currency: d.currency_code || null,
      endsAt: d.billing_period?.ends_at || null,
      transactionRef: String(d.id || ""),
      subscriptionRef: d.subscription_id || null,
    };
  }
  if (type === "subscription.updated") {
    const action = d.scheduled_change?.action || null;
    return { ...base, type: action === "cancel" ? "cancel_at_end" : "resume", subscriptionRef: d.id || null, transactionRef: null };
  }
  if (type === "subscription.canceled") return { ...base, type: "expire", subscriptionRef: d.id || null };
  if (type === "subscription.past_due") return { ...base, type: "payment_failed", subscriptionRef: d.id || null };
  if (type === "adjustment.created" || type === "adjustment.updated") {
    if (d.action === "refund" && d.status === "approved") {
      return { ...base, type: "refund", transactionRef: String(d.transaction_id || ""), subscriptionRef: d.subscription_id || null, amountMinor: Number(d.totals?.total) || null, currency: d.currency_code || null };
    }
  }
  return { ...base, type: "ignore" };
}

/** What the client needs to open the inline checkout. */
function clientCheckout({ checkout, priceId, email, env = process.env }) {
  return {
    provider: "paddle",
    environment: env.PADDLE_ENV === "production" ? "production" : "sandbox",
    clientToken: env.PADDLE_CLIENT_TOKEN || null,
    priceId,
    customData: { checkout_id: checkout.id, user_id: checkout.user_id, platform: checkout.platform },
    email: email || null,
  };
}

/**
 * Server-created transaction: Paddle answers with its hosted checkout URL (the default payment
 * link), which the client opens in a tab / the system browser. No Paddle script runs in the app.
 */
async function createTransaction({ checkout, priceId, env = process.env, fetchImpl } = {}) {
  const json = await api("/transactions", {
    method: "POST",
    env,
    fetchImpl,
    body: { items: [{ price_id: priceId, quantity: 1 }], custom_data: { checkout_id: checkout.id, user_id: checkout.user_id, platform: checkout.platform }, collection_mode: "automatic" },
  });
  return { id: json?.data?.id || null, url: json?.data?.checkout?.url || null };
}

async function api(path, { method = "GET", body = null, env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (!env.PADDLE_API_KEY) throw Object.assign(new Error("not_configured"), { code: "not_configured", status: 503 });
  const base = env.PADDLE_ENV === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${env.PADDLE_API_KEY}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error("provider_error"), { code: "provider_error", status: 502, providerStatus: res.status });
    return json;
  } finally {
    clearTimeout(timer);
  }
}

const cancelAtPeriodEnd = (subRef, opts) => api(`/subscriptions/${encodeURIComponent(subRef)}/cancel`, { method: "POST", body: { effective_from: "next_billing_period" }, ...opts });
const resume = (subRef, opts) => api(`/subscriptions/${encodeURIComponent(subRef)}`, { method: "PATCH", body: { scheduled_change: null }, ...opts });
const refund = (transactionRef, reason, opts) => api("/adjustments", { method: "POST", body: { action: "refund", transaction_id: transactionRef, reason: String(reason || "requested_by_customer").slice(0, 200), type: "full" }, ...opts });

module.exports = { status, verify, sign, normalize, clientCheckout, createTransaction, cancelAtPeriodEnd, resume, refund, parseHeader };
