"use strict";

const assert = require("node:assert/strict");
const {
  remainingUserSocketIds,
  userHasOtherSockets,
  summarizePresence,
  pruneDeadPresence,
  getPresenceEntry,
  isVisibleStatus,
} = require("./presenceRoster");

assert.deepEqual(remainingUserSocketIds(new Set(["a", "b"]), "a"), ["b"]);
assert.equal(userHasOtherSockets(new Set(["only"]), "only"), false);
assert.equal(userHasOtherSockets(new Set(["only", "other"]), "only"), true);
assert.equal(userHasOtherSockets(undefined, "x"), false);

const presence = new Map([
  ["u1", { username: "ada", status: "online", socketId: "s1" }],
  ["u2", { username: "bob", status: "invisible", socketId: "s2" }],
  ["u3", { username: "ghost", status: "online", socketId: "dead" }],
]);

const io = {
  sockets: {
    adapter: {
      rooms: new Map([
        ["user:u1", new Set(["s1"])],
        ["user:u2", new Set(["s2"])],
      ]),
    },
    sockets: new Map([
      ["s1", { id: "s1" }],
      ["s2", { id: "s2" }],
    ]),
  },
};

const summary = summarizePresence(presence, { io });
assert.equal(summary.connectedCount, 2);
assert.equal(summary.onlineUsers, 2);
assert.equal(summary.visibleCount, 1);
assert.equal(summary.invisibleCount, 1);
assert.equal(summary.statusCounts.online, 1);
assert.equal(summary.statusCounts.invisible, 1);
assert.equal(isVisibleStatus("invisible"), false);
assert.equal(isVisibleStatus("dnd"), true);

assert.equal(pruneDeadPresence(presence, io), 1);
assert.equal(presence.has("u3"), false);
assert.equal(getPresenceEntry(presence, "u1")?.username, "ada");
assert.equal(getPresenceEntry(presence, "missing"), null);

console.log("presenceRoster.selftest.cjs: ok");
