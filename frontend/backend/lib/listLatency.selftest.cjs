"use strict";

/**
 * Run: node frontend/backend/lib/listLatency.selftest.cjs
 *
 * Production measurements this model is calibrated to (2026-10-10, before the
 * batching change, Render service des-call, user with 32 groups):
 *   GET /groups/my "Found groups" 6.4s, 7.1s, 8.4s, 13.7s (3 overlapping),
 *   7.6s, 10s (4 overlapping). Health TTFB on a warm instance ~220ms.
 *   EXPLAIN ANALYZE of the SQL itself was 0.17ms (one group) and 1.4ms
 *   (batched scan). The seconds are Frankfurt→Seoul HTTP fan-out on 0.15 CPU.
 *
 * Old group list waves: membership, groups, then Promise.all of 32 last
 * messages, then Promise.all of 32 member queries, then 32 user queries.
 * 2 + 3*32 = 98 HTTP calls, 5 waves.
 */

const assert = require("assert");
const { parseSince } = require("./messagePage");

const RTT_MS = 280;
const MEASURED_GROUPS_MS = 6400;
const GROUP_COUNT = 32;
const OLD_QUERIES = 2 + GROUP_COUNT * 3;
const PARALLEL = (3 * RTT_MS * GROUP_COUNT) / (MEASURED_GROUPS_MS - RTT_MS * 2);

function wave(queries) {
  return RTT_MS * Math.max(1, queries / PARALLEL);
}

const oldGroupsMs = wave(1) + wave(1) + wave(GROUP_COUNT) + wave(GROUP_COUNT) + wave(GROUP_COUNT);
const newGroupsMs = wave(1) + wave(2) + wave(2);
const oldServersMs = wave(1) * 4 + wave(6);
const newServersMs = wave(1) + wave(3) + wave(3);
const messageBeforeMs = wave(1) + wave(1) + wave(20) + wave(1);
const messageAfterMs = wave(1) + wave(2) + wave(2);
const CLIENT_RTT_MS = 220;

assert.equal(OLD_QUERIES, 98);
assert.ok(Math.abs(oldGroupsMs - MEASURED_GROUPS_MS) < 50, `model ${oldGroupsMs} drifted from measured ${MEASURED_GROUPS_MS}`);
assert.ok(newGroupsMs < 1000, `warm group list ${newGroupsMs}ms`);
assert.ok(newServersMs < 1000, `warm server list ${newServersMs}ms`);
assert.ok(messageAfterMs < 1000, `warm message page ${messageAfterMs}ms`);

assert.equal(parseSince("2026-10-10T00:00:00.000Z"), "2026-10-10T00:00:00.000Z");
assert.equal(parseSince("not-a-date"), null);
assert.equal(parseSince("short"), null);
assert.equal(parseSince(123), null);

const surfaces = [
  ["Servers list", oldServersMs + CLIENT_RTT_MS, oldServersMs + CLIENT_RTT_MS, newServersMs + CLIENT_RTT_MS, newServersMs + CLIENT_RTT_MS],
  ["Server channel messages", messageBeforeMs + CLIENT_RTT_MS, messageBeforeMs + CLIENT_RTT_MS, messageAfterMs + CLIENT_RTT_MS, messageAfterMs + CLIENT_RTT_MS],
  ["DM list", (wave(2) + wave(1) + CLIENT_RTT_MS), (wave(2) + wave(1) + CLIENT_RTT_MS), (wave(2) + wave(1) + CLIENT_RTT_MS), (wave(2) + wave(1) + CLIENT_RTT_MS)],
  ["DM messages", messageBeforeMs + CLIENT_RTT_MS, messageBeforeMs + CLIENT_RTT_MS, messageAfterMs + CLIENT_RTT_MS, wave(2) + CLIENT_RTT_MS],
  ["Group list", oldGroupsMs + CLIENT_RTT_MS, oldGroupsMs + CLIENT_RTT_MS, newGroupsMs + CLIENT_RTT_MS, newGroupsMs + CLIENT_RTT_MS],
  ["Group messages", (messageBeforeMs + wave(1) + CLIENT_RTT_MS), (messageBeforeMs + wave(1) + CLIENT_RTT_MS), messageAfterMs + CLIENT_RTT_MS, wave(2) + CLIENT_RTT_MS],
];

console.log("listLatency model (ms). Cache paint is measured in chatCache.selftest, not here.");
console.log("surface | cold before | warm reopen before | cold after | warm fresh after");
for (const row of surfaces) {
  console.log(row.map((value) => (typeof value === "number" ? Math.round(value) : value)).join(" | "));
}
console.log(`calibrated parallel ${PARALLEL.toFixed(2)}, old groups ${Math.round(oldGroupsMs)}ms, new groups ${Math.round(newGroupsMs)}ms`);
console.log("listLatency.selftest: ok");
