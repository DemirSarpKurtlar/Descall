"use strict";

/**
 * Server audit 2026-11-15, MEMBERSHIP fixes (roles, moderation, invites, settings).
 * Every HIGH of that audit has a case here: it failed before the fix and passes after.
 *   R1  a new role is created at the bottom (just above @everyone), not above Admin
 *   R2  assigning a role that carries permissions the actor lacks (ADMINISTRATOR) is refused
 *   R3  a role change re-checks voice access (voice contract recheckVoiceAccess)
 *   M1  an UPPERCASE owner id no longer bypasses the owner protection (kick / ban / timeout)
 *   M2  kick / ban / timeout evict the user from server voice through the voice contract
 *   M3  a timeout survives leave + rejoin (server_member_timeouts)
 *   SC1 the AFK channel must be a voice channel the setter and @everyone can see and join
 *   P1  GET /servers/my pages override rows past the 1000-row cap (no private channel leak)
 * Plus MEDIUM checks: timed-out moderators lose their powers, ownership transfer clears the
 * new owner's timeout, member overrides and role rows are removed on kick.
 * Run: node frontend/backend/test/serverMembershipAudit.integration.test.cjs
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const assert = require("node:assert/strict");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const supabasePath = require.resolve("../db/supabase");
const pushPath = require.resolve("../lib/webPush");
require.cache[pushPath] = { id: pushPath, filename: pushPath, loaded: true, exports: new Proxy({}, { get: () => async () => ({ ok: true }) }) };

const P = require("../lib/serverPermissions");
const { Permissions: F, EVERYONE_DEFAULT, toPgBigint } = P;

const uid = (n) => `0000000${n}-aaaa-4bbb-8ccc-dddddddddddd`;
const OWNER = uid(1);
const MOD = uid(2);
const MEMBER = uid(3);
const ALT = uid(4);
const ADMINU = uid(5);
const MGR = uid(6);
const S = "5e5e5e5e-aaaa-4bbb-8ccc-dddddddddddd";
const S2 = "5e5e5e5f-aaaa-4bbb-8ccc-dddddddddddd";

const fake = createFakeSupabase({
  users: [OWNER, MOD, MEMBER, ALT, ADMINU, MGR].map((u) => ({ id: u, username: `u${u.slice(7, 8)}`, active_sessions: [{ id: `s-${u}` }] })),
  servers: [
    { id: S, owner_id: OWNER, name: "S1" },
    { id: S2, owner_id: ADMINU, name: "S2" },
  ],
  server_members: [OWNER, MOD, MEMBER, ALT, ADMINU, MGR].map((u) => ({ server_id: S, user_id: u, list_position: 0 }))
    .concat([{ server_id: S2, user_id: ADMINU }, { server_id: S2, user_id: MEMBER }]),
  server_roles: [
    { id: "everyone", server_id: S, is_everyone: true, position: 0, permissions: toPgBigint(EVERYONE_DEFAULT) },
    { id: "adminrole", server_id: S, name: "Admin", is_everyone: false, position: 2, permissions: toPgBigint(F.ADMINISTRATOR) },
    { id: "modrole", server_id: S, name: "Mod", is_everyone: false, position: 3, permissions: toPgBigint(F.MANAGE_ROLES | F.KICK_MEMBERS | F.BAN_MEMBERS | F.MODERATE_MEMBERS) },
    { id: "helper", server_id: S, name: "Helper", is_everyone: false, position: 1, permissions: toPgBigint(F.SEND_MESSAGES) },
    { id: "mgrrole", server_id: S, name: "Manager", is_everyone: false, position: 1, permissions: toPgBigint(F.MANAGE_GUILD) },
    { id: "everyone2", server_id: S2, is_everyone: true, position: 0, permissions: toPgBigint(EVERYONE_DEFAULT) },
  ],
  server_member_roles: [
    { server_id: S, user_id: MOD, role_id: "modrole" },
    { server_id: S, user_id: MGR, role_id: "mgrrole" },
    { server_id: S, user_id: MEMBER, role_id: "helper" },
  ],
  server_channels: [
    { id: "general", server_id: S, type: "text", name: "general", position: 0 },
    { id: "lobby", server_id: S, type: "voice", name: "Lobby", position: 1 },
    { id: "staffvoice", server_id: S, type: "voice", name: "board-meeting", position: 2 },
    { id: "s2-secret", server_id: S2, type: "text", name: "staff-only-secret", topic: "salaries", position: 0 },
    { id: "s2-general", server_id: S2, type: "text", name: "general", position: 1 },
  ],
  server_channel_overrides: [
    { id: "ov-staff", channel_id: "staffvoice", target_type: "role", target_id: "everyone", allow_permissions: "0", deny_permissions: toPgBigint(F.VIEW_CHANNEL | F.CONNECT) },
    { id: "ov-member-general", channel_id: "general", target_type: "member", target_id: MEMBER, allow_permissions: toPgBigint(F.MANAGE_MESSAGES), deny_permissions: "0" },
  ],
  server_invites: [{ code: "INV", server_id: S, creator_id: OWNER, uses: 0, max_uses: null }],
  server_bans: [],
  server_audit_logs: [],
});

// Postgres compares uuid columns case-insensitively ('ABC…'::uuid = 'abc…'::uuid).
{
  const proto = Object.getPrototypeOf(fake.from("servers"));
  const norm = (v) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v.toLowerCase() : v);
  const eq = proto.eq;
  proto.eq = function (c, v) { return eq.call(this, c, norm(v)); };
  const inn = proto.in;
  proto.in = function (c, v) { return inn.call(this, c, Array.isArray(v) ? v.map(norm) : v); };
  for (const m of ["insert", "upsert"]) {
    const orig = proto[m];
    proto[m] = function (row, ...rest) {
      const fix = (r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, norm(v)]));
      return orig.call(this, Array.isArray(row) ? row.map(fix) : fix(row), ...rest);
    };
  }
  // PostgREST max_rows (Supabase default 1000), switched on per check.
  const run = proto._run;
  proto._run = function () {
    const r = run.call(this);
    if (proto.__cap && r && Array.isArray(r.data) && r.data.length > proto.__cap) r.data = r.data.slice(0, proto.__cap);
    return r;
  };
}
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken } = require("../config/jwt");
const serversRouter = require("../routes/servers");
let memberState = null;
try {
  memberState = require("../lib/serverMemberState");
} catch {
  memberState = null;
}

// Voice contract stub: records the calls the membership routes make.
const voiceCalls = [];
const voiceStub = {
  evictFromServerVoice: async (_io, args) => { voiceCalls.push(["evict", args]); },
  recheckVoiceAccess: async (_io, args) => { voiceCalls.push(["recheck", args]); },
  applyServerVoiceMute: async (_io, args) => { voiceCalls.push(["mute", args]); },
};
memberState?._setVoiceEnforceForTest?.(voiceStub);

const rows = (t) => fake._tables[t]?.rows || [];
const emitted = [];
const io = {
  to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }),
  in: () => ({ fetchSockets: async () => [], socketsLeave() {}, socketsJoin() {}, emit() {} }),
  sockets: { adapter: { rooms: new Map() }, sockets: new Map() },
};

const failures = [];
const passed = [];
async function check(name, fn) {
  try {
    await fn();
    passed.push(name);
  } catch (err) {
    failures.push(`${name}: ${String(err.message).split("\n")[0]}`);
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
  const call = async (who, method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signToken({ id: who, username: who, sid: `s-${who}` })}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  const member = (u, s = S) => rows("server_members").find((m) => m.server_id === s && m.user_id === u);
  const role = (id) => rows("server_roles").find((r) => r.id === id);
  const settle = () => new Promise((r) => setTimeout(r, 30));

  try {
    // ---------------- R1
    await check("R1 owner-created roles land at the bottom: Mod created after Admin stays below it", async () => {
      const a = await call(OWNER, "POST", `/servers/${S}/roles`, { name: "NewAdmin", permissions: { ADMINISTRATOR: true } });
      assert.equal(a.status, 201, JSON.stringify(a.body));
      const m = await call(OWNER, "POST", `/servers/${S}/roles`, { name: "NewMod", permissions: { KICK_MEMBERS: true } });
      assert.equal(m.status, 201, JSON.stringify(m.body));
      const pa = role(a.body.role.id).position;
      const pm = role(m.body.role.id).position;
      assert.ok(pm < pa, `NewMod ${pm} must be below NewAdmin ${pa}`);
      assert.equal(pm, 1, "new role sits just above @everyone");
      assert.ok(role("modrole").position > pa, "existing roles keep their order above");
      const others = rows("server_roles").filter((r) => r.server_id === S && !r.is_everyone && r.id !== a.body.role.id && r.id !== m.body.role.id);
      assert.ok(!others.some((r) => r.position === pa || r.position === pm), "new roles tie with no existing role");
      for (const id of [a.body.role.id, m.body.role.id]) await call(OWNER, "DELETE", `/servers/${S}/roles/${id}`);
    });

    // ---------------- R2
    await check("R2 MANAGE_ROLES mod cannot hand a lower ADMINISTRATOR role to an alt", async () => {
      const r = await call(MOD, "PUT", `/servers/${S}/members/${ALT}/roles/adminrole`);
      assert.equal(r.status, 403, JSON.stringify(r.body));
      assert.equal(r.body.code, "ROLE_EXCEEDS_YOUR_PERMISSIONS");
      assert.ok(!rows("server_member_roles").some((x) => x.user_id === ALT && x.role_id === "adminrole"));
    });
    await check("R2 a role within the mod's own bits can still be assigned", async () => {
      const r = await call(MOD, "PUT", `/servers/${S}/members/${ALT}/roles/helper`);
      assert.equal(r.status, 200, JSON.stringify(r.body));
    });

    // ---------------- R3
    await check("R3 role assign/remove re-checks the member's voice access (voice contract)", async () => {
      voiceCalls.length = 0;
      const r = await call(MOD, "DELETE", `/servers/${S}/members/${ALT}/roles/helper`);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      await settle();
      assert.ok(voiceCalls.some(([k, a]) => k === "recheck" && a.serverId === S), JSON.stringify(voiceCalls));
    });

    // ---------------- M1
    await check("M1 UPPERCASE owner id: timeout, kick and ban are refused; owner row untouched", async () => {
      const up = OWNER.toUpperCase();
      const t = await call(MOD, "POST", `/servers/${S}/members/${up}/timeout`, { durationSeconds: 600 });
      assert.equal(t.status, 403, JSON.stringify(t.body));
      const k = await call(MOD, "DELETE", `/servers/${S}/members/${up}`);
      assert.equal(k.status, 403, JSON.stringify(k.body));
      const b = await call(MOD, "PUT", `/servers/${S}/bans/${up}`, { reason: "x" });
      assert.equal(b.status, 403, JSON.stringify(b.body));
      assert.ok(member(OWNER), "owner still a member");
      assert.ok(!member(OWNER).timeout_until, "owner not timed out");
      assert.ok(!rows("server_bans").some((x) => x.user_id === OWNER), "owner not banned");
    });
    await check("M1 an UPPERCASE id is stored canonical (audit target lowercase)", async () => {
      const r = await call(MOD, "POST", `/servers/${S}/members/${ALT.toUpperCase()}/timeout`, { durationSeconds: 60 });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const audit = rows("server_audit_logs").filter((x) => x.action === "MEMBER_TIMEOUT").pop();
      assert.equal(audit?.target_id, ALT);
      await call(MOD, "DELETE", `/servers/${S}/members/${ALT}/timeout`);
    });

    // ---------------- M3 / IM-1
    await check("M3 timeout survives leave + rejoin", async () => {
      const t = await call(MOD, "POST", `/servers/${S}/members/${ALT}/timeout`, { durationSeconds: 86400 });
      assert.equal(t.status, 200, JSON.stringify(t.body));
      const l = await call(ALT, "POST", `/servers/${S}/leave`, {});
      assert.equal(l.status, 200);
      const j = await call(ALT, "POST", `/servers/invites/INV/join`, {});
      assert.equal(j.status, 201, JSON.stringify(j.body));
      const until = member(ALT)?.timeout_until;
      assert.ok(until && new Date(until) > new Date(), `timeout_until after rejoin: ${until}`);
    });
    await check("IM-2 a timed-out member cannot create invites or change their nickname", async () => {
      const inv = await call(ALT, "POST", `/servers/${S}/invites`, {});
      assert.equal(inv.status, 403, JSON.stringify(inv.body));
      assert.equal(inv.body.code, "TIMED_OUT");
      const nick = await call(ALT, "PATCH", `/servers/${S}/members/${ALT}/nickname`, { nickname: "evader" });
      assert.equal(nick.status, 403);
    });

    // ---------------- M2
    await check("M2 kick evicts the user from server voice through the contract", async () => {
      voiceCalls.length = 0;
      const r = await call(MOD, "DELETE", `/servers/${S}/members/${ALT}`);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      await settle();
      assert.ok(voiceCalls.some(([k, a]) => k === "evict" && a.serverId === S && a.userId === ALT), JSON.stringify(voiceCalls));
    });
    await check("DF-1/DF-2 kick removes the member's channel overrides and role rows", async () => {
      // MEMBER has a member override on #general and the Helper role.
      const r = await call(OWNER, "DELETE", `/servers/${S}/members/${MEMBER}`);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.ok(!rows("server_channel_overrides").some((o) => o.target_type === "member" && o.target_id === MEMBER), "member override removed");
      assert.ok(!rows("server_member_roles").some((x) => x.server_id === S && x.user_id === MEMBER), "role rows removed");
      // S2 membership untouched
      assert.ok(member(MEMBER, S2));
    });

    // ---------------- M4
    await check("M4 a timed-out moderator cannot kick", async () => {
      fake._tables.server_members.rows.find((m) => m.server_id === S && m.user_id === MOD).timeout_until = new Date(Date.now() + 3600e3).toISOString();
      const r = await call(MOD, "DELETE", `/servers/${S}/members/${MGR}`);
      assert.equal(r.status, 403, JSON.stringify(r.body));
      assert.equal(r.body.code, "TIMED_OUT");
      assert.ok(member(MGR));
      fake._tables.server_members.rows.find((m) => m.server_id === S && m.user_id === MOD).timeout_until = null;
    });

    // ---------------- SC-1
    await check("SC1 MANAGE_GUILD member cannot point AFK at a hidden voice channel", async () => {
      const r = await call(MGR, "PATCH", `/servers/${S}`, { afkChannelId: "staffvoice", afkTimeoutSeconds: 60 });
      assert.ok(r.status === 400 || r.status === 403, `${r.status} ${JSON.stringify(r.body)}`);
      assert.ok(!rows("servers").find((x) => x.id === S).afk_channel_id);
      const ok = await call(MGR, "PATCH", `/servers/${S}`, { afkChannelId: "lobby" });
      assert.equal(ok.status, 200, JSON.stringify(ok.body));
    });
    await check("SC5 deleting the AFK channel clears servers.afk_channel_id", async () => {
      const r = await call(OWNER, "DELETE", `/servers/${S}/channels/lobby`);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(rows("servers").find((x) => x.id === S).afk_channel_id || null, null);
    });

    // ---------------- M6
    await check("M6 ownership transfer clears the new owner's timeout", async () => {
      fake._tables.server_members.rows.find((m) => m.server_id === S && m.user_id === MGR).timeout_until = new Date(Date.now() + 3600e3).toISOString();
      const r = await call(OWNER, "POST", `/servers/${S}/ownership/transfer`, { userId: MGR, confirmName: "S1" });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(member(MGR).timeout_until || null, null);
      // give it back
      const back = await call(MGR, "POST", `/servers/${S}/ownership/transfer`, { userId: OWNER, confirmName: "S1" });
      assert.equal(back.status, 200, JSON.stringify(back.body));
    });

    // ---------------- MEDIUM / LOW extras
    await check("R6 role names @here / @everyone are refused (create and rename)", async () => {
      const a = await call(OWNER, "POST", `/servers/${S}/roles`, { name: "@here" });
      assert.equal(a.status, 400);
      const b = await call(OWNER, "PATCH", `/servers/${S}/roles/helper`, { name: "@everyone" });
      assert.equal(b.status, 400);
    });
    await check("IM-11 invalid invite settings are a 400, not a permanent invite", async () => {
      const r = await call(OWNER, "POST", `/servers/${S}/invites`, { maxAgeSeconds: "abc" });
      assert.equal(r.status, 400, JSON.stringify(r.body));
    });
    await check("M5 kick: the server room hears no reason / moderator id", async () => {
      fake._tables.server_members.rows.push({ server_id: S, user_id: ALT, list_position: 0 });
      emitted.length = 0;
      const r = await call(OWNER, "DELETE", `/servers/${S}/members/${ALT}`, { reason: "private mod note" });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const room = emitted.filter((e) => e.room === `server:${S}` && e.event === "server:member:removed");
      assert.ok(room.length === 1 && !("reason" in room[0].payload) && !("actorId" in room[0].payload), JSON.stringify(room));
      const own = emitted.find((e) => e.room === `user:${ALT}` && e.event === "server:member:removed");
      assert.equal(own?.payload.reason, "private mod note");
      assert.ok(!("actorId" in own.payload));
    });
    await check("P3 a non-admin MANAGE_ROLES creator makes a private channel in one request and keeps access", async () => {
      fake._tables.server_roles.rows.push({ id: "chmod", server_id: S, name: "ChMod", is_everyone: false, position: 6, permissions: toPgBigint(F.MANAGE_CHANNELS | F.MANAGE_ROLES) });
      fake._tables.server_member_roles.rows.push({ server_id: S, user_id: MOD, role_id: "chmod" });
      emitted.length = 0;
      const r = await call(MOD, "POST", `/servers/${S}/channels`, { name: "mods-only", type: "text", private: true });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      const id = r.body.channel.id;
      const { resolveChannelPermissions } = require("../lib/serverPermissions");
      assert.equal(P.hasPermission((await resolveChannelPermissions(fake, S, MOD, id)).bits, F.VIEW_CHANNEL), true, "creator sees it");
      assert.equal(P.hasPermission((await resolveChannelPermissions(fake, S, MGR, id)).bits, F.VIEW_CHANNEL), false, "others do not");
      await new Promise((res) => setTimeout(res, 30));
      assert.ok(!emitted.some((e) => e.event === "server:channel:created" && e.room === `user:${MGR}`), "not announced to non-viewers");
    });

    // ---------------- P1
    await check("P1 GET /servers/my pages overrides past the 1000-row cap (private channel stays hidden)", async () => {
      const proto = Object.getPrototypeOf(fake.from("servers"));
      // 1000 harmless override rows on server S come first, then S2's @everyone deny.
      const filler = [];
      for (let i = 0; i < 1000; i++) {
        filler.push({ id: `fill-${i}`, channel_id: "general", target_type: "member", target_id: `x-${i}`, allow_permissions: toPgBigint(F.ATTACH_FILES), deny_permissions: "0" });
      }
      fake._tables.server_channel_overrides.rows.unshift(...filler);
      fake._tables.server_channel_overrides.rows.push({ id: "ov-s2-secret", channel_id: "s2-secret", target_type: "role", target_id: "everyone2", allow_permissions: "0", deny_permissions: toPgBigint(F.VIEW_CHANNEL) });
      // MEMBER was kicked from S above; ALT is no longer a member either. Use ADMINU's S2 + a fresh member of both.
      fake._tables.server_members.rows.push({ server_id: S, user_id: MEMBER, list_position: 0 });
      proto.__cap = 1000;
      try {
        const r = await call(MEMBER, "GET", `/servers/my`);
        assert.equal(r.status, 200);
        const s2 = (r.body.servers || []).find((x) => x.id === S2);
        assert.ok(s2, "S2 listed");
        const ids = (s2.channels || []).map((c) => c.id);
        assert.ok(ids.includes("s2-general"), `general visible: ${ids}`);
        assert.ok(!ids.includes("s2-secret"), `private channel leaked: ${ids}`);
      } finally {
        proto.__cap = 0;
        fake._tables.server_channel_overrides.rows = fake._tables.server_channel_overrides.rows.filter((o) => !String(o.id).startsWith("fill-"));
      }
    });
  } finally {
    server.close();
  }

  console.log(`serverMembershipAudit: ${passed.length} passed, ${failures.length} failed`);
  for (const f of failures) console.log(`  FAIL ${f}`);
  if (failures.length) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
