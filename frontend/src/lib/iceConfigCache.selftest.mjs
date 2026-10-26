// node src/lib/iceConfigCache.selftest.mjs — 3.0.0 C1: a call never waits for a TURN refresh
// while the cached credentials are still valid (refresh happens in the background).
import assert from "node:assert/strict";

const store = new Map();
globalThis.window = {
  localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
  location: { origin: "https://descall.test" },
  addEventListener() {},
};
const { SECURE_TOKEN_KEY } = await import("./secureToken.js");
const ice = await import("./iceConfig.js");

const STUN = [{ urls: "stun:stun.l.google.com:19302" }];
const TURN = { urls: ["turns:turn.example:443"], username: "123:u-1", credential: "c" };

// Pure rule.
const now = 50_000_000;
const base = { cached: [1], cachedAt: now - 1000, refreshMs: 30 * 60e3, expiresAt: now + 3600e3, cachedToken: "t", token: "t", hasTurn: true, now };
assert.equal(ice.cachedUsableForCall(base), true);
assert.equal(ice.cachedUsableForCall({ ...base, expiresAt: now + 59e3 }), false, "under 60 s left: fetch");
assert.equal(ice.cachedUsableForCall({ ...base, expiresAt: now + 61e3 }), true);
assert.equal(ice.cachedUsableForCall({ ...base, token: "other" }), false, "other account");
assert.equal(ice.cachedUsableForCall({ ...base, hasTurn: false }), false, "signed in without TURN");
assert.equal(ice.cachedUsableForCall({ ...base, token: null, cachedToken: null, hasTurn: false }), true, "signed out STUN list");
assert.equal(ice.cachedUsableForCall({ ...base, expiresAt: 0, cachedAt: now - 58 * 60e3 }), true, "no expiry: 2×refresh − 60 s");
assert.equal(ice.cachedUsableForCall({ ...base, expiresAt: 0, cachedAt: now - 59.5 * 60e3 }), false);
assert.equal(ice.cachedUsableForCall({ ...base, cached: null }), false);

// Integration: cache is past its half-TTL refresh point but valid for hours.
store.set(SECURE_TOKEN_KEY, "jwt-abc");
let fetches = 0;
let pending = null;
globalThis.fetch = async () => {
  fetches += 1;
  return { ok: true, json: async () => ({ iceServers: [...STUN, TURN], authenticated: true, ttlSeconds: 4 * 3600, expiresAt: new Date(Date.now() + 4 * 3600e3).toISOString() }) };
};
await ice.preloadIceServers();
assert.equal(fetches, 1);
const realNow = Date.now;
Date.now = () => realNow() + 2 * 3600e3; // 2 h later: stale (refresh every 90 min) but valid 2 more hours
globalThis.fetch = () => {
  fetches += 1;
  return new Promise((resolve) => { pending = resolve; }); // slow backend (Render cold start)
};
const t0 = realNow();
const list = await ice.ensureIceServersForCall({ timeoutMs: 3000 });
assert.ok(realNow() - t0 < 50, "returned without waiting for the refresh");
assert.ok(ice.iceServersHaveTurn(list), "cached TURN used");
assert.equal(fetches, 2, "background refresh started");
pending?.({ ok: false, json: async () => ({}) });
Date.now = realNow;
console.log("iceConfigCache.selftest.mjs: ok");
