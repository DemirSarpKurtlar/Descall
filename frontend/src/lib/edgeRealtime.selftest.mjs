// node frontend/src/lib/edgeRealtime.selftest.mjs
import assert from "node:assert/strict";
import { normalizeRealtimeUrl, rememberRealtimeAdvice, chooseRealtimeUrl, parkEdgeRealtime, createEdgeFailureCounter, PARK_MS } from "./edgeRealtime.js";

function memStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
assert.equal(normalizeRealtimeUrl("wss://rt.descall.com/"), "wss://rt.descall.com");
assert.equal(normalizeRealtimeUrl("ws://rt.descall.com"), null);
assert.equal(normalizeRealtimeUrl("wss://evil.example"), null);
assert.equal(normalizeRealtimeUrl("wss://rt.descall.com/x"), null);
const s = memStore();
assert.equal(chooseRealtimeUrl({ store: s }), null, "no advice → Render");
rememberRealtimeAdvice({ realtime: "wss://rt.descall.com" }, s);
assert.equal(chooseRealtimeUrl({ store: s }), "wss://rt.descall.com");
assert.equal(chooseRealtimeUrl({ store: s, disabled: true }), null);
parkEdgeRealtime(s, 1000);
assert.equal(chooseRealtimeUrl({ store: s, now: 1000 + 60_000 }), null, "parked");
assert.equal(chooseRealtimeUrl({ store: s, now: 1000 + PARK_MS + 1 }), "wss://rt.descall.com", "park expires");
rememberRealtimeAdvice({ realtime: null }, s);
assert.equal(chooseRealtimeUrl({ store: s, now: 1000 + PARK_MS + 1 }), null, "kill switch clears");
rememberRealtimeAdvice({ realtime: "wss://evil.example" }, s);
assert.equal(chooseRealtimeUrl({ store: s, now: 1e13 }), null, "foreign host ignored");
const c = createEdgeFailureCounter();
assert.equal(c.fail(), false);
assert.equal(c.fail(), true);
c.reset();
assert.equal(c.count, 0);
console.log("edgeRealtime.selftest.mjs: ok");
