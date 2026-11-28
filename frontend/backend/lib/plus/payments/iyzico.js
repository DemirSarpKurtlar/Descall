"use strict";

/**
 * iyzico (web + desktop in Turkey): Abonelik (subscriptions) and the Checkout Form (one-time gifts).
 *
 *   Auth: IYZWSv2. Authorization = "IYZWSv2 " + base64("apiKey:<key>&randomKey:<rnd>&signature:<hex>")
 *         signature = HMAC-SHA256(secretKey, rnd + uriPath + jsonBody) (hex), header x-iyzi-rnd = rnd.
 *   Checkout: the server initializes a hosted checkout form; the client renders iyzico's own form
 *         (card data never touches Descall, so no PCI scope) inside the Descall+ window on the web,
 *         or opens the payment page in the system browser on desktop. iyzico then posts `token` to
 *         our callback, and the server reads the result from the iyzico API (authoritative).
 *   Webhooks: header X-IYZ-SIGNATURE-V3 = hex(HMAC-SHA256(secretKey, <fields joined>)), fields by
 *         event family (subscription / checkout form / direct). The exact field order follows the
 *         iyzico docs as of Nov 2026 and MUST be re-checked in the iyzico sandbox before going live.
 *         A verified webhook is re-read from the API before anything is fulfilled.
 * Env (secrets): IYZICO_API_KEY, IYZICO_SECRET_KEY, IYZICO_MERCHANT_ID; IYZICO_BASE_URL (default sandbox).
 */

const crypto = require("crypto");

function status(env = process.env) {
  const missing = ["IYZICO_API_KEY", "IYZICO_SECRET_KEY", "IYZICO_MERCHANT_ID"].filter((k) => !env[k]);
  return { id: "iyzico", configured: missing.length === 0, missing, webhook: "/api/plus/webhooks/iyzico" };
}

function baseUrl(env = process.env) {
  return env.IYZICO_BASE_URL || "https://sandbox-api.iyzipay.com";
}

/** IYZWSv2 headers for one request. */
function authHeaders({ apiKey, secretKey, uriPath, body, rnd = crypto.randomBytes(8).toString("hex") }) {
  const payload = body ? JSON.stringify(body) : "";
  const signature = crypto.createHmac("sha256", secretKey).update(rnd + uriPath + payload).digest("hex");
  const auth = Buffer.from(`apiKey:${apiKey}&randomKey:${rnd}&signature:${signature}`).toString("base64");
  return { Authorization: `IYZWSv2 ${auth}`, "x-iyzi-rnd": rnd, "Content-Type": "application/json", Accept: "application/json" };
}

/** The signed string for a webhook body (by event family). */
function signatureBase(body, { secretKey, merchantId }) {
  const b = body || {};
  if (b.subscriptionReferenceCode) {
    return `${merchantId}${secretKey}${b.iyziEventType}${b.subscriptionReferenceCode}${b.orderReferenceCode}${b.customerReferenceCode}`;
  }
  if (b.token) {
    return `${secretKey}${b.iyziEventType}${b.iyziPaymentId ?? b.paymentId}${b.token}${b.paymentConversationId}${b.status}`;
  }
  return `${secretKey}${b.iyziEventType}${b.paymentId ?? b.iyziPaymentId}${b.paymentConversationId}${b.status}`;
}

function sign(body, { secretKey, merchantId }) {
  return crypto.createHmac("sha256", secretKey).update(signatureBase(body, { secretKey, merchantId })).digest("hex");
}

function verify(body, header, { env = process.env } = {}) {
  const secretKey = env.IYZICO_SECRET_KEY;
  const merchantId = env.IYZICO_MERCHANT_ID;
  if (!secretKey || !merchantId) throw Object.assign(new Error("not_configured"), { code: "not_configured", status: 503 });
  const want = Buffer.from(sign(body, { secretKey, merchantId }), "hex");
  const got = Buffer.from(String(header || ""), "hex");
  if (!got.length || got.length !== want.length || !crypto.timingSafeEqual(want, got)) {
    throw Object.assign(new Error("bad_signature"), { code: "bad_signature", status: 401 });
  }
  return true;
}

const SUB_EVENTS = {
  "subscription.order.success": "renewal",
  "subscription.order.failure": "payment_failed",
};

/** A verified webhook -> normalized event (still to be confirmed from the API by fulfil). */
function normalize(body) {
  const b = body || {};
  const ev = String(b.iyziEventType || "");
  if (b.subscriptionReferenceCode) {
    return {
      provider: "iyzico",
      eventId: `${ev}:${b.orderReferenceCode || b.iyziReferenceCode || ""}`,
      type: SUB_EVENTS[ev] || "ignore",
      subscriptionRef: String(b.subscriptionReferenceCode),
      transactionRef: b.orderReferenceCode ? String(b.orderReferenceCode) : null,
      platform: "web",
    };
  }
  return {
    provider: "iyzico",
    eventId: `${ev}:${b.iyziPaymentId ?? b.paymentId ?? ""}`,
    type: b.status === "SUCCESS" ? "purchase" : "payment_failed",
    checkoutId: typeof b.paymentConversationId === "string" ? b.paymentConversationId.toLowerCase() : null,
    transactionRef: String(b.iyziPaymentId ?? b.paymentId ?? ""),
    token: b.token || null,
    platform: "web",
  };
}

async function request(uriPath, { method = "POST", body = null, env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const st = status(env);
  if (!st.configured) throw Object.assign(new Error("not_configured"), { code: "not_configured", status: 503 });
  const headers = authHeaders({ apiKey: env.IYZICO_API_KEY, secretKey: env.IYZICO_SECRET_KEY, uriPath, body });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetchImpl(`${baseUrl(env)}${uriPath}`, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.status === "failure") {
      throw Object.assign(new Error("provider_error"), { code: "provider_error", status: 502, providerCode: json.errorCode || res.status });
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

function splitName(full) {
  const parts = String(full || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { name: parts[0] || "Descall", surname: parts[0] || "Kullanici" };
  return { name: parts.slice(0, -1).join(" "), surname: parts[parts.length - 1] };
}

/** Subscription checkout (Kendime). pricingPlanReferenceCode from config.products.iyzico. */
function initSubscription({ checkout, planRef, buyer, callbackUrl, env, fetchImpl }) {
  const { name, surname } = splitName(buyer.fullName);
  return request("/v2/subscription/checkoutform/initialize", {
    env,
    fetchImpl,
    body: {
      locale: buyer.locale === "en" ? "en" : "tr",
      conversationId: checkout.id,
      callbackUrl,
      pricingPlanReferenceCode: planRef,
      subscriptionInitialStatus: "ACTIVE",
      customer: {
        name, surname, email: buyer.email,
        billingAddress: { contactName: `${name} ${surname}`, city: buyer.city || "Istanbul", country: "Turkey", address: buyer.address || "-" },
      },
    },
  });
}

/** One-time checkout form (gifts, group shares). */
function initPayment({ checkout, title, buyer, callbackUrl, ip, env, fetchImpl }) {
  const { name, surname } = splitName(buyer.fullName);
  const price = (checkout.amount_minor / 100).toFixed(2);
  return request("/payment/iyzipos/checkoutform/initialize/auth/ecom", {
    env,
    fetchImpl,
    body: {
      locale: buyer.locale === "en" ? "en" : "tr",
      conversationId: checkout.id,
      price,
      paidPrice: price,
      currency: checkout.currency === "TRY" ? "TRY" : checkout.currency,
      basketId: checkout.id,
      paymentGroup: "SUBSCRIPTION",
      callbackUrl,
      buyer: {
        id: checkout.user_id, name, surname, email: buyer.email, identityNumber: buyer.identityNumber || "11111111111",
        registrationAddress: buyer.address || "-", city: buyer.city || "Istanbul", country: "Turkey", ip: ip || "127.0.0.1",
      },
      billingAddress: { contactName: `${name} ${surname}`, city: buyer.city || "Istanbul", country: "Turkey", address: buyer.address || "-" },
      basketItems: [{ id: checkout.plan, name: String(title).slice(0, 60), category1: "Descall+", itemType: "VIRTUAL", price }],
    },
  });
}

const retrievePayment = (token, opts) => request("/payment/iyzipos/checkoutform/auth/ecom/detail", { body: { token }, ...opts });
const retrieveSubscription = (token, opts) => request(`/v2/subscription/checkoutform/${encodeURIComponent(token)}`, { method: "GET", ...opts });
const cancelSubscription = (subRef, opts) => request(`/v2/subscription/subscriptions/${encodeURIComponent(subRef)}/cancel`, { body: {}, ...opts });
const refund = (paymentTransactionId, amountMinor, opts) => request("/payment/refund", { body: { paymentTransactionId, price: (amountMinor / 100).toFixed(2), currency: "TRY" }, ...opts });

module.exports = { status, authHeaders, signatureBase, sign, verify, normalize, request, initSubscription, initPayment, retrievePayment, retrieveSubscription, cancelSubscription, refund, splitName };
