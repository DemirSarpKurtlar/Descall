"use strict";

/**
 * Descall+ payments bind what was paid to what is delivered (security audit, Nov 2026):
 *  - a gift checkout paid with a cheaper product (Paddle.js / StoreKit let the buyer choose the
 *    price id and put any checkout id in custom_data / appAccountToken) is not delivered;
 *  - the iyzico callback (no signature) only fulfils a checkout with a token that iyzico issued
 *    for that checkout: another checkout's paid token is refused;
 *  - an Apple Sandbox transaction (TestFlight purchases are free) does not grant a membership
 *    when APPLE_ENVIRONMENT is not set; it does when the owner sets APPLE_ENVIRONMENT=Sandbox.
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
delete process.env.APPLE_ENVIRONMENT;

const http = require("http");
const os = require("os");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const BUYER = "00000000-0000-4000-8000-0000000000b1";
const FRIEND = "00000000-0000-4000-8000-0000000000b2";
const CK_GIFT12 = "00000000-0000-4000-8000-0000000000c1";
const CK_IYZ_CHEAP = "00000000-0000-4000-8000-0000000000c2";
const CK_IYZ_DEAR = "00000000-0000-4000-8000-0000000000c3";
const CK_APPLE = "00000000-0000-4000-8000-0000000000c4";
const GIFT12 = "00000000-0000-4000-8000-0000000000d1";
const GIFT_CHEAP = "00000000-0000-4000-8000-0000000000d2";
const GIFT_DEAR = "00000000-0000-4000-8000-0000000000d3";

const fake = createFakeSupabase({
  users: [{ id: BUYER, username: "demir" }, { id: FRIEND, username: "ece" }],
  premium_offer_config: [{ id: "default", version: 1, config: { products: {
    paddle: { gift_plus_1: "pri_gift_1", gift_ultra_12: "pri_gift_u12" },
    apple: { plus_monthly: "com.descall.app.plus.monthly" },
  } } }],
  premium_checkouts: [
    { id: CK_GIFT12, user_id: BUYER, kind: "gift", plan: "ultra", period: null, months: 12, platform: "web", provider: "paddle", amount_minor: 249999, currency: "TRY", gift_id: GIFT12, status: "pending" },
    { id: CK_IYZ_CHEAP, user_id: BUYER, kind: "gift", plan: "plus", period: null, months: 1, platform: "web", provider: "iyzico", amount_minor: 6999, currency: "TRY", gift_id: GIFT_CHEAP, status: "pending", provider_ref: "tok_cheap" },
    { id: CK_IYZ_DEAR, user_id: BUYER, kind: "gift", plan: "ultra", period: null, months: 12, platform: "web", provider: "iyzico", amount_minor: 249999, currency: "TRY", gift_id: GIFT_DEAR, status: "pending", provider_ref: "tok_dear" },
    { id: CK_APPLE, user_id: BUYER, kind: "self", plan: "plus", period: "monthly", months: null, platform: "ios", provider: "apple", amount_minor: 7499, currency: "TRY", status: "pending" },
  ],
  premium_gifts: [
    { id: GIFT12, sender_id: BUYER, recipient_id: FRIEND, plan: "ultra", months: 12, status: "awaiting_payment" },
    { id: GIFT_CHEAP, sender_id: BUYER, recipient_id: FRIEND, plan: "plus", months: 1, status: "awaiting_payment" },
    { id: GIFT_DEAR, sender_id: BUYER, recipient_id: FRIEND, plan: "ultra", months: 12, status: "awaiting_payment" },
  ],
  user_subscriptions: [],
  payment_webhook_events: [],
  payment_transactions: [],
  premium_refund_requests: [],
}, { uniqueKeys: { payment_webhook_events: ["provider", "event_id"], payment_transactions: ["provider", "provider_ref"] } });
const calls = [];
fake.rpc = async (name, args) => {
  calls.push({ name, args });
  if (name === "premium_plus_apply") return { data: { ok: true, subscription: { user_id: args.p_user, active: true } }, error: null };
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
        try { json = JSON.parse(data); } catch { /* html */ }
        resolve({ status: res.statusCode, body: json, text: data });
      });
    });
    req.on("error", reject);
    req.end(body);
  });
}

const gift = (id) => fake._tables.premium_gifts.rows.find((g) => g.id === id);
const applies = () => calls.filter((c) => c.name === "premium_plus_apply");

function makeChain() {
  const ssl = spawnSync("sh", ["-c", "command -v openssl"], { encoding: "utf8" }).stdout.trim();
  if (!ssl) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "plus-bind-"));
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
  const realFetch = globalThis.fetch;
  try {
    /* 1. Paddle: a 12-month Ultra gift checkout "paid" with the 1-month Plus gift price. */
    env.PADDLE_WEBHOOK_SECRET = "fake-paddle-webhook-secret";
    env.PADDLE_CLIENT_TOKEN = "fake-client-token";
    env.PADDLE_API_KEY = "fake-api-key";
    plusConfig.invalidate();
    const paddle = require("../lib/plus/payments/paddle");
    const cheap = JSON.stringify({
      event_id: "evt_cheap", event_type: "transaction.completed",
      data: { id: "txn_cheap", origin: "web", custom_data: { checkout_id: CK_GIFT12 }, items: [{ price: { id: "pri_gift_1" } }], details: { totals: { total: "6999" } }, currency_code: "TRY" },
    });
    let r = await request(port, "/api/plus/webhooks/paddle", { body: cheap, headers: { "Paddle-Signature": paddle.sign(cheap, "fake-paddle-webhook-secret") } });
    assert(r.status === 200, `paddle webhook answers 200 (${r.status})`);
    assert(gift(GIFT12).status === "awaiting_payment", `a 12-month gift paid with the 1-month price stays unpaid (gift is ${gift(GIFT12).status})`);
    assert(fake._tables.premium_checkouts.rows.find((c) => c.id === CK_GIFT12).status === "pending", "the checkout stays pending");
    // The right price still delivers it.
    const right = JSON.stringify({
      event_id: "evt_right", event_type: "transaction.completed",
      data: { id: "txn_right", origin: "web", custom_data: { checkout_id: CK_GIFT12 }, items: [{ price: { id: "pri_gift_u12" } }], details: { totals: { total: "249999" } }, currency_code: "TRY" },
    });
    r = await request(port, "/api/plus/webhooks/paddle", { body: right, headers: { "Paddle-Signature": paddle.sign(right, "fake-paddle-webhook-secret") } });
    assert(r.status === 200 && r.body.ok === true, `the matching price is fulfilled (${JSON.stringify(r.body)})`);
    assert(gift(GIFT12).status === "scheduled", "gift paid with its own price is scheduled");

    /* 2. iyzico callback: the paid token of the cheap checkout posted for the dear one. */
    env.IYZICO_API_KEY = "ak";
    env.IYZICO_SECRET_KEY = "sk";
    env.IYZICO_MERCHANT_ID = "m1";
    const issued = { tok_cheap: CK_IYZ_CHEAP, tok_dear: CK_IYZ_DEAR };
    const paidTokens = new Set(["tok_cheap"]);
    globalThis.fetch = async (url, opts) => {
      const body = JSON.parse(opts.body || "{}");
      const token = body.token;
      const json = paidTokens.has(token)
        ? { status: "success", paymentStatus: "SUCCESS", paymentId: `pay_${token}`, basketId: issued[token], paidPrice: "69.99", currency: "TRY", token }
        : { status: "success", paymentStatus: "FAILURE", token };
      return { ok: true, status: 200, json: async () => json };
    };
    const form = (token) => `token=${encodeURIComponent(token)}`;
    r = await request(port, `/api/plus/webhooks/iyzico/callback?checkout=${CK_IYZ_DEAR}`, { body: form("tok_cheap"), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    assert(gift(GIFT_DEAR).status === "awaiting_payment", `another checkout's paid token does not pay the dear gift (gift is ${gift(GIFT_DEAR).status})`);
    // The token's own checkout is still fulfilled afterwards (the refused attempt used up nothing).
    r = await request(port, `/api/plus/webhooks/iyzico/callback?checkout=${CK_IYZ_CHEAP}`, { body: form("tok_cheap"), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    assert(r.status === 200, `own callback 200 (${r.status})`);
    assert(gift(GIFT_CHEAP).status === "scheduled", `the token's own checkout is paid (gift is ${gift(GIFT_CHEAP).status})`);
    globalThis.fetch = realFetch;

    /* 3. Apple: a Sandbox (TestFlight) transaction against a server without APPLE_ENVIRONMENT. */
    const chain = makeChain();
    if (!chain) {
      console.log("plus payment binding: apple part skipped (no openssl)");
    } else {
      env.APPLE_IAP_ENABLED = "1";
      env.APPLE_BUNDLE_ID = "com.descall.app";
      env.APPLE_ROOT_CA_SHA256 = chain.rootFp;
      const txInfo = jws({ transactionId: "3000001", originalTransactionId: "3000001", productId: "com.descall.app.plus.monthly", bundleId: "com.descall.app", appAccountToken: CK_APPLE, price: 74990, currency: "TRY", expiresDate: Date.now() + 30 * 86400000, environment: "Sandbox", type: "Auto-Renewable Subscription" }, chain);
      const note = { notificationType: "SUBSCRIBED", subtype: "INITIAL_BUY", notificationUUID: "bind-n-1", data: { bundleId: "com.descall.app", environment: "Sandbox", signedTransactionInfo: txInfo } };
      const before = applies().length;
      r = await request(port, "/api/plus/webhooks/apple", { body: JSON.stringify({ signedPayload: jws(note, chain) }) });
      assert(r.status === 401, `a Sandbox notification is refused when APPLE_ENVIRONMENT is unset (${r.status})`);
      assert(applies().length === before, "no membership from a Sandbox purchase");
      const apple = require("../lib/plus/payments/apple");
      let threw = null;
      try { apple.normalizeTransaction(txInfo, await plusConfig.load()); } catch (e) { threw = e?.code; }
      assert(threw === "wrong_environment", `a Sandbox StoreKit transaction is refused (${threw})`);
      env.APPLE_ENVIRONMENT = "Sandbox";
      r = await request(port, "/api/plus/webhooks/apple", { body: JSON.stringify({ signedPayload: jws({ ...note, notificationUUID: "bind-n-2" }, chain) }) });
      assert(r.status === 200 && applies().length === before + 1, `with APPLE_ENVIRONMENT=Sandbox the test purchase applies (${r.status})`);
    }
  } finally {
    globalThis.fetch = realFetch;
    server.close();
  }
  console.log("plus payment binding integration: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
