import assert from "node:assert/strict";
import { toMs, recencyMs, sortListItems, orderFriends, newestRequestsFirst, stampArrival } from "./listOrder.js";
import { applyDmListPrefs } from "./dmConversationPrefs.js";

// Postgres `timestamp` without zone is UTC, not local time.
assert.equal(toMs("2026-10-25T07:00:00"), Date.UTC(2026, 9, 25, 7));
assert.equal(toMs("2026-10-25 07:00:00.123"), Date.UTC(2026, 9, 25, 7, 0, 0, 123));
assert.equal(toMs("2026-10-25T07:00:00+03:00"), Date.UTC(2026, 9, 25, 4));
assert.equal(toMs("2026-10-25T07:00:00Z"), Date.UTC(2026, 9, 25, 7));
assert.equal(toMs(null), 0);
assert.equal(toMs("nope"), 0);
assert.equal(recencyMs({ lastActivity: "2026-01-01T00:00:00Z", friendsSince: "2026-10-01T00:00:00Z" }), Date.UTC(2026, 9, 1));

// DMs: pinned first (newest pin first), new friend (no messages) above older chats, never above pins.
{
  const dms = [
    { id: "old", username: "old", lastActivity: "2026-10-20T10:00:00Z" },
    { id: "pinA", username: "pinA", lastActivity: "2026-01-01T00:00:00Z" },
    { id: "new", username: "new", lastActivity: null, friendsSince: "2026-10-25T09:00:00Z" },
    { id: "recent", username: "recent", lastActivity: "2026-10-24T10:00:00Z" },
    { id: "pinB", username: "pinB", lastActivity: "2026-02-01T00:00:00Z" },
    { id: "nothing", username: "nothing" },
  ];
  const prefs = {
    pinA: { peerId: "pinA", pinned: true, pinnedAt: "2026-05-01T00:00:00Z" },
    pinB: { peerId: "pinB", pinned: true, pinnedAt: "2026-06-01T00:00:00Z" },
  };
  const out = applyDmListPrefs(dms, prefs).map((d) => d.id);
  assert.deepEqual(out, ["pinB", "pinA", "new", "recent", "old", "nothing"]);
}

// Groups: a group I just joined (old messages) and a newly created one go to the top.
{
  const groups = [
    { id: "g1", name: "Eski", lastActivity: "2026-10-24T10:00:00Z", created_at: "2026-01-01T00:00:00" },
    { id: "g2", name: "Yeni", lastActivity: null, created_at: "2026-10-25T09:30:00" },
    { id: "g3", name: "Katildim", lastActivity: "2026-03-01T00:00:00Z", joinedAt: "2026-10-25T09:00:00" },
    { id: "g4", name: "Pin", pinned: true, pinnedAt: "2026-02-01T00:00:00Z", lastActivity: "2026-01-02T00:00:00Z" },
  ];
  assert.deepEqual(sortListItems(groups).map((g) => g.id), ["g4", "g2", "g3", "g1"]);
}

// Friends tab follows the chats: pins from DM prefs, then live activity, then friendship time.
{
  const friends = [
    { id: "a", username: "a", friendsSince: "2025-01-01T00:00:00Z" },
    { id: "b", username: "b", friendsSince: "2026-10-25T09:00:00Z" },
    { id: "c", username: "c", friendsSince: "2025-02-01T00:00:00Z" },
    { id: "d", username: "d", friendsSince: "2024-01-01T00:00:00Z" },
  ];
  const prefs = { d: { pinned: true, pinnedAt: "2026-01-01T00:00:00Z" } };
  const act = { c: "2026-10-25T10:00:00Z" };
  const out = orderFriends(friends, prefs, act);
  assert.deepEqual(out.map((f) => f.id), ["d", "c", "b", "a"]);
  assert.equal(out[0], friends[3], "returns the original objects");
}

// Requests: newest first; a live one stamped now beats older ones.
{
  const reqs = [
    { id: "x", username: "x", requestedAt: "2026-10-20T00:00:00Z" },
    { id: "y", username: "y", createdAt: "2026-10-22T00:00:00Z" },
    stampArrival({ id: "z", username: "z" }, "requestedAt", Date.UTC(2026, 9, 25)),
  ];
  assert.deepEqual(newestRequestsFirst(reqs).map((r) => r.id), ["z", "y", "x"]);
  const keep = { id: "k", requestedAt: "2026-01-01T00:00:00Z" };
  assert.equal(stampArrival(keep, "requestedAt"), keep, "existing time kept");
}

console.log("listOrder.selftest: ok");
