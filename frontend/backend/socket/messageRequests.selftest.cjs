"use strict";

/**
 * Non-friends must not persist a DM or ring a call. Friends still do both.
 * Run: node frontend/backend/socket/messageRequests.selftest.cjs
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const { createFakeSupabase } = require("../test/fakeSupabase.cjs");

const supabasePath = require.resolve("../db/supabase");
const fakeSupabase = createFakeSupabase({
  users: [
    { id: "alice", username: "alice", blocked_users: [] },
    { id: "bob", username: "bob", blocked_users: ["dave"] },
    { id: "cara", username: "cara", blocked_users: [] },
    { id: "dave", username: "dave", blocked_users: [] },
  ],
  friendships: [],
  dm_messages: [],
  dm_message_requests: [],
});
require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: fakeSupabase,
};

const { registerSocketHandlers } = require("./handlers");
const { friends, rateLimitDm } = require("../runtime/sharedState");
const { resetMessageRequests } = require("../lib/messageRequestStore");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

function createHarness() {
  const sockets = new Map();
  let onConnection = null;
  const io = {
    on(event, fn) {
      if (event === "connection") onConnection = fn;
    },
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
      id: `s-${user.id}-${sockets.size}`,
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
      to() {
        return { emit() {} };
      },
    };
    sockets.set(socket.id, socket);
    onConnection(socket);
    return {
      socket,
      events,
      emit(name, payload) {
        return handlers[name]?.(payload);
      },
    };
  }

  return { io, connect };
}

function waitFor(events, name, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const hit = events.find((event) => event.name === name);
      if (hit) return resolve(hit);
      if (Date.now() - start > timeout) return reject(new Error(`timeout waiting for ${name}`));
      setTimeout(tick, 15);
    };
    tick();
  });
}

function dmRows() {
  return fakeSupabase._tables.dm_messages.rows;
}

(async () => {
  resetMessageRequests();
  const { io, connect } = createHarness();
  registerSocketHandlers(io);

  const alice = connect({ id: "alice", username: "alice" });
  const bob = connect({ id: "bob", username: "bob" });
  const cara = connect({ id: "cara", username: "cara" });
  const dave = connect({ id: "dave", username: "dave" });
  await Promise.all([
    waitFor(alice.events, "friend:list"),
    waitFor(bob.events, "friend:list"),
    waitFor(cara.events, "friend:list"),
    waitFor(dave.events, "friend:list"),
  ]);

  friends.set("alice", new Set(["bob"]));
  friends.set("bob", new Set(["alice"]));
  friends.set("cara", new Set());
  friends.set("dave", new Set());

  await alice.emit("dm:send", { toUserId: "bob", tempId: "t-friend", text: "hey bob" });
  assert(dmRows().some((row) => row.from_user_id === "alice" && row.content === "hey bob"), "friend DM is stored");
  assert(bob.events.some((event) => event.name === "dm:message"), "friend DM is delivered");

  const beforeStranger = dmRows().length;
  await cara.emit("dm:send", { toUserId: "bob", tempId: "t-req", text: "can we talk" });
  assert(dmRows().length === beforeStranger, "stranger DM is not stored");
  assert(alice.events.filter((event) => event.name === "dm:message").length >= 1, "friend delivery still happened");
  assert(!bob.events.some((event) => event.name === "dm:message" && event.payload?.text === "can we talk"), "stranger text is not a DM");
  assert(cara.events.some((event) => event.name === "dm:request:sent" && event.payload?.tempId === "t-req"), "sender hears request sent");
  assert(bob.events.some((event) => event.name === "dm:request:incoming"), "recipient gets the request");
  const inbox = bob.events.filter((event) => event.name === "dm:requests").pop();
  assert(inbox && inbox.payload.some((row) => row.id === "cara" && row.preview === "can we talk"), "inbox lists the request");

  const beforeBlocked = dmRows().length;
  await dave.emit("dm:send", { toUserId: "bob", tempId: "t-block", text: "nope" });
  assert(dmRows().length === beforeBlocked, "blocked DM is not stored");
  assert(dave.events.some((event) => event.name === "dm:error"), "blocked sender gets an error");
  assert(!bob.events.some((event) => event.name === "dm:request:incoming" && event.payload?.request?.id === "dave"), "blocked user creates no request");

  bob.events.length = 0;
  await cara.emit("call:offer", { toUserId: "bob", offer: { type: "offer", sdp: "x" }, callType: "voice", renegotiate: true });
  assert(cara.events.some((event) => event.name === "call:error" && event.payload?.code === "not_friends"), "stranger call is refused");
  assert(!bob.events.some((event) => event.name === "call:offer"), "stranger call does not ring, even with renegotiate");

  await alice.emit("call:offer", { toUserId: "bob", offer: { type: "offer", sdp: "y" }, callType: "voice" });
  assert(bob.events.some((event) => event.name === "call:offer"), "friend call still rings");

  rateLimitDm.delete("cara");
  await bob.emit("dm:request:accept", { fromUserId: "cara" });
  await waitFor(bob.events, "friend:list");
  assert(friends.get("bob")?.has("cara"), "accept adds the sender as a friend");
  assert(friends.get("cara")?.has("bob"), "accept adds the recipient as a friend");

  await cara.emit("dm:send", { toUserId: "bob", tempId: "t-after", text: "now friends" });
  assert(dmRows().some((row) => row.content === "now friends"), "accepted request unlocks DMs");

  console.log("messageRequests.selftest: ok");
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
