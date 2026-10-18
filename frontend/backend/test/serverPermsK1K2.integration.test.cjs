"use strict";

/**
 * Same-server permission bypasses found by the 2026-10-18 audit (PoCs in
 * /workspace/audit/server-perms-2026-10-18/harness, turned into tests here).
 *   K1  reaction:add joined a hidden channel's live room (no VIEW_CHANNEL check)
 *   K2  channel override PUT/DELETE let a MANAGE_ROLES member self-grant VIEW /
 *       MANAGE_MESSAGES / MENTION_EVERYONE on a channel they cannot see, and lock out higher roles
 *   O2  hidden channel ids leaked via server:channels:resync, server:channel:deleted,
 *       server:voice:channel-state / member-left / member-joined / states
 *   Y1  voice moderation ignored the role hierarchy (a low mod could mute/disconnect the owner)
 *   Y2  GET /reactions/conversation/server/:id had no access check
 *   T2  second round (Bot/Grok retest of f8410bb): channel move keeps stale room sockets,
 *       override precedence, timed-out members in voice / reactions / typing, hidden
 *       channel attachments via /api/media/refresh, invite max_uses race, invite listing,
 *       read/mute on hidden channels, voluntary leave keeps rooms, mention leak
 *   T3-4 first override edit on a synced private channel replaced the copied category
 *       row: an unrelated allow on @everyone made the channel public (2.11.15 regression)
 *   C1  deleting a private category (or moving a channel out of it) dropped its rules:
 *       child channels without own overrides became visible to every member
 * Run: node frontend/backend/test/serverPermsK1K2.integration.test.cjs
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const crypto = require("crypto");
const assert = require("node:assert/strict");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const supabasePath = require.resolve("../db/supabase");
const pushPath = require.resolve("../lib/webPush");
require.cache[pushPath] = { id: pushPath, filename: pushPath, loaded: true, exports: new Proxy({}, { get: () => async () => ({ ok: true }) }) };

const P = require("../lib/serverPermissions");
const { Permissions: F } = P;
const S = "srv-1";
const MSG_STAFF = crypto.randomUUID();
const MSG_GENERAL = crypto.randomUUID();
const MSG_NOREAD = crypto.randomUUID();
const fake = createFakeSupabase({
  users: ["owner", "mod", "member", "senior", "helper", "outsider", "dual", "late1", "late2"].map((id) => ({ id, username: id, active_sessions: [{ id: `s-${id}` }] })),
  servers: [{ id: S, owner_id: "owner", name: "S1" }],
  server_members: ["owner", "mod", "member", "senior", "helper", "dual"].map((u) => ({ server_id: S, user_id: u })),
  server_roles: [
    { id: "everyone", server_id: S, is_everyone: true, position: 0, permissions: P.toPgBigint(P.EVERYONE_DEFAULT) },
    { id: "helperrole", server_id: S, is_everyone: false, position: 1, permissions: "0" },
    { id: "modrole", server_id: S, is_everyone: false, position: 2, permissions: P.toPgBigint(F.MANAGE_ROLES | F.MANAGE_CHANNELS | F.KICK_MEMBERS | F.MUTE_MEMBERS | F.MOVE_MEMBERS | F.DEAFEN_MEMBERS) },
    { id: "seniorrole", server_id: S, is_everyone: false, position: 5, permissions: P.toPgBigint(F.KICK_MEMBERS) },
  ],
  server_member_roles: [
    { server_id: S, user_id: "mod", role_id: "modrole" },
    { server_id: S, user_id: "senior", role_id: "seniorrole" },
    { server_id: S, user_id: "helper", role_id: "helperrole" },
    { server_id: S, user_id: "dual", role_id: "seniorrole" },
    { server_id: S, user_id: "dual", role_id: "helperrole" },
  ],
  server_channels: [
    { id: "general", server_id: S, type: "text", name: "general", position: 0 },
    { id: "staff", server_id: S, type: "text", name: "staff", position: 1 },
    { id: "noread", server_id: S, type: "text", name: "noread", position: 2 },
    { id: "staffvoice", server_id: S, type: "voice", name: "staff-voice", position: 3 },
    { id: "lobbyvoice", server_id: S, type: "voice", name: "lobby", position: 4 },
    { id: "trash", server_id: S, type: "text", name: "trash", position: 5 },
    { id: "cat-private", server_id: S, type: "category", name: "Staff area", position: 6 },
    { id: "c-plain", server_id: S, type: "text", name: "plans", position: 7, parent_id: "cat-private" },
    { id: "c-own", server_id: S, type: "text", name: "logs", position: 8, parent_id: "cat-private" },
    { id: "c-voice", server_id: S, type: "voice", name: "staff-call", position: 9, parent_id: "cat-private" },
    { id: "cat-mixed", server_id: S, type: "category", name: "Mixed", position: 10 },
    { id: "c-conflict", server_id: S, type: "text", name: "tricky", position: 11, parent_id: "cat-mixed" },
    { id: "cat-two", server_id: S, type: "category", name: "Private two", position: 12 },
    { id: "c-move", server_id: S, type: "text", name: "move-me", position: 13, parent_id: "cat-two" },
    { id: "cat-open", server_id: S, type: "category", name: "Open", position: 14 },
    { id: "c-public", server_id: S, type: "text", name: "public", position: 15 },
    { id: "cat-three", server_id: S, type: "category", name: "Private three", position: 16 },
    { id: "c-sync", server_id: S, type: "text", name: "synced", position: 17, parent_id: "cat-three" },
    { id: "c-roles", server_id: S, type: "text", name: "roles", position: 18 },
    { id: "c-mdeny", server_id: S, type: "text", name: "mdeny", position: 19 },
    { id: "c-evict", server_id: S, type: "text", name: "evict", position: 20 },
    { id: "cat-t3", server_id: S, type: "category", name: "T3 private", position: 21 },
    { id: "t3-owner", server_id: S, type: "text", name: "t3-owner", position: 22, parent_id: "cat-t3" },
    { id: "t3-mod", server_id: S, type: "text", name: "t3-mod", position: 23, parent_id: "cat-t3" },
    { id: "t3-inherit", server_id: S, type: "text", name: "t3-inherit", position: 24, parent_id: "cat-t3" },
    { id: "t3-member", server_id: S, type: "text", name: "t3-member", position: 25, parent_id: "cat-t3" },
  ],
  server_channel_overrides: [
    { id: "o1", channel_id: "staff", target_type: "role", target_id: "everyone", allow_permissions: "0", deny_permissions: P.toPgBigint(F.VIEW_CHANNEL) },
    { id: "o1s", channel_id: "staff", target_type: "role", target_id: "seniorrole", allow_permissions: P.toPgBigint(F.VIEW_CHANNEL), deny_permissions: "0" },
    { id: "o2", channel_id: "staffvoice", target_type: "role", target_id: "everyone", allow_permissions: "0", deny_permissions: P.toPgBigint(F.VIEW_CHANNEL | F.CONNECT) },
    { id: "o3", channel_id: "noread", target_type: "role", target_id: "everyone", allow_permissions: "0", deny_permissions: P.toPgBigint(F.READ_MESSAGE_HISTORY) },
    { id: "o4", channel_id: "trash", target_type: "role", target_id: "everyone", allow_permissions: "0", deny_permissions: P.toPgBigint(F.VIEW_CHANNEL) },
    { id: "oc1", channel_id: "cat-private", target_type: "role", target_id: "everyone", allow_permissions: "0", deny_permissions: P.toPgBigint(F.VIEW_CHANNEL | F.CONNECT) },
    { id: "oc2", channel_id: "cat-private", target_type: "role", target_id: "seniorrole", allow_permissions: P.toPgBigint(F.VIEW_CHANNEL | F.CONNECT), deny_permissions: "0" },
    { id: "oc3", channel_id: "cat-private", target_type: "member", target_id: "helper", allow_permissions: P.toPgBigint(F.VIEW_CHANNEL), deny_permissions: P.toPgBigint(F.SEND_MESSAGES) },
    { id: "oc4", channel_id: "c-own", target_type: "role", target_id: "everyone", allow_permissions: "0", deny_permissions: P.toPgBigint(F.ADD_REACTIONS) },
    { id: "oc5", channel_id: "c-own", target_type: "member", target_id: "helper", allow_permissions: P.toPgBigint(F.SEND_MESSAGES), deny_permissions: "0" },
    { id: "oc6", channel_id: "c-own", target_type: "role", target_id: "seniorrole", allow_permissions: "0", deny_permissions: P.toPgBigint(F.ATTACH_FILES) },
    { id: "om1", channel_id: "cat-mixed", target_type: "role", target_id: "everyone", allow_permissions: "0", deny_permissions: P.toPgBigint(F.VIEW_CHANNEL) },
    { id: "om2", channel_id: "cat-mixed", target_type: "member", target_id: "member", allow_permissions: P.toPgBigint(F.VIEW_CHANNEL), deny_permissions: "0" },
    { id: "om3", channel_id: "c-conflict", target_type: "role", target_id: "everyone", allow_permissions: "0", deny_permissions: P.toPgBigint(F.VIEW_CHANNEL) },
    { id: "ot1", channel_id: "cat-two", target_type: "role", target_id: "everyone", allow_permissions: "0", deny_permissions: P.toPgBigint(F.VIEW_CHANNEL) },
    { id: "ot2", channel_id: "cat-two", target_type: "role", target_id: "helperrole", allow_permissions: P.toPgBigint(F.VIEW_CHANNEL), deny_permissions: "0" },
    { id: "ok1", channel_id: "cat-three", target_type: "role", target_id: "everyone", allow_permissions: "0", deny_permissions: P.toPgBigint(F.VIEW_CHANNEL) },
    { id: "ok2", channel_id: "cat-three", target_type: "member", target_id: "helper", allow_permissions: "0", deny_permissions: P.toPgBigint(F.SEND_MESSAGES) },
    { id: "ok3", channel_id: "cat-three", target_type: "role", target_id: "helperrole", allow_permissions: P.toPgBigint(F.VIEW_CHANNEL | F.SEND_MESSAGES), deny_permissions: "0" },
    { id: "or1", channel_id: "c-roles", target_type: "role", target_id: "seniorrole", allow_permissions: "0", deny_permissions: P.toPgBigint(F.SEND_MESSAGES) },
    { id: "or2", channel_id: "c-roles", target_type: "role", target_id: "helperrole", allow_permissions: P.toPgBigint(F.SEND_MESSAGES), deny_permissions: "0" },
    { id: "od1", channel_id: "c-mdeny", target_type: "role", target_id: "everyone", allow_permissions: P.toPgBigint(F.VIEW_CHANNEL), deny_permissions: "0" },
    { id: "od2", channel_id: "c-mdeny", target_type: "member", target_id: "member", allow_permissions: "0", deny_permissions: P.toPgBigint(F.VIEW_CHANNEL) },
    { id: "ot3a", channel_id: "cat-t3", target_type: "role", target_id: "everyone", allow_permissions: "0", deny_permissions: P.toPgBigint(F.VIEW_CHANNEL | F.SEND_MESSAGES) },
    { id: "ot3b", channel_id: "cat-t3", target_type: "role", target_id: "modrole", allow_permissions: P.toPgBigint(F.VIEW_CHANNEL), deny_permissions: "0" },
    { id: "oo1", channel_id: "cat-open", target_type: "role", target_id: "everyone", allow_permissions: "0", deny_permissions: P.toPgBigint(F.VIEW_CHANNEL) },
  ],
  server_messages: [
    { id: MSG_STAFF, server_id: S, channel_id: "staff", sender_id: "owner", content: "secret staff talk", created_at: "2026-10-18T10:00:00Z" },
    { id: MSG_GENERAL, server_id: S, channel_id: "general", sender_id: "owner", content: "hello", created_at: "2026-10-18T10:01:00Z" },
    { id: MSG_NOREAD, server_id: S, channel_id: "noread", sender_id: "owner", content: "no history", created_at: "2026-10-18T10:02:00Z" },
    { id: crypto.randomUUID(), server_id: S, channel_id: "staff", sender_id: "owner", content: "", media_url: "sb://media-private/files/staff-plan.pdf", created_at: "2026-10-18T10:03:00Z" },
    { id: crypto.randomUUID(), server_id: S, channel_id: "noread", sender_id: "owner", content: "", media_url: "sb://media-private/files/noread.pdf", created_at: "2026-10-18T10:04:00Z" },
    { id: crypto.randomUUID(), server_id: S, channel_id: "general", sender_id: "owner", content: "", media_url: "sb://media-private/files/general.pdf", created_at: "2026-10-18T10:05:00Z" },
  ],
  server_invites: [
    { code: "INVOWNER", server_id: S, creator_id: "owner", uses: 0, max_uses: null, created_at: "2026-10-18T09:00:00Z" },
    { code: "INVMOD", server_id: S, creator_id: "mod", uses: 0, max_uses: null, created_at: "2026-10-18T09:01:00Z" },
    { code: "ONEUSE", server_id: S, creator_id: "owner", uses: 0, max_uses: 1, created_at: "2026-10-18T09:02:00Z" },
  ],
  reactions: [{ id: "rx1", message_id: MSG_STAFF, conversation_type: "server", conversation_id: "staff", user_id: "owner", emoji: "🔥" }],
});
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

// ---- socket.io stand-in with real rooms + fetchSockets
const rooms = new Map();
const sockets = new Map();
const emitted = [];
const roomSockets = (room) => [...(rooms.get(room) || [])].map((id) => sockets.get(id)).filter(Boolean);
const io = {
  _conn: null,
  on(ev, fn) { if (ev === "connection") this._conn = fn; },
  to(room) {
    return {
      emit: (ev, payload) => {
        emitted.push({ room, ev, payload });
        for (const s of roomSockets(room)) s.out.push({ ev, payload, via: room });
      },
    };
  },
  in(room) {
    return {
      ...io.to(room),
      fetchSockets: async () => roomSockets(room),
      socketsJoin: (r) => roomSockets(room).forEach((s) => s.join(r)),
      socketsLeave: (r) => roomSockets(room).forEach((s) => s.leave(r)),
    };
  },
  emit() {},
  of() { return io; },
  fetchSockets: async () => [...sockets.values()],
  sockets: { adapter: { rooms }, sockets },
};
function makeSocket(userId) {
  const handlers = new Map();
  const s = {
    id: `sock-${userId}`,
    user: { id: userId, username: userId },
    handshake: { auth: {} },
    data: {},
    rooms: new Set(),
    out: [],
    on(ev, fn) { handlers.set(ev, fn); },
    onAny() {}, use() {}, disconnect() {},
    emit(ev, payload) { s.out.push({ ev, payload, via: "self" }); },
    join(r) { (Array.isArray(r) ? r : [r]).forEach((x) => { s.rooms.add(x); if (!rooms.has(x)) rooms.set(x, new Set()); rooms.get(x).add(s.id); }); },
    leave(r) { s.rooms.delete(r); rooms.get(r)?.delete(s.id); },
    to(room) { return { emit: (ev, payload) => { emitted.push({ room, ev, payload }); for (const o of roomSockets(room)) if (o !== s) o.out.push({ ev, payload, via: room }); } }; },
    broadcast: { emit() {}, to: (r) => s.to(r) },
    fire: async (ev, payload) => { const fn = handlers.get(ev); if (!fn) throw new Error("no handler " + ev); return fn(payload); },
  };
  sockets.set(s.id, s);
  s.join(`user:${userId}`);
  return s;
}

const express = require("express");
const { signToken } = require("../config/jwt");
const serversRouter = require("../routes/servers");
const reactionsRouter = require("../routes/reactions");
const rows = (t) => fake._tables[t]?.rows || [];
const override = (ch, type, id) => rows("server_channel_overrides").find((o) => o.channel_id === ch && o.target_type === type && o.target_id === id);
const settle = (ms = 40) => new Promise((r) => setTimeout(r, ms));

const failures = [];
let passed = 0;
async function check(name, fn) {
  try { await fn(); passed += 1; } catch (err) { failures.push(`${name}: ${String(err.message).split("\n")[0]}`); }
}

async function run() {
  const app = express();
  app.use(express.json());
  app.set("io", io);
  app.use("/servers", serversRouter);
  app.use("/reactions", reactionsRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (who, method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signToken({ id: who, username: who, sid: `s-${who}` })}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  const can = async (user, ch, flag) => P.hasPermission((await P.resolveChannelPermissions(fake, S, user, ch)).bits, flag);

  const { registerSocketHandlers } = require("../socket/handlers");
  registerSocketHandlers(io);
  const sk = {};
  for (const u of ["owner", "mod", "member", "senior", "dual"]) {
    sk[u] = makeSocket(u);
    io._conn(sk[u]);
    sk[u].join(`server:${S}`); // what server:subscribe does for members
  }
  await settle();

  try {
    // ---------------- K1
    await check("K1 reaction:add on a hidden channel → no row, no live-room join", async () => {
      const before = rows("reactions").length;
      await sk.member.fire("server:channel:join", "staff");
      assert.ok(!sk.member.rooms.has("server-channel:staff"), "legit join is refused");
      await sk.member.fire("reaction:add", { messageId: MSG_STAFF, conversationType: "server", conversationId: "staff", emoji: "👍" });
      await sk.member.fire("reaction:add", { messageId: "x", conversationType: "server", conversationId: "staff", emoji: "👍" });
      await settle();
      assert.ok(!sk.member.rooms.has("server-channel:staff"), "reaction must not join the hidden room");
      assert.equal(rows("reactions").length, before);
      sk.member.out.length = 0;
      io.to("server-channel:staff").emit("server:channel:message", { channelId: "staff", message: { content: "staff only: ban plan for @member" } });
      assert.ok(!sk.member.out.some((o) => o.ev === "server:channel:message"), "hidden channel traffic does not reach the member");
    });
    await check("K1 reaction:add on a visible channel stores the reaction but never joins a room", async () => {
      const before = rows("reactions").length;
      await sk.member.fire("reaction:add", { messageId: MSG_GENERAL, conversationType: "server", conversationId: "general", emoji: "👍" });
      await settle();
      assert.equal(rows("reactions").length, before + 1);
      assert.ok(!sk.member.rooms.has("server-channel:general"), "membership only via server:channel:join");
      assert.ok(sk.member.out.some((o) => o.ev === "reaction:update" && o.payload.messageId === MSG_GENERAL), "sender still sees it");
    });
    await check("K1 reaction:add needs READ_MESSAGE_HISTORY", async () => {
      const before = rows("reactions").length;
      await sk.member.fire("reaction:add", { messageId: MSG_NOREAD, conversationType: "server", conversationId: "noread", emoji: "👍" });
      await settle();
      assert.equal(rows("reactions").length, before);
    });
    await check("K1 reaction:add with a message of another channel → refused", async () => {
      const before = rows("reactions").length;
      await sk.member.fire("reaction:add", { messageId: MSG_STAFF, conversationType: "server", conversationId: "general", emoji: "👀" });
      await settle();
      assert.equal(rows("reactions").length, before);
    });
    await check("K1 assertTextChannelAccess always needs VIEW_CHANNEL (pin/edit/search on a hidden channel refused)", async () => {
      const { assertTextChannelAccess } = require("../socket/serverChannelHandlers");
      await assert.rejects(() => assertTextChannelAccess("member", "staff", F.ADD_REACTIONS), /Missing permission/);
      await assert.rejects(() => assertTextChannelAccess("member", "staff", F.SEND_MESSAGES), /Missing permission/);
      await assert.rejects(() => assertTextChannelAccess("member", "staff", null), /Missing permission/);
      const ok = await assertTextChannelAccess("senior", "staff", F.ADD_REACTIONS);
      assert.equal(ok.channel.id, "staff");
    });

    // ---------------- K2
    await check("K2 mod cannot self-grant VIEW/READ/MANAGE_MESSAGES/MENTION_EVERYONE on a hidden channel", async () => {
      assert.equal(await can("mod", "staff", F.VIEW_CHANNEL), false);
      const r = await call("mod", "PUT", `/servers/${S}/channels/staff/overrides`, { targetType: "member", targetId: "mod", permissions: { VIEW_CHANNEL: "allow", READ_MESSAGE_HISTORY: "allow", MANAGE_MESSAGES: "allow", MENTION_EVERYONE: "allow" } });
      assert.equal(r.status, 403, JSON.stringify(r.body));
      assert.equal(await can("mod", "staff", F.VIEW_CHANNEL), false);
      assert.equal((await call("mod", "GET", `/servers/${S}/channels/staff/messages`)).status, 403);
      assert.ok(!override("staff", "member", "mod"));
    });
    await check("K2 mod cannot edit overrides of their own member on a visible channel", async () => {
      const r = await call("mod", "PUT", `/servers/${S}/channels/general/overrides`, { targetType: "member", targetId: "mod", permissions: { MANAGE_MESSAGES: "allow" } });
      assert.equal(r.status, 403);
      assert.equal(r.body.code, "CANNOT_EDIT_SELF");
    });
    await check("K2 allow/deny limited to the actor's own channel permissions", async () => {
      const r = await call("mod", "PUT", `/servers/${S}/channels/general/overrides`, { targetType: "member", targetId: "member", permissions: { MANAGE_MESSAGES: "allow", MENTION_EVERYONE: "allow", ATTACH_FILES: "allow" } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const row = override("general", "member", "member");
      const allow = P.fromPgBigint(row.allow_permissions);
      assert.equal(P.hasPermission(allow, F.MANAGE_MESSAGES), false, "mod lacks MANAGE_MESSAGES");
      assert.equal(P.hasPermission(allow, F.MENTION_EVERYONE), false, "mod lacks MENTION_EVERYONE");
      assert.equal(P.hasPermission(allow, F.ATTACH_FILES), true, "mod has ATTACH_FILES");
    });
    await check("K2 mod cannot lock out a higher role (deny VIEW on seniorrole)", async () => {
      const r = await call("mod", "PUT", `/servers/${S}/channels/general/overrides`, { targetType: "role", targetId: "seniorrole", permissions: { VIEW_CHANNEL: "deny", SEND_MESSAGES: "deny" } });
      assert.equal(r.status, 403);
      assert.equal(await can("senior", "general", F.VIEW_CHANNEL), true);
    });
    await check("K2 mod cannot override a member with a higher role, or the owner", async () => {
      assert.equal((await call("mod", "PUT", `/servers/${S}/channels/general/overrides`, { targetType: "member", targetId: "senior", permissions: { SEND_MESSAGES: "deny" } })).status, 403);
      assert.equal((await call("mod", "PUT", `/servers/${S}/channels/general/overrides`, { targetType: "member", targetId: "owner", permissions: { SEND_MESSAGES: "deny" } })).status, 403);
    });
    await check("K2 mod can still edit @everyone and lower roles with bits they hold", async () => {
      const r = await call("mod", "PUT", `/servers/${S}/channels/general/overrides`, { targetType: "role", targetId: "everyone", permissions: { SEND_MESSAGES: "deny" } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(await can("member", "general", F.SEND_MESSAGES), false);
    });
    await check("K2 bits the actor lacks are preserved on an existing override", async () => {
      const o = await call("owner", "PUT", `/servers/${S}/channels/general/overrides`, { targetType: "role", targetId: "helperrole", permissions: { MANAGE_MESSAGES: "allow" } });
      assert.equal(o.status, 200);
      const r = await call("mod", "PUT", `/servers/${S}/channels/general/overrides`, { targetType: "role", targetId: "helperrole", permissions: { ATTACH_FILES: "allow" } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const allow = P.fromPgBigint(override("general", "role", "helperrole").allow_permissions);
      assert.ok(P.hasPermission(allow, F.MANAGE_MESSAGES), "owner's MANAGE_MESSAGES kept");
      assert.ok(P.hasPermission(allow, F.ATTACH_FILES), "mod's ATTACH_FILES added");
    });
    await check("K2 DELETE follows the same rules", async () => {
      let r = await call("mod", "DELETE", `/servers/${S}/channels/general/overrides/role/helperrole`);
      assert.equal(r.status, 403, "override holds MANAGE_MESSAGES the mod lacks");
      assert.equal(r.body.code, "OVERRIDE_PERMISSION");
      r = await call("mod", "DELETE", `/servers/${S}/channels/staff/overrides/role/everyone`);
      assert.equal(r.status, 403, "cannot see #staff");
      assert.ok(override("staff", "role", "everyone"), "#staff stays private");
      r = await call("mod", "DELETE", `/servers/${S}/channels/general/overrides/role/seniorrole`);
      assert.equal(r.status, 403, "higher role");
      r = await call("mod", "DELETE", `/servers/${S}/channels/general/overrides/member/member`);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      r = await call("owner", "DELETE", `/servers/${S}/channels/general/overrides/role/helperrole`);
      assert.equal(r.status, 200);
    });
    await check("K2 GET overrides of a channel the actor cannot see → 403", async () => {
      assert.equal((await call("mod", "GET", `/servers/${S}/channels/staff/overrides`)).status, 403);
      assert.equal((await call("mod", "GET", `/servers/${S}/channels/general/overrides`)).status, 200);
    });

    // ---------------- O2 hidden channel id leaks
    await check("O2 server:channels:resync carries no channel id", async () => {
      const mark = emitted.length;
      const r = await call("owner", "PUT", `/servers/${S}/channels/general/overrides`, { targetType: "role", targetId: "seniorrole", permissions: { ADD_REACTIONS: "deny" } });
      assert.equal(r.status, 200);
      await settle();
      const resync = emitted.slice(mark).filter((e) => e.ev === "server:channels:resync");
      assert.ok(resync.length >= 1);
      for (const e of resync) assert.deepEqual(Object.keys(e.payload), ["serverId"], JSON.stringify(e.payload));
    });
    await check("O2 server:channel:deleted only reaches members who could see the channel", async () => {
      for (const u of Object.keys(sk)) sk[u].out.length = 0;
      const r = await call("owner", "DELETE", `/servers/${S}/channels/trash`);
      assert.equal(r.status, 200);
      await settle();
      const got = (u) => sk[u].out.some((o) => o.ev === "server:channel:deleted" && o.payload.channelId === "trash");
      assert.ok(got("owner"), "owner saw it");
      assert.ok(!got("member") && !got("mod") && !got("senior"), "hidden from the rest");
      assert.ok(!emitted.some((e) => e.room === `server:${S}` && e.ev === "server:channel:deleted"), "not to the server room");
    });
    const { activeServerVoiceCalls } = require("../runtime/sharedState");
    await check("O2 voice channel-state / member-left of a hidden voice channel only reach viewers", async () => {
      activeServerVoiceCalls.set("staffvoice", { serverId: S, channelName: "staff-voice", participants: new Map([["owner", { id: "owner" }], ["senior", { id: "senior" }]]), startTime: Date.now() });
      for (const u of Object.keys(sk)) sk[u].out.length = 0;
      await sk.owner.fire("server:voice:media-state", { channelId: "staffvoice", muted: true });
      await sk.senior.fire("server:voice:leave", { channelId: "staffvoice" });
      await settle(80);
      const seen = (u, ev) => sk[u].out.some((o) => o.ev === ev && o.payload?.channelId === "staffvoice");
      assert.ok(!seen("member", "server:voice:channel-state") && !seen("member", "server:voice:member-left"), "member sees nothing of staffvoice");
      assert.ok(!seen("mod", "server:voice:channel-state"), "mod cannot see staffvoice either");
      assert.ok(seen("owner", "server:voice:channel-state"), "owner (viewer) still gets it");
      assert.ok(!emitted.some((e) => e.room === `server:${S}` && String(e.ev).startsWith("server:voice:")), "nothing voice-related to the whole server room");
    });
    await check("O2 server:voice:subscribe lists only channels the user can see", async () => {
      activeServerVoiceCalls.set("lobbyvoice", { serverId: S, channelName: "lobby", participants: new Map([["mod", { id: "mod" }]]), startTime: Date.now() });
      sk.member.out.length = 0;
      await sk.member.fire("server:voice:subscribe", { serverId: S });
      const st = sk.member.out.find((o) => o.ev === "server:voice:states");
      assert.ok(st, "states emitted");
      const ids = st.payload.states.map((x) => x.channelId);
      assert.ok(ids.includes("lobbyvoice") && !ids.includes("staffvoice"), JSON.stringify(ids));
    });

    // ---------------- Y1 voice hierarchy
    await check("Y1 low mod cannot server-mute / deafen / disconnect / move the owner or a higher role", async () => {
      activeServerVoiceCalls.set("lobbyvoice", {
        serverId: S, channelName: "lobby", startTime: Date.now(),
        participants: new Map([["owner", { id: "owner", muted: false }], ["senior", { id: "senior", muted: false }], ["member", { id: "member", muted: false }], ["mod", { id: "mod" }]]),
      });
      const lobby = () => activeServerVoiceCalls.get("lobbyvoice").participants;
      await sk.mod.fire("server:voice:server-mute", { serverId: S, channelId: "lobbyvoice", userId: "owner", muted: true });
      await sk.mod.fire("server:voice:server-deafen", { serverId: S, channelId: "lobbyvoice", userId: "senior", deafened: true });
      await sk.mod.fire("server:voice:disconnect", { serverId: S, channelId: "lobbyvoice", userId: "owner" });
      await sk.mod.fire("server:voice:move", { serverId: S, userId: "senior", fromChannelId: "lobbyvoice", toChannelId: "staffvoice" });
      await settle();
      assert.ok(!lobby().get("owner")?.serverMuted, "owner not muted");
      assert.ok(lobby().has("owner"), "owner not disconnected");
      assert.ok(!lobby().get("senior")?.serverDeafened && lobby().has("senior"), "senior untouched");
    });
    await check("Y1 mod can still moderate a lower member", async () => {
      await sk.mod.fire("server:voice:server-mute", { serverId: S, channelId: "lobbyvoice", userId: "member", muted: true });
      await settle();
      assert.equal(activeServerVoiceCalls.get("lobbyvoice").participants.get("member").serverMuted, true);
    });

    await check("Y1 move needs MOVE_MEMBERS + CONNECT on the destination (channel overrides)", async () => {
      sk.mod.out.length = 0;
      await sk.mod.fire("server:voice:move", { serverId: S, userId: "member", fromChannelId: "lobbyvoice", toChannelId: "staffvoice" });
      await settle();
      assert.ok(activeServerVoiceCalls.get("lobbyvoice").participants.has("member"), "member not moved into staffvoice");
      assert.ok(sk.mod.out.some((o) => o.ev === "server:voice:error" && /CONNECT/.test(o.payload.message)), JSON.stringify(sk.mod.out.slice(-2)));
    });
    // ---------------- Y2 reactions REST
    await check("Y2 GET reactions of a hidden channel / as a non-member → 403", async () => {
      assert.equal((await call("member", "GET", "/reactions/conversation/server/staff")).status, 403);
      assert.equal((await call("outsider", "GET", "/reactions/conversation/server/general")).status, 403);
      const ok = await call("senior", "GET", "/reactions/conversation/server/staff");
      assert.equal(ok.status, 200);
      assert.equal(ok.body.reactions[MSG_STAFF][0].emoji, "🔥");
    });

    // ---------------- C1 category detach keeps effective permissions
    const USERS = ["owner", "mod", "member", "senior", "helper", "outsider", "dual"];
    const snapshot = async (channels) => {
      const out = {};
      for (const ch of channels) for (const u of USERS) out[`${ch}/${u}`] = String((await P.resolveChannelPermissions(fake, S, u, ch)).bits);
      return out;
    };
    await check("C1 deleting a private category keeps every child's effective permissions", async () => {
      const kids = ["c-plain", "c-own", "c-voice"];
      const before = await snapshot(kids);
      assert.equal(await can("member", "c-plain", F.VIEW_CHANNEL), false, "precondition: hidden");
      const mark = emitted.length;
      const r = await call("owner", "DELETE", `/servers/${S}/channels/cat-private`);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      await settle();
      for (const k of kids) assert.equal(rows("server_channels").find((c) => c.id === k).parent_id ?? null, null);
      assert.deepEqual(await snapshot(kids), before);
      assert.equal(await can("member", "c-plain", F.VIEW_CHANNEL), false, "#plans stays hidden");
      assert.equal(await can("member", "c-voice", F.CONNECT), false, "voice stays closed");
      assert.equal(await can("helper", "c-own", F.SEND_MESSAGES), true, "child's own allow still wins");
      assert.equal(await can("helper", "c-plain", F.SEND_MESSAGES), false, "category deny kept");
      assert.ok(emitted.slice(mark).some((e) => e.ev === "server:channels:resync"), "clients refetch");
    });
    await check("C1 deleting a category whose child has its own overrides changes nothing for it", async () => {
      assert.equal(await can("member", "c-conflict", F.VIEW_CHANNEL), false, "own @everyone deny; category member allow not stacked");
      const before = await snapshot(["c-conflict"]);
      const r = await call("owner", "DELETE", `/servers/${S}/channels/cat-mixed`);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.deepEqual(await snapshot(["c-conflict"]), before);
    });
    await check("C1 moving a channel out of a private category keeps it private", async () => {
      const before = await snapshot(["c-move"]);
      const r = await call("owner", "PATCH", `/servers/${S}/channels/c-move`, { parentId: null });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.deepEqual(await snapshot(["c-move"]), before);
      assert.equal(await can("member", "c-move", F.VIEW_CHANNEL), false);
      assert.equal(await can("helper", "c-move", F.VIEW_CHANNEL), true);
    });
    await check("C1 moving between categories keeps the old category's rules; moving in inherits", async () => {
      let r = await call("owner", "PATCH", `/servers/${S}/channels/c-move`, { parentId: "cat-two" });
      assert.equal(r.status, 200);
      assert.equal(await can("member", "c-move", F.VIEW_CHANNEL), false);
      r = await call("owner", "PATCH", `/servers/${S}/channels/c-public`, { parentId: "cat-open" });
      assert.equal(r.status, 200);
      assert.equal(await can("member", "c-public", F.VIEW_CHANNEL), false, "joining a private category hides it (intended)");
      r = await call("owner", "PATCH", `/servers/${S}/channels/c-public`, { parentId: null });
      assert.equal(r.status, 200);
      assert.equal(await can("member", "c-public", F.VIEW_CHANNEL), false, "leaving keeps it private, not silently public");
    });

    // ---------------- P1 overwrite precedence (Discord order, synced categories)
    await check("P1 role overrides are aggregated: any role allow beats any role deny", async () => {
      assert.equal(await can("dual", "c-roles", F.SEND_MESSAGES), true, "helperrole allow + seniorrole deny → allowed");
      assert.equal(await can("senior", "c-roles", F.SEND_MESSAGES), false);
      assert.equal(await can("helper", "c-roles", F.SEND_MESSAGES), true);
    });
    await check("P1 member deny beats @everyone allow in the same channel", async () => {
      assert.equal(await can("member", "c-mdeny", F.VIEW_CHANNEL), false);
      assert.equal(await can("mod", "c-mdeny", F.VIEW_CHANNEL), true);
    });
    await check("P1 a synced channel uses its category's rules (member deny wins over role allow)", async () => {
      assert.equal(await can("member", "c-sync", F.VIEW_CHANNEL), false);
      assert.equal(await can("helper", "c-sync", F.VIEW_CHANNEL), true);
      assert.equal(await can("helper", "c-sync", F.SEND_MESSAGES), false, "category member deny beats category role allow");
      const list = await call("member", "GET", `/servers/${S}`);
      const ids = (list.body.server?.channels || list.body.channels || []).map((c) => c.id);
      assert.ok(ids.length > 0 && !ids.includes("c-sync") && ids.includes("general"), JSON.stringify(ids).slice(0, 200));
    });
    await check("P1 first edit on a synced channel copies the category rules (stays private)", async () => {
      const r = await call("owner", "PUT", `/servers/${S}/channels/c-sync/overrides`, { targetType: "role", targetId: "helperrole", permissions: { ATTACH_FILES: "allow" } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.ok(override("c-sync", "role", "everyone"), "category @everyone deny copied");
      assert.equal(await can("member", "c-sync", F.VIEW_CHANNEL), false, "still hidden");
      assert.equal(await can("helper", "c-sync", F.SEND_MESSAGES), false, "category member deny kept");
      assert.equal(await can("helper", "c-sync", F.ATTACH_FILES), true, "edit applied");
    });

    // ---------------- T2 second round
    await check("T2 mention in a hidden channel does not alert a non-viewer", async () => {
      sk.member.out.length = 0;
      await sk.owner.fire("server:channel:join", "staff");
      await sk.owner.fire("server:channel:message", { channelId: "staff", content: "staff only: ban plan for @member", tempId: "t-m1" });
      await settle(80);
      assert.ok(!sk.member.out.some((o) => o.ev === "mention:received"), "no mention:received for member");
      sk.senior.out.length = 0;
      await sk.owner.fire("server:channel:message", { channelId: "staff", content: "ping @senior", tempId: "t-m2" });
      await settle(80);
      assert.ok(sk.senior.out.some((o) => o.ev === "mention:received"), "viewer still alerted");
    });
    await check("T2 moving a channel into a private category evicts sockets that lost VIEW", async () => {
      await sk.member.fire("server:channel:join", "c-evict");
      assert.ok(sk.member.rooms.has("server-channel:c-evict"), "precondition: joined");
      const r = await call("owner", "PATCH", `/servers/${S}/channels/c-evict`, { parentId: "cat-open" });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      await settle(400);
      assert.equal(await can("member", "c-evict", F.VIEW_CHANNEL), false);
      assert.ok(!sk.member.rooms.has("server-channel:c-evict"), "evicted from the live room");
    });
    const { canAccessPath } = require("../lib/privateMedia");
    await check("T2 /api/media/refresh: hidden-channel attachment needs VIEW + READ_MESSAGE_HISTORY", async () => {
      assert.equal(await canAccessPath(fake, "member", "files/staff-plan.pdf"), false, "hidden #staff");
      assert.equal(await canAccessPath(fake, "member", "files/noread.pdf"), false, "no READ_MESSAGE_HISTORY");
      assert.equal(await canAccessPath(fake, "outsider", "files/general.pdf"), false, "non-member");
      assert.equal(await canAccessPath(fake, "senior", "files/staff-plan.pdf"), true, "viewer");
      assert.equal(await canAccessPath(fake, "member", "files/general.pdf"), true, "visible channel");
    });
    await check("T2 read receipt / mute on a hidden channel → 404", async () => {
      assert.equal((await call("member", "POST", `/servers/${S}/channels/staff/read`, {})).status, 404);
      assert.equal((await call("member", "PUT", `/servers/${S}/channels/staff/mute`, { muted: true })).status, 404);
      assert.equal((await call("member", "POST", `/servers/${S}/channels/general/read`, {})).status, 200);
      assert.equal((await call("senior", "PUT", `/servers/${S}/channels/staff/mute`, { muted: true })).status, 200);
    });
    await check("T2 invites: only MANAGE_GUILD lists / revokes everyone's", async () => {
      const mine = await call("mod", "GET", `/servers/${S}/invites`);
      assert.equal(mine.status, 200, JSON.stringify(mine.body));
      assert.deepEqual(mine.body.invites.map((i) => i.code), ["INVMOD"]);
      const all = await call("owner", "GET", `/servers/${S}/invites`);
      assert.ok(all.body.invites.length >= 3);
      assert.equal((await call("mod", "DELETE", `/servers/${S}/invites/INVOWNER`)).status, 404);
      assert.ok(rows("server_invites").some((i) => i.code === "INVOWNER"));
      assert.equal((await call("mod", "DELETE", `/servers/${S}/invites/INVMOD`)).status, 200);
    });
    await check("T2 invite max_uses=1 with two parallel joins → exactly one gets in", async () => {
      const [a, b] = await Promise.all([
        call("late1", "POST", "/servers/invites/ONEUSE/join"),
        call("late2", "POST", "/servers/invites/ONEUSE/join"),
      ]);
      const codes = [a.status, b.status].sort();
      assert.ok(codes[0] === 201 && [404, 410].includes(codes[1]), JSON.stringify([a.status, a.body.error, b.status, b.body.error]));
      const joined = rows("server_members").filter((m) => m.server_id === S && ["late1", "late2"].includes(m.user_id));
      assert.equal(joined.length, 1);
    });
    await check("T2 typing on a server channel needs the live room, SEND_MESSAGES and no timeout", async () => {
      await sk.owner.fire("server:channel:join", "general");
      sk.owner.out.length = 0;
      await sk.member.fire("typing:start", { context: "server", channelId: "staff" });
      await sk.mod.fire("typing:start", { context: "server", channelId: "general" });
      await settle(60);
      assert.ok(!sk.owner.out.some((o) => o.ev === "typing:update" && o.payload.channelId === "staff"), "no fake typing into #staff");
      assert.ok(!sk.owner.out.some((o) => o.ev === "typing:update" && o.payload.fromUser.id === "mod"), "mod is not in #general room");
      await sk.senior.fire("server:channel:join", "general");
      sk.senior.out.length = 0;
      await sk.owner.fire("typing:start", { context: "server", channelId: "general" });
      await settle(60);
      assert.ok(sk.senior.out.some((o) => o.ev === "typing:update" && o.payload.fromUser.id === "owner"), "legit typing works");
    });
    const memberRow = () => rows("server_members").find((m) => m.server_id === S && m.user_id === "member");
    await check("T2 applying a timeout drops the member from voice", async () => {
      assert.ok(activeServerVoiceCalls.get("lobbyvoice").participants.has("member"), "precondition: seated");
      sk.member.out.length = 0;
      const r = await call("owner", "POST", `/servers/${S}/members/member/timeout`, { durationSeconds: 600 });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      await settle();
      assert.ok(!activeServerVoiceCalls.get("lobbyvoice")?.participants.has("member"), "removed from voice");
      assert.ok(sk.member.out.some((o) => o.ev === "server:voice:force-disconnected"), "client told");
      assert.ok(memberRow().timeout_until);
    });
    await check("T2 timed-out member cannot join voice, start camera/screen, react or type", async () => {
      sk.member.out.length = 0;
      await sk.member.fire("server:voice:join", { serverId: S, channelId: "lobbyvoice" });
      await settle();
      assert.ok(!activeServerVoiceCalls.get("lobbyvoice")?.participants.has("member"), "join refused");
      assert.ok(sk.member.out.some((o) => o.ev === "server:voice:error" && o.payload.code === "TIMED_OUT"), JSON.stringify(sk.member.out.slice(-2)));
      // Seated anyway (race): camera/screen refused and the seat dropped.
      activeServerVoiceCalls.get("lobbyvoice").participants.set("member", { id: "member", canStream: true });
      await sk.member.fire("server:voice:camera:start", { channelId: "lobbyvoice" });
      assert.ok(!activeServerVoiceCalls.get("lobbyvoice")?.participants.has("member"), "camera refused, seat dropped");
      activeServerVoiceCalls.get("lobbyvoice").participants.set("member", { id: "member", canStream: true });
      await sk.member.fire("server:voice:screen:start", { channelId: "lobbyvoice" });
      assert.ok(!activeServerVoiceCalls.get("lobbyvoice")?.participants.has("member"), "screen refused");
      const before = rows("reactions").length;
      await sk.member.fire("reaction:add", { messageId: MSG_GENERAL, conversationType: "server", conversationId: "general", emoji: "😡" });
      await settle();
      assert.equal(rows("reactions").length, before, "no reaction");
      await sk.member.fire("server:channel:join", "general");
      sk.owner.out.length = 0;
      await sk.member.fire("typing:start", { context: "server", channelId: "general" });
      await settle(60);
      assert.ok(!sk.owner.out.some((o) => o.ev === "typing:update" && o.payload.fromUser.id === "member"), "no typing");
    });
    await check("T2 leaving a server drops the live rooms right away", async () => {
      await sk.dual.fire("server:channel:join", "general");
      assert.ok(sk.dual.rooms.has("server-channel:general") && sk.dual.rooms.has(`server:${S}`));
      const r = await call("dual", "POST", `/servers/${S}/leave`, {});
      assert.equal(r.status, 200, JSON.stringify(r.body));
      await settle();
      assert.ok(!sk.dual.rooms.has("server-channel:general"), "left channel room");
      assert.ok(!sk.dual.rooms.has(`server:${S}`), "left server room");
    });

    // ---------------- T3-4 first edit on a synced private channel
    const everyoneRow = (ch) => override(ch, "role", "everyone");
    await check("T3-4 owner: unrelated @everyone allow on a synced private channel keeps the category deny", async () => {
      assert.equal(await can("member", "t3-owner", F.VIEW_CHANNEL), false, "precondition");
      const r = await call("owner", "PUT", `/servers/${S}/channels/t3-owner/overrides`, { targetType: "role", targetId: "everyone", permissions: { ADD_REACTIONS: "allow" } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(await can("member", "t3-owner", F.VIEW_CHANNEL), false, "still private");
      const row = everyoneRow("t3-owner");
      assert.ok(P.hasPermission(P.fromPgBigint(row.deny_permissions), F.VIEW_CHANNEL), "VIEW deny kept");
      assert.ok(P.hasPermission(P.fromPgBigint(row.deny_permissions), F.SEND_MESSAGES), "SEND deny kept");
      assert.ok(P.hasPermission(P.fromPgBigint(row.allow_permissions), F.ADD_REACTIONS), "edit applied");
      assert.equal(await can("mod", "t3-owner", F.VIEW_CHANNEL), true, "modrole allow copied too");
    });
    await check("T3-4 restricted editor (mod): same merge, channel stays private", async () => {
      assert.equal(await can("mod", "t3-mod", F.VIEW_CHANNEL), true, "mod can see it");
      const r = await call("mod", "PUT", `/servers/${S}/channels/t3-mod/overrides`, { targetType: "role", targetId: "everyone", permissions: { ATTACH_FILES: "deny" } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(await can("member", "t3-mod", F.VIEW_CHANNEL), false, "still private");
      assert.ok(P.hasPermission(P.fromPgBigint(everyoneRow("t3-mod").deny_permissions), F.ATTACH_FILES));
    });
    await check("T3-4 member target on a synced private channel keeps the copied @everyone deny", async () => {
      const r = await call("owner", "PUT", `/servers/${S}/channels/t3-member/overrides`, { targetType: "member", targetId: "helper", permissions: { ADD_REACTIONS: "allow" } });
      assert.equal(r.status, 200);
      assert.equal(await can("member", "t3-member", F.VIEW_CHANNEL), false);
      assert.equal(await can("helper", "t3-member", F.VIEW_CHANNEL), false, "helper got reactions, not VIEW");
    });
    await check("T3-4 an explicit inherit still clears a copied bit; later edits are full replacement", async () => {
      let r = await call("owner", "PUT", `/servers/${S}/channels/t3-inherit/overrides`, { targetType: "role", targetId: "everyone", permissions: { VIEW_CHANNEL: "inherit", ADD_REACTIONS: "allow" } });
      assert.equal(r.status, 200);
      assert.equal(await can("member", "t3-inherit", F.VIEW_CHANNEL), true, "owner explicitly opened it");
      assert.equal(await can("member", "t3-inherit", F.SEND_MESSAGES), false, "unnamed SEND deny kept");
      r = await call("owner", "PUT", `/servers/${S}/channels/t3-inherit/overrides`, { targetType: "role", targetId: "everyone", permissions: { VIEW_CHANNEL: "deny" } });
      assert.equal(r.status, 200);
      const row = everyoneRow("t3-inherit");
      assert.equal(row.deny_permissions, P.toPgBigint(F.VIEW_CHANNEL), "second edit replaces (client now sees the row)");
      assert.equal(row.allow_permissions, "0");
    });
  } finally {
    server.close();
  }

  console.log(`serverPermsK1K2: ${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const f of failures) console.error("  FAIL " + f);
    process.exit(1);
  }
  console.log("serverPermsK1K2.integration.test.cjs: ok");
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
