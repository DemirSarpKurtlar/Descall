"use strict";
// Regression (security scan 17 Nov 2026): POST /api/web-push/subscription accepted any
// https:// URL and lib/webPush.js POSTed to it on every notification (blind SSRF to
// internal hosts and ports). Only browser push services are accepted and sent to now.
process.env.NODE_ENV = "test"; process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
process.env.WEB_PUSH_SUBJECT = "mailto:test@example.test";
const assert = require("assert");
const http = require("http");
const express = require("express");
const webpush = require("web-push");
const keys = webpush.generateVAPIDKeys();
process.env.WEB_PUSH_PUBLIC_KEY = keys.publicKey; process.env.WEB_PUSH_PRIVATE_KEY = keys.privateKey;
const sent = [];
webpush.sendNotification = async (sub) => { sent.push(sub.endpoint); return { statusCode: 201 }; };
const { createFakeSupabase } = require("./fakeSupabase.cjs");
const U = "11111111-1111-4111-8111-111111111111";
const fake = createFakeSupabase({
  users: [{ id: U, username: "mallory", active_sessions: [{ id: "s-m" }] }],
  // A row saved before the allow-list existed.
  web_push_subscriptions: [{ user_id: U, endpoint: "https://10.0.0.5/old", p256dh: "k", auth: "a" }],
});
require.cache[require.resolve("../db/supabase")] = { id: "s", filename: "s", loaded: true, exports: fake };
const { isAllowedPushEndpoint } = require("../lib/pushEndpoint");
const { signToken } = require("../config/jwt");
const app = express(); app.use(express.json()); app.use("/api/web-push", require("../routes/webPush"));
(async () => {
  for (const ok of ["https://fcm.googleapis.com/fcm/send/abc", "https://updates.push.services.mozilla.com/wpush/v2/x", "https://web.push.apple.com/QK", "https://wns2-par02p.notify.windows.com/w/?token=x"]) {
    assert.ok(isAllowedPushEndpoint(ok), ok);
  }
  for (const bad of ["https://127.0.0.1:6379/", "https://10.0.0.5/admin", "https://169.254.169.254/latest/", "http://fcm.googleapis.com/x", "https://fcm.googleapis.com:8443/x", "https://user:pw@fcm.googleapis.com/x", "https://fcm.googleapis.com.evil.test/x", "https://notify.windows.com/x", 42]) {
    assert.ok(!isAllowedPushEndpoint(bad), String(bad));
  }
  const srv = http.createServer(app); await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const tok = signToken({ id: U, username: "mallory", sid: "s-m" });
  const post = (endpoint) => fetch("http://127.0.0.1:" + srv.address().port + "/api/web-push/subscription", {
    method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + tok },
    body: JSON.stringify({ endpoint, keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } }),
  });
  assert.strictEqual((await post("https://127.0.0.1:6379/")).status, 400, "internal endpoint refused");
  assert.strictEqual((await post("https://169.254.169.254/latest/meta-data/")).status, 400, "metadata endpoint refused");
  assert.strictEqual((await post("https://fcm.googleapis.com/fcm/send/abc")).status, 204, "FCM endpoint saved");
  await require("../lib/webPush").sendWebPushToUsers([U], { title: "x" });
  assert.deepStrictEqual(sent, ["https://fcm.googleapis.com/fcm/send/abc"], "only the push service is contacted");
  assert.ok(!fake._tables.web_push_subscriptions.rows.some((r) => r.endpoint.includes("10.0.0.5")), "old internal row dropped");
  console.log("webPushEndpoint test ok");
  srv.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
