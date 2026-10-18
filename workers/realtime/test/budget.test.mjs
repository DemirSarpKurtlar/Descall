// node workers/realtime/test/budget.test.mjs
import assert from "node:assert/strict";
import { createBudget, utcDay } from "../src/budget.js";

let t = Date.parse("2026-10-18T10:00:00Z");
const b = createBudget({ soft: 100, hard: 120, now: () => t });
assert.equal(b.level(), "ok");
b.request(50);
b.wsMessage(20 * 49); // 49 units
assert.equal(b.units(), 99);
assert.equal(b.level(), "ok");
b.wsMessage(1); // ceil → 100
assert.equal(b.level(), "soft");
b.request(20);
assert.equal(b.level(), "hard");
assert.ok(b.shouldPersist());
const snap = b.snapshot();
assert.equal(snap.day, "2026-10-18");
assert.equal(b.shouldPersist(), false);
// restore after hibernation
const b2 = createBudget({ soft: 100, hard: 120, now: () => t, snapshot: snap });
assert.equal(b2.level(), "hard");
// new UTC day resets
t = Date.parse("2026-10-19T00:00:01Z");
assert.equal(b2.level(), "ok");
assert.equal(b2.units(), 0);
assert.equal(utcDay(t), "2026-10-19");
// stale snapshot from yesterday is ignored on load
const b3 = createBudget({ now: () => t, snapshot: snap });
assert.equal(b3.units(), 0);
console.log("budget.test.mjs: ok");
