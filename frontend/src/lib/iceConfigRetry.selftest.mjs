// node src/lib/iceConfigRetry.selftest.mjs — 3.7.27: a signed-in caller retries a
// failed /api/webrtc/ice-config with backoff before falling back to STUN only,
// and the status is visible for diagnostics.
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
const ok = () => ({ ok: true, status: 200, json: async () => ({ iceServers: [...STUN, TURN], authenticated: true, ttlSeconds: 3600 }) });

assert.equal(ice.shouldRetryStatus(503), true);
assert.equal(ice.shouldRetryStatus(429), true);
assert.equal(ice.shouldRetryStatus(0), true);
assert.equal(ice.shouldRetryStatus(401), false);
assert.equal(ice.shouldRetryStatus(404), false);

// Signed in: network error, then 502, then OK → TURN, 3 attempts.
store.set(SECURE_TOKEN_KEY, "jwt-1");
let calls = 0;
globalThis.fetch = async () => {
  calls += 1;
  if (calls === 1) throw new TypeError("Failed to fetch");
  if (calls === 2) return { ok: false, status: 502, json: async () => ({}) };
  return ok();
};
let list = await ice.refreshIceServers();
assert.equal(calls, 3);
assert.ok(ice.iceServersHaveTurn(list), "TURN after retry");
assert.deepEqual({ ...ice.getIceConfigStatus(), fetchStatus: null }, { fetchOk: true, fetchAttempts: 3, fetchStatus: null, turnPresent: true, authenticated: true });

// Signed in, every attempt fails → STUN only, after FETCH_BACKOFF_MS.length attempts, status says so.
ice._resetIceConfigForTests();
calls = 0;
globalThis.fetch = async () => { calls += 1; throw new TypeError("Failed to fetch"); };
const warn = console.warn; console.warn = () => {};
list = await ice.refreshIceServers();
console.warn = warn;
assert.equal(calls, ice.FETCH_BACKOFF_MS.length);
assert.equal(ice.iceServersHaveTurn(list), false);
assert.equal(ice.getIceConfigStatus().fetchOk, false);
assert.equal(ice.getIceConfigStatus().turnPresent, false);

// 401 is not retried.
ice._resetIceConfigForTests();
calls = 0;
globalThis.fetch = async () => { calls += 1; return { ok: false, status: 401, json: async () => ({}) }; };
console.warn = () => {};
await ice.refreshIceServers();
console.warn = warn;
assert.equal(calls, 1);

// Signed out: one attempt only (no TURN for anonymous callers anyway).
ice._resetIceConfigForTests();
store.delete(SECURE_TOKEN_KEY);
calls = 0;
globalThis.fetch = async () => { calls += 1; throw new TypeError("offline"); };
console.warn = () => {};
await ice.refreshIceServers();
console.warn = warn;
assert.equal(calls, 1);

// Live peers are exposed for the mic failsafe; closed ones dropped.
const mk = (state) => ({ connectionState: state, signalingState: state === "closed" ? "closed" : "stable", setConfiguration() {}, getConfiguration: () => ({}), addEventListener() {} });
ice.trackPeerConnection(mk("connected"));
ice.trackPeerConnection(mk("closed"));
assert.equal(ice.getLivePeerConnections().length, 1);

console.log("iceConfigRetry.selftest ok");
