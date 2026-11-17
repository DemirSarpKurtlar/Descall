"use strict";
// voice-drops-01: a short socket drop must not take the server voice seat (and the
// peers' audio) away. Real socket/handlers.js + serverVoiceHandlers.js on the fake db,
// real socket.io + socket.io-client, fake LiveKit RoomService.
// Run from frontend/: node backend/test/serverVoiceSeatGrace.integration.test.cjs
const B = require("path").join(__dirname, "..");
process.env.VOICE_SEAT_GRACE_MS = "400";
process.env.JWT_SECRET = "x".repeat(32);
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "p";
process.env.NODE_ENV = "test";
process.env.LIVEKIT_URL = "ws://127.0.0.1:9";
process.env.LIVEKIT_API_KEY = "k";
process.env.LIVEKIT_API_SECRET = "y".repeat(48);
const path = require("path");
const assert = require("node:assert/strict");
const http = require("http");
const { createFakeSupabase } = require(B + "/test/fakeSupabase.cjs");
const USERS = { alice: { id: "u-alice", username: "alice" }, bob: { id: "u-bob", username: "bob" } };
const db = createFakeSupabase({
  users: Object.values(USERS).map((u) => ({ ...u, blocked_users: [] })),
  servers: [{ id: "srv-1", owner_id: "u-alice", afk_channel_id: null, afk_timeout_seconds: 300, community_enabled: false, rules_text: "" }],
  server_channels: [{ id: "ch-voice", server_id: "srv-1", type: "voice", name: "General" }],
  server_members: [{ server_id: "srv-1", user_id: "u-alice" }, { server_id: "srv-1", user_id: "u-bob" }],
});
{
  const proto = Object.getPrototypeOf(db.from("__p__"));
  for (const m of ["lt", "lte", "range", "contains", "filter", "match", "returns", "abortSignal", "like", "overlaps", "textSearch"]) if (!proto[m]) proto[m] = function () { return this; };
  const syncThen = proto.then;
  proto.then = function (res, rej) { return Promise.resolve().then(() => new Promise((a, b) => syncThen.call(this, a, b))).then(res, rej); };
}
db.rpc = async () => ({ data: null, error: null });
db.storage = { from: () => ({ upload: async () => ({}), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) };
const stub = (rel, ex) => { const p = require.resolve(B + "/" + rel); require.cache[p] = { id: p, filename: p, loaded: true, exports: ex }; };
stub("db/supabase", db);
const noop = new Proxy({}, { get: () => async () => ({ ok: true }) });
stub("lib/webPush", noop); stub("lib/voipPush", noop);
const perms = require(B + "/lib/serverPermissions");
const P = perms.Permissions; const VOICE = P.VIEW_CHANNEL | P.CONNECT | P.SPEAK;
perms.resolveChannelPermissions = async () => ({ isMember: true, isOwner: false, bits: VOICE });
perms.resolveMemberPermissions = async () => ({ isMember: true, isOwner: false, bits: VOICE });
const lk = [];
const ve = require(B + "/lib/serverVoiceEnforce");
ve._setRoomServiceForTest({
  removeParticipant: async (room, identity, o) => void lk.push({ t: Date.now(), op: "remove", room, identity, revoke: o?.revokeTokenTs != null }),
  updateParticipant: async () => {}, deleteRoom: async () => {}, listParticipants: async () => [],
});
const { Server } = require(require.resolve("socket.io", { paths: [B] }));
const { io: ioClient } = require(path.join(B, "../node_modules/socket.io-client"));
const { registerSocketHandlers } = require(B + "/socket/handlers");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const server = http.createServer();
  const io = new Server(server, { cors: { origin: "*" } });
  io.use((s, next) => { const u = USERS[s.handshake.auth?.as]; if (!u) return next(new Error("x")); s.user = { ...u }; next(); });
  registerSocketHandlers(io);
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const conn = async (as) => { const s = ioClient(`http://127.0.0.1:${port}`, { auth: { as }, transports: ["websocket"], reconnection: false, forceNew: true }); await new Promise((r, j) => { s.once("connect", r); s.once("connect_error", j); }); await sleep(50); return s; };
  const join = (s) => new Promise((r) => { s.once("server:voice:joined", r); s.emit("server:voice:join", { serverId: "srv-1", channelId: "ch-voice" }); });
  const bob = await conn("bob");
  let alice = await conn("alice");
  const bobSaw = [];
  bob.on("server:voice:member-left", (p) => bobSaw.push(["left", p.userId]));
  bob.on("server:voice:member-joined", (p) => bobSaw.push(["joined", p.user?.id, Boolean(p.rejoin)]));
  const first = await join(alice);
  assert.equal(first.rejoin, false, "a first join is not a rejoin");
  await join(bob);
  await sleep(50);
  bobSaw.length = 0;
  lk.length = 0;

  // 1) transport drops, reconnects within the grace and re-joins (useServerVoice onConnect)
  alice.io.engine.close();
  await sleep(150);
  assert.deepEqual(bobSaw, [], "no member-left on a short drop");
  assert.equal(lk.length, 0, "no LiveKit removal on a short drop");
  alice = await conn("alice");
  const again = await join(alice);
  assert.equal(again.rejoin, true, "re-joining the kept seat is flagged");
  await sleep(500); // past the grace of the dead socket
  assert.deepEqual(bobSaw, [["joined", "u-alice", true]], "peers only see a rejoin, never a leave");
  assert.equal(lk.length, 0, "the seat re-taken by the new socket survives the old socket's grace");
  console.log("PASS short drop keeps the seat; rejoin flagged");

  // 2) socket gone for longer than the grace: the seat goes
  bobSaw.length = 0;
  alice.io.engine.close();
  await sleep(700);
  assert.ok(bobSaw.length > 0 && bobSaw.every((e) => e[0] === "left" && e[1] === "u-alice"), "seat removed after the grace (voice room + sidebar viewers)");
  assert.ok(lk.some((x) => x.identity === "u-alice" && x.revoke), "LiveKit identity removed after the grace");
  console.log("PASS seat removed after the grace");

  // 3) coming back after that is a normal join (peers rebuild the link)
  bobSaw.length = 0;
  alice = await conn("alice");
  const late = await join(alice);
  assert.equal(late.rejoin, false);
  await sleep(50);
  assert.ok(bobSaw.some((e) => e[0] === "joined" && e[1] === "u-alice" && e[2] === false), "late return is a normal join");
  console.log("PASS late return is a fresh join");
  console.log("serverVoiceSeatGrace.integration: 3 checks passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
