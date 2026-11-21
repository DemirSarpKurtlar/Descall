// node src/lib/typingStore.selftest.mjs
// Typing store (App no longer re-renders per typing event) + indexed roster lookup.
import assert from "node:assert/strict";
import { getTypingSnapshot, subscribeTyping, setTypingDm, setTypingGroups, setTypingChannels, resetTyping } from "./typingStore.js";
import { findOnlineUser, getPresenceStatus, isVisiblyOnline } from "./presence.js";

let calls = 0;
const off = subscribeTyping(() => {
  calls += 1;
});

const a = { id: "a", username: "a" };
const s0 = getTypingSnapshot();
assert.equal(s0.dm, null);

setTypingDm(a);
assert.equal(getTypingSnapshot().dm, a);
assert.equal(calls, 1);

// Same value: no new snapshot, no notification (subscribers do not re-render).
const s1 = getTypingSnapshot();
setTypingDm(a);
setTypingDm((cur) => (cur?.id === "zzz" ? null : cur));
assert.equal(getTypingSnapshot(), s1);
assert.equal(calls, 1);

setTypingDm((cur) => (cur?.id === "a" ? null : cur));
assert.equal(getTypingSnapshot().dm, null);
assert.equal(calls, 2);

const groups = { g1: new Map([["a", a]]) };
setTypingGroups(groups);
assert.equal(getTypingSnapshot().group, groups);
setTypingGroups(groups);
assert.equal(calls, 3);

const channels = { c1: new Map() };
setTypingChannels(channels);
assert.equal(getTypingSnapshot().channel, channels);
assert.equal(getTypingSnapshot().group, groups, "a channel update keeps the group maps");
assert.equal(calls, 4);

resetTyping();
assert.equal(getTypingSnapshot().dm, null);
assert.deepEqual(Object.keys(getTypingSnapshot().group), []);
assert.equal(calls, 5);

off();
setTypingDm(a);
assert.equal(calls, 5, "unsubscribed listener is not called");
resetTyping();

// Roster index: same answers as Array#find, rebuilt for a new roster array.
const roster = [
  { id: "u1", status: "online" },
  { id: "u2", status: "idle" },
  { id: "u1", status: "dnd" },
  { id: "u3", status: "invisible" },
];
assert.equal(findOnlineUser(roster, "u1"), roster[0], "first match wins like find()");
assert.equal(findOnlineUser(roster, "nope"), undefined);
assert.equal(findOnlineUser(null, "u1"), undefined);
assert.equal(getPresenceStatus(roster, "u2"), "idle");
assert.equal(getPresenceStatus(roster, "u3"), "offline");
assert.equal(isVisiblyOnline(roster, "u1"), true);
assert.equal(isVisiblyOnline(roster, "u3"), false);
const next = roster.map((u) => (u.id === "u2" ? { ...u, status: "dnd" } : u));
assert.equal(getPresenceStatus(next, "u2"), "dnd");
assert.equal(getPresenceStatus(roster, "u2"), "idle", "old roster keeps its own index");
// In-place push is still seen (length guard).
roster.push({ id: "u9", status: "online" });
assert.equal(getPresenceStatus(roster, "u9"), "online");

console.log("typingStore.selftest: ok");
