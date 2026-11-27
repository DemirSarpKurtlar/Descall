"use strict";

/**
 * 27 Nov 2026 production bug: "iOS'ta arayınca Bağlanıyor'da takılıyor ve
 * arama sona eriyor, uygulamaya girmeyince oluyor aranan kişi".
 *
 * Root cause: call:offer awaits the block-list / friendship lookups before it
 * creates the ring record. The caller trickles its ICE candidates during that
 * await; bufferCallerIce found no ring and dropped them. A callee whose app
 * was not running (no socket: VoIP push, then call:resume-pending) got the
 * offer with zero caller candidates, answered, and ICE never connected.
 *
 * Against the real socket handlers + in-memory Supabase with a slow
 * block-list lookup:
 *   - ICE sent right after the offer reaches a VoIP-woken callee
 *   - a re-sent offer of the same ring keeps the buffered candidates
 *   - a new peer connection (new ufrag) does not reuse dead candidates
 *   - a refused offer (not friends) neither relays nor keeps its ICE
 * Run: node test/callColdIce.integration.test.cjs
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
  dave: { id: "u-dave", username: "dave" },
  erin: { id: "u-erin", username: "erin" },
};
let SLOW_BLOCK_LOOKUP_MS = 250;
const GROUP_ID = "g-1";

const fakeSupabase = createFakeSupabase({
  users: Object.values(USERS).map((u) => ({ ...u, blocked_users: [] })),
  friendships: [
    { id: "f1", user_id: USERS.alice.id, friend_id: USERS.bob.id, status: "accepted" },
    { id: "f2", user_id: USERS.alice.id, friend_id: USERS.carol.id, status: "accepted" },
    { id: "f3", user_id: USERS.alice.id, friend_id: USERS.dave.id, status: "accepted" },
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
    // Production 27 Nov 2026: right after a deploy the block-list cache is
    // cold and the database answered in seconds. The caller's ICE arrives
    // while call:offer awaits this lookup.
    const slow = this.name === "users" && /blocked_users/.test(String(this.cols || "")) ? SLOW_BLOCK_LOOKUP_MS : 0;
    const wait = slow ? new Promise((r) => setTimeout(r, slow)) : Promise.resolve();
    return wait.then(() => new Promise((res, rej) => syncThen.call(this, res, rej))).then(resolve, reject);
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


function offerWith(ufrag) {
  return { type: "offer", sdp: `v=0\r\na=ice-ufrag:${ufrag}\r\na=ice-pwd:x\r\n` };
}
function cand(ufrag, n) {
  return {
    candidate: `candidate:${n} 1 udp 2122260223 10.0.0.${n} 5${n}000 typ host generation 0 ufrag ${ufrag} network-id 1`,
    sdpMid: "0",
    sdpMLineIndex: 0,
    usernameFragment: ufrag,
  };
}

async function collect(s, event, ms) {
  const got = [];
  const h = (p) => got.push(p);
  s.on(event, h);
  await sleep(ms);
  s.off(event, h);
  return got;
}

async function scenarios() {
  // 1. Callee app not running: offer + immediate trickle, slow checks, then VoIP wake.
  {
    const alice = await connect("alice");
    alice.emit("call:offer", { toUserId: USERS.bob.id, offer: offerWith("ufA"), callType: "voice", renegotiate: false }, () => {});
    // Host / srflx / relay candidates trickle within milliseconds of the offer.
    for (let i = 1; i <= 3; i += 1) alice.emit("call:ice-candidate", { toUserId: USERS.bob.id, candidate: cand("ufA", i) });
    await sleep(SLOW_BLOCK_LOOKUP_MS + 150);
    const pending = dmCallLog.getPendingCall(USERS.alice.id, USERS.bob.id);
    assert(pending && pending.status === "ringing", "ring tracked after the slow checks");
    assertEq(pending.callerIce.length, 3, "early caller ICE joined the ring");

    // The iPhone wakes from the VoIP push and opens its native socket.
    const bob = await connect("bob", { client: "ios-native-call" });
    const offers = collect(bob, "call:offer", 200);
    const ice = collect(bob, "call:ice-candidate", 200);
    bob.emit("call:resume-pending", { callUuids: [pending.callUuid] });
    assertEq((await offers).length, 1, "woken callee gets the ringing offer");
    const replayed = await ice;
    assertEq(replayed.length, 3, "woken callee gets every caller candidate");
    assert(replayed.every((p) => p.fromUserId === USERS.alice.id), "candidates carry the caller id");

    // A late candidate (after tracking) is buffered too and relayed live.
    const live = waitFor(bob, "call:ice-candidate");
    alice.emit("call:ice-candidate", { toUserId: USERS.bob.id, candidate: cand("ufA", 4) });
    await live;
    assertEq(dmCallLog.getPendingCall(USERS.alice.id, USERS.bob.id).callerIce.length, 4, "late candidate buffered");

    const answered = waitFor(alice, "call:answer");
    bob.emit("call:answer", { toUserId: USERS.alice.id, answer: { type: "answer", sdp: "v=0 a" } }, () => {});
    await answered;
    await emitAck(alice, "call:end", { toUserId: USERS.bob.id });
    await disconnect(alice);
    await disconnect(bob);
    advance(200);
    console.log("ok - ICE trickled during the offer checks reaches a VoIP-woken callee");
  }

  // 2. Re-sent offer of the same ring keeps candidates; a new pc (new ufrag) drops the old ones.
  {
    dmCallLog._resetDmCallStateForTests();
    const alice = await connect("alice");
    await emitAck(alice, "call:offer", { toUserId: USERS.carol.id, offer: offerWith("ufB"), callType: "voice", renegotiate: false });
    for (let i = 1; i <= 2; i += 1) alice.emit("call:ice-candidate", { toUserId: USERS.carol.id, candidate: cand("ufB", i) });
    await sleep(SLOW_BLOCK_LOOKUP_MS + 150);
    const first = dmCallLog.getPendingCall(USERS.alice.id, USERS.carol.id);
    assertEq(first.callerIce.length, 2, "first offer buffered its ICE");
    // Ack retry / caller-resume "unknown": the same SDP again.
    await emitAck(alice, "call:offer", { toUserId: USERS.carol.id, offer: offerWith("ufB"), callType: "voice", renegotiate: false });
    await sleep(80);
    const again = dmCallLog.getPendingCall(USERS.alice.id, USERS.carol.id);
    assertEq(again.callUuid, first.callUuid, "same ring id");
    assertEq(again.callerIce.length, 2, "re-sent offer keeps the trickled candidates");
    // Caller rebuilt its peer connection (new ICE session).
    await emitAck(alice, "call:offer", { toUserId: USERS.carol.id, offer: offerWith("ufC"), callType: "voice", renegotiate: false });
    alice.emit("call:ice-candidate", { toUserId: USERS.carol.id, candidate: cand("ufC", 7) });
    await sleep(80);
    const rebuilt = dmCallLog.getPendingCall(USERS.alice.id, USERS.carol.id);
    assertEq(rebuilt.callerIce.length, 1, "candidates of the dead pc are not replayed");
    assert(rebuilt.callerIce[0].usernameFragment === "ufC", "only the new session's candidate");
    await emitAck(alice, "call:cancel", { toUserId: USERS.carol.id });
    await disconnect(alice);
    advance(200);
    console.log("ok - re-sent offer keeps ICE, new ICE session starts clean");
  }

  // 3. Refused offer (not friends): nothing relayed, nothing kept.
  {
    dmCallLog._resetDmCallStateForTests();
    const erin = await connect("erin");
    const alice = await connect("alice");
    const errors = collect(erin, "call:error", SLOW_BLOCK_LOOKUP_MS + 300);
    const relayed = collect(alice, "call:ice-candidate", SLOW_BLOCK_LOOKUP_MS + 300);
    erin.emit("call:offer", { toUserId: USERS.alice.id, offer: offerWith("ufE"), callType: "voice", renegotiate: false }, () => {});
    erin.emit("call:ice-candidate", { toUserId: USERS.alice.id, candidate: cand("ufE", 1) });
    assertEq((await errors).length, 1, "stranger's offer refused");
    assertEq((await relayed).length, 0, "stranger's ICE never relayed");
    assertEq(dmCallLog.getPendingCall(USERS.erin.id, USERS.alice.id), null, "no ring for a stranger");
    assertEq(dmCallLog.hasOfferInFlight(USERS.erin.id, USERS.alice.id), false, "early ICE dropped");
    // A candidate without any offer is never stored.
    erin.emit("call:ice-candidate", { toUserId: USERS.dave.id, candidate: cand("ufX", 1) });
    await sleep(60);
    assertEq(dmCallLog.hasOfferInFlight(USERS.erin.id, USERS.dave.id), false, "no offer, no early buffer");
    await disconnect(erin);
    await disconnect(alice);
    console.log("ok - refused offers keep and relay no ICE");
  }

  // 4. Fast path unchanged: callee online gets ICE live.
  {
    dmCallLog._resetDmCallStateForTests();
    SLOW_BLOCK_LOOKUP_MS = 0;
    const alice = await connect("alice");
    const dave = await connect("dave");
    const gotOffer = waitFor(dave, "call:offer");
    const live = collect(dave, "call:ice-candidate", 250);
    await emitAck(alice, "call:offer", { toUserId: USERS.dave.id, offer: offerWith("ufD"), callType: "voice", renegotiate: false });
    await gotOffer;
    alice.emit("call:ice-candidate", { toUserId: USERS.dave.id, candidate: cand("ufD", 1) });
    assertEq((await live).length, 1, "online callee gets the candidate live");
    await emitAck(alice, "call:cancel", { toUserId: USERS.dave.id });
    await disconnect(alice);
    await disconnect(dave);
    console.log("ok - online callee path unchanged");
  }
}

(async () => {
  const { server, io } = await start();
  try {
    await scenarios();
    console.log("\ncallColdIce integration: all scenarios passed");
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    for (const s of openSockets) s.disconnect();
    io.close();
    server.close();
    setTimeout(() => process.exit(process.exitCode || 0), 50);
  }
})();
