"use strict";

/**
 * A logged-in user who is not in the group cannot start a call, read the
 * banner, or inject SDP/ICE. Members can, and media is relayed only after
 * both people are in the live call.
 * Run: node frontend/backend/socket/groupCallMembership.selftest.cjs
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const { createFakeSupabase } = require("../test/fakeSupabase.cjs");

const supabasePath = require.resolve("../db/supabase");
const fakeSupabase = createFakeSupabase({
  users: [
    { id: "alice", username: "alice" },
    { id: "bob", username: "bob" },
    { id: "cara", username: "cara" },
    { id: "eve", username: "eve" },
  ],
  groups: [{ id: "g1", name: "Squad" }],
  group_members: [
    { group_id: "g1", user_id: "alice" },
    { group_id: "g1", user_id: "bob" },
  ],
  group_calls: [],
});
require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: fakeSupabase,
};

function stubModule(rel, exportsObj) {
  const resolved = require.resolve(rel);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exportsObj };
}
stubModule("../lib/webPush", new Proxy({}, { get: () => async () => ({ ok: true }) }));

const { registerGroupHandlers } = require("./groupHandlers");
const { activeGroupCalls } = require("../runtime/sharedState");
const { bothInGroupCall, assertGroupMember, resetGroupMemberCache } = require("../lib/groupCallMembership");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

function createHarness() {
  const sockets = new Map();
  const io = {
    emit() {},
    to(room) {
      return {
        emit(event, payload) {
          const ids = io.sockets.adapter.rooms.get(room);
          if (!ids) return;
          for (const id of ids) sockets.get(id)?.emit(event, payload);
        },
      };
    },
    sockets: { adapter: { rooms: new Map() }, sockets },
  };

  function connect(user) {
    const handlers = {};
    const events = [];
    const socket = {
      id: `s-${user.id}`,
      user,
      handshake: { auth: {} },
      data: {},
      join(room) {
        let set = io.sockets.adapter.rooms.get(room);
        if (!set) {
          set = new Set();
          io.sockets.adapter.rooms.set(room, set);
        }
        set.add(socket.id);
      },
      emit(name, payload) {
        events.push({ name, payload });
      },
      on(name, fn) {
        handlers[name] = fn;
      },
      to(room) {
        return io.to(room);
      },
    };
    socket.join(`user:${user.id}`);
    sockets.set(socket.id, socket);
    registerGroupHandlers(io, socket);
    return {
      events,
      emit(name, payload) {
        return handlers[name]?.(payload);
      },
    };
  }

  return { connect };
}

(async () => {
  resetGroupMemberCache();
  activeGroupCalls.clear();

  const calls = new Map();
  calls.set("g", { participants: new Set(["a", "b"]) });
  assert(bothInGroupCall(calls, "g", "a", "b"), "both participants relay");
  assert(!bothInGroupCall(calls, "g", "a", "c"), "outsider does not relay");
  assert(!bothInGroupCall(calls, "g", "a", "a"), "a user is not a peer of themselves");

  const broken = {
    from() {
      const query = {
        select() { return query; },
        eq() { return query; },
        maybeSingle() { return query; },
        then(resolve) {
          resolve({ data: null, error: { message: "db down" } });
        },
      };
      return query;
    },
  };
  assert(await assertGroupMember(broken, "g1", "alice") === false, "membership fails closed");

  const { connect } = createHarness();
  const alice = connect({ id: "alice", username: "alice" });
  const bob = connect({ id: "bob", username: "bob" });
  const cara = connect({ id: "cara", username: "cara" });
  const eve = connect({ id: "eve", username: "eve" });

  await cara.emit("group:call:start", { groupId: "g1", callType: "voice", memberIds: ["bob", "alice"] });
  assert(!activeGroupCalls.has("g1"), "non-member does not create a call");
  assert(cara.events.some((event) => event.name === "group:call:error" && event.payload?.code === "not_member"), "non-member gets an error");
  assert(!bob.events.some((event) => event.name === "group:call:incoming"), "non-member does not ring the group");

  await cara.emit("group:call:check", { groupId: "g1" });
  assert(!cara.events.some((event) => event.name === "group:call:banner-update"), "non-member does not see the banner");

  await alice.emit("group:call:start", { groupId: "g1", callType: "voice", memberIds: ["bob", "eve"] });
  assert(activeGroupCalls.get("g1")?.participants?.has("alice"), "member starts the call");
  assert(bob.events.some((event) => event.name === "group:call:incoming"), "a real member is rung");
  assert(!eve.events.some((event) => event.name === "group:call:incoming"), "a non-member id in memberIds is not rung");

  await alice.emit("group:call:check", { groupId: "g1" });
  assert(alice.events.some((event) => event.name === "group:call:banner-update" && event.payload?.banner), "member sees the banner");

  bob.events.length = 0;
  await cara.emit("group:call:offer", { groupId: "g1", toUserId: "alice", offer: { type: "offer", sdp: "no" } });
  await cara.emit("group:call:ice", { groupId: "g1", toUserId: "alice", candidate: { candidate: "x" } });
  assert(!alice.events.some((event) => event.name === "group:call:offer" || event.name === "group:call:ice"), "non-member SDP is dropped");

  await alice.emit("group:call:offer", { groupId: "g1", toUserId: "bob", offer: { type: "offer", sdp: "early" } });
  assert(!bob.events.some((event) => event.name === "group:call:offer"), "offer waits until bob has joined");

  await bob.emit("group:call:accept", { groupId: "g1", toUserId: "alice" });
  assert(activeGroupCalls.get("g1").participants.has("bob"), "accept adds the member");
  assert(alice.events.some((event) => event.name === "group:call:accepted"), "initiator hears the accept");

  await alice.emit("group:call:offer", { groupId: "g1", toUserId: "bob", offer: { type: "offer", sdp: "ok" } });
  await bob.emit("group:call:answer", { groupId: "g1", toUserId: "alice", answer: { type: "answer", sdp: "ok" } });
  await alice.emit("group:call:ice", { groupId: "g1", toUserId: "bob", candidate: { candidate: "y" } });
  assert(bob.events.some((event) => event.name === "group:call:offer"), "member offer is relayed");
  assert(alice.events.some((event) => event.name === "group:call:answer"), "member answer is relayed");
  assert(bob.events.some((event) => event.name === "group:call:ice"), "member ICE is relayed");

  alice.events.length = 0;
  await cara.emit("group:call:accept", { groupId: "g1", toUserId: "alice" });
  assert(!activeGroupCalls.get("g1").participants.has("cara"), "non-member accept does not join");
  assert(!alice.events.some((event) => event.name === "group:call:accepted"), "non-member accept is not relayed");

  console.log("groupCallMembership.selftest: ok");
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
