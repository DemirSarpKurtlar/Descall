"use strict";

/**
 * Cross-server scope (2026-10-18 security audit). Every route / socket event that
 * takes a channel, role, member, invite, ban or message id must check that the
 * object belongs to the server the caller was authorized on. Here Alice owns
 * server A and is a plain member of server B (Bob's). Nothing she does through
 * A may read or change B, and B's private channel #secret stays hidden.
 * Run: node frontend/backend/test/serverCrossScope.integration.test.cjs
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

const { Permissions, EVERYONE_DEFAULT, toPgBigint } = require("../lib/serverPermissions");

const MSG_SECRET = crypto.randomUUID();
const MSG_A = crypto.randomUUID();
const users = ["alice", "bob", "carol", "dave", "erin"].map((u) => ({ id: `u-${u}`, username: u, active_sessions: [{ id: `s-${u}` }] }));
const fake = createFakeSupabase({
  users,
  servers: [
    { id: "srv-A", name: "Alice Town", owner_id: "u-alice" },
    { id: "srv-B", name: "Bob Base", owner_id: "u-bob" },
  ],
  server_members: [
    { server_id: "srv-A", user_id: "u-alice" },
    { server_id: "srv-A", user_id: "u-erin" },
    { server_id: "srv-B", user_id: "u-bob" },
    { server_id: "srv-B", user_id: "u-alice" },
    { server_id: "srv-B", user_id: "u-carol" },
  ],
  server_roles: [
    { id: "rA-every", server_id: "srv-A", name: "@everyone", is_everyone: true, position: 0, permissions: toPgBigint(EVERYONE_DEFAULT) },
    { id: "rA-mod", server_id: "srv-A", name: "Mod", is_everyone: false, position: 1, permissions: "0" },
    { id: "rB-every", server_id: "srv-B", name: "@everyone", is_everyone: true, position: 0, permissions: toPgBigint(EVERYONE_DEFAULT) },
    { id: "rB-staff", server_id: "srv-B", name: "Staff", is_everyone: false, position: 2, permissions: "0" },
  ],
  server_member_roles: [{ server_id: "srv-B", user_id: "u-carol", role_id: "rB-staff" }],
  server_channels: [
    { id: "cA-text", server_id: "srv-A", name: "general", type: "text", position: 0 },
    { id: "cA-voice", server_id: "srv-A", name: "Voice", type: "voice", position: 1 },
    { id: "cB-text", server_id: "srv-B", name: "lobby", type: "text", position: 0 },
    { id: "cB-secret", server_id: "srv-B", name: "secret", type: "text", position: 1 },
    { id: "cB-voice", server_id: "srv-B", name: "Staff Voice", type: "voice", position: 2 },
  ],
  server_channel_overrides: [
    { id: "ov-secret", channel_id: "cB-secret", target_type: "role", target_id: "rB-every", allow_permissions: "0", deny_permissions: toPgBigint(Permissions.VIEW_CHANNEL) },
    { id: "ov-secret-staff", channel_id: "cB-secret", target_type: "role", target_id: "rB-staff", allow_permissions: toPgBigint(Permissions.VIEW_CHANNEL), deny_permissions: "0" },
    { id: "ov-a", channel_id: "cA-text", target_type: "member", target_id: "u-erin", allow_permissions: toPgBigint(Permissions.ATTACH_FILES), deny_permissions: "0" },
  ],
  server_bans: [{ server_id: "srv-B", user_id: "u-dave", moderator_id: "u-bob" }],
  server_invites: [{ code: "BINVITE1", server_id: "srv-B", creator_id: "u-bob", uses: 0 }],
  server_messages: [
    { id: MSG_SECRET, server_id: "srv-B", channel_id: "cB-secret", sender_id: "u-bob", content: "B staff only" },
    { id: MSG_A, server_id: "srv-A", channel_id: "cA-text", sender_id: "u-alice", content: "hi A" },
  ],
  reactions: [{ id: "rx1", message_id: MSG_SECRET, conversation_type: "server", conversation_id: "cB-secret", user_id: "u-bob", emoji: "🔥" }],
  group_members: [{ group_id: "g1", user_id: "u-bob" }],
});
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken } = require("../config/jwt");
const serversRouter = require("../routes/servers");
const reactionsRouter = require("../routes/reactions");
const { resolveChannelPermissions } = require("../lib/serverPermissions");

const rows = (t) => fake._tables[t]?.rows || [];
const emitted = [];
const io = {
  to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }),
  in: () => ({ fetchSockets: async () => [], socketsLeave() {}, socketsJoin() {} }),
  sockets: { adapter: { rooms: new Map() }, sockets: new Map() },
};

const failures = [];
const passed = [];
async function check(name, fn) {
  try {
    await fn();
    passed.push(name);
  } catch (err) {
    failures.push(`${name}: ${err.message.split("\n")[0]}`);
  }
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
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signToken({ id: `u-${who}`, username: who, sid: `s-${who}` })}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  const auditsOn = (serverId, action) => rows("server_audit_logs").filter((r) => r.server_id === serverId && (!action || r.action === action));

  try {
    // ---- The reported bug: override DELETE via a server the caller manages.
    await check("override DELETE via foreign server → 404, override kept, no audit", async () => {
      const r = await call("alice", "DELETE", "/servers/srv-A/channels/cB-secret/overrides/role/rB-every");
      assert.equal(r.status, 404, JSON.stringify(r.body));
      assert.equal(r.body.error, "Channel not found.");
      assert.ok(rows("server_channel_overrides").some((o) => o.id === "ov-secret"), "B's @everyone VIEW deny must survive");
      assert.equal(auditsOn("srv-A", "CHANNEL_OVERRIDE_DELETE").length, 0, "no audit row on A for B's channel");
    });
    await check("override DELETE on B without MANAGE_ROLES → 403", async () => {
      const r = await call("alice", "DELETE", "/servers/srv-B/channels/cB-secret/overrides/role/rB-every");
      assert.equal(r.status, 403);
      assert.ok(rows("server_channel_overrides").some((o) => o.id === "ov-secret"));
    });
    await check("override DELETE own channel still works (owner of A)", async () => {
      const r = await call("alice", "DELETE", "/servers/srv-A/channels/cA-text/overrides/member/u-erin");
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.ok(!rows("server_channel_overrides").some((o) => o.id === "ov-a"));
      assert.equal(auditsOn("srv-A", "CHANNEL_OVERRIDE_DELETE").length, 1);
    });
    await check("override PUT via foreign server → 404", async () => {
      const r = await call("alice", "PUT", "/servers/srv-A/channels/cB-secret/overrides", { targetType: "role", targetId: "rA-every", permissions: { VIEW_CHANNEL: "allow" } });
      assert.equal(r.status, 404);
      const r2 = await call("alice", "PUT", "/servers/srv-A/channels/cB-secret/overrides", { targetType: "role", targetId: "rB-every", permissions: {} });
      assert.equal(r2.status, 404);
      assert.ok(rows("server_channel_overrides").some((o) => o.id === "ov-secret"));
    });
    await check("override PUT with a role of another server → 404", async () => {
      const r = await call("alice", "PUT", "/servers/srv-A/channels/cA-text/overrides", { targetType: "role", targetId: "rB-every", permissions: { VIEW_CHANNEL: "deny" } });
      assert.equal(r.status, 404);
    });
    await check("override GET via foreign server → 404", async () => {
      const r = await call("alice", "GET", "/servers/srv-A/channels/cB-secret/overrides");
      assert.equal(r.status, 404);
    });

    // ---- Channels
    await check("channel PATCH via foreign server → 404", async () => {
      const r = await call("alice", "PATCH", "/servers/srv-A/channels/cB-secret", { name: "pwned" });
      assert.equal(r.status, 404);
      assert.equal(rows("server_channels").find((c) => c.id === "cB-secret").name, "secret");
    });
    await check("channel PATCH parentId of another server → 400", async () => {
      const r = await call("alice", "PATCH", "/servers/srv-A/channels/cA-text", { parentId: "cB-text" });
      assert.equal(r.status, 400);
    });
    await check("channel DELETE via foreign server → 404", async () => {
      const r = await call("alice", "DELETE", "/servers/srv-A/channels/cB-secret");
      assert.equal(r.status, 404);
      assert.ok(rows("server_channels").some((c) => c.id === "cB-secret"));
    });
    await check("channel messages via foreign server → 404", async () => {
      const r = await call("alice", "GET", "/servers/srv-A/channels/cB-secret/messages");
      assert.equal(r.status, 404);
    });
    await check("channel mute / read via foreign server → 404", async () => {
      assert.equal((await call("alice", "PUT", "/servers/srv-A/channels/cB-secret/mute", { muted: true })).status, 404);
      assert.equal((await call("alice", "POST", "/servers/srv-A/channels/cB-secret/read", {})).status, 404);
    });

    // ---- Roles
    await check("role PATCH via foreign server → 404", async () => {
      const r = await call("alice", "PATCH", "/servers/srv-A/roles/rB-staff", { permissions: { ADMINISTRATOR: true } });
      assert.equal(r.status, 404);
      assert.equal(rows("server_roles").find((x) => x.id === "rB-staff").permissions, "0");
    });
    await check("role DELETE via foreign server → 404", async () => {
      const r = await call("alice", "DELETE", "/servers/srv-A/roles/rB-staff");
      assert.equal(r.status, 404);
      assert.ok(rows("server_roles").some((x) => x.id === "rB-staff"));
    });
    await check("member role PUT with a foreign role → 404", async () => {
      const r = await call("alice", "PUT", "/servers/srv-A/members/u-erin/roles/rB-staff");
      assert.equal(r.status, 404);
      assert.ok(!rows("server_member_roles").some((x) => x.role_id === "rB-staff" && x.user_id === "u-erin"));
    });
    await check("member role PUT/DELETE for a member of another server → 404", async () => {
      assert.equal((await call("alice", "PUT", "/servers/srv-A/members/u-carol/roles/rA-mod")).status, 404);
      assert.equal((await call("alice", "DELETE", "/servers/srv-A/members/u-carol/roles/rB-staff")).status, 404);
      assert.ok(rows("server_member_roles").some((x) => x.role_id === "rB-staff" && x.user_id === "u-carol"));
    });

    // ---- Members, bans
    await check("kick a member of another server → 404", async () => {
      const r = await call("alice", "DELETE", "/servers/srv-A/members/u-carol");
      assert.equal(r.status, 404);
      assert.ok(rows("server_members").some((m) => m.server_id === "srv-B" && m.user_id === "u-carol"));
    });
    await check("timeout set/clear for a member of another server → 404", async () => {
      assert.equal((await call("alice", "POST", "/servers/srv-A/members/u-carol/timeout", { durationSeconds: 600 })).status, 404);
      assert.equal((await call("alice", "DELETE", "/servers/srv-A/members/u-carol/timeout")).status, 404);
      assert.ok(!rows("server_members").find((m) => m.server_id === "srv-B" && m.user_id === "u-carol").timeout_until);
    });
    await check("nickname: non-member cannot probe membership (403 first)", async () => {
      const r = await call("dave", "PATCH", "/servers/srv-B/members/u-carol/nickname", { nickname: "x" });
      assert.equal(r.status, 403, JSON.stringify(r.body));
      const r2 = await call("dave", "PATCH", "/servers/srv-B/members/u-nobody/nickname", { nickname: "x" });
      assert.equal(r2.status, 403, "same answer whether or not the target is a member");
    });
    await check("nickname for a member of another server → 404", async () => {
      const r = await call("alice", "PATCH", "/servers/srv-A/members/u-carol/nickname", { nickname: "x" });
      assert.equal(r.status, 404);
    });
    await check("unban a ban of another server → 404", async () => {
      const r = await call("alice", "DELETE", "/servers/srv-A/bans/u-dave");
      assert.equal(r.status, 404);
      assert.ok(rows("server_bans").some((b) => b.server_id === "srv-B" && b.user_id === "u-dave"));
    });
    await check("ban through A does not touch B membership", async () => {
      const r = await call("alice", "PUT", "/servers/srv-A/bans/u-carol", {});
      assert.equal(r.status, 200);
      assert.ok(rows("server_members").some((m) => m.server_id === "srv-B" && m.user_id === "u-carol"));
      assert.ok(!rows("server_bans").some((b) => b.server_id === "srv-B" && b.user_id === "u-carol"));
    });

    // ---- Invites
    await check("invite revoke of another server's code → 404", async () => {
      const r = await call("alice", "DELETE", "/servers/srv-A/invites/BINVITE1");
      assert.equal(r.status, 404);
      assert.ok(rows("server_invites").some((i) => i.code === "BINVITE1"));
    });
    await check("invite create pointing at another server's channel → 400", async () => {
      const before = rows("server_invites").length;
      const r = await call("alice", "POST", "/servers/srv-A/invites", { channelId: "cB-secret" });
      assert.equal(r.status, 400, JSON.stringify(r.body));
      assert.equal(rows("server_invites").length, before);
      const ok = await call("alice", "POST", "/servers/srv-A/invites", { channelId: "cA-text" });
      assert.equal(ok.status, 201);
      assert.equal(ok.body.invite.channelId, "cA-text");
    });

    // ---- Server settings channel refs
    await check("server PATCH rules/afk/system/welcome channel of another server → 400", async () => {
      for (const body of [{ rulesChannelId: "cB-secret" }, { afkChannelId: "cB-voice" }, { systemChannelId: "cB-text" }, { welcomeChannelId: "cB-text" }]) {
        const r = await call("alice", "PATCH", "/servers/srv-A", body);
        assert.equal(r.status, 400, `${JSON.stringify(body)} → ${r.status}`);
      }
      const a = rows("servers").find((s) => s.id === "srv-A");
      assert.ok(!a.rules_channel_id && !a.afk_channel_id && !a.system_channel_id && !a.welcome_channel_id);
      const ok = await call("alice", "PATCH", "/servers/srv-A", { rulesChannelId: "cA-text" });
      assert.equal(ok.status, 200, JSON.stringify(ok.body));
    });

    // ---- Reactions REST
    await check("reactions of a private channel: hidden member → 403", async () => {
      const r = await call("alice", "GET", "/reactions/conversation/server/cB-secret");
      assert.equal(r.status, 403, JSON.stringify(r.body));
    });
    await check("reactions of a server channel: outsider → 403", async () => {
      const r = await call("dave", "GET", "/reactions/conversation/server/cB-text");
      assert.equal(r.status, 403);
    });
    await check("reactions of a server channel: allowed member → 200", async () => {
      const r = await call("bob", "GET", "/reactions/conversation/server/cB-secret");
      assert.equal(r.status, 200);
      assert.equal(r.body.reactions[MSG_SECRET][0].emoji, "🔥");
      assert.equal((await call("carol", "GET", "/reactions/conversation/server/cB-secret")).status, 200, "staff override allows");
    });
    await check("reactions with an unknown conversation type → 400", async () => {
      assert.equal((await call("dave", "GET", "/reactions/conversation/whatever/cB-secret")).status, 400);
    });

    // ---- Permission resolver
    await check("resolveChannelPermissions on a channel of another server grants nothing", async () => {
      const owner = await resolveChannelPermissions(fake, "srv-A", "u-alice", "cB-secret");
      assert.equal(owner.bits, 0n, "owner of A gets no bits on B's channel");
      const member = await resolveChannelPermissions(fake, "srv-A", "u-erin", "cB-secret");
      assert.equal(member.bits, 0n);
      const own = await resolveChannelPermissions(fake, "srv-A", "u-alice", "cA-text");
      assert.ok(own.bits > 0n, "own channel still resolves");
    });
  } finally {
    server.close();
  }

  await socketChecks();

  console.log(`serverCrossScope: ${passed.length} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const f of failures) console.error("  FAIL " + f);
    process.exit(1);
  }
  console.log("serverCrossScope.integration.test.cjs: ok");
  process.exit(0);
}

function makeSocket(userId, sockEmitted) {
  const handlers = new Map();
  const rooms = new Set();
  const sock = {
    id: `sock-${userId}`,
    user: { id: userId, username: userId.slice(2) },
    handshake: { auth: {} },
    data: {},
    rooms,
    on(ev, fn) { handlers.set(ev, fn); },
    onAny() {}, use() {},
    emit(ev, data) { sockEmitted.push({ ev, data }); },
    join(r) { (Array.isArray(r) ? r : [r]).forEach((x) => rooms.add(x)); },
    leave(r) { rooms.delete(r); },
    to(room) { return { emit: (event, payload) => emitted.push({ room, event, payload }) }; },
    broadcast: { emit() {}, to: (r) => ({ emit: (event, payload) => emitted.push({ room: r, event, payload }) }) },
    disconnect() {},
  };
  return { sock, handlers };
}

async function socketChecks() {
  const sio = {
    _conn: null,
    on(ev, fn) { if (ev === "connection") this._conn = fn; },
    to(room) { return { emit: (event, payload) => emitted.push({ room, event, payload }), to: () => sio.to(room) }; },
    in(room) { return { ...sio.to(room), socketsLeave() {}, socketsJoin() {}, fetchSockets: async () => [] }; },
    emit() {},
    sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
    of() { return sio; },
    fetchSockets: async () => [],
  };
  const { registerSocketHandlers } = require("../socket/handlers");
  registerSocketHandlers(sio);
  const aliceOut = [];
  const erinOut = [];
  const outsiderOut = [];
  const alice = makeSocket("u-alice", aliceOut);
  const erin = makeSocket("u-erin", erinOut);
  const dave = makeSocket("u-dave", outsiderOut);
  for (const s of [alice, erin, dave]) {
    sio.sockets.sockets.set(s.sock.id, s.sock);
    sio._conn(s.sock);
  }
  const settle = () => new Promise((r) => setTimeout(r, 30));
  await settle();

  await check("socket reaction:add with a message of another channel → not stored", async () => {
    const before = rows("reactions").length;
    await alice.handlers.get("reaction:add")({ messageId: MSG_SECRET, conversationType: "server", conversationId: "cA-text", emoji: "👀" });
    await settle();
    assert.equal(rows("reactions").length, before, "no reaction row for B's hidden message");
    await alice.handlers.get("reaction:add")({ messageId: MSG_A, conversationType: "server", conversationId: "cA-text", emoji: "👍" });
    await settle();
    assert.equal(rows("reactions").length, before + 1, "own-channel reaction still stored");
  });
  await check("socket reaction:add on a hidden channel → not stored, live room not joined", async () => {
    const before = rows("reactions").length;
    await alice.handlers.get("reaction:add")({ messageId: MSG_SECRET, conversationType: "server", conversationId: "cB-secret", emoji: "👀" });
    await settle();
    assert.equal(rows("reactions").length, before);
    assert.ok(!alice.sock.rooms.has("server-channel:cB-secret"), "must not join the hidden channel's live room");
  });
  await check("socket reaction:remove into a group the caller is not in → no broadcast", async () => {
    const n = emitted.filter((e) => e.room === "group:g1").length;
    await dave.handlers.get("reaction:remove")({ messageId: "m1", conversationType: "group", conversationId: "g1", emoji: "x" });
    await settle();
    assert.equal(emitted.filter((e) => e.room === "group:g1").length, n);
  });
  await check("socket message delete in a hidden channel of another server → refused", async () => {
    await alice.handlers.get("server:channel:message:delete")({ serverId: "srv-A", channelId: "cB-secret", messageId: MSG_SECRET });
    await settle();
    assert.ok(rows("server_messages").some((m) => m.id === MSG_SECRET));
  });
  await check("socket pin a message of another channel → refused", async () => {
    await alice.handlers.get("server:channel:message:pin")({ serverId: "srv-A", channelId: "cA-text", messageId: MSG_SECRET });
    await settle();
    assert.ok(!rows("server_messages").find((m) => m.id === MSG_SECRET).pinned_at);
  });

  // Voice: Erin and Alice sit in A's voice channel; Carol sits in B's staff voice.
  const { activeServerVoiceCalls } = require("../runtime/sharedState");
  activeServerVoiceCalls.set("cA-voice", { serverId: "srv-A", channelName: "Voice", participants: new Map([["u-alice", { id: "u-alice" }], ["u-erin", { id: "u-erin" }]]), startTime: Date.now() });
  activeServerVoiceCalls.set("cB-voice", { serverId: "srv-B", channelName: "Staff Voice", participants: new Map([["u-carol", { id: "u-carol", muted: false }]]), startTime: Date.now() });

  await check("voice offer/answer/ice only relay to a peer in the same call", async () => {
    const mark = emitted.length;
    erin.handlers.get("server:voice:offer")({ channelId: "cA-voice", toUserId: "u-carol", offer: { sdp: "x" } });
    erin.handlers.get("server:voice:answer")({ channelId: "cA-voice", toUserId: "u-carol", answer: { sdp: "x" } });
    erin.handlers.get("server:voice:ice")({ channelId: "cA-voice", toUserId: "u-carol", candidate: { c: 1 } });
    assert.equal(emitted.slice(mark).filter((e) => e.room === "user:u-carol").length, 0, "nothing reaches a user outside the call");
    erin.handlers.get("server:voice:offer")({ channelId: "cA-voice", toUserId: "u-alice", offer: { sdp: "x" } });
    assert.equal(emitted.slice(mark).filter((e) => e.room === "user:u-alice" && e.event === "server:voice:offer").length, 1, "peer in call still gets the offer");
  });
  await check("voice mute/deafen/disconnect/move of a user in another server's voice → refused", async () => {
    const mark = emitted.length;
    await alice.handlers.get("server:voice:server-mute")({ serverId: "srv-A", channelId: "cB-voice", userId: "u-carol", muted: true });
    await alice.handlers.get("server:voice:server-deafen")({ serverId: "srv-A", channelId: "cB-voice", userId: "u-carol", deafened: true });
    await alice.handlers.get("server:voice:disconnect")({ serverId: "srv-A", channelId: "cB-voice", userId: "u-carol" });
    await alice.handlers.get("server:voice:move")({ serverId: "srv-A", userId: "u-carol", fromChannelId: "cB-voice", toChannelId: "cA-voice" });
    await settle();
    const carol = activeServerVoiceCalls.get("cB-voice").participants.get("u-carol");
    assert.ok(carol && !carol.serverMuted && !carol.serverDeafened, "Carol untouched");
    assert.equal(emitted.slice(mark).filter((e) => e.room === "user:u-carol").length, 0);
  });
  await check("voice move into another server's channel → refused", async () => {
    await alice.handlers.get("server:voice:move")({ serverId: "srv-A", userId: "u-erin", fromChannelId: "cA-voice", toChannelId: "cB-voice" });
    await settle();
    assert.ok(activeServerVoiceCalls.get("cA-voice").participants.has("u-erin"));
    assert.ok(!activeServerVoiceCalls.get("cB-voice").participants.has("u-erin"));
  });
  await check("voice stage set-role with a channel of another server → refused", async () => {
    const mark = emitted.length;
    await alice.handlers.get("server:voice:stage:set-role")({ serverId: "srv-A", channelId: "cB-voice", userId: "u-carol", stageRole: "speaker" });
    await settle();
    assert.equal(emitted.slice(mark).filter((e) => e.room === "user:u-carol").length, 0);
  });
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
