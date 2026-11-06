"use strict";

/**
 * Regression: a message sent from one of the user's devices (e.g. iOS) must
 * appear live on their other open sessions (Electron / web). Covers DM fan-out
 * through the real dm:send handler.
 *
 * Run: node frontend/backend/socket/multiDeviceMessage.selftest.cjs
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const { createFakeSupabase } = require("../test/fakeSupabase.cjs");

const supabasePath = require.resolve("../db/supabase");
const fakeSupabase = createFakeSupabase({
  users: [
    { id: "alice", username: "alice", blocked_users: [] },
    { id: "bob", username: "bob", blocked_users: [] },
  ],
  friendships: [
    { user_id: "alice", friend_id: "bob" },
    { user_id: "bob", friend_id: "alice" },
  ],
  dm_messages: [],
  dm_message_requests: [],
});
require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: fakeSupabase,
};

function stubModule(rel, exportsObj) {
  const resolved = require.resolve(rel);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: exportsObj,
  };
}
const pushNoop = new Proxy({}, { get: () => async () => ({ ok: true }) });
stubModule("../lib/webPush", pushNoop);
stubModule("../lib/voipPush", pushNoop);
stubModule("../lib/fcm", pushNoop);

const { registerSocketHandlers } = require("./handlers");
const { friends } = require("../runtime/sharedState");
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
        except(exceptId) {
          return {
            emit(event, payload) {
              const ids = io.sockets.adapter.rooms.get(room);
              if (!ids) return;
              for (const id of ids) {
                if (id === exceptId) continue;
                sockets.get(id)?.emit(event, payload);
              }
            },
          };
        },
      };
    },
    sockets: { adapter: { rooms: new Map() }, sockets },
  };

  function connect(user, platform) {
    const handlers = {};
    const events = [];
    const socket = {
      id: `s-${user.id}-${platform || "web"}-${sockets.size}`,
      user,
      handshake: { auth: platform ? { platform } : {} },
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
      platform: platform || "unknown",
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

function waitForDm(events, text, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const hit = events.find((e) => e.name === "dm:message" && e.payload?.text === text);
      if (hit) return resolve(hit);
      if (Date.now() - start > timeout) return reject(new Error(`timeout waiting for dm:message ${text}`));
      setTimeout(tick, 15);
    };
    tick();
  });
}

(async () => {
  resetMessageRequests();
  const { io, connect } = createHarness();
  registerSocketHandlers(io);

  // Alice on iOS + Electron + a third session with no platform hint
  const aliceIos = connect({ id: "alice", username: "alice" }, "ios");
  const aliceElectron = connect({ id: "alice", username: "alice" }, "electron");
  const aliceUnknown = connect({ id: "alice", username: "alice" }, null);
  const bob = connect({ id: "bob", username: "bob" }, "web");

  await Promise.all([
    waitFor(aliceIos.events, "friend:list"),
    waitFor(aliceElectron.events, "friend:list"),
    waitFor(aliceUnknown.events, "friend:list"),
    waitFor(bob.events, "friend:list"),
  ]);

  friends.set("alice", new Set(["bob"]));
  friends.set("bob", new Set(["alice"]));

  // Clear connect noise
  for (const c of [aliceIos, aliceElectron, aliceUnknown, bob]) c.events.length = 0;

  await aliceIos.emit("dm:send", {
    toUserId: "bob",
    tempId: "temp-ios-xyz",
    text: "selam from ios",
  });

  const onElectron = await waitForDm(aliceElectron.events, "selam from ios");
  const onUnknown = await waitForDm(aliceUnknown.events, "selam from ios");
  const onIos = await waitForDm(aliceIos.events, "selam from ios");
  const onBob = await waitForDm(bob.events, "selam from ios");

  assert(onElectron.payload.from?.id === "alice" || onElectron.payload.from?.username === "alice", "electron sees alice as sender");
  assert(onElectron.payload.convWith === "bob", "electron stores under the peer conversation");
  assert(onBob.payload.convWith === "alice", "bob stores under alice");
  assert(onIos.payload.tempId === "temp-ios-xyz", "sending iOS keeps tempId for optimistic replace");
  // Other devices may also see tempId (fanoutDmMessage includes it); client ignores unknown tempIds.
  assert(onUnknown.payload.id, "unknown-platform session got a real message id");
  assert(fakeSupabase._tables.dm_messages.rows.some((r) => r.content === "selam from ios"), "persisted for history reload");

  console.log("multiDeviceMessage.selftest: ok");
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
