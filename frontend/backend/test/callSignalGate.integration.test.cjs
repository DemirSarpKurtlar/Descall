"use strict";

/**
 * Regression (security scan 17 Nov 2026): call:answer, call:ice-candidate, call:media-state
 * and screen:share-start were relayed to ANY user id (strangers and blocked users included,
 * any payload size). They now reach only someone with a tracked call or a friend.
 * Harness copied from callSignalAck.integration.test.cjs (bob and carol are not friends).
 * Run: node test/callSignalGate.integration.test.cjs
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
process.env.NODE_ENV = "test";

const path = require("path");
const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const USERS = {
  alice: { id: "u-alice", username: "alice" },
  bob: { id: "u-bob", username: "bob" },
  carol: { id: "u-carol", username: "carol" },
};
const GROUP_ID = "g-1";

const fakeSupabase = createFakeSupabase({
  users: Object.values(USERS).map((u) => ({ ...u, blocked_users: [] })),
  friendships: [
    { id: "f1", user_id: USERS.alice.id, friend_id: USERS.bob.id, status: "accepted" },
    { id: "f2", user_id: USERS.alice.id, friend_id: USERS.carol.id, status: "accepted" },
  ],
  groups: [{ id: GROUP_ID, name: "Squad", avatar_url: null }],
  group_members: Object.values(USERS).map((u, i) => ({ id: `gm-${i}`, group_id: GROUP_ID, user_id: u.id })),
});
// Builder methods some boot paths use that the shared fake lacks: no-op filters.
{
  const probe = fakeSupabase.from("__probe__");
  const proto = Object.getPrototypeOf(probe);
  for (const m of ["lt", "lte", "range", "contains", "filter", "match", "returns", "abortSignal", "like", "overlaps", "textSearch"]) {
    if (!proto[m]) proto[m] = function () { return this; };
  }
  // Real supabase-js resolves asynchronously; the shared fake resolves inside
  // .then() synchronously, which would run "after insert" callbacks before
  // the handler's next line (e.g. before activeGroupCalls.set).
  const syncThen = proto.then;
  proto.then = function (resolve, reject) {
    return Promise.resolve().then(() => new Promise((res, rej) => syncThen.call(this, res, rej))).then(resolve, reject);
  };
}
fakeSupabase.rpc = async () => ({ data: null, error: null });
fakeSupabase.storage = { from: () => ({ upload: async () => ({ data: null, error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) };

function stubModule(rel, exportsObj) {
  const p = require.resolve(rel);
  require.cache[p] = { id: p, filename: p, loaded: true, exports: exportsObj };
}
stubModule("../db/supabase", fakeSupabase);
// No real pushes from a test.
const asyncNoop = new Proxy({}, { get: () => async () => ({ ok: true }) });
stubModule("../lib/webPush", asyncNoop);
stubModule("../lib/voipPush", asyncNoop);

const express = require("express");
const { Server } = require("socket.io");
const { io: ioClient } = require(path.join(__dirname, "../../node_modules/socket.io-client"));
const clock = require("../lib/callClock");
const { registerSocketHandlers } = require("../socket/handlers");
const dmCallLog = require("../lib/dmCallLog");
const callsRouter = require("../routes/calls");

let offsetMs = 0;
const realNow = Date.now;
clock.now = () => realNow() + offsetMs;
function advance(seconds) {
  offsetMs += seconds * 1000;
}

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}
function assertEq(actual, expected, msg) {
  if (actual !== expected) throw new Error(`FAIL: ${msg} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

let port;
const OFFER = { type: "offer", sdp: "v=0 fake-offer" };
const ANSWER = { type: "answer", sdp: "v=0 fake-answer" };

async function start() {
  const app = express();
  app.use(express.json());
  app.use("/api/calls", callsRouter);
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: "*" } });
  app.set("io", io);
  io.use((socket, next) => {
    const u = USERS[socket.handshake.auth?.as];
    if (!u) return next(new Error("unknown test user"));
    socket.user = { ...u };
    next();
  });
  registerSocketHandlers(io);
  await new Promise((resolve) => server.listen(0, resolve));
  port = server.address().port;
  return { server, io };
}

const openSockets = new Set();
async function connect(as, extraAuth = {}) {
  const s = ioClient(`http://127.0.0.1:${port}`, {
    auth: { as, ...extraAuth },
    transports: ["websocket"],
    reconnection: false,
    forceNew: true,
  });
  openSockets.add(s);
  await new Promise((resolve, reject) => {
    s.once("connect", resolve);
    s.once("connect_error", reject);
  });
  await sleep(30); // let the server finish room joins
  return s;
}
async function disconnect(s) {
  s.disconnect();
  openSockets.delete(s);
  await sleep(30);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function waitFor(s, event, pred = () => true, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      s.off(event, handler);
      reject(new Error(`timeout waiting for ${event}`));
    }, timeoutMs);
    function handler(payload) {
      if (!pred(payload)) return;
      clearTimeout(t);
      s.off(event, handler);
      resolve(payload);
    }
    s.on(event, handler);
  });
}

function emitAck(s, event, payload, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`no ack for ${event}`)), timeoutMs);
    s.emit(event, payload, (res) => {
      clearTimeout(t);
      resolve(res);
    });
  });
}


async function noEvent(s, event, ms = 300) {
  try {
    await waitFor(s, event, () => true, ms);
    return false;
  } catch {
    return true;
  }
}

async function main() {
  const { server, io } = await start();
  try {
    const alice = await connect("alice");
    const bob = await connect("bob");
    const carol = await connect("carol");
    // A stranger (bob -> carol, not friends, no call): nothing is relayed.
    const silent = Promise.all([
      noEvent(carol, "call:answer"),
      noEvent(carol, "call:ice-candidate"),
      noEvent(carol, "call:media-state"),
      noEvent(carol, "screen:share-start"),
    ]);
    bob.emit("call:answer", { toUserId: USERS.carol.id, answer: ANSWER }, () => {});
    bob.emit("call:ice-candidate", { toUserId: USERS.carol.id, candidate: { candidate: "candidate:1 1 udp 1 1.2.3.4 5 typ host" } });
    bob.emit("call:media-state", { toUserId: USERS.carol.id, muted: true });
    bob.emit("screen:share-start", { toUserId: USERS.carol.id });
    const results = await silent;
    assert(results.every(Boolean), "nothing reaches a stranger: " + JSON.stringify(results));

    // A friend (alice -> bob) still gets ICE and media state.
    const gotIce = waitFor(bob, "call:ice-candidate");
    const gotMedia = waitFor(bob, "call:media-state");
    alice.emit("call:ice-candidate", { toUserId: USERS.bob.id, candidate: { candidate: "candidate:1 1 udp 1 1.2.3.4 5 typ host" } });
    alice.emit("call:media-state", { toUserId: USERS.bob.id, muted: true });
    assertEq((await gotIce).fromUserId, USERS.alice.id, "friend ICE delivered");
    assertEq((await gotMedia).fromUserId, USERS.alice.id, "friend media state delivered");

    // An oversized ICE payload is dropped even between friends.
    const quiet = noEvent(bob, "call:ice-candidate");
    alice.emit("call:ice-candidate", { toUserId: USERS.bob.id, candidate: { candidate: "x".repeat(20000) } });
    assert(await quiet, "oversized candidate dropped");
    console.log("callSignalGate integration: ok");
  } finally {
    for (const s of openSockets) s.disconnect();
    io.close();
    server.close();
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
