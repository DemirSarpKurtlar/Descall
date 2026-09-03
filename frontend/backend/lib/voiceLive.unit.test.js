"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key";
const {
  roomIdDm,
  roomIdGroup,
  roomIdServer,
  parseRoomId,
  userInRoom,
  joinLive,
  leaveLive,
  listRooms,
  resetLive,
  setSpeaking,
  dropRoom,
  leaveUser,
} = require("./voiceLive");
const { activeServerVoiceCalls } = require("../runtime/sharedState");

test("room ids", () => {
  assert.equal(roomIdDm("b", "a"), "dm:a:b");
  assert.equal(roomIdGroup("g1"), "group:g1");
  assert.equal(roomIdServer("c1"), "server:c1");
  assert.equal(parseRoomId("dm:a:b").kind, "dm");
  assert.equal(parseRoomId("group:g1").key, "g1");
  assert.equal(parseRoomId("nope"), null);
});

test("userInRoom false for garbage", () => {
  resetLive();
  assert.equal(userInRoom("x", "garbage"), false);
});

test("joinLive for server without occupancy is ignored", () => {
  resetLive();
  assert.equal(joinLive("server:c1", "u1", { channelName: "General" }), false);
  assert.equal(listRooms("server").length, 0);
  assert.equal(userInRoom("u1", "server:c1"), false);
});

test("one-person group still lists", () => {
  resetLive();
  assert.equal(joinLive("group:g1", "solo", { groupName: "Smoke" }), true);
  const rooms = listRooms("group");
  assert.equal(rooms.length, 1);
  assert.equal(rooms[0].participants.length, 1);
  leaveLive("group:g1", "solo");
});

test("dm join only if emitter is a peer", () => {
  resetLive();
  assert.equal(joinLive("dm:a:b", "z"), false);
  assert.equal(joinLive("dm:a:b", "a"), true);
  assert.equal(listRooms("dm").length, 1);
  leaveLive("dm:a:b", "a");
});

test("listRooms includes a live-Map-only room", () => {
  resetLive();
  setSpeaking("dm:p1:p2", "p1", { speaking: true, level: 0.6 });
  const rooms = listRooms("dm");
  const hit = rooms.find((r) => r.id === "dm:p1:p2");
  assert.ok(hit, "live-map-only DM must appear without occupancy");
  assert.ok(hit.participants.some((p) => p.id === "p1"));
  resetLive();
});

test("1-person server occupancy still lists", () => {
  resetLive();
  activeServerVoiceCalls.set("c-solo", {
    serverId: "s1",
    channelName: "General",
    participants: new Map([["u1", { id: "u1", username: "alice" }]]),
    startTime: Date.now(),
  });
  try {
    const rooms = listRooms("server");
    const hit = rooms.find((r) => r.id === "server:c-solo");
    assert.ok(hit, "solo user in a server channel must still list");
    assert.equal(hit.liveCount, 1);
    assert.equal(hit.participants[0].id, "u1");
  } finally {
    activeServerVoiceCalls.delete("c-solo");
  }
});

test("userInRoom true for live-map speaker", () => {
  resetLive();
  setSpeaking("server:c-speak", "u8", { speaking: true, level: 0.4 });
  assert.equal(userInRoom("u8", "server:c-speak"), true);
  resetLive();
});

test("dropRoom clears occupancy-backed live row", () => {
  resetLive();
  activeServerVoiceCalls.set("c-stale", {
    serverId: "s1",
    channelName: "General",
    participants: new Map([["u1", { id: "u1", username: "alice" }]]),
    startTime: Date.now(),
  });
  try {
    assert.equal(joinLive("server:c-stale", "u1", { channelName: "General" }), true);
    assert.equal(listRooms("server").some((r) => r.id === "server:c-stale"), true);
  } finally {
    activeServerVoiceCalls.delete("c-stale");
  }
  dropRoom("server:c-stale");
  assert.equal(listRooms("server").some((r) => r.id === "server:c-stale"), false);
});

test("named live leftover after occupancy hangup is not listed", () => {
  resetLive();
  activeServerVoiceCalls.set("c-name", {
    serverId: "s1",
    channelName: "General",
    participants: new Map([["u1", { id: "u1", username: "alice" }]]),
    startTime: Date.now(),
  });
  try {
    const named = listRooms("server").find((r) => r.id === "server:c-name");
    assert.equal(named.title, "General");
    setSpeaking("server:c-name", "u1", { speaking: true, level: 0.2 });
  } finally {
    activeServerVoiceCalls.delete("c-name");
  }
  const leftover = listRooms("server").find((r) => r.id === "server:c-name");
  assert.equal(leftover, undefined, "hangup occupancy drop must hide Admin Canlı");
  dropRoom("server:c-name");
  assert.equal(listRooms("server").some((r) => r.id === "server:c-name"), false);
});

test("speaking without occupancy does not list a server room", () => {
  resetLive();
  setSpeaking("server:c-tap", "u1", { speaking: true, level: 0.8 });
  assert.equal(listRooms("server").some((r) => r.id === "server:c-tap"), false);
  resetLive();
});

test("unnamed live-only server room is not listed", () => {
  resetLive();
  setSpeaking("server:ghost", "u1", { speaking: true, level: 0.9 });
  assert.equal(listRooms("server").some((r) => r.id === "server:ghost"), false);
  resetLive();
});

test("leaveUser clears every ghost room for that user", () => {
  resetLive();
  activeServerVoiceCalls.set("a", {
    serverId: "s1",
    channelName: "General",
    participants: new Map([["u1", { id: "u1", username: "alice" }]]),
    startTime: Date.now(),
  });
  try {
    joinLive("server:a", "u1", { channelName: "General" });
    setSpeaking("server:ghost", "u1", { speaking: true, level: 0.4 });
    leaveUser("u1");
    activeServerVoiceCalls.delete("a");
    assert.equal(listRooms("server").some((r) => (r.participants || []).some((p) => p.id === "u1")), false);
  } finally {
    activeServerVoiceCalls.delete("a");
  }
});

test("joinLive drops the user from other live rooms", () => {
  resetLive();
  activeServerVoiceCalls.set("old", {
    serverId: "s1",
    channelName: "Old",
    participants: new Map([["u1", { id: "u1", username: "alice" }]]),
    startTime: Date.now(),
  });
  activeServerVoiceCalls.set("new", {
    serverId: "s1",
    channelName: "General",
    participants: new Map([["u1", { id: "u1", username: "alice" }]]),
    startTime: Date.now(),
  });
  try {
    assert.equal(joinLive("server:old", "u1", { channelName: "Old" }), true);
    assert.equal(joinLive("server:new", "u1", { channelName: "General" }), true);
    activeServerVoiceCalls.delete("old");
    const rooms = listRooms("server");
    assert.equal(rooms.some((r) => r.id === "server:old"), false);
    assert.equal(rooms.some((r) => r.id === "server:new"), true);
    assert.equal(userInRoom("u1", "server:new"), true);
  } finally {
    activeServerVoiceCalls.delete("old");
    activeServerVoiceCalls.delete("new");
    resetLive();
  }
});
