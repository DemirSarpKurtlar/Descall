import assert from "node:assert/strict";
import { applyDmListPrefs, mergePrefIntoMap, prefsMapFromList, applyLocalPrefPatch } from "./dmConversationPrefs.js";

const prefs = prefsMapFromList([
  { peerId: "a", pinned: true, pinnedAt: "2026-08-01T00:00:00.000Z" },
  { peerId: "b", hidden: true },
  { peerId: "c", muted: true, markedUnread: true },
]);
assert.equal(prefs.a.pinned, true);
assert.equal(prefs.b.hidden, true);
assert.equal(prefs.c.muted, true);

const dms = [
  { id: "b", username: "hidden", lastActivity: "2026-08-20T00:00:00.000Z", unreadCount: 3 },
  { id: "c", username: "muted", lastActivity: "2026-08-10T00:00:00.000Z", unreadCount: 0 },
  { id: "d", username: "recent", lastActivity: "2026-08-22T00:00:00.000Z", unreadCount: 0 },
  { id: "a", username: "pinned", lastActivity: "2026-01-01T00:00:00.000Z", unreadCount: 0 },
];

const next = applyDmListPrefs(dms, prefs);
assert.deepEqual(next.map((d) => d.id), ["a", "d", "c"]);
assert.equal(next[0].pinned, true);
assert.equal(next.find((d) => d.id === "c").muted, true);
assert.equal(next.find((d) => d.id === "c").unreadCount, 1);
assert.ok(!next.some((d) => d.id === "b"));

const laterPin = prefsMapFromList([
  { peerId: "a", pinned: true, pinnedAt: "2026-08-01T00:00:00.000Z" },
  { peerId: "d", pinned: true, pinnedAt: "2026-08-20T00:00:00.000Z" },
]);
const pinnedOrder = applyDmListPrefs(
  [
    { id: "a", username: "old-pin", lastActivity: "2026-08-22T00:00:00.000Z" },
    { id: "d", username: "new-pin", lastActivity: "2026-01-01T00:00:00.000Z" },
  ],
  laterPin,
);
assert.deepEqual(pinnedOrder.map((d) => d.id), ["d", "a"]);

const merged = mergePrefIntoMap(prefs, { peerId: "b", hidden: false, pinned: true });
assert.equal(merged.b.hidden, false);
assert.equal(merged.b.pinned, true);

const closedLocal = applyLocalPrefPatch({ peerId: "a", pinned: true, pinnedAt: "2026-08-01T00:00:00.000Z" }, { hidden: true });
assert.equal(closedLocal.hidden, true);
assert.equal(closedLocal.pinned, false);

const pinHidden = applyLocalPrefPatch({ peerId: "b", hidden: true }, { pinned: true });
assert.equal(pinHidden.pinned, true);
assert.equal(pinHidden.hidden, false);

console.log("dmConversationPrefs.selftest.mjs: ok");
