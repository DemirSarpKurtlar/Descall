"use strict";

/**
 * Apple: StoreKit 2 signed transactions and App Store Server Notifications V2.
 *
 * Every Apple payload is a JWS (ES256) whose header carries the x5c chain leaf -> intermediate ->
 * Apple Root CA - G3. We verify: each certificate is signed by the next and valid now, the root is
 * the pinned Apple Root CA - G3 (SHA-256 fingerprint, overridable with APPLE_ROOT_CA_SHA256 for
 * tests / a future root), and the JWS signature with the leaf key. Then the bundle id must match
 * APPLE_BUNDLE_ID (default com.descall.app) and the environment must be APPLE_ENVIRONMENT (default Production).
 *
 * Nothing secret lives here: verifying needs no key. Configured = the owner set APPLE_IAP_ENABLED=1
 * (after accepting the Paid Apps agreement) and product ids exist in the offer config.
 */

const crypto = require("crypto");
const { keyFor } = require("./products");

const APPLE_ROOT_G3_SHA256 = "63343ABFB89A6A03EBB57E9B3F5FA7BE7C4F5C756F3017B3A8C488C3653E9179";

class AppleError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
    this.status = 400;
  }
}

function b64urlDecode(s) {
  return Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function pinnedRoots(env = process.env) {
  const extra = String(env.APPLE_ROOT_CA_SHA256 || "").split(",").map((x) => x.replace(/[^0-9a-f]/gi, "").toUpperCase()).filter(Boolean);
  return extra.length ? extra : [APPLE_ROOT_G3_SHA256];
}

function fingerprint(cert) {
  return String(cert.fingerprint256 || "").replace(/:/g, "").toUpperCase();
}

/** Verify an Apple JWS and return its payload. Throws AppleError. */
function verifyJws(jws, { roots = pinnedRoots(), now = Date.now() } = {}) {
  if (typeof jws !== "string" || jws.length > 200000) throw new AppleError("invalid_jws");
  const parts = jws.split(".");
  if (parts.length !== 3) throw new AppleError("invalid_jws");
  let header;
  let payload;
  try {
    header = JSON.parse(b64urlDecode(parts[0]).toString("utf8"));
    payload = JSON.parse(b64urlDecode(parts[1]).toString("utf8"));
  } catch {
    throw new AppleError("invalid_jws");
  }
  if (header.alg !== "ES256") throw new AppleError("bad_alg");
  if (!Array.isArray(header.x5c) || header.x5c.length < 2 || header.x5c.length > 4) throw new AppleError("bad_chain");
  let certs;
  try {
    certs = header.x5c.map((b64) => new crypto.X509Certificate(Buffer.from(String(b64), "base64")));
  } catch {
    throw new AppleError("bad_chain");
  }
  for (const c of certs) {
    const from = Date.parse(c.validFrom);
    const to = Date.parse(c.validTo);
    if (!(from <= now && now <= to)) throw new AppleError("cert_expired");
  }
  for (let i = 0; i < certs.length - 1; i += 1) {
    if (!certs[i].checkIssued(certs[i + 1]) || !certs[i].verify(certs[i + 1].publicKey)) throw new AppleError("bad_chain");
  }
  const root = certs[certs.length - 1];
  if (!root.verify(root.publicKey)) throw new AppleError("bad_root");
  if (!roots.includes(fingerprint(root))) throw new AppleError("untrusted_root");
  const ok = crypto.verify("sha256", Buffer.from(`${parts[0]}.${parts[1]}`), { key: certs[0].publicKey, dsaEncoding: "ieee-p1363" }, b64urlDecode(parts[2]));
  if (!ok) throw new AppleError("bad_signature");
  return payload;
}

function bundleOk(bundleId, env = process.env) {
  return String(bundleId || "") === String(env.APPLE_BUNDLE_ID || "com.descall.app");
}

// Production unless the owner sets APPLE_ENVIRONMENT=Sandbox (a test server): Sandbox purchases
// (TestFlight, sandbox testers) are free and signed by the same Apple chain, so accepting them by
// default would grant real memberships without payment.
function envOk(environment, env = process.env) {
  const want = String(env.APPLE_ENVIRONMENT || "").trim() || "Production";
  return String(environment || "") === want;
}

function status(env = process.env) {
  const missing = [];
  if (env.APPLE_IAP_ENABLED !== "1") missing.push("APPLE_IAP_ENABLED");
  return { id: "apple", configured: missing.length === 0, missing, webhook: "/api/plus/webhooks/apple" };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One verified transaction -> normalized fields (no type decided yet). */
function transactionFields(tx, cfg) {
  const product = keyFor(cfg, "apple", tx.productId);
  return {
    checkoutId: UUID.test(String(tx.appAccountToken || "")) ? String(tx.appAccountToken).toLowerCase() : null,
    productKey: product?.key || null,
    product,
    amountMinor: Number.isFinite(Number(tx.price)) ? Math.round(Number(tx.price) / 10) : null, // milliunits -> minor
    currency: typeof tx.currency === "string" ? tx.currency.toUpperCase() : null,
    endsAt: tx.expiresDate ? new Date(Number(tx.expiresDate)).toISOString() : null,
    transactionRef: String(tx.transactionId || ""),
    subscriptionRef: tx.originalTransactionId ? String(tx.originalTransactionId) : null,
    trial: Number(tx.offerType) === 1 && (Number(tx.price) === 0 || tx.offerDiscountType === "FREE_TRIAL"),
    revoked: Boolean(tx.revocationDate),
    environment: tx.environment || null,
    platform: "ios",
  };
}

/** A signed transaction posted by the app right after purchase (StoreKit 2 Transaction.jwsRepresentation). */
function normalizeTransaction(jws, cfg, opts = {}) {
  const tx = verifyJws(jws, opts);
  if (!bundleOk(tx.bundleId, opts.env)) throw new AppleError("wrong_bundle");
  if (!envOk(tx.environment, opts.env)) throw new AppleError("wrong_environment");
  const f = transactionFields(tx, cfg);
  let type = "purchase";
  if (f.revoked) type = "refund";
  else if (f.trial) type = "trial_start";
  else if (f.product?.kind === "subscription" && tx.transactionId !== tx.originalTransactionId) type = "renewal";
  return { provider: "apple", eventId: `tx:${f.transactionRef}`, type, ...f };
}

const TYPE_MAP = {
  SUBSCRIBED: "purchase",
  DID_RENEW: "renewal",
  OFFER_REDEEMED: "purchase",
  REFUND: "refund",
  REVOKE: "refund",
  EXPIRED: "expire",
  GRACE_PERIOD_EXPIRED: "expire",
  DID_FAIL_TO_RENEW: "payment_failed",
  ONE_TIME_CHARGE: "purchase",
};

/** App Store Server Notification V2 body { signedPayload } -> normalized event. */
function normalizeNotification(body, cfg, opts = {}) {
  const signed = body && typeof body === "object" ? body.signedPayload : null;
  const n = verifyJws(signed, opts);
  const data = n.data || {};
  if (!bundleOk(data.bundleId, opts.env)) throw new AppleError("wrong_bundle");
  if (!envOk(data.environment, opts.env)) throw new AppleError("wrong_environment");
  let type = TYPE_MAP[n.notificationType] || "ignore";
  if (n.notificationType === "DID_CHANGE_RENEWAL_STATUS") type = n.subtype === "AUTO_RENEW_DISABLED" ? "cancel_at_end" : "resume";
  if (n.notificationType === "TEST") type = "ignore";
  let fields = {};
  if (data.signedTransactionInfo) {
    const tx = verifyJws(data.signedTransactionInfo, opts);
    fields = transactionFields(tx, cfg);
    if (type === "purchase" && fields.trial) type = "trial_start";
  }
  return { provider: "apple", eventId: String(n.notificationUUID || ""), type, notificationType: n.notificationType, subtype: n.subtype || null, ...fields };
}

module.exports = { APPLE_ROOT_G3_SHA256, AppleError, verifyJws, pinnedRoots, normalizeTransaction, normalizeNotification, status, bundleOk };
