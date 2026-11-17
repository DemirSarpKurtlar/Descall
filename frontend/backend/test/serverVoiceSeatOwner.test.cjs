"use strict";
// server-voice-02 / 03: seat-owner aware leave, takeover and move.
// Real socket/serverVoiceHandlers.js on the fake db with a recording io double.
// Run from frontend/: node backend/test/serverVoiceSeatOwner.test.cjs
const B = require("path").join(__dirname, "..");
process.env.JWT_SECRET = "x".repeat(32);
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "p";
process.env.NODE_ENV = "test";
const assert = require("node:assert/strict");
const { createFakeSupabase } = require(B + "/test/fakeSupabase.cjs");

const db = createFakeSupabase({
  users: ["alice", "bob"].map((n) => ({ id: "u-" + n, username: n, active_sessions: [{ id: "s-" + n }] })),
  server_channels: [
    { id: "ch-a", server_id: "srv-1", type: "voice", name: "General" },
    { id: "ch-b", server_id: "srv-1", type: "voice", name: "Duo" },
    { id: "ch-priv", server_id: "srv-1", type: "voice", name: "Private" },
  ],
  servers: [{ id: "srv-1", community_enabled: false, rules_text: "" }],
  server_members: [{ server_id: "srv-1", user_id: "u-alice" }, { server_id: "srv-1", user_id: "u-bob" }],
});
const sp = require.resolve(B + "/db/supabase");
require.cache[sp] = { id: sp, filename: sp, loaded: true, exports: db };

const perms = require(B + "/lib/serverPermissions");
const P = perms.Permissions;
const VOICE = P.VIEW_CHANNEL | P.CONNECT | P.SPEAK;
perms.resolveChannelPermissions = async (_d, _s, uid, ch) => {
  if (uid === "u-alice") return { isMember: true, bits: VOICE | P.MOVE_MEMBERS | P.MUTE_MEMBERS };
  return { isMember: true, bits: ch === "ch-priv" ? 0n : VOICE };
};
perms.resolveMemberPermissions = async (_d, _s, uid) => ({ isMember: true, bits: uid === "u-alice" ? VOICE | P.MOVE_MEMBERS : VOICE });
perms.assertHierarchy = async () => {};

const { activeServerVoiceCalls } = require(B + "/runtime/sharedState");
const callCoinSessions = require(B + "/lib/callCoinSessions");
const { registerServerVoiceHandlers, seatOwnerOf, runAfkScan, refreshSeatProfile } = require(B + "/socket/serverVoiceHandlers");

const log = [];
const liveSockets = new Map();
const room = (name) => ({
  emit: (e, p) => log.push({ to: name, e, p }),
  socketsLeave() {},
  socketsJoin() {},
});
const io = { to: room, in: room, sockets: { sockets: liveSockets } };
function mk(uid, id) {
  const h = {};
  const s = { id, user: { id: uid, username: uid }, data: {}, h, on: (e, f) => (h[e] = f), emit: (e, p) => log.push({ to: id, e, p }), join() {}, leave() {}, to: room };
  liveSockets.set(id, s);
  registerServerVoiceHandlers(io, s);
  return s;
}
const seats = () =>
  [...activeServerVoiceCalls.entries()].map(([c, call]) => `${c}:${[...call.participants.keys()].join(",")}`).sort();

(async () => {
  const alice = mk("u-alice", "sockA");
  const bob = mk("u-bob", "sockB");
  const bobPhone = mk("u-bob", "sockB2");

  // 02: moved into a channel Bob cannot see; his client then leaves the OLD channel and rejoins.
  await alice.h["server:voice:join"]({ serverId: "srv-1", channelId: "ch-a" });
  await bob.h["server:voice:join"]({ serverId: "srv-1", channelId: "ch-a" });
  callCoinSessions.start("u-bob", { context: "server", channelId: "ch-a" });
  log.length = 0;
  await alice.h["server:voice:move"]({ serverId: "srv-1", userId: "u-bob", fromChannelId: "ch-a", toChannelId: "ch-priv" });
  assert.deepEqual(seats(), ["ch-a:u-alice", "ch-priv:u-bob"]);
  const moved = log.find((l) => l.e === "server:voice:force-moved");
  assert.equal(moved.to, "sockB", "force-moved goes to the socket holding the seat, not every device");
  assert.ok(callCoinSessions.get("u-bob", { context: "server", channelId: "ch-priv" }), "the DesCoin session moves with the seat");
  assert.equal(log.filter((l) => l.e === "descoin:call-summary").length, 0, "a move is not the end of the call");
  bob.h["server:voice:leave"]({ channelId: "ch-a" });
  assert.deepEqual(seats(), ["ch-a:u-alice", "ch-priv:u-bob"], "a stale leave keeps the new seat");
  await bob.h["server:voice:join"]({ serverId: "srv-1", channelId: "ch-priv" });
  assert.deepEqual(seats(), ["ch-a:u-alice", "ch-priv:u-bob"], "rejoin of a force-moved seat into a private channel works");
  assert.equal(log.filter((l) => l.e === "server:voice:error").length, 0);

  // 03: the phone takes the seat in another channel; the desktop is told, and its stale leave
  // (Leave button / tab close) does not drop the phone.
  log.length = 0;
  await bobPhone.h["server:voice:join"]({ serverId: "srv-1", channelId: "ch-b" });
  assert.deepEqual(seats(), ["ch-a:u-alice", "ch-b:u-bob"]);
  assert.equal(seatOwnerOf("ch-b", "u-bob"), "sockB2");
  const told = log.find((l) => l.to === "sockB" && l.e === "server:voice:force-disconnected");
  assert.equal(told?.p?.reason, "other_device");
  bob.h["server:voice:leave"]({ channelId: "ch-priv" });
  bob.h["server:voice:leave"]({});
  assert.deepEqual(seats(), ["ch-a:u-alice", "ch-b:u-bob"], "another device's leave never drops the live seat");

  // Same channel taken over from the other device.
  log.length = 0;
  await bob.h["server:voice:join"]({ serverId: "srv-1", channelId: "ch-b" });
  assert.equal(seatOwnerOf("ch-b", "u-bob"), "sockB");
  assert.equal(log.find((l) => l.to === "sockB2" && l.e === "server:voice:force-disconnected")?.p?.reason, "other_device");

  // The holder's own leave still works (with and without a channel id).
  bob.h["server:voice:leave"]({ channelId: "ch-b" });
  assert.deepEqual(seats(), ["ch-a:u-alice"]);
  await bob.h["server:voice:join"]({ serverId: "srv-1", channelId: "ch-b" });
  bob.h["server:voice:leave"]({});
  assert.deepEqual(seats(), ["ch-a:u-alice"]);

  // AFK move: same arrival event as a moderator move, sent to the seat's socket, session kept.
  await bob.h["server:voice:join"]({ serverId: "srv-1", channelId: "ch-a" });
  db._tables.servers.rows[0].afk_channel_id = "ch-b";
  db._tables.servers.rows[0].afk_timeout_seconds = 60;
  const seat = activeServerVoiceCalls.get("ch-a").participants.get("u-bob");
  seat.muted = true;
  seat.afkIdleSince = Date.now() - 10 * 60_000;
  log.length = 0;
  const res = await runAfkScan(io);
  assert.equal(res.moved, 1);
  assert.deepEqual(seats(), ["ch-a:u-alice", "ch-b:u-bob"]);
  assert.ok(log.some((l) => l.to === "server-voice:ch-b" && l.e === "server:voice:member-joined"), "AFK arrival announced");
  assert.equal(log.find((l) => l.e === "server:voice:force-moved")?.to, "sockB");
  assert.ok(callCoinSessions.get("u-bob", { context: "server", channelId: "ch-b" }));

  // 18: equipping a voice tile mid-call reaches the seat and the channel (no rejoin).
  log.length = 0;
  const changed = refreshSeatProfile(io, "u-bob", { id: "u-bob", username: "bob", display_name: "Bob", avatar_url: "/b.png", equippedVoiceTile: { effect_key: "vt-neon-carsi" } });
  assert.equal(changed, 1);
  const bobSeat = activeServerVoiceCalls.get("ch-b").participants.get("u-bob");
  assert.equal(bobSeat.equippedVoiceTile.effect_key, "vt-neon-carsi");
  assert.equal(bobSeat.displayName, "Bob");
  assert.equal(bobSeat.afkLocked, true, "seat state is kept");
  assert.ok(log.some((l) => l.e === "server:voice:channel-state" && l.p.members.some((m) => m.equippedVoiceTile?.effect_key === "vt-neon-carsi")));
  refreshSeatProfile(io, "u-bob", { id: "u-bob", username: "bob", display_name: "Bob" });
  assert.equal(activeServerVoiceCalls.get("ch-b").participants.get("u-bob").equippedVoiceTile, null, "unequip clears it");

  console.log("serverVoiceSeatOwner test ok");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
