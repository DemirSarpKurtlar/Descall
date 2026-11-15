"use strict";
// Server voice enforcement (server audit 2026-11-15): LiveKit token rules, persistent and
// SFU-enforced server mute / deafen, eviction with token revocation, permission re-checks,
// AFK scanner robustness, stage moderation, user limit, stale seats, LiveKit webhook.
// Run from frontend/: node backend/test/serverVoiceEnforce.integration.test.cjs
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
process.env.LIVEKIT_URL = "ws://127.0.0.1:9";
process.env.LIVEKIT_API_KEY = "lk-test-key";
process.env.LIVEKIT_API_SECRET = "y".repeat(48); // fake, test only
process.env.VOICE_TOKEN_SEAT_WAIT_MS = "400";
process.env.VOICE_SEAT_GRACE_MS = "60";

const http = require("http");
const crypto = require("crypto");
const assert = require("node:assert/strict");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const future = new Date(Date.now() + 3600e3).toISOString();
const db = createFakeSupabase({
  users: ["alice", "bob", "carol", "dave", "erin", "tim", "ghost", "lost", "mod", "frank"].map((n) => ({
    id: `u-${n}`,
    username: n,
    active_sessions: [{ id: `s-${n}` }],
  })),
  servers: [
    { id: "srv-1", owner_id: "u-alice", afk_channel_id: null, afk_timeout_seconds: 60, community_enabled: false, rules_text: "" },
    { id: "srv-2", owner_id: "u-alice", afk_channel_id: "ch-deleted", afk_timeout_seconds: 60, community_enabled: false, rules_text: "" },
  ],
  server_channels: [
    { id: "ch-voice", server_id: "srv-1", type: "voice", name: "General" },
    { id: "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b", server_id: "srv-1", type: "voice", name: "Uuid" },
    { id: "ch-voice2", server_id: "srv-1", type: "voice", name: "Second" },
    { id: "ch-nospeak", server_id: "srv-1", type: "voice", name: "Listen only" },
    { id: "ch-priv", server_id: "srv-1", type: "voice", name: "Staff" },
    { id: "ch-stage", server_id: "srv-1", type: "stage", name: "Stage" },
    { id: "ch-afk", server_id: "srv-1", type: "voice", name: "AFK" },
    { id: "ch-small", server_id: "srv-1", type: "voice", name: "Duo", user_limit: 1 },
    { id: "ch-s2", server_id: "srv-2", type: "voice", name: "Other server" },
  ],
  server_members: ["alice", "bob", "carol", "dave", "erin", "tim", "ghost", "lost", "mod", "frank"].map((n) => ({
    server_id: "srv-1",
    user_id: `u-${n}`,
    ...(n === "tim" ? { timeout_until: future, timeout_reason: "spam" } : {}),
  })).concat([{ server_id: "srv-2", user_id: "u-erin" }]),
});
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: db };

const perms = require("../lib/serverPermissions");
const { Permissions } = perms;
const P = Permissions;
const VOICE = P.VIEW_CHANNEL | P.CONNECT | P.SPEAK;
// bits[user][channel] with "*" as the default.
const bits = {
  "u-alice": { "*": VOICE | P.STREAM | P.MUTE_MEMBERS | P.DEAFEN_MEMBERS | P.MOVE_MEMBERS },
  "u-mod": { "*": VOICE | P.MOVE_MEMBERS }, // MOVE_MEMBERS only
  "u-bob": { "*": VOICE },
  "u-carol": { "*": VOICE | P.STREAM },
  "u-dave": { "*": VOICE, "ch-priv": 0n, "ch-nospeak": P.VIEW_CHANNEL | P.CONNECT },
  "u-erin": { "*": VOICE, "ch-afk": 0n },
  "u-tim": { "*": VOICE },
  "u-ghost": { "*": VOICE },
  "u-lost": { "*": 0n },
  "u-frank": { "*": VOICE },
};
const bitsFor = (uid, ch) => {
  const row = bits[uid];
  if (!row) return null;
  return ch in row ? row[ch] : row["*"];
};
perms.resolveChannelPermissions = async (_d, _s, uid, ch) => {
  const b = bitsFor(uid, ch);
  return b == null ? { isMember: false, bits: 0n } : { isMember: true, isOwner: uid === "u-alice", bits: b };
};
perms.resolveMemberPermissions = async (_d, _s, uid) => {
  const b = bitsFor(uid, "*");
  return b == null ? { isMember: false, bits: 0n } : { isMember: true, isOwner: uid === "u-alice", bits: b };
};
perms.assertHierarchy = async () => {};

// Fake LiveKit RoomServiceClient: records every call.
const lk = [];
let lkParticipants = {};
const fakeRoomService = {
  removeParticipant: async (room, identity, opts) => void lk.push({ op: "remove", room, identity, revoke: opts?.revokeTokenTs != null }),
  updateParticipant: async (room, identity, opts) => void lk.push({ op: "update", room, identity, permission: opts?.permission }),
  deleteRoom: async (room) => void lk.push({ op: "deleteRoom", room }),
  listParticipants: async (room) => (lkParticipants[room] || []).map((identity) => ({ identity })),
};

const express = require("express");
const { signToken } = require("../config/jwt");
const { activeServerVoiceCalls } = require("../runtime/sharedState");
const ve = require("../lib/serverVoiceEnforce");
if (typeof ve._setRoomServiceForTest === "function") ve._setRoomServiceForTest(fakeRoomService);
const voice = require("../socket/serverVoiceHandlers");
const webrtc = require("../routes/webrtc");
const access = require("../lib/serverAccessRealtime");

// Fake socket.io server.
const events = []; // [target, event, payload]
const sockets = new Map(); // socket id -> socket
const roomsOf = (s) => s.rooms;
function socketsIn(room) {
  if (room.startsWith("user:")) return [...sockets.values()].filter((s) => `user:${s.user.id}` === room);
  return [...sockets.values()].filter((s) => roomsOf(s).has(room));
}
const io = {
  to: (room) => ({ emit: (e, p) => events.push([room, e, p]) }),
  in: (room) => ({
    socketsLeave: (r) => socketsIn(room).forEach((s) => s.rooms.delete(r)),
    socketsJoin: (r) => socketsIn(room).forEach((s) => s.rooms.add(r)),
    fetchSockets: async () => socketsIn(room),
    emit: (e, p) => events.push([room, e, p]),
  }),
};
let sockSeq = 0;
function mkSocket(uid) {
  const h = {};
  const s = {
    id: `sock-${++sockSeq}`,
    user: { id: uid, username: uid.slice(2) },
    data: {},
    rooms: new Set(),
    h,
    on: (e, f) => {
      (h[e] = h[e] || []).push(f);
    },
    emit: (e, p) => events.push([`sock:${uid}`, e, p]),
    join: (r) => s.rooms.add(r),
    leave: (r) => s.rooms.delete(r),
    to: (room) => ({ emit: (e, p) => events.push([room, e, p]) }),
    fire: async (e, p) => {
      for (const f of h[e] || []) await f(p);
    },
  };
  sockets.set(s.id, s);
  voice.registerServerVoiceHandlers(io, s);
  return s;
}
const seat = (ch, uid) => activeServerVoiceCalls.get(ch)?.participants.get(uid) || null;
const lastEvent = (target, e) => [...events].reverse().find((x) => x[0] === target && x[1] === e)?.[2];
const decode = (t) => JSON.parse(Buffer.from(String(t).split(".")[1], "base64url").toString());
const tok = (id) => signToken({ id, username: id.slice(2), sid: `s-${id.slice(2)}` });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flush = () => sleep(30);

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push([name, true]);
  } catch (err) {
    results.push([name, false, err?.message || String(err)]);
  }
}

(async () => {
  const app = express();
  app.set("io", io);
  app.use("/api/webrtc", webrtc);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const getToken = async (uid, ch) => {
    const r = await fetch(`${base}/api/webrtc/livekit-token?channelId=${encodeURIComponent(ch)}`, {
      headers: { Authorization: `Bearer ${tok(uid)}` },
    });
    return { status: r.status, body: await r.json() };
  };

  const alice = mkSocket("u-alice");
  const bob = mkSocket("u-bob");
  const carol = mkSocket("u-carol");
  const mod = mkSocket("u-mod");

  // ---- V2: no seat, no token (ghost listener)
  await check("V2 token requires a seat (409 NOT_IN_CHANNEL)", async () => {
    const r = await getToken("u-ghost", "ch-voice");
    assert.equal(r.status, 409);
    assert.equal(r.body.code, "NOT_IN_CHANNEL");
  });

  // ---- old clients: token requested while the join is in flight still works
  await check("Old client early token waits for the seat", async () => {
    const pending = getToken("u-bob", "ch-voice");
    await sleep(60);
    await bob.fire("server:voice:join", { serverId: "srv-1", channelId: "ch-voice" });
    const r = await pending;
    assert.equal(r.status, 200, JSON.stringify(r.body));
  });

  // ---- token comes with the confirmed join
  await check("server:voice:joined carries a LiveKit token minted for the seat", async () => {
    await alice.fire("server:voice:join", { serverId: "srv-1", channelId: "ch-voice" });
    const joined = lastEvent("sock:u-alice", "server:voice:joined");
    assert.ok(joined?.livekit?.token, "token in joined payload");
    assert.equal(decode(joined.livekit.token).sub, "u-alice");
    assert.equal(joined.livekit.room, "server-voice-ch-voice");
  });

  // ---- V5 / V14 / SK-3: grants match permissions, no data channel, short TTL
  await check("V5 no STREAM -> microphone only; V14 no data; short TTL", async () => {
    const r = await getToken("u-bob", "ch-voice");
    assert.equal(r.status, 200);
    const c = decode(r.body.token);
    assert.equal(c.video.canPublish, true);
    assert.deepEqual(c.video.canPublishSources, ["microphone"]);
    assert.equal(Boolean(c.video.canPublishData), false);
    assert.ok(c.exp - c.nbf <= 300, `ttl ${c.exp - c.nbf}`);
  });

  // ---- V11: spelling variants map to the canonical room
  await check("V11 uuid spelling variants -> canonical room and seat", async () => {
    const UUID = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
    const ghost2 = mkSocket("u-ghost");
    await ghost2.fire("server:voice:join", { serverId: "srv-1", channelId: UUID.toUpperCase() });
    assert.ok(seat(UUID, "u-ghost"), "seat under the canonical id");
    const r = await getToken("u-ghost", `{${UUID.toUpperCase().replace(/-/g, "")}}`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.room, `server-voice-${UUID}`);
    await ghost2.fire("server:voice:leave", { channelId: UUID });
    sockets.delete(ghost2.id);
  });

  // ---- V1: timed-out seated member gets no token
  await check("V1 timed-out member cannot mint a token", async () => {
    activeServerVoiceCalls.get("ch-voice").participants.set("u-tim", { id: "u-tim", channelType: "voice" });
    const r = await getToken("u-tim", "ch-voice");
    assert.equal(r.status, 403);
    assert.equal(r.body.code, "TIMED_OUT");
    activeServerVoiceCalls.get("ch-voice").participants.delete("u-tim");
  });

  // ---- V6: a seat without VIEW/CONNECT (not placed by a mover) gets no token
  await check("V6 seated member without VIEW/CONNECT cannot mint", async () => {
    activeServerVoiceCalls.get("ch-voice").participants.set("u-lost", { id: "u-lost", channelType: "voice" });
    const r = await getToken("u-lost", "ch-voice");
    assert.equal(r.status, 403);
    activeServerVoiceCalls.get("ch-voice").participants.delete("u-lost");
  });

  // ---- V3 / SK-1: server mute survives re-join and leave + join; V4: enforced in LiveKit
  await check("V3 server mute survives re-join and leave+join", async () => {
    await alice.fire("server:voice:server-mute", { serverId: "srv-1", channelId: "ch-voice", userId: "u-bob", muted: true });
    assert.equal(seat("ch-voice", "u-bob").serverMuted, true);
    await bob.fire("server:voice:join", { serverId: "srv-1", channelId: "ch-voice" });
    assert.equal(seat("ch-voice", "u-bob").serverMuted, true, "after re-join");
    await bob.fire("server:voice:leave", { channelId: "ch-voice" });
    await bob.fire("server:voice:join", { serverId: "srv-1", channelId: "ch-voice" });
    assert.equal(seat("ch-voice", "u-bob").serverMuted, true, "after leave + join");
    await bob.fire("server:voice:media-state", { channelId: "ch-voice", muted: false });
    assert.equal(seat("ch-voice", "u-bob").muted, true, "self-unmute refused");
  });
  await check("V4 server mute -> updateParticipant canPublish false; token canPublish false", async () => {
    lk.length = 0;
    await alice.fire("server:voice:server-mute", { serverId: "srv-1", channelId: "ch-voice", userId: "u-bob", muted: false });
    await alice.fire("server:voice:server-mute", { serverId: "srv-1", channelId: "ch-voice", userId: "u-bob", muted: true });
    await flush();
    const upd = lk.filter((x) => x.op === "update" && x.identity === "u-bob").pop();
    assert.ok(upd, "updateParticipant called");
    assert.equal(upd.permission.canPublish, false);
    const r = await getToken("u-bob", "ch-voice");
    assert.equal(decode(r.body.token).video.canPublish, false);
    assert.equal(r.body.canSpeak, true, "permission kept separate from the lock");
    await alice.fire("server:voice:server-mute", { serverId: "srv-1", channelId: "ch-voice", userId: "u-bob", muted: false });
    assert.equal(seat("ch-voice", "u-bob").serverMuted, false, "unmute lifts it");
  });
  await check("V4 server deafen -> canSubscribe false (LiveKit + token), survives re-join", async () => {
    lk.length = 0;
    await alice.fire("server:voice:server-deafen", { serverId: "srv-1", channelId: "ch-voice", userId: "u-bob", deafened: true });
    await flush();
    const upd = lk.filter((x) => x.op === "update" && x.identity === "u-bob").pop();
    assert.equal(upd?.permission?.canSubscribe, false);
    await bob.fire("server:voice:join", { serverId: "srv-1", channelId: "ch-voice" });
    assert.equal(seat("ch-voice", "u-bob").serverDeafened, true);
    const r = await getToken("u-bob", "ch-voice");
    assert.equal(decode(r.body.token).video.canSubscribe, false);
    await alice.fire("server:voice:server-deafen", { serverId: "srv-1", channelId: "ch-voice", userId: "u-bob", deafened: false });
    assert.equal(seat("ch-voice", "u-bob").serverDeafened, false);
    assert.equal(seat("ch-voice", "u-bob").serverMuted, false, "undeafen does not leave a mute behind");
  });

  // ---- V2 / M2 / SK-3: eviction removes and revokes everywhere (ghosts and companions too)
  await check("M2 evictFromServerVoice removes + revokes in every voice room", async () => {
    lk.length = 0;
    await ve.evictFromServerVoice(io, { serverId: "srv-1", userId: "u-ghost", reason: "ban" });
    const rooms = lk.filter((x) => x.op === "remove" && x.identity === "u-ghost").map((x) => x.room);
    for (const ch of ["ch-voice", "ch-stage", "ch-afk", "ch-priv"]) assert.ok(rooms.includes(`server-voice-${ch}`), ch);
    assert.ok(lk.some((x) => x.identity === "u-ghost:screen"), "companion removed");
    assert.ok(lk.filter((x) => x.op === "remove").every((x) => x.revoke), "tokens revoked");
  });
  await check("M2 timeout / kick path (removeUserFromServerVoice) revokes LiveKit too", async () => {
    lk.length = 0;
    await carol.fire("server:voice:join", { serverId: "srv-1", channelId: "ch-voice2" });
    await voice.removeUserFromServerVoice(io, "srv-1", "u-carol", "timeout");
    await flush();
    assert.equal(seat("ch-voice2", "u-carol"), null);
    assert.ok(lk.some((x) => x.op === "remove" && x.identity === "u-carol" && x.room === "server-voice-ch-voice2" && x.revoke));
  });

  // ---- V6 / SC-2 / R3: access change re-checks seats
  await check("SC-2/R3 losing VIEW/CONNECT removes the seat on access change", async () => {
    await carol.fire("server:voice:join", { serverId: "srv-1", channelId: "ch-voice2" });
    assert.ok(seat("ch-voice2", "u-carol"));
    bits["u-carol"]["ch-voice2"] = 0n;
    await access.notifyServerAccessChanged(io, "srv-1");
    await flush();
    assert.equal(seat("ch-voice2", "u-carol"), null, "seat removed");
    assert.equal(lastEvent("user:u-carol", "server:voice:force-disconnected")?.reason, "permission");
    delete bits["u-carol"]["ch-voice2"];
  });
  await check("V6 losing SPEAK server-mutes, losing STREAM stops the camera (LiveKit follows)", async () => {
    await carol.fire("server:voice:join", { serverId: "srv-1", channelId: "ch-voice2" });
    await carol.fire("server:voice:camera:start", { channelId: "ch-voice2" });
    assert.equal(seat("ch-voice2", "u-carol").cameraOn, true);
    lk.length = 0;
    bits["u-carol"]["ch-voice2"] = P.VIEW_CHANNEL | P.CONNECT;
    await access.notifyServerAccessChanged(io, "srv-1");
    await flush();
    const s = seat("ch-voice2", "u-carol");
    assert.equal(s.serverMuted, true);
    assert.equal(s.cameraOn, false);
    const upd = lk.filter((x) => x.op === "update" && x.identity === "u-carol").pop();
    assert.equal(upd?.permission?.canPublish, false);
    delete bits["u-carol"]["ch-voice2"];
    await access.notifyServerAccessChanged(io, "srv-1");
    assert.equal(seat("ch-voice2", "u-carol").serverMuted, false, "SPEAK back -> lock lifted");
  });

  // ---- V7: force-moved members keep the voice room on unrelated access changes
  const dave = mkSocket("u-dave");
  await check("V7 force-moved member keeps the voice room and seat", async () => {
    await dave.fire("server:voice:join", { serverId: "srv-1", channelId: "ch-voice" });
    await alice.fire("server:voice:move", { serverId: "srv-1", userId: "u-dave", fromChannelId: "ch-voice", toChannelId: "ch-priv" });
    assert.ok(seat("ch-priv", "u-dave")?.forceMovedIn, "seated by a mover");
    await dave.fire("server:voice:join", { serverId: "srv-1", channelId: "ch-priv" });
    assert.ok(dave.rooms.has("server-voice:ch-priv"));
    await access.notifyServerAccessChanged(io, "srv-1");
    await flush();
    assert.ok(seat("ch-priv", "u-dave"), "seat kept");
    assert.ok(dave.rooms.has("server-voice:ch-priv"), "socket kept in the voice room");
  });

  // ---- V10: move into a channel without SPEAK locks the mic; camera flag needs STREAM
  await check("V10 move into a no-SPEAK channel server-mutes", async () => {
    await alice.fire("server:voice:move", { serverId: "srv-1", userId: "u-dave", fromChannelId: "ch-priv", toChannelId: "ch-voice2" });
    assert.equal(seat("ch-voice2", "u-dave")?.serverMuted, false, "SPEAK at the destination: no lock carried over");
    await alice.fire("server:voice:move", { serverId: "srv-1", userId: "u-dave", fromChannelId: "ch-voice2", toChannelId: "ch-nospeak" });
    assert.equal(seat("ch-nospeak", "u-dave")?.serverMuted, true);
  });
  await check("V10 media-state cameraOn without STREAM is ignored", async () => {
    await bob.fire("server:voice:media-state", { channelId: "ch-voice", muted: true, cameraOn: true });
    assert.equal(seat("ch-voice", "u-bob").cameraOn, false);
  });

  // ---- SC-6: the AFK clock starts on self-mute
  await check("SC-6 self-mute starts the AFK clock", async () => {
    await bob.fire("server:voice:media-state", { channelId: "ch-voice", muted: false });
    await bob.fire("server:voice:media-state", { channelId: "ch-voice", muted: true });
    assert.ok(seat("ch-voice", "u-bob").afkIdleSince > 0);
  });

  // ---- V8 / SC-3 / SK-10 / SC-1 / stage
  await check("V8 AFK scan survives a deleted AFK channel and moves others", async () => {
    assert.equal(typeof voice.runAfkScan, "function", "runAfkScan exported");
    await db.from("servers").update({ afk_channel_id: "ch-afk" }).eq("id", "srv-1");
    const erin = mkSocket("u-erin");
    await erin.fire("server:voice:join", { serverId: "srv-2", channelId: "ch-s2" });
    await erin.fire("server:voice:media-state", { channelId: "ch-s2", muted: true });
    await bob.fire("server:voice:media-state", { channelId: "ch-voice", muted: true });
    const frank = mkSocket("u-frank");
    await frank.fire("server:voice:join", { serverId: "srv-1", channelId: "ch-stage" }); // stage audience
    const res = await voice.runAfkScan(io, Date.now() + 3600e3);
    assert.ok(res, "scan result");
    assert.ok(seat("ch-afk", "u-bob"), "srv-1 member moved");
    assert.equal(seat("ch-afk", "u-bob").serverMuted, true, "AFK channel locks the mic");
    assert.ok(seat("ch-stage", "u-frank"), "stage audience is not AFK-moved");
    const { data: s2 } = await db.from("servers").select("afk_channel_id").eq("id", "srv-2").maybeSingle();
    assert.equal(s2.afk_channel_id, null, "dangling AFK setting cleared");
  });
  await check("SC-1 member who cannot see the AFK channel is disconnected, not moved", async () => {
    const erin2 = mkSocket("u-erin");
    await erin2.fire("server:voice:join", { serverId: "srv-1", channelId: "ch-voice2" });
    await erin2.fire("server:voice:media-state", { channelId: "ch-voice2", muted: true });
    await voice.runAfkScan(io, Date.now() + 3600e3);
    assert.equal(seat("ch-afk", "u-erin"), null, "not placed in the hidden AFK channel");
    assert.equal(seat("ch-voice2", "u-erin"), null, "left voice");
  });

  // ---- V13 stage moderation
  await check("V13 stage set-role needs MUTE_MEMBERS too and keeps a server mute", async () => {
    await carol.fire("server:voice:join", { serverId: "srv-1", channelId: "ch-stage" });
    await mod.fire("server:voice:stage:set-role", { serverId: "srv-1", channelId: "ch-stage", userId: "u-carol", stageRole: "speaker" });
    assert.equal(seat("ch-stage", "u-carol").stageRole, "audience", "MOVE_MEMBERS alone refused");
    await alice.fire("server:voice:server-mute", { serverId: "srv-1", channelId: "ch-stage", userId: "u-carol", muted: true });
    await alice.fire("server:voice:stage:set-role", { serverId: "srv-1", channelId: "ch-stage", userId: "u-carol", stageRole: "speaker" });
    assert.equal(seat("ch-stage", "u-carol").stageRole, "speaker");
    assert.equal(seat("ch-stage", "u-carol").serverMuted, true, "mute kept");
    await alice.fire("server:voice:server-mute", { serverId: "srv-1", channelId: "ch-stage", userId: "u-carol", muted: false });
  });
  await check("V13 stage:request is rate limited", async () => {
    const frank = [...sockets.values()].find((s) => s.user.id === "u-frank");
    bits["u-frank"]["*"] = VOICE | P.REQUEST_TO_SPEAK;
    const before = events.filter((e) => e[1] === "server:voice:stage-state" && e[2]?.userId === "u-frank").length;
    await frank.fire("server:voice:stage:request", { channelId: "ch-stage" });
    seat("ch-stage", "u-frank").requestedToSpeak = false;
    await frank.fire("server:voice:stage:request", { channelId: "ch-stage" });
    const after = events.filter((e) => e[1] === "server:voice:stage-state" && e[2]?.userId === "u-frank").length;
    assert.equal(after - before, 1);
  });

  // ---- V12 user limit
  await check("V12 per-channel user limit", async () => {
    await bob.fire("server:voice:join", { serverId: "srv-1", channelId: "ch-small" });
    await carol.fire("server:voice:join", { serverId: "srv-1", channelId: "ch-small" });
    assert.equal(seat("ch-small", "u-carol"), null);
    assert.equal(lastEvent("sock:u-carol", "server:voice:error")?.code, "CHANNEL_FULL");
    await alice.fire("server:voice:join", { serverId: "srv-1", channelId: "ch-small" });
    assert.ok(seat("ch-small", "u-alice"), "MOVE_MEMBERS bypasses the limit");
  });

  // ---- V9 stale seat when another socket of the user stays connected
  await check("V9 seat of a closed socket goes after the grace period", async () => {
    const bobPhone = mkSocket("u-bob");
    void bobPhone;
    await bob.fire("server:voice:join", { serverId: "srv-1", channelId: "ch-voice" });
    await bob.fire("disconnect");
    sockets.delete(bob.id);
    await sleep(120);
    assert.equal(seat("ch-voice", "u-bob"), null);
  });

  // ---- LiveKit webhook + sweep
  await check("Webhook: participant without a seat is removed", async () => {
    const { AccessToken } = require("livekit-server-sdk");
    const body = JSON.stringify({ event: "participant_joined", room: { name: "server-voice-ch-voice" }, participant: { identity: "u-ghost" } });
    const at = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
    at.sha256 = crypto.createHash("sha256").update(body).digest("base64");
    lk.length = 0;
    const r = await fetch(`${base}/api/webrtc/livekit-webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/webhook+json", Authorization: await at.toJwt() },
      body,
    });
    assert.equal(r.status, 200);
    assert.ok(lk.some((x) => x.op === "remove" && x.identity === "u-ghost" && x.room === "server-voice-ch-voice"));
    const bad = await fetch(`${base}/api/webrtc/livekit-webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/webhook+json", Authorization: "nope" },
      body,
    });
    assert.equal(bad.status, 401);
  });
  await check("Sweep removes identities without a seat, keeps seated ones", async () => {
    lk.length = 0;
    lkParticipants = { "server-voice-ch-voice": ["u-alice", "u-ghost", "u-ghost:screen"] };
    await alice.fire("server:voice:join", { serverId: "srv-1", channelId: "ch-voice" });
    await ve.reconcileLiveKitRoom("ch-voice");
    const removed = lk.filter((x) => x.op === "remove" && x.room === "server-voice-ch-voice").map((x) => x.identity).sort();
    assert.deepEqual(removed, ["u-ghost", "u-ghost:screen"]);
  });
  await check("Channel delete closes the LiveKit room", async () => {
    lk.length = 0;
    voice.endServerVoiceChannel(io, "ch-voice", "channel_deleted");
    await flush();
    assert.ok(lk.some((x) => x.op === "deleteRoom" && x.room === "server-voice-ch-voice"));
  });

  server.close();
  let failed = 0;
  for (const [name, ok, msg] of results) {
    if (!ok) failed += 1;
    console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` -- ${msg}`}`);
  }
  if (failed) {
    console.error(`serverVoiceEnforce.integration: ${failed} of ${results.length} checks failed`);
    process.exit(1);
  }
  console.log(`serverVoiceEnforce.integration: all ${results.length} checks passed`);
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
