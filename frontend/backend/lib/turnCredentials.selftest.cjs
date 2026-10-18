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
  assert.match(route, /turnIceServersForUser\(/);
  assert.match(route, /turnMode/);
  assert.match(route, /private, no-store/);

  // 2.11.2 per-user short-lived credentials.
  const { turnIceServersForUser, userTtlSeconds } = require("./turnCredentials");
  assert.equal(userTtlSeconds({}), 4 * 3600);
  assert.equal(userTtlSeconds({ TURN_CREDENTIAL_TTL_S: "60" }), 3600, "clamped to >= 1h");
  assert.equal(userTtlSeconds({ TURN_CREDENTIAL_TTL_S: "999999" }), 4 * 3600, "clamped to <= 4h");
  const ss = await turnIceServersForUser("user-1", { TURN_URL: "turn:t.example:3478", TURN_SHARED_SECRET: "sek" }, { now });
  assert.equal(ss.servers[0].username, `${Math.floor(now / 1000) + 4 * 3600}:user-1`, "shared-secret username is per user");
  assert.equal(ss.ttlSeconds, 4 * 3600);
  _resetTurnCacheForTests();
  let minted = 0;
  const bodies = [];
  const cf = async (_url, init) => {
    minted += 1;
    bodies.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({ iceServers: [{ urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turn:turn.cloudflare.com:53?transport=udp"], username: `u${minted}`, credential: "c" }] }) };
  };
  const a1 = await turnIceServersForUser("alice", env, { fetchImpl: cf, now: 0 });
  const a2 = await turnIceServersForUser("alice", env, { fetchImpl: cf, now: 3600 * 1000 });
  const b1 = await turnIceServersForUser("bob", env, { fetchImpl: cf, now: 3600 * 1000 });
  assert.equal(bodies[0].ttl, 4 * 3600, "Cloudflare credential ttl is 4h, not 24h");
  assert.equal(a1.servers[0].username, a2.servers[0].username, "reused within half the ttl");
  assert.notEqual(a1.servers[0].username, b1.servers[0].username, "each user gets their own credential");
  assert.ok(!a1.servers[0].urls.some((u) => /:53\?/.test(u)), "port 53 dropped");
  assert.equal(a2.ttlSeconds, 3 * 3600, "remaining lifetime reported");
  const a3 = await turnIceServersForUser("alice", env, { fetchImpl: cf, now: 2.5 * 3600 * 1000 });
  assert.notEqual(a3.servers[0].username, a1.servers[0].username, "re-minted after half the ttl");
  assert.equal((await turnIceServersForUser("x", {})).servers.length, 0);
  console.log("turnCredentials.selftest ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
