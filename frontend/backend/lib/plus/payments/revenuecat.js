"use strict";

/**
 * RevenueCat (optional, mobile): webhook with a shared Authorization header value
 * (REVENUECAT_WEBHOOK_AUTH), compared in constant time. app_user_id is the Descall user id
 * (the app logs in to RevenueCat with it). Product ids map through config.products.revenuecat.
 */

const crypto = require("crypto");
const { keyFor } = require("./products");

function status(env = process.env) {
  const missing = env.REVENUECAT_WEBHOOK_AUTH ? [] : ["REVENUECAT_WEBHOOK_AUTH"];
  return { id: "revenuecat", configured: missing.length === 0, missing, webhook: "/api/plus/webhooks/revenuecat" };
}

function verify(header, { env = process.env } = {}) {
  const want = env.REVENUECAT_WEBHOOK_AUTH;
  if (!want) throw Object.assign(new Error("not_configured"), { code: "not_configured", status: 503 });
  const a = crypto.createHash("sha256").update(String(header || "")).digest();
  const b = crypto.createHash("sha256").update(String(want)).digest();
  if (!crypto.timingSafeEqual(a, b)) throw Object.assign(new Error("bad_signature"), { code: "bad_signature", status: 401 });
  return true;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAP = {
  INITIAL_PURCHASE: "purchase",
  RENEWAL: "renewal",
  NON_RENEWING_PURCHASE: "purchase",
  PRODUCT_CHANGE: "purchase",
  UNCANCELLATION: "resume",
  EXPIRATION: "expire",
  BILLING_ISSUE: "payment_failed",
};

function normalize(body, cfg) {
  const e = body?.event || {};
  let type = MAP[e.type] || "ignore";
  if (e.type === "CANCELLATION") type = e.cancel_reason === "CUSTOMER_SUPPORT" ? "refund" : "cancel_at_end";
  if (type === "purchase" && e.period_type === "TRIAL") type = "trial_start";
  const product = keyFor(cfg, "revenuecat", e.product_id);
  const platform = e.store === "APP_STORE" ? "ios" : e.store === "PLAY_STORE" ? "android" : "web";
  return {
    provider: "revenuecat",
    eventId: String(e.id || ""),
    type,
    userId: UUID.test(String(e.app_user_id || "")) ? String(e.app_user_id).toLowerCase() : null,
    productKey: product?.key || null,
    product,
    amountMinor: Number.isFinite(Number(e.price_in_purchased_currency)) ? Math.round(Number(e.price_in_purchased_currency) * 100) : null,
    currency: e.currency || null,
    endsAt: e.expiration_at_ms ? new Date(Number(e.expiration_at_ms)).toISOString() : null,
    transactionRef: String(e.transaction_id || e.id || ""),
    subscriptionRef: e.original_transaction_id || null,
    platform,
    environment: e.environment || null,
  };
}

module.exports = { status, verify, normalize };
