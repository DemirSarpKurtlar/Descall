// node src/lib/presenceMerge.selftest.mjs
import assert from "node:assert/strict";
import { mergePresenceSnapshot, prunePresence } from "./presenceMerge.js";

const since = 1000;
const friends = ["a", "b", "c", "d"];
const prev = {
  a: { appName: "Old game", receivedAt: 500 },       // stale: friend stopped while we were offline
  b: { appName: "Live now", receivedAt: 1500 },      // arrived after the hydrate started
  gone: { appName: "Removed friend", receivedAt: 1500 },
};
const snapshot = { c: { appName: "Chess" }, d: { appName: "Cleared after start" } };
const out = mergePresenceSnapshot(prev, snapshot, { friendIds: friends, since, clearedAt: { d: 1200 } });
assert.deepEqual(Object.keys(out).sort(), ["b", "c"], "stale and removed entries go, live newer stay");
assert.equal(out.b.appName, "Live now");
assert.equal(out.c.appName, "Chess");

// Snapshot entry wins over an older live one for the same friend.
const out2 = mergePresenceSnapshot({ a: { appName: "Old", receivedAt: 10 } }, { a: { appName: "New" } }, { friendIds: ["a"], since });
assert.equal(out2.a.appName, "New");

const same = { a: { x: 1 } };
assert.equal(prunePresence(same, ["a"]), same, "unchanged keeps identity");
assert.deepEqual(prunePresence({ a: 1, z: 2 }, ["a"]), { a: 1 });
console.log("presenceMerge.selftest: ok");
