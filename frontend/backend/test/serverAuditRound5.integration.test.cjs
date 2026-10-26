"use strict";

/**
 * Fifth server audit round (2026-10-19): Grok's list at 7b9f80c (#1-#17 minus the DesCoin
 * items, which live in descoinShopSafety.test.cjs) plus Bot's O3, T3-2, D1, D2.
 *   #1  MANAGE_CHANNELS could PATCH / DELETE a channel it cannot see
 *   #2  moving a synced channel into a category changed its permissions without MANAGE_ROLES
 *   #3  server delete: no live event, rooms / voice kept, reactions + private media orphaned,
 *       SERVER_DELETE audit row cascaded away
 *   #4  kick / ban dropped the user from rooms and voice of OTHER servers
 *   #5  icon / banner / splash accepted any URL
 *   #6  discover: no paging / sort / rate limit, unmasked names
 *   #7  deleting a voice channel left its call running
 *   #8  MANAGE_GUILD could make a server public / change vanity / verification
 *   #9  count-then-insert limits and the ban / join race, 23505 on parallel joins
 *   #13 PATCH /:id answered isOwner:true to moderators   #14 no server:updated event
 *   #15 reserved vanity words, 23505 → 409   #16 invite codes from Math.random   #17 caps
 *   O3  ownership transfer   T3-2 reply_to from the client   D1 join rate limits   D2 leave
 * Run: node frontend/backend/test/serverAuditRound5.integration.test.cjs
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const supabasePath = require.resolve("../db/supabase");
const pushPath = require.resolve("../lib/webPush");
require.cache[pushPath] = { id: pushPath, filename: pushPath, loaded: true, exports: new Proxy({}, { get: () => async () => ({ ok: true }) }) };

const P = require("../lib/serverPermissions");
const { Permissions: F } = P;
const A = "srv-a";
const B = "srv-b";
const C = "srv-c";
const T = "srv-t";
const MSG_HELLO = crypto.randomUUID();
const MSG_STAFF = crypto.randomUUID();
const MSG_B = crypto.randomUUID();
const ts = (i) => new Date(Date.UTC(2026, 9, 1, 0, 0, i)).toISOString();
const IMG = "https://placeholder.supabase.co/storage/v1/object/public/media/images/icon.png";

const userIds = ["owner", "admin", "guild", "chanmod", "member", "victim", "owner2", "outsider", "racer", "dup",
  "maker", "maker2", "folderer", "joiner", "flooder", "looker", "spammer", "leaver", "heir", "owner3", "stranger", "bmember"];
const users = userIds.map((id) => ({ id, username: id, display_name: id.toUpperCase(), active_sessions: [{ id: `s-${id}` }] }));
users.find((u) => u.id === "owner3").password_hash = bcrypt.hashSync("pw-123", 4);

const members = [];
const addMember = (server_id, user_id, extra = {}) => members.push({ server_id, user_id, joined_at: ts(members.length), ...extra });
for (const u of ["owner", "admin", "guild", "chanmod", "member", "victim", "leaver"]) addMember(A, u);
for (const u of ["owner2", "victim", "bmember"]) addMember(B, u);
for (const u of ["owner", "member"]) addMember(C, u);
for (const u of ["owner3", "heir", "stranger"]) addMember(T, u, u === "stranger" ? { temporary: true } : {});
for (let i = 0; i < 200; i++) addMember(`filler-${i}`, "joiner");

const roles = [
  { id: "a-everyone", server_id: A, is_everyone: true, position: 0, permissions: P.toPgBigint(P.EVERYONE_DEFAULT), created_at: ts(0) },
  { id: "a-admin", server_id: A, is_everyone: false, position: 10, permissions: P.toPgBigint(F.ADMINISTRATOR), created_at: ts(1) },
  { id: "a-guild", server_id: A, is_everyone: false, position: 5, permissions: P.toPgBigint(F.MANAGE_GUILD), created_at: ts(2) },
  { id: "a-chan", server_id: A, is_everyone: false, position: 4, permissions: P.toPgBigint(F.MANAGE_CHANNELS), created_at: ts(3) },
  { id: "b-everyone", server_id: B, is_everyone: true, position: 0, permissions: P.toPgBigint(P.EVERYONE_DEFAULT), created_at: ts(4) },
  { id: "c-everyone", server_id: C, is_everyone: true, position: 0, permissions: P.toPgBigint(P.EVERYONE_DEFAULT), created_at: ts(5) },
  { id: "t-everyone", server_id: T, is_everyone: true, position: 0, permissions: P.toPgBigint(P.EVERYONE_DEFAULT), created_at: ts(6) },
];
// srv-a sits one role below the 50-role cap
for (let i = roles.filter((r) => r.server_id === A).length; i < 49; i++) {
  roles.push({ id: `a-fill-${i}`, server_id: A, is_everyone: false, position: 1, permissions: "0", created_at: ts(10 + i) });
}

const servers = [
  { id: A, owner_id: "owner", name: "Alpha", is_public: false, verification_level: "none", vanity_slug: null, created_at: ts(1) },
  { id: B, owner_id: "owner2", name: "Beta", is_public: false, created_at: ts(2) },
  { id: C, owner_id: "owner", name: "Gamma", is_public: false, created_at: ts(3) },
  { id: T, owner_id: "owner3", name: "Tango", is_public: false, created_at: ts(4) },
  { id: "pub-big", owner_id: "owner2", name: "Big hall", is_public: true, created_at: ts(5), updated_at: ts(5) },
  { id: "pub-small", owner_id: "owner2", name: "Small room", is_public: true, created_at: ts(7), updated_at: ts(7) },
  { id: "pub-bad", owner_id: "owner2", name: "shit club", description: "fck this", is_public: true, created_at: ts(6), updated_at: ts(9) },
];
for (let i = 0; i < 9; i++) servers.push({ id: `maker-${i}`, owner_id: "maker", name: `M${i}`, created_at: ts(20 + i) });
for (let i = 0; i < 9; i++) servers.push({ id: `maker2-${i}`, owner_id: "maker2", name: `N${i}`, created_at: ts(40 + i) });
for (const u of ["owner2", "member", "victim"]) addMember("pub-big", u);
for (const u of ["owner2"]) addMember("pub-small", u);
for (const u of ["owner2", "member"]) addMember("pub-bad", u);

const fake = createFakeSupabase({
  users,
  servers,
  server_members: members,
  server_roles: roles,
  server_member_roles: [
    { server_id: A, user_id: "admin", role_id: "a-admin" },
    { server_id: A, user_id: "guild", role_id: "a-guild" },
    { server_id: A, user_id: "chanmod", role_id: "a-chan" },
  ],
  server_channels: [
    { id: "a-general", server_id: A, type: "text", name: "general", position: 0, created_at: ts(1) },
    { id: "a-staff", server_id: A, type: "text", name: "staff", position: 1, created_at: ts(2) },
    { id: "a-voice", server_id: A, type: "voice", name: "lobby", position: 2, created_at: ts(3) },
    { id: "a-free", server_id: A, type: "text", name: "free", position: 3, created_at: ts(4) },
    { id: "a-cat-rules", server_id: A, type: "category", name: "Rules", position: 4, created_at: ts(5) },
    { id: "a-cat-hidden", server_id: A, type: "category", name: "Hidden", position: 5, created_at: ts(6) },
    { id: "b-general", server_id: B, type: "text", name: "general", position: 0, created_at: ts(7) },
    { id: "b-voice", server_id: B, type: "voice", name: "voice", position: 1, created_at: ts(8) },
    { id: "c-text", server_id: C, type: "text", name: "text", position: 0, created_at: ts(9) },
    { id: "c-voice", server_id: C, type: "voice", name: "voice", position: 1, created_at: ts(10) },
  ],
  server_channel_overrides: [
    { id: "x1", channel_id: "a-staff", target_type: "role", target_id: "a-everyone", allow_permissions: "0", deny_permissions: P.toPgBigint(F.VIEW_CHANNEL) },
    { id: "x2", channel_id: "a-cat-rules", target_type: "role", target_id: "a-everyone", allow_permissions: "0", deny_permissions: P.toPgBigint(F.SEND_MESSAGES) },
    { id: "x3", channel_id: "a-cat-hidden", target_type: "role", target_id: "a-everyone", allow_permissions: "0", deny_permissions: P.toPgBigint(F.VIEW_CHANNEL) },
  ],
  server_messages: [
    { id: MSG_HELLO, server_id: A, channel_id: "a-general", sender_id: "owner", content: "hello everyone", created_at: ts(1) },
    { id: MSG_STAFF, server_id: A, channel_id: "a-staff", sender_id: "owner", content: "staff secret", created_at: ts(2) },
    { id: MSG_B, server_id: B, channel_id: "b-general", sender_id: "owner2", content: "beta", created_at: ts(3) },
    { id: crypto.randomUUID(), server_id: C, channel_id: "c-text", sender_id: "member", content: "", media_url: "sb://media-private/files/c-only.pdf", created_at: ts(4) },
    { id: crypto.randomUUID(), server_id: C, channel_id: "c-text", sender_id: "member", content: "", media_url: "sb://media-private/files/shared.pdf", created_at: ts(5) },
  ],
  dm_messages: [{ id: "dm1", from_user_id: "member", to_user_id: "owner", media_url: "sb://media-private/files/shared.pdf" }],
  group_messages: [],
  server_invites: [
    { code: "INVA", server_id: A, creator_id: "owner", uses: 0, max_uses: null, created_at: ts(1) },
  ],
  server_bans: [],
  server_folders: Array.from({ length: 50 }, (_, i) => ({ id: `f-${i}`, user_id: "folderer", name: `F${i}`, position: i, created_at: ts(i) })),
  reactions: [
    { id: "rc1", message_id: "m", conversation_type: "server", conversation_id: "c-text", user_id: "member", emoji: "🔥" },
    { id: "ra1", message_id: "m", conversation_type: "server", conversation_id: "a-general", user_id: "member", emoji: "🔥" },
  ],
  server_audit_logs: [],
  server_deletion_log: [],
});
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

// Inject one-shot faults / interleavings into the fake.
const hooks = [];
const origFrom = fake.from.bind(fake);
fake.from = (name) => {
  const q = origFrom(name);
  for (const h of hooks) {
    if (h.table !== name) continue;
    const orig = q[h.mode].bind(q);
    q[h.mode] = (payload, ...rest) => {
      orig(payload, ...rest);
      if (!h.used && h.match(payload)) {
        if (!h.persist) h.used = true;
        if (h.delayMs) {
          // hold this write back so parallel requests all pass their checks first
          const then = q.then.bind(q);
          q.then = (resolve, reject) => setTimeout(() => then(resolve, reject), h.delayMs);
        } else {
          const res = h.run(payload, q);
          if (res) q._run = () => res;
        }
      }
      return q;
    };
  }
  return q;
};
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
function makeSocket(userId, tag = "") {
  const handlers = new Map();
  const s = {
    id: `sock-${userId}${tag}`,
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
const rows = (t) => fake._tables[t]?.rows || [];
const settle = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const got = (s, ev) => s.out.filter((o) => o.ev === ev);

const failures = [];
let passed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    if (process.env.TEST_VERBOSE) console.log(`PASS | ${name}`);
  } catch (err) {
    failures.push(`${name}: ${String(err.message).split("\n")[0].slice(0, 200)}`);
    if (process.env.TEST_VERBOSE) console.log(`FAIL | ${name}`);
  }
}

async function run() {
  const app = express();
  app.use(express.json());
  app.set("io", io);
  app.use("/servers", serversRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (who, method, p, body) => {
    const res = await fetch(base + p, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signToken({ id: who, username: who, sid: `s-${who}` })}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };

  const { registerSocketHandlers } = require("../socket/handlers");
  registerSocketHandlers(io);
  const { activeServerVoiceCalls } = require("../runtime/sharedState");
  const sk = {};
  for (const u of ["owner", "member", "victim", "guild"]) {
    sk[u] = makeSocket(u);
    io._conn(sk[u]);
    sk[u].join(`server:${A}`);
  }
  await settle();

  try {
    // ---------------- #1
    await check("#1 MANAGE_CHANNELS without VIEW: PATCH / DELETE a hidden channel → 404, channel unchanged", async () => {
      const p = await call("chanmod", "PATCH", `/servers/${A}/channels/a-staff`, { name: "pwned" });
      assert.equal(p.status, 404, JSON.stringify(p.body));
      const d = await call("chanmod", "DELETE", `/servers/${A}/channels/a-staff`);
      assert.equal(d.status, 404, JSON.stringify(d.body));
      const ch = rows("server_channels").find((c) => c.id === "a-staff");
      assert.ok(ch && ch.name === "staff");
    });
    await check("#1 visible channel still editable with MANAGE_CHANNELS", async () => {
      const p = await call("chanmod", "PATCH", `/servers/${A}/channels/a-free`, { topic: "ok" });
      assert.equal(p.status, 200, JSON.stringify(p.body));
    });

    // ---------------- #2
    await check("#2 MANAGE_CHANNELS-only cannot move a synced channel into a category with rules", async () => {
      const r = await call("chanmod", "PATCH", `/servers/${A}/channels/a-free`, { parentId: "a-cat-rules" });
      assert.equal(r.status, 403, JSON.stringify(r.body));
      assert.ok(!rows("server_channels").find((c) => c.id === "a-free").parent_id);
    });
    await check("#2 hidden category is not a valid parent (move or create)", async () => {
      const r = await call("chanmod", "PATCH", `/servers/${A}/channels/a-free`, { parentId: "a-cat-hidden" });
      assert.equal(r.status, 400, JSON.stringify(r.body));
      const c = await call("chanmod", "POST", `/servers/${A}/channels`, { name: "sneaky", type: "text", parentId: "a-cat-hidden" });
      assert.equal(c.status, 400, JSON.stringify(c.body));
    });
    await check("#2 owner can still move it", async () => {
      const r = await call("owner", "PATCH", `/servers/${A}/channels/a-free`, { parentId: "a-cat-rules" });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(rows("server_channels").find((c) => c.id === "a-free").parent_id, "a-cat-rules");
    });

    // ---------------- #4
    await check("#4 kick from A keeps the user's rooms and voice in server B", async () => {
      const v = sk.victim;
      v.join([`server:${B}`, "server-channel:b-general", "server-channel:a-general", "server-voice:b-voice"]);
      activeServerVoiceCalls.set("b-voice", { serverId: B, channelName: "voice", participants: new Map([["victim", { id: "victim" }]]), startTime: Date.now() });
      const r = await call("owner", "DELETE", `/servers/${A}/members/victim`);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      await settle(80);
      assert.ok(!v.rooms.has(`server:${A}`) && !v.rooms.has("server-channel:a-general"), "left A");
      assert.ok(v.rooms.has("server-channel:b-general") && v.rooms.has(`server:${B}`), "still in B's rooms");
      assert.ok(activeServerVoiceCalls.get("b-voice")?.participants.has("victim"), "B voice call kept");
      activeServerVoiceCalls.delete("b-voice");
    });

    // ---------------- #7
    await check("#7 deleting a voice channel ends its call", async () => {
      activeServerVoiceCalls.set("a-voice", { serverId: A, channelName: "lobby", participants: new Map([["member", { id: "member" }]]), startTime: Date.now() });
      sk.member.out.length = 0;
      const r = await call("owner", "DELETE", `/servers/${A}/channels/a-voice`);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      await settle();
      assert.ok(!activeServerVoiceCalls.has("a-voice"), "call removed");
      assert.ok(got(sk.member, "server:voice:force-disconnected").some((o) => o.payload.channelId === "a-voice"));
    });

    // ---------------- #5
    await check("#5 icon / banner / splash must be our own https uploads", async () => {
      for (const bad of ["https://evil.example/x.png", "http://placeholder.supabase.co/storage/v1/object/public/media/images/a.png", "javascript:alert(1)", "https://placeholder.supabase.co/storage/v1/object/sign/media-private/files/a.pdf"]) {
        const r = await call("owner", "PATCH", `/servers/${A}`, { iconUrl: bad });
        assert.equal(r.status, 400, `${bad} → ${r.status}`);
      }
      const b = await call("owner", "PATCH", `/servers/${A}`, { bannerUrl: "https://tracker.example/b.png" });
      assert.equal(b.status, 400);
      const s = await call("owner", "PATCH", `/servers/${A}`, { splashUrl: "https://tracker.example/s.png" });
      assert.equal(s.status, 400);
      const ok = await call("owner", "PATCH", `/servers/${A}`, { iconUrl: IMG });
      assert.equal(ok.status, 200, JSON.stringify(ok.body));
      const c = await call("maker", "POST", `/servers`, { name: "Evil icon", iconUrl: "https://evil.example/x.png" });
      assert.equal(c.status, 400);
    });

    // ---------------- #8, #13, #14
    await check("#8 MANAGE_GUILD cannot open the server / set vanity / lower verification", async () => {
      for (const body of [{ isPublic: true }, { vanitySlug: "alpha-club" }, { verificationLevel: "high" }]) {
        const r = await call("guild", "PATCH", `/servers/${A}`, body);
        assert.equal(r.status, 403, `${JSON.stringify(body)} → ${r.status}`);
      }
      const s = rows("servers").find((x) => x.id === A);
      assert.equal(Boolean(s.is_public), false);
    });
    await check("#8 MANAGE_GUILD may resend unchanged values; #13 isOwner false for a moderator; #14 server:updated", async () => {
      sk.member.out.length = 0;
      const r = await call("guild", "PATCH", `/servers/${A}`, { name: "Alpha 2", isPublic: false, verificationLevel: "none", vanitySlug: "" });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.server.isOwner, false, "#13");
      await settle();
      const ev = got(sk.member, "server:updated");
      assert.ok(ev.length && ev[0].payload.server.name === "Alpha 2", "#14 members get server:updated");
      assert.equal(ev[0].payload.server.isOwner, undefined, "no per-user fields in the broadcast");
    });
    await check("#8 administrator can open it; the owner is told", async () => {
      sk.owner.out.length = 0;
      const r = await call("admin", "PATCH", `/servers/${A}`, { isPublic: true });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      await settle();
      assert.ok(got(sk.owner, "server:updated").some((o) => o.payload.sensitiveChange?.fields?.includes("isPublic")));
      await call("owner", "PATCH", `/servers/${A}`, { isPublic: false });
    });

    // ---------------- #15
    await check("#15 reserved vanity words → 400; unique violation → 409", async () => {
      const r = await call("owner", "PATCH", `/servers/${A}`, { vanitySlug: "descall" });
      assert.equal(r.status, 400, JSON.stringify(r.body));
      hooks.push({ table: "servers", mode: "update", match: (p) => p && p.vanity_slug === "race-slug", run: () => ({ data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } }) });
      const d = await call("owner", "PATCH", `/servers/${A}`, { vanitySlug: "race-slug" });
      assert.equal(d.status, 409, JSON.stringify(d.body));
    });

    // ---------------- #16
    await check("#16 invite codes come from crypto.randomInt", async () => {
      const src = fs.readFileSync(path.join(__dirname, "../routes/servers.js"), "utf8");
      const fn = src.slice(src.indexOf("function generateInviteCode"), src.indexOf("function generateInviteCode") + 400);
      assert.ok(/randomInt/.test(fn) && !/Math\.random/.test(fn.split("\n}")[0]));
      const inv = await call("owner", "POST", `/servers/${A}/invites`, {});
      assert.equal(inv.status, 201, JSON.stringify(inv.body));
    });

    // ---------------- #9
    await check("#9 parallel role creates stop at the 50-role cap", async () => {
      const hook = { table: "server_roles", mode: "insert", persist: true, delayMs: 60, match: (p) => p && /^race /.test(p.name || "") };
      hooks.push(hook);
      const res = await Promise.all([1, 2, 3, 4].map((i) => call("owner", "POST", `/servers/${A}/roles`, { name: `race ${i}` })));
      hook.used = true;
      const okCount = res.filter((r) => r.status === 201 || r.status === 200).length;
      assert.equal(rows("server_roles").filter((r) => r.server_id === A).length, 50, `roles now ${rows("server_roles").filter((r) => r.server_id === A).length}, ok=${okCount}`);
      assert.equal(okCount, 1);
    });
    await check("#9 parallel server creates stop at 10 owned", async () => {
      const hook = { table: "servers", mode: "insert", persist: true, delayMs: 60, match: (p) => p && p.owner_id === "maker" };
      hooks.push(hook);
      const res = await Promise.all([1, 2, 3].map((i) => call("maker", "POST", `/servers`, { name: `Race ${i}`, templateId: "blank" })));
      hook.used = true;
      const owned = rows("servers").filter((s) => s.owner_id === "maker").length;
      assert.equal(owned, 10, `owned ${owned}; statuses ${res.map((r) => r.status)}`);
    });
    await check("#9 a create that commits late with an older timestamp cannot overfill", async () => {
      // CI flake on #305 (owned 11 vs 10): the first create re-counted before the second
      // committed and kept its row; the second then landed with an earlier created_at,
      // ranked inside the cap, and was kept too. Force exactly that interleaving.
      const order = new Map();
      const nth = (p) => (p && p.owner_id === "maker2" ? (order.has(p) || order.set(p, order.size + 1), order.get(p)) : 0);
      // 1st insert: held 30 ms so both requests pass the pre-count, then re-counts alone.
      hooks.push({ table: "servers", mode: "insert", persist: true, delayMs: 30, match: (p) => nth(p) === 1 });
      // 2nd insert: commits after that re-count but carries an older created_at.
      hooks.push({ table: "servers", mode: "insert", persist: true, delayMs: 200, match: (p) => {
        if (nth(p) !== 2) return false;
        p.created_at = ts(0);
        return true;
      } });
      const res = await Promise.all([1, 2].map((i) => call("maker2", "POST", `/servers`, { name: `Late ${i}`, templateId: "blank" })));
      const owned = rows("servers").filter((s) => s.owner_id === "maker2").length;
      assert.equal(owned, 10, `owned ${owned}; statuses ${res.map((r) => r.status)}`);
      assert.deepEqual(res.map((r) => r.status).sort(), [201, 400]);
      assert.equal(res.find((r) => r.status === 400).body.code, "MAX_OWNED_SERVERS");
    });
    await check("#9 a ban landing during the join removes the fresh membership", async () => {
      hooks.push({ table: "server_members", mode: "insert", match: (p) => p && p.user_id === "racer", run: () => { rows("server_bans").push({ server_id: A, user_id: "racer", moderator_id: "owner", created_at: ts(1) }); return null; } });
      const r = await call("racer", "POST", `/servers/invites/INVA/join`);
      assert.equal(r.status, 403, JSON.stringify(r.body));
      assert.ok(!rows("server_members").some((m) => m.server_id === A && m.user_id === "racer"), "no membership left");
    });
    await check("#9 parallel join unique violation → alreadyMember, not 500", async () => {
      hooks.push({ table: "server_members", mode: "insert", match: (p) => p && p.user_id === "dup", run: () => { rows("server_members").push({ server_id: A, user_id: "dup", joined_at: ts(9) }); return { data: null, error: { code: "23505", message: "duplicate key" } }; } });
      const r = await call("dup", "POST", `/servers/invites/INVA/join`);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.alreadyMember, true);
    });

    // ---------------- #17
    await check("#17 folder cap 50", async () => {
      const r = await call("folderer", "POST", `/servers/me/folders`, { name: "one more" });
      assert.equal(r.status, 400, JSON.stringify(r.body));
      assert.equal(rows("server_folders").filter((f) => f.user_id === "folderer").length, 50);
    });
    await check("#17 joined-server cap 200", async () => {
      const r = await call("joiner", "POST", `/servers/discover/pub-small/join`);
      assert.equal(r.status, 400, JSON.stringify(r.body));
      assert.equal(r.body.code, "MAX_JOINED_SERVERS");
    });

    // ---------------- #6
    await check("#6 discover: sort by members, paging, masked names", async () => {
      const r1 = await call("looker", "GET", `/servers/discover?sort=members&limit=2`);
      assert.equal(r1.status, 200, JSON.stringify(r1.body));
      assert.deepEqual(r1.body.servers.map((s) => s.id), ["pub-big", "pub-bad"]);
      assert.equal(r1.body.servers[0].memberCount, 3);
      assert.equal(r1.body.nextOffset, 2);
      const r2 = await call("looker", "GET", `/servers/discover?sort=members&limit=2&offset=2`);
      assert.deepEqual(r2.body.servers.map((s) => s.id), ["pub-small"]);
      assert.equal(r2.body.nextOffset, null);
      const bad = r1.body.servers.find((s) => s.id === "pub-bad");
      assert.ok(!/shit|fck/i.test(bad.name + " " + bad.description), `${bad.name} / ${bad.description}`);
    });
    await check("#6 discover is rate limited", async () => {
      let limited = false;
      for (let i = 0; i < 35 && !limited; i++) limited = (await call("spammer", "GET", `/servers/discover`)).status === 429;
      assert.ok(limited);
    });

    // ---------------- D1
    await check("D1 invite join attempts are rate limited", async () => {
      let limited = false;
      for (let i = 0; i < 25 && !limited; i++) limited = (await call("flooder", "POST", `/servers/invites/NOPE${i}/join`)).status === 429;
      assert.ok(limited, "join flood");
    });
    await check("D1 invite lookups are rate limited", async () => {
      let limited = false;
      for (let i = 0; i < 130 && !limited; i++) limited = (await call("looker", "GET", `/servers/invites/GUESS${i}`)).status === 429;
      assert.ok(limited, "lookup flood");
    });

    // ---------------- T3-2
    await check("T3-2 reply quote comes from the stored message, not the client", async () => {
      await sk.member.fire("server:channel:join", "a-general");
      await sk.member.fire("server:channel:message", { channelId: "a-general", tempId: "t-r1", content: "agreed", replyTo: { id: MSG_HELLO, text: "I quit, server is dead", from: { username: "owner", displayName: "OWNER" } } });
      await settle();
      const row = rows("server_messages").find((m) => m.content === "agreed");
      assert.ok(row, "message stored");
      assert.equal(row.reply_to?.text, "hello everyone");
      assert.equal(row.reply_to?.from?.id, "owner");
    });
    await check("T3-2 replyTo of another channel's message is dropped", async () => {
      await sk.member.fire("server:channel:message", { channelId: "a-general", tempId: "t-r2", content: "leak?", replyTo: { id: MSG_STAFF, text: "x", from: { username: "owner" } } });
      await settle();
      const row = rows("server_messages").find((m) => m.content === "leak?");
      assert.ok(row);
      assert.equal(row.reply_to ?? null, null);
    });

    // ---------------- D2
    await check("D2 leave drops every tab's rooms and tells the other tabs", async () => {
      const t1 = makeSocket("leaver", "-1");
      const t2 = makeSocket("leaver", "-2");
      for (const t of [t1, t2]) t.join([`server:${A}`, "server-channel:a-general"]);
      const r = await call("leaver", "POST", `/servers/${A}/leave`);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      await settle();
      for (const t of [t1, t2]) {
        assert.ok(!t.rooms.has(`server:${A}`) && !t.rooms.has("server-channel:a-general"), `${t.id} still in rooms`);
        assert.ok(got(t, "server:member:removed").some((o) => o.payload.action === "leave"), `${t.id} not told`);
      }
    });

    // ---------------- O3
    await check("O3 ownership transfer: checks", async () => {
      assert.equal((await call("heir", "POST", `/servers/${T}/ownership/transfer`, { userId: "heir", confirmName: "Tango", password: "pw-123" })).status, 403, "non-owner");
      assert.equal((await call("owner3", "POST", `/servers/${T}/ownership/transfer`, { userId: "heir", confirmName: "Wrong", password: "pw-123" })).status, 400, "name");
      assert.equal((await call("owner3", "POST", `/servers/${T}/ownership/transfer`, { userId: "heir", confirmName: "Tango", password: "nope" })).status, 403, "password");
      assert.equal((await call("owner3", "POST", `/servers/${T}/ownership/transfer`, { userId: "outsider", confirmName: "Tango", password: "pw-123" })).status, 400, "non-member");
      assert.equal((await call("owner3", "POST", `/servers/${T}/ownership/transfer`, { userId: "stranger", confirmName: "Tango", password: "pw-123" })).status, 400, "temporary member");
      assert.equal(rows("servers").find((s) => s.id === T).owner_id, "owner3");
    });
    await check("O3 transfer dialog preflight: owner only, says whether a password is needed", async () => {
      const r = await call("owner3", "GET", `/servers/${T}/ownership/transfer`);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.passwordRequired, true);
      assert.equal((await call("heir", "GET", `/servers/${T}/ownership/transfer`)).status, 403, "non-owner");
      const g = await call("owner", "GET", `/servers/${A}/ownership/transfer`);
      assert.equal(g.status, 200);
      assert.equal(g.body.passwordRequired, false, "social-login owner has no password");
    });
    const heirTab = makeSocket("heir", "-o3");
    const watcher = makeSocket("stranger", "-o3");
    for (const t of [heirTab, watcher]) t.join(`server:${T}`);
    await check("O3 ownership transfer: success, audited, old owner loses owner rights", async () => {
      const r = await call("owner3", "POST", `/servers/${T}/ownership/transfer`, { userId: "heir", confirmName: "tango", password: "pw-123" });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(rows("servers").find((s) => s.id === T).owner_id, "heir");
      assert.ok(rows("server_audit_logs").some((a) => a.action === "OWNERSHIP_TRANSFER" && a.target_id === "heir"));
      assert.equal((await call("owner3", "DELETE", `/servers/${T}`, { confirmName: "Tango" })).status, 403);
      assert.ok(rows("server_members").some((m) => m.server_id === T && m.user_id === "owner3"), "old owner stays a member");
    });
    await check("O3 transfer is live for every member and the new owner is notified", async () => {
      await settle();
      for (const t of [heirTab, watcher]) {
        const upd = got(t, "server:updated").map((o) => o.payload);
        assert.ok(
          upd.some((p) => p.serverId === T && p.server?.ownerId === "heir" && p.ownerChanged?.toUserId === "heir" && p.ownerChanged?.fromUserId === "owner3"),
          `${t.id} missed server:updated ${JSON.stringify(upd)}`
        );
      }
      const note = got(heirTab, "server:ownership:received").map((o) => o.payload);
      assert.equal(note.length, 1, JSON.stringify(note));
      assert.equal(note[0].serverId, T);
      assert.equal(note[0].serverName, "Tango");
      assert.equal(note[0].fromUserId, "owner3");
      assert.equal(got(watcher, "server:ownership:received").length, 0, "only the new owner gets the notification");
      const { trGenitive } = require("../lib/trSuffix");
      assert.equal(`${trGenitive("Tango")} sahibi artık sensin`, "Tango'nun sahibi artık sensin");
      const ios = require("../lib/iosAlertPush").describeEvent({ type: "server-owner", serverId: T, serverName: "Alpha Topluluğu" }, "tr");
      assert.equal(ios.body, "Alpha Topluluğu'nun sahibi artık sensin");
      assert.equal(ios.data.type, "server-owner");
      assert.equal(ios.data.serverId, T);
    });

    // ---------------- #3 (last: removes srv-c)
    await check("#3 server delete: live event, rooms + voice cleared, reactions + private media removed, log kept", async () => {
      const bucket = fake.storage.from("media-private");
      await bucket.upload("files/c-only.pdf", "x");
      await bucket.upload("files/shared.pdf", "x");
      const m = sk.member;
      m.join([`server:${C}`, "server-channel:c-text", "server-voice:c-voice"]);
      activeServerVoiceCalls.set("c-voice", { serverId: C, channelName: "voice", participants: new Map([["member", { id: "member" }]]), startTime: Date.now() });
      m.out.length = 0;
      const r = await call("owner", "DELETE", `/servers/${C}`, { confirmName: "Gamma" });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      await settle(80);
      assert.ok(got(m, "server:deleted").some((o) => o.payload.serverId === C), "member told");
      assert.ok(![...m.rooms].some((x) => x === `server:${C}` || x === "server-channel:c-text" || x === "server-voice:c-voice"), `rooms ${[...m.rooms]}`);
      assert.ok(!activeServerVoiceCalls.has("c-voice"), "voice ended");
      assert.ok(!rows("reactions").some((x) => x.conversation_id === "c-text"), "reactions removed");
      assert.ok(rows("reactions").some((x) => x.conversation_id === "a-general"), "other reactions kept");
      const objs = fake.storage._buckets["media-private"];
      assert.ok(!objs.has("files/c-only.pdf"), "server-only attachment removed");
      assert.ok(objs.has("files/shared.pdf"), "attachment still used in a DM kept");
      assert.ok(rows("server_deletion_log").some((x) => x.server_id === C && x.actor_id === "owner" && x.server_name === "Gamma"), "deletion log row");
    });
  } finally {
    server.close();
  }

  console.log(`serverAuditRound5: ${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const f of failures) console.error("  FAIL " + f);
    process.exit(1);
  }
  console.log("serverAuditRound5.integration.test.cjs: ok");
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
