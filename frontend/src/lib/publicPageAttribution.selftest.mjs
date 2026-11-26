import assert from "node:assert/strict";
import { VISIT_KEY, VISIT_TTL_MS, takePageVisit } from "./publicPageAttribution.js";

function mem() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}
const now = Date.parse("2026-11-24T10:00:00Z");
let s = mem();
s.setItem(VISIT_KEY, JSON.stringify({ slug: "anadolucraft", src: "google", at: now - 1000 }));
assert.deepEqual(takePageVisit("AnadoluCraft", { now, storage: s }), { src: "google" });
assert.equal(s.getItem(VISIT_KEY), null, "read once");
assert.equal(takePageVisit("anadolucraft", { now, storage: s }), null);
s.setItem(VISIT_KEY, JSON.stringify({ slug: "other", src: "google", at: now }));
assert.equal(takePageVisit("anadolucraft", { now, storage: s }), null, "another server's visit does not count");
s.setItem(VISIT_KEY, JSON.stringify({ slug: "anadolucraft", src: "google", at: now - VISIT_TTL_MS - 1 }));
assert.equal(takePageVisit("anadolucraft", { now, storage: s }), null, "stale");
s.setItem(VISIT_KEY, JSON.stringify({ slug: "anadolucraft", src: "<x>", at: now }));
assert.deepEqual(takePageVisit("anadolucraft", { now, storage: s }), { src: "direct" }, "bad source cleaned");
s.setItem(VISIT_KEY, "{not json");
assert.equal(takePageVisit("anadolucraft", { now, storage: s }), null);
assert.equal(s.getItem(VISIT_KEY), null, "malformed value removed");
console.log("publicPageAttribution selftest ok");
