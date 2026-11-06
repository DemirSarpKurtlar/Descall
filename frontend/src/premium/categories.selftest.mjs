import assert from "node:assert/strict";
import { PREMIUM_CATEGORIES, categoryOf, daysUntil } from "./categories.js";
import { FEATURE_KEYS, FEATURES } from "./features.js";

// Every feature key sits in exactly one category, and no category names an unknown key.
const seen = new Map();
for (const c of PREMIUM_CATEGORIES) {
  assert.ok(c.keys.length > 0, `${c.id} is empty`);
  for (const k of c.keys) {
    assert.ok(Object.prototype.hasOwnProperty.call(FEATURES, k), `${c.id} names unknown key ${k}`);
    assert.ok(!seen.has(k), `${k} is in ${seen.get(k)} and ${c.id}`);
    seen.set(k, c.id);
  }
}
for (const k of FEATURE_KEYS) assert.ok(seen.has(k), `${k} has no category`);
assert.equal(PREMIUM_CATEGORIES.length, 8);
assert.equal(categoryOf("noise_gate"), "audio");
assert.equal(categoryOf("nope"), null);

// Ultra-only categories hold only ultra keys (the tiles show an "Ultra" tag).
for (const id of ["desktop_tools", "automation"]) {
  const c = PREMIUM_CATEGORIES.find((x) => x.id === id);
  for (const k of c.keys) assert.equal(FEATURES[k].tier, "ultra", `${k} in ${id} is not ultra`);
}

const now = Date.parse("2026-11-06T12:00:00Z");
assert.equal(daysUntil("2026-12-06T12:00:00Z", now), 30);
assert.equal(daysUntil("2026-11-06T12:00:01Z", now), 1);
assert.equal(daysUntil("2026-11-01T00:00:00Z", now), 0);
assert.equal(daysUntil(null, now), null);
assert.equal(daysUntil("garbage", now), null);

console.log("categories.selftest ok");
