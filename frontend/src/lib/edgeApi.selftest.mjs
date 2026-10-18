// node frontend/src/lib/edgeApi.selftest.mjs
import assert from "node:assert/strict";

import { normalizeEdgeBase, rememberEdgeApiBase, edgeApiBase, fetchPublic } from "./edgeApi.js";

function memStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}

assert.equal(normalizeEdgeBase("https://api.descall.com/"), "https://api.descall.com");
assert.equal(normalizeEdgeBase("https://evil.example"), null);
assert.equal(normalizeEdgeBase("http://api.descall.com"), null);

const store = memStore();
assert.equal(edgeApiBase({ store }), null);
assert.equal(rememberEdgeApiBase("https://api.descall.com", store), "https://api.descall.com");
assert.equal(edgeApiBase({ store }), "https://api.descall.com");
rememberEdgeApiBase("https://evil.example", store);
assert.equal(edgeApiBase({ store }), null, "bad value clears");

// edge ok → edge used, Authorization stripped
rememberEdgeApiBase("https://api.descall.com", store);
const calls = [];
let res = await fetchPublic("/api/features", { headers: { Authorization: "Bearer x", Accept: "application/json" } }, {
  store, origin: "https://des-call.onrender.com",
  fetch: async (url, init) => { calls.push({ url, init }); return { status: 200 }; },
});
assert.equal(res.status, 200);
assert.equal(calls[0].url, "https://api.descall.com/api/features");
assert.equal(calls[0].init.headers.Authorization, undefined);
assert.equal(calls[0].init.credentials, "omit");

// edge 503 → origin, edge parked
calls.length = 0;
res = await fetchPublic("/api/features", {}, {
  store, origin: "https://des-call.onrender.com", now: 1000,
  fetch: async (url) => { calls.push(url); return { status: url.includes("api.descall.com") ? 503 : 200 }; },
});
assert.deepEqual(calls, ["https://api.descall.com/api/features", "https://des-call.onrender.com/api/features"]);
assert.equal(edgeApiBase({ store, now: 1000 + 60_000 }), null, "parked");
assert.equal(edgeApiBase({ store, now: 1000 + 31 * 60_000 }), "https://api.descall.com", "unparked");

// network error → origin
calls.length = 0;
store.removeItem("descall:edge-api-fail");
res = await fetchPublic("/x", {}, {
  store, origin: "https://o", fetch: async (url) => { calls.push(url); if (url.startsWith("https://api")) throw new TypeError("Load failed"); return { status: 200 }; },
});
assert.deepEqual(calls, ["https://api.descall.com/x", "https://o/x"]);

// no edge → origin only
const s2 = memStore();
calls.length = 0;
await fetchPublic("/y", {}, { store: s2, origin: "https://o", fetch: async (u) => { calls.push(u); return { status: 200 }; } });
assert.deepEqual(calls, ["https://o/y"]);
console.log("edgeApi.selftest.mjs: ok");
