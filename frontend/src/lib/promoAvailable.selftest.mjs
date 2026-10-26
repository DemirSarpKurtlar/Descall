// node src/lib/promoAvailable.selftest.mjs
import assert from "node:assert/strict";
import { clockSkew, expiryInfo, needsFastTick, summaryOf, unseenIds, GONE_AFTER } from "./promoAvailable.js";

const NOW = Date.parse("2026-10-27T10:00:00Z");
assert.equal(clockSkew("2026-10-27T10:00:05Z", NOW), 5000);
assert.equal(clockSkew("garbage", NOW), 0);
assert.equal(clockSkew(null, NOW), 0);
assert.equal(clockSkew("2030-01-01T00:00:00Z", NOW), 0, "absurd skew ignored");

assert.deepEqual(expiryInfo(null, NOW), { kind: "none" });
assert.deepEqual(expiryInfo("nope", NOW), { kind: "none" });
assert.deepEqual(expiryInfo("2026-10-29T14:30:00Z", NOW), { kind: "days", d: 2, h: 4 });
assert.deepEqual(expiryInfo("2026-10-28T10:00:00Z", NOW), { kind: "days", d: 1, h: 0 }, "exactly 24h is still days");
assert.deepEqual(expiryInfo("2026-10-27T15:04:09Z", NOW), { kind: "live", clock: "05:04:09" });
assert.deepEqual(expiryInfo("2026-10-27T10:00:00Z", NOW), { kind: "over", clock: "00:00:00" });

assert.equal(needsFastTick([{ expiresAt: null }, { expiresAt: "2026-11-27T10:00:00Z" }], NOW), false);
assert.equal(needsFastTick([{ expiresAt: "2026-10-27T11:00:00Z" }], NOW), true);
assert.equal(needsFastTick(null, NOW), false);

assert.deepEqual(summaryOf({ count: 3, unseen: 2 }), { count: 3, unseen: 2 });
assert.deepEqual(summaryOf({ count: 1, unseen: 9 }), { count: 1, unseen: 1 }, "unseen never above count");
assert.deepEqual(summaryOf({ items: [{ seen: true }, { seen: false }, {}] }), { count: 3, unseen: 2 });
assert.deepEqual(summaryOf(null), { count: 0, unseen: 0 });
assert.deepEqual(summaryOf({ count: -4 }), { count: 0, unseen: 0 });

assert.deepEqual(unseenIds([{ id: "a", seen: false }, { id: "b", seen: true }, { id: "c" }, null]), ["a", "c"]);
assert.equal(unseenIds(Array.from({ length: 80 }, (_, i) => ({ id: String(i) }))).length, 50);

for (const c of ["used", "limit", "expired", "invalid", "badge_owned"]) assert(GONE_AFTER.has(c), c);
assert(!GONE_AFTER.has("rate_limited") && !GONE_AFTER.has("server_error"), "transient errors keep the card");
console.log("promoAvailable selftest: ok");
