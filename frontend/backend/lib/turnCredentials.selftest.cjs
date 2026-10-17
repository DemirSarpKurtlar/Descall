// TURN modes for /api/webrtc/ice-config. Run from frontend/: node backend/lib/turnCredentials.selftest.cjs
"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const {
  turnMode,
  sharedSecretCredentials,
  turnIceServers,
  _resetTurnCacheForTests,
} = require("./turnCredentials");

(async () => {
  assert.equal(turnMode({}), "none");
  assert.equal(turnMode({ TURN_URL: "turn:t.example:3478", TURN_SHARED_SECRET: "s" }), "shared-secret");
  assert.equal(turnMode({ TURN_URL: "turn:t.example:3478", TURN_USERNAME: "u", TURN_CREDENTIAL: "p" }), "static");
  assert.equal(turnMode({ CLOUDFLARE_TURN_KEY_ID: "k", CLOUDFLARE_TURN_API_TOKEN: "t", TURN_URL: "x", TURN_SHARED_SECRET: "s" }), "cloudflare");

  // coturn REST scheme: username "<expiry>:descall", credential = b64(HMAC-SHA1(secret, username)).
  const now = 1_700_000_000_000;
  const c = sharedSecretCredentials(["turns:t.example:443"], "sekret", { now, ttlS: 3600 });
  assert.equal(c.username, `${Math.floor(now / 1000) + 3600}:descall`);
  assert.equal(c.credential, crypto.createHmac("sha1", "sekret").update(c.username).digest("base64"));
  assert.deepEqual(c.urls, ["turn:t.example:443?transport=udp", "turns:t.example:443"]);

  assert.deepEqual(await turnIceServers({}), []);
  const stat = await turnIceServers({ TURN_URL: "turn:a:3478,turn:b:3478", TURN_USERNAME: "u", TURN_CREDENTIAL: "p" });
  assert.deepEqual(stat[0].urls, ["turn:a:3478", "turn:b:3478"]);

  // Cloudflare: minted once, cached, old list kept when the API fails.
  _resetTurnCacheForTests();
  let calls = 0;
  const env = { CLOUDFLARE_TURN_KEY_ID: "key", CLOUDFLARE_TURN_API_TOKEN: "tok" };
  const ok = async (url, init) => {
    calls += 1;
    assert.match(url, /rtc\.live\.cloudflare\.com\/v1\/turn\/keys\/key\/credentials\/generate-ice-servers/);
    assert.equal(init.headers.Authorization, "Bearer tok");
    return { ok: true, json: async () => ({ iceServers: [{ urls: ["stun:stun.cloudflare.com:3478", "turn:turn.cloudflare.com:3478?transport=udp"], username: "x", credential: "y" }] }) };
  };
  const first = await turnIceServers(env, { fetchImpl: ok, now: 0 });
  await turnIceServers(env, { fetchImpl: ok, now: 1000 });
  assert.equal(calls, 1, "cached");
  assert.equal(first[0].username, "x");
  const warn = console.warn;
  console.warn = () => {};
  const failed = await turnIceServers(env, { fetchImpl: async () => ({ ok: false, status: 500 }), now: 9 * 3600 * 1000 });
  console.warn = warn;
  assert.equal(failed[0].username, "x", "keeps the last good list on failure");

  // Route wiring: async ice-config, TURN appended after STUN, mode exposed.
  const fs = require("node:fs");
  const path = require("node:path");
  const route = fs.readFileSync(path.join(__dirname, "../routes/webrtc.js"), "utf8");
  assert.match(route, /turnIceServers\(/);
  assert.match(route, /turnMode/);
  assert.match(route, /private, max-age=300/);
  console.log("turnCredentials.selftest ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
