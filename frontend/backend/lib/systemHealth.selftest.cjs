"use strict";
// Memory alert of Yönetici Paneli › Sistem (systemHealth.memoryAlert).
// Run: node frontend/backend/lib/systemHealth.selftest.cjs
const assert = require("node:assert/strict");
const h = require("./systemHealth");

const LIMIT = 512;
const at = (pct) => Math.round((pct / 100) * LIMIT);
const run = (series, now, peak) => h.memoryAlert({ rssSeries: series, rssMb: now, memLimitMb: LIMIT, peakRssMb: peak });

// Normal use (about 40 % like the free instance in Nov 2026).
assert.equal(run(Array(15).fill(at(40)), at(40)).level, "ok");

// 5 minutes at 82 %: warn, with the numbers the banner shows.
const warn = run(Array(15).fill(at(82)), at(82));
assert.equal(warn.level, "warn");
assert.equal(warn.windowMin, 5);
assert.equal(warn.recommendMb, 2048);
assert.ok(warn.sustainedPct >= 80 && warn.sustainedPct < 90);

// One spike (a deploy, a GC burst) is not a warning...
assert.equal(run([...Array(12).fill(at(40)), at(85), at(85), at(85)], at(85)).level, "ok");
// ...but 90 % right now is critical at once.
assert.equal(run([...Array(14).fill(at(40)), at(92)], at(92)).level, "bad");
// Sustained 90 %+ is critical even if the last sample dipped.
assert.equal(run([...Array(14).fill(at(93)), at(88)], at(88)).level, "bad");

// Fine now, but today's peak touched 90 %: a note, not an alarm.
assert.equal(run(Array(15).fill(at(40)), at(40), at(94)).level, "peak");

// Too few samples right after a start: no sustained verdict yet.
const early = run([at(85), at(85)], at(85));
assert.equal(early.sustainedPct, null);
assert.equal(early.level, "ok");

// Unknown limit or reading.
assert.equal(h.memoryAlert({ rssSeries: [], rssMb: 100, memLimitMb: 0 }).level, "unknown");
assert.equal(h.memoryAlert({}).level, "unknown");

// A 2 GB plan recommends 4 GB next.
assert.equal(h.memoryAlert({ rssSeries: Array(15).fill(1700), rssMb: 1700, memLimitMb: 2048 }).recommendMb, 4096);

// The snapshot carries it.
h.__resetForTests();
assert.ok(h.snapshot().memoryAlert && typeof h.snapshot().memoryAlert.level === "string");

console.log("systemHealth.selftest ok");
