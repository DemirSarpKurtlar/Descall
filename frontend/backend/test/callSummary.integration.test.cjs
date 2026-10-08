"use strict";

/**
 * End-to-end call-summary test: a real Socket.IO server running the real
 * socket handlers (socket/handlers.js + groupHandlers.js) against the
 * in-memory fake Supabase, driven by real socket.io-client sockets.
 *
 * Asserts the ended-call card data (stored JSON + live dm:message /
 * group:call:summary payload + history reload via mapDmRow):
 *   - duration = time from connect (answer / second person joined) to end
 *   - participants = people who actually joined
 *   - missed / declined stay missed / declined with 1 participant
 * across: caller vs callee hang-up, socket reconnect mid-call, iOS locked
 * CallKit answer (voip-status + call:resume-pending), backend restart,
 * late decline, double end, group join / leave / rejoin.
 *
 * Time is fast-forwarded through lib/callClock (no real waiting).
 * Run: node test/callSummary.integration.test.cjs
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
const { loadDmMessages } = require("../lib/dmMessages");
const { signVoipStatus } = require("../lib/voipStatus");
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

const isSummary = (m) => m?.type === "call_summary";

function dmSummaryRows() {
  return (fakeSupabase._tables.dm_messages?.rows || [])
    .filter((r) => String(r.content || "").includes('"call_summary"'))
    .map((r) => ({ row: r, summary: JSON.parse(r.content) }));
}

/** Rings caller → callee and has the callee answer. Returns nothing. */
async function ringAndAnswer(caller, callee, callerName, calleeName, { ringSeconds = 0 } = {}) {
  const gotOffer = waitFor(callee, "call:offer");
  caller.emit("call:offer", { toUserId: USERS[calleeName].id, offer: OFFER, callType: "voice", renegotiate: false });
  await gotOffer;
  advance(ringSeconds);
  const gotAnswer = waitFor(caller, "call:answer");
  callee.emit("call:answer", { toUserId: USERS[callerName].id, answer: ANSWER });
  await gotAnswer;
}

/** Hang up from `ender`; resolve both sides' live summary payloads + the stored one. */
async function hangUp(ender, other, peerName, event = "call:end") {
  const before = dmSummaryRows().length;
  const a = waitFor(ender, "dm:message", isSummary);
  const b = waitFor(other, "dm:message", isSummary);
  ender.emit(event, { toUserId: USERS[peerName].id });
  const [mine, theirs] = await Promise.all([a, b]);
  await sleep(20);
  const rows = dmSummaryRows();
  assertEq(rows.length, before + 1, `exactly one stored summary for ${event}`);
  return { mine, theirs, stored: rows[rows.length - 1].summary, rowId: rows[rows.length - 1].row.id };
}

function expectCard(card, { status, duration, participants }, label) {
  assertEq(card.type, "call_summary", `${label}: type`);
  assertEq(card.status, status, `${label}: status`);
  assertEq(card.durationSeconds, duration, `${label}: durationSeconds`);
  assertEq(card.participantCount, participants, `${label}: participantCount`);
}

async function dmScenarios() {
  // 1) Caller hangs up after 75 s of talking (ringing 8 s is not counted).
  {
    const alice = await connect("alice");
    const bob = await connect("bob");
    await ringAndAnswer(alice, bob, "alice", "bob", { ringSeconds: 8 });
    advance(75);
    const r = await hangUp(alice, bob, "bob");
    expectCard(r.stored, { status: "completed", duration: 75, participants: 2 }, "caller end: stored JSON");
    expectCard(r.mine, { status: "completed", duration: 75, participants: 2 }, "caller end: live payload (caller)");
    expectCard(r.theirs, { status: "completed", duration: 75, participants: 2 }, "caller end: live payload (callee)");
    assert(r.stored.connectedAt, "caller end: connectedAt recorded");
    const call = fakeSupabase._tables.dm_calls.rows.at(-1);
    assertEq(call.duration_seconds, 75, "caller end: dm_calls.duration_seconds");
    assertEq(call.status, "completed", "caller end: dm_calls.status");

    // History reload (REST / socket history → mapDmRow) carries the numbers too.
    const { messages } = await loadDmMessages(USERS.bob.id, USERS.alice.id);
    const reloaded = messages.find((m) => m.id === r.rowId);
    assert(reloaded, "history: summary row reloaded");
    expectCard(reloaded, { status: "completed", duration: 75, participants: 2 }, "history reload");
    await disconnect(alice);
    await disconnect(bob);
    console.log("ok - DM: caller ends after 75s → 75s, 2 participants (live + stored + history)");
  }

  // 2) Callee hangs up after 2 min 5 s.
  {
    const alice = await connect("alice");
    const bob = await connect("bob");
    await ringAndAnswer(alice, bob, "alice", "bob", { ringSeconds: 3 });
    advance(125);
    const r = await hangUp(bob, alice, "alice");
    expectCard(r.stored, { status: "completed", duration: 125, participants: 2 }, "callee end");
    assertEq(r.stored.initiatorId, USERS.alice.id, "callee end: initiator stays the caller");
    await disconnect(alice);
    await disconnect(bob);
    console.log("ok - DM: callee ends after 125s → 125s, 2 participants");
  }

  // 3) Callee socket drops and reconnects mid-call, ICE-restarts, then ends.
  {
    const alice = await connect("alice");
    let bob = await connect("bob");
    await ringAndAnswer(alice, bob, "alice", "bob");
    advance(40);
    await disconnect(bob);
    advance(5);
    bob = await connect("bob");
    const gotRestart = waitFor(alice, "call:offer");
    bob.emit("call:offer", { toUserId: USERS.alice.id, offer: OFFER, callType: "voice", renegotiate: true });
    await gotRestart;
    const gotAns = waitFor(bob, "call:answer");
    alice.emit("call:answer", { toUserId: USERS.bob.id, answer: ANSWER }); // answer to the restart
    await gotAns;
    advance(30);
    // A legacy client renegotiation without the flag must not reset it either.
    alice.emit("call:offer", { toUserId: USERS.bob.id, offer: OFFER, callType: "video" });
    await waitFor(bob, "call:offer");
    advance(10);
    const r = await hangUp(bob, alice, "alice");
    expectCard(r.stored, { status: "completed", duration: 85, participants: 2 }, "reconnect mid-call");
    assertEq(r.stored.callType, "video", "reconnect: upgraded to video");
    await disconnect(alice);
    await disconnect(bob);
    console.log("ok - DM: reconnect + ICE restart + renegotiation keep the original connect time (85s)");
  }

  // 4) iOS locked-phone answer: CallKit answer → voip-status "answering" →
  //    unlock → socket reconnects → call:resume-pending → in-app answer.
  {
    const alice = await connect("alice");
    let bob = await connect("bob", { platform: "ios" });
    const offerP = waitFor(bob, "call:offer");
    alice.emit("call:offer", { toUserId: USERS.bob.id, offer: OFFER, callType: "voice", renegotiate: false });
    const { callUuid } = await offerP;
    assert(callUuid, "iOS: ring has a CallKit uuid");
    await disconnect(bob); // phone locked: web layer suspended
    advance(4);
    const res = await fetch(`http://127.0.0.1:${port}/api/calls/voip-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callUuid, calleeId: USERS.bob.id, token: signVoipStatus(callUuid, USERS.bob.id), status: "answering" }),
    });
    assertEq(res.status, 200, "iOS: voip-status answering accepted");
    advance(20); // unlocking
    bob = await connect("bob", { platform: "ios" });
    const replay = waitFor(bob, "call:offer", (p) => p?.resumed === true);
    bob.emit("call:resume-pending", { callUuids: [callUuid] });
    await replay;
    const gotAnswer = waitFor(alice, "call:answer");
    bob.emit("call:answer", { toUserId: USERS.alice.id, answer: ANSWER });
    await gotAnswer;
    advance(61);
    const r = await hangUp(alice, bob, "bob");
    expectCard(r.stored, { status: "completed", duration: 61, participants: 2 }, "iOS locked answer");
    await disconnect(alice);
    await disconnect(bob);
    console.log("ok - DM: iOS locked CallKit answer → duration from the in-app answer (61s)");
  }

  // 5) Backend restarted mid-call (in-memory call state lost): the peers'
  //    ICE restart re-establishes tracking; ending is not logged as missed.
  {
    const alice = await connect("alice");
    const bob = await connect("bob");
    await ringAndAnswer(alice, bob, "alice", "bob");
    advance(30);
    dmCallLog._resetDmCallStateForTests();
    alice.emit("call:offer", { toUserId: USERS.bob.id, offer: OFFER, callType: "voice", renegotiate: true });
    await waitFor(bob, "call:offer");
    advance(42);
    const r = await hangUp(alice, bob, "bob");
    expectCard(r.stored, { status: "completed", duration: 42, participants: 2 }, "backend restart");
    await disconnect(alice);
    await disconnect(bob);
    console.log("ok - DM: backend restart mid-call → completed (tracked from the ICE restart)");
  }

  // 6) Unanswered: caller cancels → missed, 1 participant, no duration.
  {
    const alice = await connect("alice");
    const bob = await connect("bob");
    alice.emit("call:offer", { toUserId: USERS.bob.id, offer: OFFER, callType: "voice", renegotiate: false });
    await waitFor(bob, "call:offer");
    advance(20);
    const r = await hangUp(alice, bob, "bob", "call:cancel");
    expectCard(r.stored, { status: "missed", duration: 0, participants: 1 }, "missed");
    expectCard(r.theirs, { status: "missed", duration: 0, participants: 1 }, "missed live");
    await disconnect(alice);
    await disconnect(bob);
    console.log("ok - DM: cancelled ring → missed, 1 participant");
  }

  // 7) Declined by the callee.
  {
    const alice = await connect("alice");
    const bob = await connect("bob");
    alice.emit("call:offer", { toUserId: USERS.bob.id, offer: OFFER, callType: "voice", renegotiate: false });
    await waitFor(bob, "call:offer");
    advance(5);
    const r = await hangUp(bob, alice, "alice", "call:decline");
    expectCard(r.stored, { status: "declined", duration: 0, participants: 1 }, "declined");
    await disconnect(alice);
    await disconnect(bob);
    console.log("ok - DM: declined ring → declined, 1 participant");
  }

  // 8) Stale "decline" after the call connected (old CallKit UI / busy 2nd
  //    device) ends it as completed with the real duration; a second end
  //    from the other side does not write a second card.
  {
    const alice = await connect("alice");
    const bob = await connect("bob");
    await ringAndAnswer(alice, bob, "alice", "bob");
    advance(33);
    const r = await hangUp(bob, alice, "alice", "call:decline");
    expectCard(r.stored, { status: "completed", duration: 33, participants: 2 }, "late decline");
    const before = dmSummaryRows().length;
    alice.emit("call:end", { toUserId: USERS.bob.id });
    await sleep(80);
    assertEq(dmSummaryRows().length, before, "double end: no second card");
    await disconnect(alice);
    await disconnect(bob);
    console.log("ok - DM: late decline after answer → completed 33s; double end → one card");
  }

  // 9) Late renegotiation from a peer that has not seen the hang-up yet does
  //    not resurrect the finished call.
  {
    const alice = await connect("alice");
    const bob = await connect("bob");
    alice.emit("call:offer", { toUserId: USERS.bob.id, offer: OFFER, callType: "voice", renegotiate: true });
    await waitFor(bob, "call:offer");
    assertEq(dmCallLog.isActiveDmCall(USERS.alice.id, USERS.bob.id), false, "no ghost call after a just-ended call");
    // Clean the ringing record this offer left behind.
    await hangUp(alice, bob, "bob", "call:cancel");
    await disconnect(alice);
    await disconnect(bob);
    console.log("ok - DM: late ICE restart right after hang-up does not create a ghost call");
  }
}

function groupSummaryRows() {
  return (fakeSupabase._tables.group_messages?.rows || [])
    .filter((r) => r.message_type === "call_summary")
    .map((r) => JSON.parse(r.content));
}

async function groupScenarios() {
  // G1) Ring 12 s, Bob accepts, Carol joins later from the banner, Carol
  //     drops & resumes, Bob leaves and rejoins; call ends when all leave.
  {
    const alice = await connect("alice");
    const bob = await connect("bob");
    let carol = await connect("carol");
    const incoming = waitFor(bob, "group:call:incoming");
    alice.emit("group:call:start", { groupId: GROUP_ID, callType: "voice", memberIds: [USERS.bob.id, USERS.carol.id] });
    await incoming;
    await sleep(30);
    advance(12);
    const accepted = waitFor(alice, "group:call:accepted");
    bob.emit("group:call:accept", { groupId: GROUP_ID, toUserId: USERS.alice.id });
    await accepted;
    advance(20);
    carol.emit("group:call:join", { groupId: GROUP_ID, callType: "voice" });
    await waitFor(carol, "group:call:participants");
    advance(10);
    await disconnect(carol); // network blip → 45 s grace, still in the call
    carol = await connect("carol");
    carol.emit("group:call:resume", { groupId: GROUP_ID });
    await sleep(30);
    advance(15);
    bob.emit("group:call:leave", { groupId: GROUP_ID });
    await sleep(30);
    advance(5);
    bob.emit("group:call:join", { groupId: GROUP_ID, callType: "voice" });
    await waitFor(bob, "group:call:participants");
    advance(30);
    bob.emit("group:call:leave", { groupId: GROUP_ID });
    carol.emit("group:call:leave", { groupId: GROUP_ID });
    await sleep(30);
    const live = waitFor(bob, "group:call:summary");
    alice.emit("group:call:leave", { groupId: GROUP_ID });
    const { summary } = await live;
    await sleep(30);
    const stored = groupSummaryRows().at(-1);
    for (const [card, label] of [[summary, "group live"], [stored, "group stored"]]) {
      expectCard(card, { status: "completed", duration: 80, participants: 3 }, label);
      assert(card.connectedAt, `${label}: connectedAt`);
    }
    const callRow = fakeSupabase._tables.group_calls.rows.at(-1);
    assertEq(callRow.duration_seconds, 80, "group_calls.duration_seconds");
    assertEq(callRow.participant_count, 3, "group_calls.participant_count");
    for (const s of [alice, bob, carol]) await disconnect(s);
    console.log("ok - group: duration from first accept (80s, ring excluded), 3 joined incl. leave/rejoin/reconnect");
  }

  // G2) Nobody answers: initiator gives up after 30 s → missed, 1 participant.
  {
    const alice = await connect("alice");
    const bob = await connect("bob");
    const incoming = waitFor(bob, "group:call:incoming");
    alice.emit("group:call:start", { groupId: GROUP_ID, callType: "voice", memberIds: [USERS.bob.id, USERS.carol.id] });
    await incoming;
    advance(30);
    const live = waitFor(bob, "group:call:summary");
    alice.emit("group:call:leave", { groupId: GROUP_ID });
    const { summary } = await live;
    expectCard(summary, { status: "missed", duration: 0, participants: 1 }, "group unanswered");
    await disconnect(alice);
    await disconnect(bob);
    console.log("ok - group: unanswered → missed, 1 participant, 0s");
  }

  // G3) Initiator force-ends (group:call:end) while a member is connected.
  {
    const alice = await connect("alice");
    const bob = await connect("bob");
    const incoming = waitFor(bob, "group:call:incoming");
    alice.emit("group:call:start", { groupId: GROUP_ID, callType: "video", memberIds: [USERS.bob.id] });
    await incoming;
    await sleep(30);
    advance(6);
    bob.emit("group:call:accept", { groupId: GROUP_ID, toUserId: USERS.alice.id });
    await waitFor(alice, "group:call:accepted");
    advance(64);
    const live = waitFor(bob, "group:call:summary");
    alice.emit("group:call:end", { groupId: GROUP_ID });
    const { summary } = await live;
    expectCard(summary, { status: "completed", duration: 64, participants: 2 }, "group force end");
    await disconnect(alice);
    await disconnect(bob);
    console.log("ok - group: initiator ends for everyone → 64s, 2 participants");
  }
}

(async () => {
  const { server, io } = await start();
  let failed = false;
  try {
    await dmScenarios();
    await groupScenarios();
    console.log("\ncallSummary integration: all scenarios passed");
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
