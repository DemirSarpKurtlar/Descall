// Selftest: pull-to-refresh applies the REST friend list without losing live socket fields.
import assert from "node:assert/strict";
import { mergeRestFriends } from "./friendListMerge.js";

const live = [
  { id: "a", username: "ayse", displayName: "Ayşe", status: "online", lastMessage: "selam", lastActivity: "2026-10-25T10:00:00Z" },
  { id: "b", username: "mert", displayName: "Mert", status: "idle" },
];

// New friendship from REST appears (first), removed one disappears.
const rest1 = [
  { id: "a", username: "ayse", displayName: "Ayşe Y.", avatarUrl: null, bio: null },
  { id: "c", username: "can", displayName: "Can", avatarUrl: null },
];
const m1 = mergeRestFriends(live, rest1);
assert.deepEqual(m1.map((u) => u.id), ["c", "a"], "new friend added first, removed friend dropped");
const a = m1.find((u) => u.id === "a");
assert.equal(a.displayName, "Ayşe Y.", "profile field from REST wins");
assert.equal(a.status, "online", "presence kept from socket entry");
assert.equal(a.lastMessage, "selam", "last message kept");
assert.equal(a.lastActivity, "2026-10-25T10:00:00Z", "last activity kept");

// Nulls from REST do not blank live values, but a new key still exists.
const m2 = mergeRestFriends([{ id: "a", customStatus: "maçta" }], [{ id: "a", customStatus: null, bio: null }]);
assert.equal(m2[0].customStatus, "maçta");
assert.ok("bio" in m2[0]);

// No change keeps the same array (no re-render).
const same = [{ id: "a", username: "ayse", status: "online" }];
assert.equal(mergeRestFriends(same, [{ id: "a", username: "ayse" }]), same, "unchanged list keeps identity");

// Empty REST list (no friends left) empties the list; bad input is safe.
assert.deepEqual(mergeRestFriends(live, []), []);
assert.deepEqual(mergeRestFriends(null, null), []);
assert.deepEqual(mergeRestFriends(undefined, [{ id: 1 }]).map((u) => u.id), [1]);

console.log("friendListMerge.selftest: ok");
