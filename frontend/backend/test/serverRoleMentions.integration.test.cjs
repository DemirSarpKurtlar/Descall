"use strict";

/**
 * Messaging phase 5: role, @everyone and @here mentions in server channels,
 * through the real server:channel:message handler.
 *   - who may ping (mentionable role / owner / ADMINISTRATOR / MANAGE_ROLES;
 *     plus MENTION_EVERYONE by default; owner/admins only with the "admins" policy)
 *   - who is notified (members who see the channel, minus the sender, server
 *     level "muted" and channel mutes; level "mentions" counts pings;
 *     @here = online and not invisible)
 *   - @everyone rate limit per sender per channel
 *   - cards say "@Rol adı", pinged members get `mentioned: true` on the plain card
 *   node frontend/backend/test/serverRoleMentions.integration.test.cjs
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
delete process.env.SERVER_EVERYONE_PING_POLICY;
delete process.env.SERVER_EVERYONE_COOLDOWN_SEC;

const assert = require("node:assert/strict");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

// Push stand-in: records every mention / server push.
const pushes = [];
const pushPath = require.resolve("../lib/webPush");
require.cache[pushPath] = {
  id: pushPath,
  filename: pushPath,
  loaded: true,
  exports: new Proxy({}, { get: (_, name) => async (userIds, payload) => { pushes.push({ name, userIds, payload }); return { ok: true }; } }),
};

const { Permissions, EVERYONE_DEFAULT, toPgBigint } = require("../lib/serverPermissions");

const S = "srv-1";
const C = "chan-1";
const HIDDEN = "chan-hidden";
const C2 = "chan-2";
const R = {
  every: "00000000-0000-4000-8000-0000000000e0",
  admin: "00000000-0000-4000-8000-0000000000a1",
  mod: "00000000-0000-4000-8000-0000000000a2",
  vip: "00000000-0000-4000-8000-0000000000a3",
  design: "00000000-0000-4000-8000-0000000000a4", // mentionable
  secret: "00000000-0000-4000-8000-0000000000a5", // not mentionable
};
const names = ["own", "adm", "mod", "vip", "alice", "bob", "carol", "dave", "erin", "gone"];
const fake = createFakeSupabase({
  users: names.map((n) => ({ id: `u-${n}`, username: n, active_sessions: [{ id: `s-${n}` }] })),
  servers: [{ id: S, name: "Tasarım Kulübü", owner_id: "u-own" }],
  server_members: [
    { server_id: S, user_id: "u-own", notification_level: "all" },
    { server_id: S, user_id: "u-adm", notification_level: "all" },
    { server_id: S, user_id: "u-mod", notification_level: "all" },
    { server_id: S, user_id: "u-vip", notification_level: "all" },
    { server_id: S, user_id: "u-alice", notification_level: "all" },
    { server_id: S, user_id: "u-bob", notification_level: "all" },
    { server_id: S, user_id: "u-carol", notification_level: "muted" },
    { server_id: S, user_id: "u-dave", notification_level: "all" },
    { server_id: S, user_id: "u-erin", notification_level: "mentions" },
  ],
  server_roles: [
    { id: R.every, server_id: S, name: "@everyone", is_everyone: true, position: 0, permissions: toPgBigint(EVERYONE_DEFAULT), mentionable: false },
    { id: R.admin, server_id: S, name: "Yönetici", position: 5, permissions: toPgBigint(Permissions.ADMINISTRATOR), mentionable: false },
    { id: R.mod, server_id: S, name: "Moderatör", position: 4, permissions: toPgBigint(Permissions.MANAGE_ROLES), mentionable: false },
    { id: R.vip, server_id: S, name: "VIP", position: 3, permissions: toPgBigint(Permissions.MENTION_EVERYONE), mentionable: false },
    { id: R.design, server_id: S, name: "Tasarım Ekibi", color: 0xe67e22, position: 2, permissions: "0", mentionable: true },
    { id: R.secret, server_id: S, name: "Gizli", position: 1, permissions: "0", mentionable: false },
  ],
  server_member_roles: [
    { server_id: S, user_id: "u-adm", role_id: R.admin },
    { server_id: S, user_id: "u-mod", role_id: R.mod },
    { server_id: S, user_id: "u-vip", role_id: R.vip },
    { server_id: S, user_id: "u-alice", role_id: R.design },
    { server_id: S, user_id: "u-bob", role_id: R.design },
    { server_id: S, user_id: "u-bob", role_id: R.secret },
    { server_id: S, user_id: "u-carol", role_id: R.design },
    { server_id: S, user_id: "u-dave", role_id: R.design },
    { server_id: S, user_id: "u-erin", role_id: R.design },
    { server_id: S, user_id: "u-gone", role_id: R.design }, // left the server: no member row
  ],
  server_channels: [
    { id: C, server_id: S, name: "genel", type: "text", position: 0, slowmode_seconds: 0 },
    { id: HIDDEN, server_id: S, name: "yonetim", type: "text", position: 1, slowmode_seconds: 0 },
    { id: C2, server_id: S, name: "sohbet", type: "text", position: 2, slowmode_seconds: 0 },
  ],
  server_channel_overrides: [
    // Only staff see #yonetim.
    { id: "ov-1", channel_id: HIDDEN, target_type: "role", target_id: R.every, allow_permissions: "0", deny_permissions: toPgBigint(Permissions.VIEW_CHANNEL) },
  ],
  server_channel_mutes: [{ user_id: "u-dave", channel_id: C }],
  server_channel_reads: [],
  server_messages: [],
  device_push_tokens: [],
});
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const shared = require("../runtime/sharedState");
const { registerServerChannelHandlers, __massPingLimiter } = require("../socket/serverChannelHandlers");

const emitted = [];
const io = {
  to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }),
  in: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }), fetchSockets: async () => [] }),
  sockets: { adapter: { rooms: new Map() }, sockets: new Map() },
};

function makeSocket(userId) {
  const handlers = new Map();
  const out = [];
  const s = {
    id: `sock-${userId}`,
    user: { id: userId, username: userId.replace(/^u-/, "") },
    handshake: { auth: {}, headers: {} },
    data: {},
    rooms: new Set(),
    on(ev, fn) { handlers.set(ev, fn); },
    emit(ev, payload) { out.push({ ev, payload }); },
    join(r) { s.rooms.add(r); },
    leave(r) { s.rooms.delete(r); },
    to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }),
    broadcast: { emit() {}, to: (room) => io.to(room) },
  };
  registerServerChannelHandlers(io, s);
  return { s, out, send: (payload) => handlers.get("server:channel:message")(payload) };
}

const settle = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const pinged = () => emitted.filter((e) => e.event === "mention:received").map((e) => e.room.replace(/^user:/, "")).sort();
const reset = () => { emitted.length = 0; pushes.length = 0; };
const stored = () => fake._tables.server_messages.rows;
let tempN = 0;

async function send(sock, content, channelId = C) {
  reset();
  sock.out.length = 0;
  const tempId = `t-${++tempN}`;
  await sock.send({ serverId: S, channelId, tempId, content });
  await settle();
  const err = sock.out.find((o) => o.ev === "server:channel:message:error");
  return { err: err?.payload || null };
}

(async () => {
  const sk = Object.fromEntries(names.map((n) => [n, makeSocket(`u-${n}`)]));

  // 1. A plain member cannot ping @everyone / @here: rejected, nothing stored.
  let before = stored().length;
  let r = await send(sk.alice, "@everyone selam");
  assert.equal(r.err?.code, "MISSING_PERMISSION", "plain member @everyone rejected");
  r = await send(sk.alice, "bakın @here");
  assert.equal(r.err?.code, "MISSING_PERMISSION", "plain member @here rejected");
  assert.equal(stored().length, before, "nothing stored");
  assert.deepEqual(pinged(), []);

  // 2. Default policy (Discord style): a role the server gave MENTION_EVERYONE may ping
  //    @everyone. The "admins" policy restricts it to owner / admins.
  process.env.SERVER_EVERYONE_PING_POLICY = "admins";
  r = await send(sk.vip, "@everyone duyuru");
  assert.equal(r.err?.code, "MISSING_PERMISSION", "admins policy: MENTION_EVERYONE alone rejected");
  delete process.env.SERVER_EVERYONE_PING_POLICY;
  before = stored().length;
  r = await send(sk.vip, "@everyone duyuru", C2);
  assert.equal(r.err, null, "default policy: MENTION_EVERYONE accepted");
  assert.equal(stored().length, before + 1, "stored");

  // 3. MANAGE_ROLES may: everyone who sees the channel, minus sender, muted level and channel mutes.
  before = stored().length;
  r = await send(sk.mod, "@everyone toplantı 20:00");
  assert.equal(r.err, null, "mod @everyone accepted");
  assert.equal(stored().length, before + 1, "stored");
  assert.deepEqual(pinged(), ["u-adm", "u-alice", "u-bob", "u-erin", "u-own", "u-vip"], "carol (muted) and dave (channel muted) skipped");
  const mPush = pushes.filter((p) => p.name === "sendMentionPush");
  assert.equal(mPush.length, 1, "one mention push fan-out");
  assert.deepEqual([...mPush[0].userIds].sort(), ["u-adm", "u-alice", "u-bob", "u-erin", "u-own", "u-vip"]);
  const cards = emitted.filter((e) => e.event === "server:channel:notify");
  assert.ok(cards.length > 0, "plain cards still sent");
  assert.ok(cards.filter((e) => e.room === "user:u-alice").every((e) => e.payload.mentioned === true), "pinged members' card marked mentioned");

  // 4. Same sender, same channel, within the window: rate limited, not stored.
  before = stored().length;
  r = await send(sk.mod, "@here tekrar");
  assert.equal(r.err?.code, "MENTION_RATE_LIMITED");
  assert.ok(r.err.retryAfterSeconds > 0 && r.err.retryAfterSeconds <= 60, "retry within a minute");
  assert.equal(r.err.messageKey, "You can mention @everyone or @here again in {seconds}s.");
  assert.equal(stored().length, before, "rate-limited message not stored");
  // Another channel is its own window.
  r = await send(sk.mod, "@here sohbet", C2);
  assert.equal(r.err, null, "other channel has its own window");
  assert.deepEqual(pinged(), [], "@here with nobody online pings nobody");

  // 5. @here: only online (and not invisible) members.
  shared.presence.set("u-alice", { username: "alice", status: "online", socketId: "x1" });
  shared.presence.set("u-bob", { username: "bob", status: "invisible", socketId: "x2" });
  shared.presence.set("u-erin", { username: "erin", status: "dnd", socketId: "x3" });
  shared.presence.set("u-carol", { username: "carol", status: "online", socketId: "x4" });
  r = await send(sk.adm, "@here kim burada?");
  assert.equal(r.err, null, "ADMINISTRATOR @here accepted");
  assert.deepEqual(pinged(), ["u-alice", "u-erin"], "online only; invisible bob and muted carol skipped");

  // 6. A mentionable role: any member may ping it; "mentions" level counts.
  r = await send(sk.alice, `<@&${R.design}> yeni logoya bakın`);
  assert.equal(r.err, null);
  assert.deepEqual(pinged(), ["u-bob", "u-erin"], "role holders who are notifiable; sender, muted, channel-muted and ex-members skipped");
  const card = emitted.find((e) => e.event === "mention:received");
  assert.equal(card.payload.text, "@Tasarım Ekibi yeni logoya bakın", "cards read the role name");
  const plain = emitted.find((e) => e.event === "server:channel:notify" && e.room === "user:u-own");
  assert.equal(plain.payload.text, "@Tasarım Ekibi yeni logoya bakın");
  assert.equal(plain.payload.mentioned, undefined, "non-pinged member gets the plain card");
  const rolePush = pushes.find((p) => p.name === "sendMentionPush");
  assert.equal(rolePush.payload.body, "@Tasarım Ekibi yeni logoya bakın", "push body has no raw token");
  assert.ok(stored().at(-1).content.includes(`<@&${R.design}>`), "stored text keeps the token");

  // 7. A role that is not mentionable: the text goes out, nobody is pinged.
  r = await send(sk.alice, `<@&${R.secret}> gizli`);
  assert.equal(r.err, null, "message still sent");
  assert.deepEqual(pinged(), [], "non-mentionable role pings nobody for a plain member");

  // 8. ... but the owner and MANAGE_ROLES may ping it.
  r = await send(sk.own, `<@&${R.secret}> bakar mısın`);
  assert.deepEqual(pinged(), ["u-bob"], "owner pings a non-mentionable role");
  r = await send(sk.mod, `<@&${R.secret}> sen de`);
  assert.deepEqual(pinged(), ["u-bob"], "MANAGE_ROLES pings a non-mentionable role");

  // 9. A role of another server (forged token) pings nobody.
  r = await send(sk.own, "<@&00000000-0000-4000-8000-0000000000ff> yok");
  assert.deepEqual(pinged(), []);

  // 10. Hidden channel: role holders who cannot see it are not pinged.
  r = await send(sk.own, `<@&${R.design}> buraya`, HIDDEN);
  assert.equal(r.err, null);
  assert.deepEqual(pinged(), [], "nobody in the role can see #yonetim");

  // 11. A direct @name and a role ping for the same person: one mention card (the direct one).
  r = await send(sk.alice, `@bob <@&${R.design}> bakın`);
  const bobCards = emitted.filter((e) => e.event === "mention:received" && e.room === "user:u-bob");
  assert.equal(bobCards.length, 1, "bob gets one card");

  assert.ok(__massPingLimiter.windowMs === 60000, "default window 60 s");
  console.log("serverRoleMentions integration test OK");
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
