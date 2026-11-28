"use strict";

/**
 * Descall+ 2.0 payment webhooks over real HTTP with signed fixtures (routes/plusWebhooks.js):
 *  - not configured -> 503; bad / stale signatures -> 401; nothing is written;
 *  - Paddle transaction.completed -> one premium_plus_apply("purchase") + one payment_transactions row;
 *    the same event again is a duplicate (no second apply);
 *  - a gift checkout -> the gift becomes "scheduled" (paid), no membership change for the buyer;
 *  - iyzico subscription renewal (X-IYZ-SIGNATURE-V3) -> "renew" for the subscription's owner;
 *  - RevenueCat with the wrong Authorization -> 401; refund -> revoke;
 *  - Apple ASSN V2: a JWS signed by a test chain whose root is pinned for the test -> processed;
 *    tampered payload, and the same chain against the real Apple root pin -> 401.
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const os = require("os");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const BUYER = "00000000-0000-4000-8000-0000000000b1";
const FRIEND = "00000000-0000-4000-8000-0000000000b2";
const CK_SELF = "00000000-0000-4000-8000-0000000000c1";
const CK_GIFT = "00000000-0000-4000-8000-0000000000c2";
const CK_APPLE = "00000000-0000-4000-8000-0000000000c3";
const GIFT = "00000000-0000-4000-8000-0000000000d1";

const fake = createFakeSupabase({
  users: [{ id: BUYER, username: "demir" }, { id: FRIEND, username: "ece" }],
  premium_offer_config: [{ id: "default", version: 1, config: { products: { paddle: { plus_monthly: "pri_plus_m", gift_plus_3: "pri_gift_3" }, apple: { plus_monthly: "com.descall.app.plus.monthly" }, revenuecat: { plus_monthly: "rc_plus_m" } } } }],
  premium_checkouts: [
    { id: CK_SELF, user_id: BUYER, kind: "self", plan: "plus", period: "monthly", months: null, platform: "web", provider: "paddle", amount_minor: 6999, currency: "TRY", status: "pending" },
    { id: CK_GIFT, user_id: BUYER, kind: "gift", plan: "plus", period: null, months: 3, platform: "web", provider: "paddle", amount_minor: 19999, currency: "TRY", gift_id: GIFT, status: "pending" },
    { id: CK_APPLE, user_id: BUYER, kind: "self", plan: "plus", period: "monthly", months: null, platform: "ios", provider: "apple", amount_minor: 7499, currency: "TRY", status: "pending" },
  ],
  premium_gifts: [{ id: GIFT, sender_id: BUYER, recipient_id: FRIEND, plan: "plus", months: 3, status: "awaiting_payment", deliver_at: "2026-12-02T09:00:00.000Z" }],
  user_subscriptions: [{ user_id: FRIEND, provider: "iyzico", provider_sub_ref: "SUB-1", plan_id: "plus", status: "active" }],
  payment_webhook_events: [],
  payment_transactions: [],
  premium_refund_requests: [],
}, { uniqueKeys: { payment_webhook_events: ["provider", "event_id"], payment_transactions: ["provider", "provider_ref"] } });
const calls = [];
fake.rpc = async (name, args) => {
  calls.push({ name, args });
  if (name === "premium_plus_apply") return { data: { ok: true, subscription: { user_id: args.p_user, active: true } }, error: null };
  if (name === "premium_gift_sweep") return { data: { delivered: [], returned: [], group_expired: [] }, error: null };
  return { data: null, error: null };
};
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const plusConfig = require("../lib/plus/config");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

function request(port, p, { body = "", headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: p, method: "POST", headers: { "Content-Type": "application/json", ...headers } }, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(data); } catch { /* not json */ }
        resolve({ status: res.statusCode, body: json });
      });
    });
    req.on("error", reject);
    req.end(body);
  });
}

const applies = () => calls.filter((c) => c.name === "premium_plus_apply");

/* ---------------- Apple test chain (openssl) ---------------- */

function makeChain() {
  const ssl = spawnSync("sh", ["-c", "command -v openssl"], { encoding: "utf8" }).stdout.trim();
  if (!ssl) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "plus-apple-"));
  const run = (args) => {
    const r = spawnSync(ssl, args, { cwd: dir, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`openssl ${args[0]} failed: ${r.stderr}`);
  };
  fs.writeFileSync(path.join(dir, "ca.ext"), "basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign\n");
  fs.writeFileSync(path.join(dir, "leaf.ext"), "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\n");
  for (const k of ["root", "int", "leaf"]) run(["ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", `${k}.key`]);
  run(["req", "-x509", "-new", "-key", "root.key", "-subj", "/CN=Test Root CA", "-days", "2", "-out", "root.pem", "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign"]);
  run(["req", "-new", "-key", "int.key", "-subj", "/CN=Test Intermediate", "-out", "int.csr"]);
  run(["x509", "-req", "-in", "int.csr", "-CA", "root.pem", "-CAkey", "root.key", "-CAcreateserial", "-days", "2", "-out", "int.pem", "-extfile", "ca.ext"]);
  run(["req", "-new", "-key", "leaf.key", "-subj", "/CN=Test Leaf", "-out", "leaf.csr"]);
  run(["x509", "-req", "-in", "leaf.csr", "-CA", "int.pem", "-CAkey", "int.key", "-CAcreateserial", "-days", "2", "-out", "leaf.pem", "-extfile", "leaf.ext"]);
  const der = (f) => new crypto.X509Certificate(fs.readFileSync(path.join(dir, f))).raw.toString("base64");
  const out = {
    x5c: [der("leaf.pem"), der("int.pem"), der("root.pem")],
    key: fs.readFileSync(path.join(dir, "leaf.key"), "utf8"),
    rootFp: new crypto.X509Certificate(fs.readFileSync(path.join(dir, "root.pem"))).fingerprint256.replace(/:/g, ""),
  };
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

const b64u = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");
function jws(payload, chain) {
  const head = b64u({ alg: "ES256", x5c: chain.x5c });
  const body = b64u(payload);
  const sig = crypto.sign("sha256", Buffer.from(`${head}.${body}`), { key: chain.key, dsaEncoding: "ieee-p1363" });
  return `${head}.${body}.${sig.toString("base64url")}`;
}

async function main() {
  const app = express();
  app.use("/api/plus/webhooks", require("../routes/plusWebhooks"));
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const port = server.address().port;
  const env = process.env;
  try {
    // not configured
    let r = await request(port, "/api/plus/webhooks/paddle", { body: "{}" });
    assert(r.status === 503, `unconfigured paddle -> 503 (${r.status})`);

    env.PADDLE_WEBHOOK_SECRET = "fake-paddle-webhook-secret";
    env.PADDLE_CLIENT_TOKEN = "fake-client-token";
    env.PADDLE_API_KEY = "fake-api-key";
    plusConfig.invalidate();
    const paddle = require("../lib/plus/payments/paddle");
    const tx = JSON.stringify({
      event_id: "evt_01", event_type: "transaction.completed",
      data: { id: "txn_01", origin: "web", custom_data: { checkout_id: CK_SELF }, items: [{ price: { id: "pri_plus_m" } }], details: { totals: { total: "6999" } }, currency_code: "TRY", subscription_id: "sub_01", billing_period: { ends_at: "2026-12-27T00:00:00Z" } },
    });
    r = await request(port, "/api/plus/webhooks/paddle", { body: tx, headers: { "Paddle-Signature": paddle.sign(tx, "wrong") } });
    assert(r.status === 401, `bad paddle signature -> 401 (${r.status})`);
    r = await request(port, "/api/plus/webhooks/paddle", { body: tx, headers: { "Paddle-Signature": paddle.sign(tx, "fake-paddle-webhook-secret", Math.floor(Date.now() / 1000) - 3600) } });
    assert(r.status === 401, "stale paddle signature -> 401");
    assert(applies().length === 0, "nothing applied for refused webhooks");

    r = await request(port, "/api/plus/webhooks/paddle", { body: tx, headers: { "Paddle-Signature": paddle.sign(tx, "fake-paddle-webhook-secret") } });
    assert(r.status === 200 && r.body.ok === true, `valid paddle -> 200 ok (${JSON.stringify(r.body)})`);
    assert(applies().length === 1, "one apply");
    const a = applies()[0].args;
    assert(a.p_user === BUYER && a.p_op === "purchase" && a.p_plan === "plus" && a.p_origin === "web" && a.p_provider === "paddle", "apply args");
    assert(a.p_ends_at === "2026-12-27T00:00:00Z", "provider period end used");
    assert(/^[A-Za-z0-9:_.-]{8,100}$/.test(a.p_request_id), "request id shape");
    assert(fake._tables.payment_transactions.rows.length === 1, "transaction stored");
    assert(fake._tables.premium_checkouts.rows.find((c) => c.id === CK_SELF).status === "paid", "checkout paid");
    r = await request(port, "/api/plus/webhooks/paddle", { body: tx, headers: { "Paddle-Signature": paddle.sign(tx, "fake-paddle-webhook-secret") } });
    assert(r.status === 200 && r.body.duplicate === true, "replay is a duplicate");
    assert(applies().length === 1, "no second apply on replay");

    // gift checkout
    const gtx = JSON.stringify({
      event_id: "evt_02", event_type: "transaction.completed",
      data: { id: "txn_02", origin: "web", custom_data: { checkout_id: CK_GIFT }, items: [{ price: { id: "pri_gift_3" } }], details: { totals: { total: "19999" } }, currency_code: "TRY" },
    });
    r = await request(port, "/api/plus/webhooks/paddle", { body: gtx, headers: { "Paddle-Signature": paddle.sign(gtx, "fake-paddle-webhook-secret") } });
    assert(r.status === 200 && r.body.ok === true, "gift webhook ok");
    const gift = fake._tables.premium_gifts.rows.find((g) => g.id === GIFT);
    assert(gift.status === "scheduled" && gift.paid_at, "gift paid and scheduled");
    assert(applies().length === 1, "a gift purchase changes no membership of the buyer");

    // iyzico subscription renewal
    env.IYZICO_API_KEY = "ak";
    env.IYZICO_SECRET_KEY = "sk";
    env.IYZICO_MERCHANT_ID = "m1";
    const iyz = require("../lib/plus/payments/iyzico");
    const ib = { iyziEventType: "subscription.order.success", subscriptionReferenceCode: "SUB-1", orderReferenceCode: "ORD-9", customerReferenceCode: "CUS-1", merchantId: "m1" };
    r = await request(port, "/api/plus/webhooks/iyzico", { body: JSON.stringify(ib), headers: { "X-IYZ-SIGNATURE-V3": "00ff" } });
    assert(r.status === 401, "bad iyzico signature -> 401");
    r = await request(port, "/api/plus/webhooks/iyzico", { body: JSON.stringify(ib), headers: { "X-IYZ-SIGNATURE-V3": iyz.sign(ib, { secretKey: "sk", merchantId: "m1" }) } });
    assert(r.status === 200, `iyzico renewal -> 200 (${JSON.stringify(r.body)})`);
    const ev = fake._tables.payment_webhook_events.rows.find((e) => e.provider === "iyzico");
    assert(ev && ev.status === "processed", `iyzico event processed (${ev && ev.status})`);
    const ren = applies().at(-1).args;
    assert(ren.p_user === FRIEND && ren.p_op === "renew" && ren.p_plan === "plus", "renewal renews the subscription owner's plan");

    // RevenueCat
    env.REVENUECAT_WEBHOOK_AUTH = "Bearer fake-rc-auth";
    const rc = JSON.stringify({ event: { id: "rc_1", type: "INITIAL_PURCHASE", app_user_id: FRIEND, product_id: "rc_plus_m", store: "APP_STORE", price_in_purchased_currency: 74.99, currency: "TRY", transaction_id: "rc_tx_1", expiration_at_ms: Date.now() + 30 * 86400000 } });
    r = await request(port, "/api/plus/webhooks/revenuecat", { body: rc, headers: { Authorization: "Bearer nope" } });
    assert(r.status === 401, "revenuecat wrong auth -> 401");
    const before = applies().length;
    r = await request(port, "/api/plus/webhooks/revenuecat", { body: rc, headers: { Authorization: "Bearer fake-rc-auth" } });
    assert(r.status === 200 && r.body.ok === true, `revenuecat ok (${JSON.stringify(r.body)})`);
    assert(applies().length === before + 1 && applies().at(-1).args.p_origin === "store" && applies().at(-1).args.p_platform === "ios", "store purchase applied");
    const refund = JSON.stringify({ event: { id: "rc_2", type: "CANCELLATION", cancel_reason: "CUSTOMER_SUPPORT", app_user_id: FRIEND, transaction_id: "rc_tx_1", store: "APP_STORE" } });
    r = await request(port, "/api/plus/webhooks/revenuecat", { body: refund, headers: { Authorization: "Bearer fake-rc-auth" } });
    assert(r.status === 200 && applies().at(-1).args.p_op === "revoke", "refund revokes");

    // Apple
    const chain = makeChain();
    if (!chain) {
      console.log("plus webhooks: apple part skipped (no openssl)");
    } else {
      r = await request(port, "/api/plus/webhooks/apple", { body: "{}" });
      assert(r.status === 503, "apple not configured -> 503");
      env.APPLE_IAP_ENABLED = "1";
      env.APPLE_BUNDLE_ID = "com.descall.app";
      // The fixtures are Sandbox transactions: a test server opts in (production is the default).
      env.APPLE_ENVIRONMENT = "Sandbox";
      const txInfo = jws({ transactionId: "2000001", originalTransactionId: "2000001", productId: "com.descall.app.plus.monthly", bundleId: "com.descall.app", appAccountToken: CK_APPLE, price: 74990, currency: "TRY", expiresDate: Date.now() + 30 * 86400000, environment: "Sandbox", type: "Auto-Renewable Subscription" }, chain);
      const note = { notificationType: "SUBSCRIBED", subtype: "INITIAL_BUY", notificationUUID: "n-uuid-1", data: { bundleId: "com.descall.app", environment: "Sandbox", signedTransactionInfo: txInfo } };
      const body = JSON.stringify({ signedPayload: jws(note, chain) });
      delete env.APPLE_ROOT_CA_SHA256;
      r = await request(port, "/api/plus/webhooks/apple", { body });
      assert(r.status === 401, "a chain that is not Apple's root -> 401");
      env.APPLE_ROOT_CA_SHA256 = chain.rootFp;
      const parts = JSON.parse(body).signedPayload.split(".");
      const tampered = JSON.stringify({ signedPayload: `${parts[0]}.${b64u({ ...note, notificationType: "REFUND" })}.${parts[2]}` });
      r = await request(port, "/api/plus/webhooks/apple", { body: tampered });
      assert(r.status === 401, "tampered payload -> 401");
      const n = applies().length;
      r = await request(port, "/api/plus/webhooks/apple", { body });
      assert(r.status === 200 && r.body.ok === true, `apple ok (${JSON.stringify(r.body)})`);
      const last = applies().at(-1).args;
      assert(applies().length === n + 1 && last.p_user === BUYER && last.p_provider === "apple" && last.p_origin === "store" && last.p_provider_sub_ref === "2000001", "apple purchase applied to the checkout's buyer");
      const wrongBundle = JSON.stringify({ signedPayload: jws({ ...note, notificationUUID: "n-uuid-2", data: { ...note.data, bundleId: "com.other.app" } }, chain) });
      r = await request(port, "/api/plus/webhooks/apple", { body: wrongBundle });
      assert(r.status === 401, "another app's notification -> 401");
    }
  } finally {
    server.close();
  }
  console.log("plus webhooks integration: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
