"use strict";
// End-of-call DesCoin summary + server voice earning (owner approved, Nov 2026), end to end
// against the in-memory Supabase fake and a fake socket.io:
//   - server voice earns only with a real seat held by this socket, someone else seated,
//     speaking (voice) / sharing (screen share), not muted / server-muted / timed out
//   - same caps and throttle as DM / group, ledger rows carry the call receipt
//   - leaving emits descoin:call-summary to the device that left; server-driven leave
//     (socket gone) to every device of the user; offline users get it on connect
//   - DM calls summarise both sides; featured item, display info only
// Run from frontend/: node backend/test/callCoinSummary.integration.test.cjs
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
process.env.LIVEKIT_URL = "ws://127.0.0.1:9";
process.env.LIVEKIT_API_KEY = "lk-test-key";
process.env.LIVEKIT_API_SECRET = "y".repeat(48); // fake, test only
process.env.VOICE_SEAT_GRACE_MS = "40";
process.env.DESCOIN_ANTIBOT_MONITOR = "0";

const assert = require("node:assert/strict");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const H = 3600e3;
const later = new Date(Date.now() + 5 * H).toISOString();
const names = ["alice", "bob", "carol", "dave", "ghost", "erin", "fay", "gus"];
const db = createFakeSupabase({
  users: names.map((n) => ({
    id: `u-${n}`,
    username: n,
    display_name: n === "bob" ? "Bob Builder" : null,
    email: `${n}@example.com`,
    descoin_balance: 1000,
    active_sessions: [{ id: `s-${n}` }],
  })),
  servers: [{ id: "srv-1", name: "Kuzey Oyuncular", icon_url: "https://cdn.example/srv.png", owner_id: "u-alice", afk_channel_id: null, afk_timeout_seconds: 60, community_enabled: false, rules_text: "" }],
  server_channels: [
    { id: "ch-voice", server_id: "srv-1", type: "voice", name: "Oyun Gecesi" },
    { id: "ch-solo", server_id: "srv-1", type: "voice", name: "Solo" },
  ],
  server_members: names.map((n) => ({ server_id: "srv-1", user_id: `u-${n}` })),
  descoin_ledger: [],
  shop_items: [
    { id: "it-plain", sku: "plain", name: "Plain", category: "avatar_effect", price_descoin: 100, active: true, rarity: "common", sort_order: 1 },
    { id: "it-aurora", sku: "aurora", name: "Aurora", category: "avatar_effect", price_descoin: 800, active: true, rarity: "epic", sort_order: 2, sale_pct: 25, sale_ends_at: later, stock_limit: 50, stock_sold: 36 },
  ],
  user_inventory: [],
  groups: [{ id: "g-1", name: "Ekip Kuzey", avatar_url: null }],
});
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: db };

const perms = require("../lib/serverPermissions");
const P = perms.Permissions;
const VOICE = P.VIEW_CHANNEL | P.CONNECT | P.SPEAK;
perms.resolveChannelPermissions = async () => ({ isMember: true, isOwner: false, bits: VOICE | P.STREAM });
perms.resolveMemberPermissions = async () => ({ isMember: true, isOwner: false, bits: VOICE | P.STREAM });
perms.assertHierarchy = async () => {};

const ve = require("../lib/serverVoiceEnforce");
ve._setRoomServiceForTest?.({
  removeParticipant: async () => {},
  updateParticipant: async () => {},
  deleteRoom: async () => {},
  listParticipants: async () => [],
});
const voice = require("../socket/serverVoiceHandlers");
const hb = require("../socket/descoinHeartbeat");
const sessions = require("../lib/callCoinSessions");
const { activeServerVoiceCalls, activeGroupCalls } = require("../runtime/sharedState");

// Fake socket.io.
const events = []; // [target, event, payload]
const sockets = new Map();
const io = {
  to: (room) => ({ emit: (e, p) => events.push([room, e, p]) }),
  in: (room) => ({
    socketsLeave: () => {},
    socketsJoin: () => {},
    fetchSockets: async () => [],
    emit: (e, p) => events.push([room, e, p]),
  }),
};
let seq = 0;
function mkSocket(uid) {
  const h = {};
  const s = {
    id: `sock-${++seq}`,
    user: { id: uid, username: uid.slice(2) },
    data: {},
    rooms: new Set(),
    on: (e, f) => {
      (h[e] = h[e] || []).push(f);
    },
    emit: (e, p) => events.push([`sock:${s.id}`, e, p]),
    join: (r) => s.rooms.add(r),
    leave: (r) => s.rooms.delete(r),
    to: (room) => ({ emit: (e, p) => events.push([room, e, p]) }),
    fire: async (e, p) => {
      for (const f of h[e] || []) await f(p);
    },
  };
  sockets.set(s.id, s);
  voice.registerServerVoiceHandlers(io, s);
  hb.registerDescoinHeartbeat(s, { userId: uid, dmScreenSharingUsers: new Set() });
  return s;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ledger = (uid) => db._tables.descoin_ledger.rows.filter((r) => r.user_id === uid);
const earned = (uid) => ledger(uid).reduce((n, r) => n + r.amount, 0);
const summaries = (target) => events.filter((e) => e[0] === target && e[1] === "descoin:call-summary").map((e) => e[2]);
async function beat(sock, payload) {
  hb._reset(); // the 15 s throttle has its own test below
  await sock.fire("descoin:heartbeat", payload);
  await sleep(5);
}
const speak = { context: "server", channelId: "ch-voice", type: "voice", speaking: true };

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push([name, true]);
  } catch (err) {
    results.push([name, false, err?.stack || String(err)]);
  }
}

(async () => {
  const alice = mkSocket("u-alice");
  const alice2 = mkSocket("u-alice"); // second device, no seat
  const bob = mkSocket("u-bob");
  const carol = mkSocket("u-carol");
  const ghost = mkSocket("u-ghost");

  await check("alone in the channel earns nothing", async () => {
    await alice.fire("server:voice:join", { serverId: "srv-1", channelId: "ch-voice" });
    assert.ok(activeServerVoiceCalls.get("ch-voice")?.participants.has("u-alice"));
    await beat(alice, speak);
    assert.equal(earned("u-alice"), 0);
  });

  await check("seated with someone else and speaking earns 1 with the receipt on the ledger row", async () => {
    await bob.fire("server:voice:join", { serverId: "srv-1", channelId: "ch-voice" });
    await beat(alice, speak);
    assert.equal(earned("u-alice"), 1);
    const row = ledger("u-alice")[0];
    assert.equal(row.reason, "voice_activity");
    assert.equal(row.meta.context, "server");
    assert.equal(row.meta.channelId, "ch-voice");
    assert.equal(row.meta.serverId, "srv-1");
    const s = sessions.get("u-alice", { context: "server", channelId: "ch-voice" });
    assert.ok(s, "session started at join");
    assert.equal(row.meta.callSession, s.id);
    assert.equal(row.meta.receipt, s.receipt);
    assert.ok(events.some((e) => e[0] === `sock:${alice.id}` && e[1] === "descoin:balance"));
  });

  await check("not speaking, unknown type, other device, no seat: nothing", async () => {
    const before = earned("u-alice");
    await beat(alice, { ...speak, speaking: false });
    await beat(alice, { ...speak, type: "coins" });
    await beat(alice2, speak); // the seat belongs to the first socket
    await beat(ghost, speak); // no seat at all
    await beat(alice, { ...speak, channelId: "ch-solo" }); // seat is in another channel
    assert.equal(earned("u-alice"), before);
    assert.equal(earned("u-ghost"), 0);
  });

  await check("self-muted or server-muted seats do not earn voice", async () => {
    const before = earned("u-alice");
    await alice.fire("server:voice:media-state", { channelId: "ch-voice", muted: true });
    await beat(alice, speak);
    assert.equal(earned("u-alice"), before, "self-muted");
    await alice.fire("server:voice:media-state", { channelId: "ch-voice", muted: false });
    const seat = activeServerVoiceCalls.get("ch-voice").participants.get("u-alice");
    seat.modMuted = true;
    ve.recomputeSeatLocks(seat);
    await beat(alice, speak);
    assert.equal(earned("u-alice"), before, "server-muted");
    seat.modMuted = false;
    ve.recomputeSeatLocks(seat);
    seat.muted = false;
    await beat(alice, speak);
    assert.equal(earned("u-alice"), before + 1, "unmuted again");
  });

  await check("timed out member does not earn", async () => {
    const row = db._tables.server_members.rows.find((r) => r.user_id === "u-bob");
    row.timeout_until = new Date(Date.now() + H).toISOString();
    await beat(bob, speak);
    assert.equal(earned("u-bob"), 0);
    row.timeout_until = null;
    await beat(bob, speak); // the timeout check is cached for 30 s; _reset() in beat() clears it
    assert.equal(earned("u-bob"), 1);
  });

  await check("screen share earns 2 only while sharing", async () => {
    await carol.fire("server:voice:join", { serverId: "srv-1", channelId: "ch-voice" });
    const ss = { context: "server", channelId: "ch-voice", type: "screenshare", speaking: false };
    await beat(carol, ss);
    assert.equal(earned("u-carol"), 0);
    await carol.fire("server:voice:screen:start", { channelId: "ch-voice" });
    await beat(carol, ss);
    assert.equal(earned("u-carol"), 2);
    await carol.fire("server:voice:screen:stop", { channelId: "ch-voice" });
    await beat(carol, ss);
    assert.equal(earned("u-carol"), 2);
  });

  await check("same 15 s throttle as DM / group", async () => {
    hb._reset();
    const before = earned("u-carol");
    await carol.fire("descoin:heartbeat", speak);
    await carol.fire("descoin:heartbeat", speak);
    await sleep(5);
    assert.equal(earned("u-carol"), before + 1);
  });

  await check("same caps: hourly voice cap stops server voice too", async () => {
    db._tables.descoin_ledger.rows.push({ id: "pre-1", user_id: "u-bob", amount: 29, reason: "voice_activity", meta: {}, balance_after: 0, created_at: new Date().toISOString() });
    await beat(bob, speak); // 1 earned earlier + 29 = 30 = hour cap: nothing more
    await beat(bob, speak);
    const voiceSum = ledger("u-bob").filter((r) => r.reason === "voice_activity").reduce((n, r) => n + r.amount, 0);
    assert.equal(voiceSum, 30);
    const s = sessions.get("u-bob", { context: "server", channelId: "ch-voice" });
    assert.equal(s.hourCapReached, true);
    assert.equal(s.earnedVoice, 1, "this call earned 1 before the cap");
    assert.equal(s.voiceBeats, 3, "capped beats still count as talk time");
  });

  await check("leave emits descoin:call-summary to the device that left", async () => {
    await alice.fire("server:voice:leave", { channelId: "ch-voice" });
    await sleep(40);
    const got = summaries(alice.id);
    assert.equal(got.length, 1, JSON.stringify(events.filter((e) => e[1] === "descoin:call-summary")));
    const p = got[0];
    assert.equal(p.context, "server");
    assert.equal(p.origin, "self");
    assert.equal(p.earnedVoice, 2);
    assert.equal(p.earnedScreenshare, 0);
    assert.equal(p.earnedTotal, 2);
    assert.equal(p.balance, 1002);
    assert.equal(p.balanceBefore, 1000);
    assert.equal(p.todayEarned, 2);
    assert.equal(p.todayCap, 400);
    assert.equal(p.display.serverName, "Kuzey Oyuncular");
    assert.equal(p.display.channelName, "Oyun Gecesi");
    assert.match(p.receipt, /^DC-[0-9A-F]{4}$/);
    assert.equal(p.streakDays, 1);
    assert.ok(p.people >= 2);
    assert.equal(p.featuredItem?.id, "it-aurora");
    assert.equal(p.featuredItem.price, 600);
    assert.equal(p.featuredItem.listPrice, 800);
    assert.equal(p.featuredItem.stockLeft, 14);
    const text = JSON.stringify(p);
    for (const leak of ["@example.com", "u-bob", "u-carol", "descoin_balance"]) assert.equal(text.includes(leak), false, `leaks ${leak}`);
    assert.equal(summaries("user:u-alice").length, 0, "not broadcast to other devices");
    assert.equal(sessions.get("u-alice", { context: "server", channelId: "ch-voice" }), null);
  });

  await check("a session that earned nothing emits nothing", async () => {
    await ghost.fire("server:voice:join", { serverId: "srv-1", channelId: "ch-voice" });
    await ghost.fire("server:voice:leave", { channelId: "ch-voice" });
    await sleep(30);
    assert.equal(summaries(ghost.id).length + summaries("user:u-ghost").length, 0);
  });

  await check("owned featured item is never suggested", async () => {
    db._tables.user_inventory.rows.push({ id: "inv-1", user_id: "u-carol", item_id: "it-aurora", acquired_at: new Date().toISOString() });
    await carol.fire("server:voice:leave", { channelId: "ch-voice" });
    await sleep(40);
    const p = summaries(carol.id)[0];
    assert.ok(p, "carol earned, gets a summary");
    assert.equal(p.earnedScreenshare, 2);
    assert.equal(p.screenShared, true);
    assert.equal(p.featuredItem, null);
  });

  await check("socket gone mid-call: server-driven leave reaches every device of the user", async () => {
    await bob.fire("disconnect");
    await sleep(120); // VOICE_SEAT_GRACE_MS = 40
    const p = summaries("user:u-bob")[0];
    assert.ok(p, "summary after the grace removal");
    assert.equal(p.origin, "server");
    assert.equal(p.earnedVoice, 1);
    assert.equal(p.hourCapReached, true);
    assert.deepEqual(p.nearCap, null, "30 / 180 voice is not near the daily cap");
  });

  await check("DM call: both sides summarised, the one who hung up on its device", async () => {
    const dmLog = require("../lib/dmCallLog");
    const { finishDmCall } = require("../socket/handlers");
    const dave = mkSocket("u-dave");
    const erin = mkSocket("u-erin");
    dmLog.trackOffer({ callerId: "u-dave", calleeId: "u-erin", callType: "voice", offer: { sdp: "x" } });
    dmLog.markAnswered({ callerId: "u-dave", calleeId: "u-erin", answer: { sdp: "y" } });
    sessions.start("u-dave", { context: "dm", peerId: "u-erin" });
    sessions.start("u-erin", { context: "dm", peerId: "u-dave" });
    await beat(dave, { context: "dm", peerId: "u-erin", type: "voice", speaking: true });
    await beat(erin, { context: "dm", peerId: "u-dave", type: "voice", speaking: true });
    await beat(erin, { context: "dm", peerId: "u-dave", type: "screenshare" }); // not sharing: ignored
    assert.equal(earned("u-dave"), 1);
    assert.equal(earned("u-erin"), 1);
    await finishDmCall(io, "u-dave", "u-erin", "completed", { originSocketId: dave.id });
    await sleep(40);
    const mine = summaries(dave.id)[0];
    const theirs = summaries("user:u-erin")[0];
    assert.ok(mine && theirs);
    assert.equal(mine.context, "dm");
    assert.equal(mine.origin, "self");
    assert.equal(theirs.origin, "server");
    assert.equal(mine.display.id, "u-erin");
    assert.equal(theirs.display.id, "u-dave");
    assert.equal(mine.people, 2);
    assert.notEqual(mine.sessionId, theirs.sessionId);
  });

  await check("group call: leaving summarises, the call must have someone else", async () => {
    const fay = mkSocket("u-fay");
    activeGroupCalls.set("g-1", { participants: new Set(["u-fay"]), allParticipants: new Set(["u-fay"]), startTime: Date.now() });
    sessions.start("u-fay", { context: "group", groupId: "g-1" });
    await beat(fay, { context: "group", groupId: "g-1", type: "voice", speaking: true });
    assert.equal(earned("u-fay"), 0, "alone in the group call");
    activeGroupCalls.get("g-1").participants.add("u-gus");
    await beat(fay, { context: "group", groupId: "g-1", type: "voice", speaking: true });
    assert.equal(earned("u-fay"), 1);
    const { removeUserFromGroupCall } = require("../socket/groupCallLifecycle");
    await removeUserFromGroupCall(io, "g-1", "u-fay", fay);
    await sleep(40);
    const p = summaries(fay.id)[0];
    assert.ok(p);
    assert.equal(p.context, "group");
    assert.equal(p.display.name, "Ekip Kuzey");
    activeGroupCalls.delete("g-1");
  });

  await check("offline user: summary waits and is delivered on the next connect", async () => {
    const offlineIo = {
      sockets: { adapter: { rooms: new Map() }, sockets: new Map() },
      to: (room) => ({ emit: (e, p) => events.push([room, e, p]) }),
    };
    sessions.recordBeat("u-gus", { context: "group", groupId: "g-9" }, { type: "voice", credited: 3, people: 3 });
    await sessions.finish(offlineIo, "u-gus", { context: "group", groupId: "g-9" }, { originSocketId: "sock-gone" });
    assert.equal(summaries("user:u-gus").length, 0);
    const got = [];
    const n = sessions.flushPending({ emit: (e, p) => got.push([e, p]) }, "u-gus");
    assert.equal(n, 1);
    assert.equal(got[0][0], "descoin:call-summary");
    assert.equal(got[0][1].origin, "server");
    assert.equal(got[0][1].earnedTotal, 3);
    assert.equal(sessions.flushPending({ emit: () => {} }, "u-gus"), 0, "delivered once");
  });

  const failed = results.filter((r) => !r[1]);
  for (const [name, ok, err] of results) console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     ${err}`}`);
  if (failed.length) {
    console.error(`\n${failed.length} failed`);
    process.exit(1);
  }
  console.log(`\ncallCoinSummary integration: ${results.length} scenarios passed`);
  process.exit(0);
})();
