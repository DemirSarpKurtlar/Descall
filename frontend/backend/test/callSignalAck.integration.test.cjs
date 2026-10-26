"use strict";

/**
 * 3.0.0 (C3) call signaling reliability, against the real socket handlers
 * and the in-memory fake Supabase (harness shared with
 * callSummary.integration.test.cjs):
 *   - call:offer / call:answer / call:end / call:cancel / call:decline ack
 *   - backend restart mid-ring: callee ring-status "unknown" (keeps ringing),
 *     caller-resume:result "unknown" → re-sent offer rings again
 *   - a declined ring the caller missed: caller-resume:result "ended"
 * Run: node test/callSignalAck.integration.test.cjs
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

async function scenarios() {
  // Acks on every call signal.
  {
    const alice = await connect("alice");
    const bob = await connect("bob");
    const gotOffer = waitFor(bob, "call:offer");
    const a1 = await emitAck(alice, "call:offer", { toUserId: USERS.bob.id, offer: OFFER, callType: "voice", renegotiate: false });
    assertEq(a1?.ok, true, "offer acked");
    await gotOffer;
    const gotAnswer = waitFor(alice, "call:answer");
    const a2 = await emitAck(bob, "call:answer", { toUserId: USERS.alice.id, answer: ANSWER });
    assertEq(a2?.ok, true, "answer acked");
    await gotAnswer;
    const a3 = await emitAck(alice, "call:end", { toUserId: USERS.bob.id });
    assertEq(a3?.ok, true, "end acked");
    const a4 = await emitAck(alice, "call:end", { toUserId: USERS.bob.id });
    assertEq(a4?.ok, true, "a re-sent end is acked and harmless");
    await disconnect(alice);
    await disconnect(bob);
    advance(200);
    console.log("ok - offer / answer / end acked");
  }

  // Backend restart mid-ring → "unknown" on both sides; the re-sent offer rings again.
  {
    const alice = await connect("alice");
    const bob = await connect("bob");
    const first = waitFor(bob, "call:offer");
    alice.emit("call:offer", { toUserId: USERS.bob.id, offer: OFFER, callType: "voice", renegotiate: false });
    await first;
    dmCallLog._resetDmCallStateForTests();
    const status = waitFor(bob, "call:ring-status:result");
    bob.emit("call:ring-status", { fromUserId: USERS.alice.id });
    assertEq((await status).state, "unknown", "callee keeps ringing after a restart");
    const resume = waitFor(alice, "call:caller-resume:result");
    alice.emit("call:caller-resume", { toUserId: USERS.bob.id });
    assertEq((await resume).state, "unknown", "caller learns the ring was lost");
    const again = waitFor(bob, "call:offer");
    await emitAck(alice, "call:offer", { toUserId: USERS.bob.id, offer: OFFER, callType: "voice", renegotiate: false });
    const re = await again;
    assert(re.callUuid, "re-sent offer carries a ring id");
    const status2 = waitFor(bob, "call:ring-status:result");
    bob.emit("call:ring-status", { fromUserId: USERS.alice.id });
    assertEq((await status2).state, "ringing", "ring tracked again");
    const cancelled = await emitAck(alice, "call:cancel", { toUserId: USERS.bob.id });
    assertEq(cancelled?.ok, true, "cancel acked");
    await disconnect(alice);
    await disconnect(bob);
    advance(200);
    console.log("ok - backend restart mid-ring: unknown → re-sent offer rings again");
  }

  // A decline the caller missed → "ended".
  {
    const alice = await connect("alice");
    const bob = await connect("bob");
    const got = waitFor(bob, "call:offer");
    alice.emit("call:offer", { toUserId: USERS.bob.id, offer: OFFER, callType: "voice", renegotiate: false });
    await got;
    const d = await emitAck(bob, "call:decline", { toUserId: USERS.alice.id });
    assertEq(d?.ok, true, "decline acked");
    await sleep(30);
    const resume = waitFor(alice, "call:caller-resume:result");
    alice.emit("call:caller-resume", { toUserId: USERS.bob.id });
    assertEq((await resume).state, "ended", "missed decline reported as ended");
    const status = waitFor(bob, "call:ring-status:result");
    bob.emit("call:ring-status", { fromUserId: USERS.alice.id });
    assertEq((await status).state, "ended", "callee: ended, not unknown");
    await disconnect(alice);
    await disconnect(bob);
    console.log("ok - missed decline → caller-resume ended");
  }
}

(async () => {
  const { server, io } = await start();
  let failed = false;
  try {
    await scenarios();
    console.log("\ncallSignalAck integration: all scenarios passed");
  } catch (err) {
    failed = true;
    console.error(err);
  } finally {
    for (const s of openSockets) s.disconnect();
    io.close();
    server.close();
    process.exit(failed ? 1 : 0);
  }
})();
