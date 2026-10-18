"use strict";
// GET /api/webrtc/ice-config (2.11.1): anonymous = STUN only, signed-in = per-user TURN, rate-limited.
// Run from frontend/: node backend/test/iceConfig.integration.test.cjs
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
process.env.TURN_URL = "turns:turn.example.com:443";
process.env.TURN_SHARED_SECRET = "shared-secret-for-test";
delete process.env.CLOUDFLARE_TURN_KEY_ID;
delete process.env.ICE_SERVERS_JSON;

const http = require("http");
const assert = require("node:assert/strict");
const { createFakeSupabase } = require("./fakeSupabase.cjs");
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = {
  id: supabasePath, filename: supabasePath, loaded: true,
  exports: createFakeSupabase({
    users: [
      { id: "u-alice", username: "alice", active_sessions: [{ id: "s-alice" }] },
      { id: "u-bob", username: "bob", active_sessions: [{ id: "s-bob" }] },
    ],
  }),
};
const express = require("express");
const { signToken } = require("../config/jwt");
const webrtc = require("../routes/webrtc");
const { resetLimits } = require("../lib/rateLimit");

const hasTurn = (list) => (list || []).some((s) => [].concat(s.urls).some((u) => /^turns?:/i.test(u)));

(async () => {
  const app = express();
  app.set("trust proxy", 1);
  app.use("/api/webrtc", webrtc);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async (token, ip = "203.0.113.5") => {
    const headers = { "X-Forwarded-For": ip };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${base}/api/webrtc/ice-config`, { headers });
    return { status: res.status, cache: res.headers.get("cache-control"), body: await res.json() };
  };
  try {
    const anon = await get(null);
    assert.equal(anon.status, 200);
    assert.equal(anon.body.authenticated, false);
    assert.equal(hasTurn(anon.body.iceServers), false, "anonymous callers get no TURN");
    assert.ok(!JSON.stringify(anon.body).includes("credential"), "no credential for anonymous callers");
    assert.equal(anon.body.turnRequiresAuth, true);

    const bad = await get("not-a-jwt");
    assert.equal(hasTurn(bad.body.iceServers), false, "invalid token = STUN only");

    const revoked = await get(signToken({ id: "u-alice", username: "alice", sid: "s-gone" }));
    assert.equal(hasTurn(revoked.body.iceServers), false, "revoked session = STUN only");

    const alice = await get(signToken({ id: "u-alice", username: "alice", sid: "s-alice" }));
    assert.equal(alice.status, 200);
    assert.equal(alice.body.authenticated, true);
    assert.ok(hasTurn(alice.body.iceServers), "signed-in user gets TURN");
    assert.equal(alice.cache, "private, no-store");
    const aliceTurn = alice.body.iceServers.find((s) => s.username);
    assert.match(aliceTurn.username, /^\d+:u-alice$/, "per-user credential");
    assert.ok(alice.body.ttlSeconds >= 3600 && alice.body.ttlSeconds <= 4 * 3600, "1-4h ttl");
    assert.ok(Date.parse(alice.body.expiresAt) > Date.now());

    const bob = await get(signToken({ id: "u-bob", username: "bob", sid: "s-bob" }), "198.51.100.7");
    assert.notEqual(bob.body.iceServers.find((s) => s.username).username, aliceTurn.username);

    // Per-user limit: 30 per 10 minutes.
    resetLimits();
    const tok = signToken({ id: "u-bob", username: "bob", sid: "s-bob" });
    let last;
    for (let i = 0; i < 31; i++) last = await get(tok, `192.0.2.${i + 1}`);
    assert.equal(last.status, 429, "per-user rate limit");
    assert.equal(hasTurn(last.body.iceServers), false);
    // Per-IP limit: 120 per 10 minutes.
    resetLimits();
    for (let i = 0; i < 121; i++) last = await get(null, "192.0.2.200");
    assert.equal(last.status, 429, "per-IP rate limit");
    console.log("iceConfig.integration.test.cjs: ok");
  } finally {
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
