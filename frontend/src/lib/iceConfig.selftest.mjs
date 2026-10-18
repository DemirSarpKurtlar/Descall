// node src/lib/iceConfig.selftest.mjs — 2.11.1 TURN needs auth; token-bound cache, refresh before expiry.
import assert from "node:assert/strict";

const store = new Map();
globalThis.window = {
  localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
  location: { origin: "https://descall.com" },
  addEventListener() {},
};
const { SECURE_TOKEN_KEY } = await import("./secureToken.js");
const ice = await import("./iceConfig.js");

const calls = [];
let reply = null;
globalThis.fetch = async (url, init) => {
  calls.push({ url, auth: init?.headers?.Authorization || null });
  return { ok: true, json: async () => reply(init) };
};
const STUN = [{ urls: "stun:stun.l.google.com:19302" }];
const TURN = { urls: ["turns:turn.example:443"], username: "123:u-1", credential: "c" };

// Signed out: request has no Authorization and the server answers STUN only.
reply = () => ({ iceServers: STUN, authenticated: false, turnRequiresAuth: true });
await ice.preloadIceServers();
assert.equal(calls.at(-1).auth, null);
assert.equal(ice.iceServersHaveTurn(ice.getIceServers()), false);

// Sign in: the token change makes the cache stale; next fetch sends Bearer and gets TURN.
store.set(SECURE_TOKEN_KEY, "jwt-abc");
reply = (init) => (init.headers.Authorization === "Bearer jwt-abc"
  ? { iceServers: [...STUN, TURN], authenticated: true, ttlSeconds: 4 * 3600, expiresAt: new Date(Date.now() + 4 * 3600e3).toISOString() }
  : { iceServers: STUN, authenticated: false });
await ice.preloadIceServers();
assert.equal(calls.at(-1).auth, "Bearer jwt-abc", "TURN request carries the session token");
assert.ok(ice.iceServersHaveTurn(ice.getIceServers()), "signed-in client gets TURN");
const n = calls.length;
await ice.preloadIceServers();
assert.equal(calls.length, n, "fresh cache is reused");

// Live peer connections get refreshed credentials.
const configs = [];
const pc = { signalingState: "stable", connectionState: "connected", getConfiguration: () => ({ bundlePolicy: "max-bundle" }), setConfiguration: (c) => configs.push(c), addEventListener() {} };
ice.trackPeerConnection(pc);
await ice.refreshIceServers();
assert.equal(configs.length, 1);
assert.equal(configs[0].bundlePolicy, "max-bundle");
assert.ok(ice.iceServersHaveTurn(configs[0].iceServers));

// Sign out drops TURN from the cache.
store.delete(SECURE_TOKEN_KEY);
reply = () => ({ iceServers: STUN, authenticated: false });
await ice.preloadIceServers();
assert.equal(ice.iceServersHaveTurn(ice.getIceServers()), false, "signed out = no cached TURN");

// Pure decisions.
assert.equal(ice.refreshDelayMs(4 * 3600), 90 * 60 * 1000, "refresh at most every 90 min");
assert.equal(ice.refreshDelayMs(3600), 30 * 60 * 1000, "half of a 1h lifetime");
const now = 10_000_000;
const base = { cached: [1], cachedAt: now - 1000, refreshMs: 3600e3, expiresAt: now + 3600e3, cachedToken: "t", cachedAuthenticated: true, token: "t", now };
assert.equal(ice.decideStale(base), false);
assert.equal(ice.decideStale({ ...base, token: "other" }), true, "account switch");
assert.equal(ice.decideStale({ ...base, expiresAt: now + 60e3 }), true, "within 5 min of expiry");
assert.equal(ice.decideStale({ ...base, cachedAuthenticated: false, cachedAt: now - 120e3 }), true, "STUN-only while signed in retries after 60 s");
console.log("iceConfig.selftest.mjs: ok");
