"use strict";

/**
 * /world namespace end to end on a real Socket.IO server:
 * gate (admin + desktop), call membership, relay of batched snapshots, chat,
 * 16 avatar cap, kick when the user leaves the call.
 * Run: node frontend/backend/socket/worldHandlers.selftest.cjs
 */

const assert = require("assert");
const http = require("http");
const { Server } = require("socket.io");
const { io: ioc } = require("socket.io-client");
const { registerWorldNamespace } = require("./worldHandlers");

const admins = new Set(["alice", "bob", "cara", "eve"]);
const sharedState = {
  activeGroupCalls: new Map([["g1", { participants: new Set(["alice", "bob"]) }]]),
  activeServerVoiceCalls: new Map([["c1", { participants: new Map([["alice", {}], ["cara", {}]]) }]]),
};

function fakeAuth(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Authentication required"));
  socket.user = { id: token, username: token };
  next();
}

function waitFor(socket, event, ms = 2000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    socket.once(event, (data) => {
      clearTimeout(t);
      resolve(data);
    });
  });
}

function emitAck(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

async function main() {
  const server = http.createServer();
  const io = new Server(server);
  const world = registerWorldNamespace(io, {
    sharedState,
    authMiddleware: fakeAuth,
    loadAdminRow: async (id) => ({ id, username: id, is_admin: admins.has(id) }),
    profileOf: (id) => ({ id, username: id, displayName: id.toUpperCase(), avatarUrl: null }),
  });
  await new Promise((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}/world`;
  const clients = [];
  const connect = (token, app = "web") => {
    const c = ioc(url, { auth: { token, app }, transports: ["websocket"], forceNew: true, reconnection: false });
    clients.push(c);
    return c;
  };
  const connected = (c) =>
    new Promise((resolve) => {
      c.once("connect", () => resolve({ ok: true }));
      c.once("connect_error", (err) => resolve({ ok: false, error: err.message }));
    });

  try {
    // Gate.
    assert.deepStrictEqual(await connected(connect("dave")), { ok: false, error: "WORLD_DISABLED" }, "non-admin is refused");
    assert.deepStrictEqual(await connected(connect("alice", "ios")), { ok: false, error: "WORLD_PLATFORM" }, "iOS is refused");
    assert.deepStrictEqual(await connected(connect("alice", "android")), { ok: false, error: "WORLD_PLATFORM" });

    const alice = connect("alice", "electron");
    const bob = connect("bob");
    const eve = connect("eve");
    assert.ok((await connected(alice)).ok);
    assert.ok((await connected(bob)).ok);
    assert.ok((await connected(eve)).ok);

    // Authorization: must be in the live call.
    assert.deepStrictEqual(await emitAck(eve, "world:join", { kind: "group", id: "g1" }), { ok: false, error: "not_in_call" });
    assert.deepStrictEqual(await emitAck(eve, "world:join", { kind: "voice", id: "c1" }), { ok: false, error: "not_in_call" });
    assert.deepStrictEqual(await emitAck(alice, "world:join", { kind: "nope", id: "g1" }), { ok: false, error: "kind" });

    const a = await emitAck(alice, "world:join", { kind: "group", id: "g1" });
    assert.strictEqual(a.ok, true);
    assert.strictEqual(a.self, "alice");
    assert.strictEqual(a.maxAvatars, 16);
    assert.deepStrictEqual(a.members.map((m) => m.id), ["alice"]);

    const joinSeen = waitFor(alice, "world:member");
    const b = await emitAck(bob, "world:join", { kind: "group", id: "g1" });
    assert.deepStrictEqual(b.members.map((m) => m.id).sort(), ["alice", "bob"]);
    const joined = await joinSeen;
    assert.strictEqual(joined.type, "join");
    assert.strictEqual(joined.member.id, "bob");
    assert.strictEqual(joined.member.displayName, "BOB");

    // Snapshots: bob moves, alice receives one batch with server time.
    const snaps = waitFor(alice, "world:snaps");
    bob.emit("world:snap", [1.5, 0, 2.25, 0.5, 1, 0, 0, -1]);
    const batch = await snaps;
    assert.ok(Number.isFinite(batch.t));
    assert.deepStrictEqual(batch.s, [["bob", 1.5, 0, 2.25, 0.5, 1, 0, 0, -1]]);
    // Garbage is dropped, not relayed.
    bob.emit("world:snap", ["x"]);
    bob.emit("world:snap", { not: "an array" });

    // Chat relays to the room, cleaned and capped.
    const chat = waitFor(alice, "world:chat");
    const ack = await emitAck(bob, "world:chat", { text: "  merhaba\n  oda " });
    assert.strictEqual(ack.ok, true);
    const msg = await chat;
    assert.strictEqual(msg.text, "merhaba oda");
    assert.strictEqual(msg.userId, "bob");
    assert.deepStrictEqual(await emitAck(eve, "world:chat", { text: "hi" }), { ok: false, error: "not_joined" });

    // Leaving the call kicks the user out of the world on the next recheck.
    // (Trigger by dropping bob from the call and waiting for the 5 s sweep.)
    sharedState.activeGroupCalls.get("g1").participants.delete("bob");
    const kicked = waitFor(bob, "world:kicked", 7000);
    const left = waitFor(alice, "world:member", 7000);
    assert.strictEqual((await kicked).reason, "not_in_call");
    const leftMsg = await left;
    assert.deepStrictEqual(leftMsg, { type: "leave", id: "bob" });

    // Cap: 16 avatars per call.
    const big = new Set();
    for (let i = 0; i < 17; i += 1) big.add(`u${i}`);
    sharedState.activeServerVoiceCalls.set("c2", { participants: new Map([...big].map((id) => [id, {}])) });
    for (const id of big) admins.add(id);
    const crowd = [...big].map((id) => connect(id));
    await Promise.all(crowd.map(connected));
    const results = [];
    for (const c of crowd) results.push(await emitAck(c, "world:join", { kind: "voice", id: "c2" }));
    assert.strictEqual(results.filter((r) => r.ok).length, 16);
    assert.deepStrictEqual(results[16], { ok: false, error: "full" });
  } finally {
    for (const c of clients) c.close();
    world.stop();
    io.close();
    server.close();
  }
  console.log("worldHandlers.selftest: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
