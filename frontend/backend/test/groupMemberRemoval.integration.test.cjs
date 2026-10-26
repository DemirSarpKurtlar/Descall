"use strict";

/**
 * Group member removal + group admin + leave (owner decisions 25.10.2026),
 * end to end over HTTP against routes/groups.js with the fake Supabase.
 *
 *  - owner removes anyone but themself; group admin removes plain members;
 *    plain members remove nobody; non-member target → 404
 *  - optional reason ≤ 140, delivered only to the removed person
 *    (group:removed), never in the system row
 *  - removed person keeps reading history up to the removal, nothing after,
 *    and cannot post; GET /my keeps the group with `removed`
 *  - re-add waits 5 s (429 REMOVAL_COOLDOWN), then works and clears `removed`
 *  - leave writes a member_left row + group:member:left; owner leaving hands
 *    the group to an admin first
 *  - works while the migration is pending (missing table / role column)
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const assert = require("node:assert/strict");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const names = ["owner", "admin", "can", "deniz", "ece", "outsider", "late"];
const users = names.map((n) => ({
  id: `u-${n}`,
  username: n,
  avatar_url: null,
  status: "online",
  is_admin: false,
  active_sessions: [{ id: `s-${n}` }],
}));
const t0 = "2026-10-01T00:00:00Z";
const fake = createFakeSupabase(
  {
    users,
    groups: [
      { id: "g1", name: "Halı saha", created_by: "u-owner", avatar_url: null, created_at: t0 },
      { id: "g2", name: "İş", created_by: "u-owner", avatar_url: null, created_at: t0 },
    ],
    group_members: [
      { group_id: "g1", user_id: "u-owner", joined_at: "2026-10-01T00:00:00Z", role: "member" },
      { group_id: "g1", user_id: "u-admin", joined_at: "2026-10-01T00:01:00Z", role: "admin" },
      { group_id: "g1", user_id: "u-can", joined_at: "2026-10-01T00:02:00Z", role: "member" },
      { group_id: "g1", user_id: "u-deniz", joined_at: "2026-10-01T00:03:00Z", role: "member" },
      { group_id: "g1", user_id: "u-ece", joined_at: "2026-10-01T00:04:00Z", role: "member" },
      { group_id: "g2", user_id: "u-owner", joined_at: t0, role: "member" },
      { group_id: "g2", user_id: "u-deniz", joined_at: "2026-10-01T00:05:00Z", role: "member" },
      { group_id: "g2", user_id: "u-ece", joined_at: "2026-10-01T00:06:00Z", role: "admin" },
    ],
    group_messages: [
      { id: "m-old", group_id: "g1", sender_id: "u-can", content: "eski mesaj", created_at: "2026-10-02T10:00:00.000Z", sender: { id: "u-can", username: "can" } },
    ],
    group_member_removals: [],
    friendships: [
      { id: "f1", user_id: "u-owner", friend_id: "u-can", status: "accepted" },
    ],
  },
  { strictSingle: true, uniqueKeys: { group_members: ["group_id", "user_id"] } },
);
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken } = require("../config/jwt");
const groupsRouter = require("../routes/groups");

async function run() {
  const emitted = [];
  const left = [];
  const app = express();
  app.use(express.json());
  app.set("io", {
    to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }),
    in: (room) => ({
      socketsJoin: () => {},
      socketsLeave: (target) => left.push({ room, target }),
    }),
  });
  app.use("/api/groups", groupsRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}/api/groups`;
  const token = (who) => signToken({ id: `u-${who}`, username: who, sid: `s-${who}` });
  const call = async (who, method, path, body) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { "content-type": "application/json", authorization: `Bearer ${token(who)}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  const remove = (who, target, reason, g = "g1") =>
    call(who, "POST", `/${g}/members/u-${target}/remove`, reason === undefined ? {} : { reason });
  const isMember = (g, u) => fake._tables.group_members.rows.some((r) => r.group_id === g && r.user_id === `u-${u}`);
  const events = (name) => emitted.filter((e) => e.event === name);

  try {
    // Unauthenticated → 401, never 500.
    let raw = await fetch(`${base}/g1/members/u-can/remove`, { method: "POST" });
    assert.equal(raw.status, 401);
    raw = await fetch(`${base}/g1/members/u-can/role`, { method: "PATCH" });
    assert.equal(raw.status, 401);
    raw = await fetch(`${base}/g1/removed-view`, { method: "DELETE" });
    assert.equal(raw.status, 401);

    // Permission matrix.
    let r = await remove("can", "deniz");
    assert.equal(r.status, 403, "plain member cannot remove");
    assert.equal(r.body.code, "NOT_ALLOWED");
    r = await remove("owner", "owner");
    assert.equal(r.status, 400, "owner cannot remove self");
    r = await remove("admin", "owner");
    assert.equal(r.status, 403, "admin cannot remove owner");
    r = await remove("outsider", "can");
    assert.equal(r.status, 403);
    assert.equal(r.body.code, "NOT_MEMBER");
    r = await remove("owner", "outsider");
    assert.equal(r.status, 404, "non-member target");
    r = await remove("owner", "can", "x".repeat(141));
    assert.equal(r.status, 400);
    assert.equal(r.body.code, "REASON_TOO_LONG");
    r = await remove("owner", "can", 42);
    assert.equal(r.status, 400);
    assert.ok(isMember("g1", "can"), "nothing removed by refusals");

    // Owner removes Can with a reason.
    const reason = "grup yalnızca halı saha ekibi için";
    r = await remove("owner", "can", `  ${reason}  `);
    assert.equal(r.status, 200);
    assert.equal(isMember("g1", "can"), false);
    assert.equal(r.body.memberCount, 4);
    const sys = fake._tables.group_messages.rows.find((m) => m.message_type === "member_removed");
    assert.ok(sys, "system row stored");
    assert.deepEqual(JSON.parse(sys.content), { actorId: "u-owner", actorName: "owner", targetId: "u-can", targetName: "can" });
    assert.ok(!sys.content.includes("halı"), "reason never in the system row");
    const roomEvt = events("group:member:removed")[0];
    assert.equal(roomEvt.room, "group:g1");
    assert.equal(roomEvt.payload.userId, "u-can");
    assert.equal(roomEvt.payload.memberCount, 4);
    assert.ok(!JSON.stringify(roomEvt.payload).includes("halı"), "room event carries no reason");
    const userEvt = events("group:removed")[0];
    assert.equal(userEvt.room, "user:u-can");
    assert.equal(userEvt.payload.reason, reason, "reason trimmed, only to the removed person");
    assert.equal(userEvt.payload.byUsername, "owner");
    assert.ok(left.some((l) => l.room === "user:u-can" && l.target === "group:g1"), "sockets leave the room");
    const removal = fake._tables.group_member_removals.rows[0];
    assert.equal(removal.reason, reason);
    assert.equal(removal.read_until, sys.created_at);

    // A message after the removal.
    fake._tables.group_messages.rows.push({
      id: "m-new",
      group_id: "g1",
      sender_id: "u-owner",
      content: "yeni mesaj",
      created_at: new Date(Date.now() + 1000).toISOString(),
      sender: { id: "u-owner", username: "owner" },
    });

    // Removed person: reads history up to the removal, nothing newer.
    r = await call("can", "GET", "/g1/messages");
    assert.equal(r.status, 200);
    assert.equal(r.body.removed, true);
    const ids = r.body.messages.map((m) => m.id);
    assert.ok(ids.includes("m-old"));
    assert.ok(ids.includes(sys.id), "sees the removal row");
    assert.ok(!ids.includes("m-new"), "nothing after the removal");
    r = await call("can", "GET", `/g1/messages?since=${encodeURIComponent("2026-10-01T00:00:00Z")}`);
    assert.equal(r.status, 200);
    assert.ok(!r.body.messages.some((m) => m.id === "m-new"), "incremental fetch stops too");
    r = await call("can", "POST", "/g1/messages", { content: "selam" });
    assert.equal(r.status, 403, "cannot post");
    r = await call("outsider", "GET", "/g1/messages");
    assert.equal(r.status, 403, "strangers still 403");

    // GET /my keeps the group for Can, read-only, preview stops at the removal.
    r = await call("can", "GET", "/my");
    assert.equal(r.status, 200);
    const kept = r.body.groups.find((g) => g.id === "g1");
    assert.ok(kept, "removed group stays in the list");
    assert.equal(kept.removed.reason, reason);
    assert.equal(kept.removed.byUsername, "owner");
    assert.equal(kept.lastMessage, "owner removed you");
    r = await call("owner", "GET", "/my");
    const ownerView = r.body.groups.find((g) => g.id === "g1");
    assert.equal(ownerView.removed, undefined);
    assert.deepEqual(ownerView.adminIds, ["u-admin"]);

    // Re-add inside 5 s → 429; after the cooldown → OK and `removed` clears.
    r = await call("owner", "POST", "/g1/members", { userId: "u-can" });
    assert.equal(r.status, 429);
    assert.equal(r.body.code, "REMOVAL_COOLDOWN");
    assert.ok(r.body.retryAfterMs > 0 && r.body.retryAfterMs <= 5000);
    const removalsLib = require("../lib/groupRemovals");
    removalsLib.__test.recentRemovals.clear();
    removal.removed_at = new Date(Date.now() - 6000).toISOString();
    r = await call("owner", "POST", "/g1/members", { userId: "u-can" });
    assert.equal(r.status, 200);
    assert.ok(isMember("g1", "can"));
    assert.ok(removal.readded_at, "re-add closes the removal");
    r = await call("can", "GET", "/my");
    assert.equal(r.body.groups.filter((g) => g.id === "g1").length, 1);
    assert.equal(r.body.groups.find((g) => g.id === "g1").removed, undefined);

    // Group admin removes a plain member, not another admin.
    r = await remove("admin", "deniz");
    assert.equal(r.status, 200);
    fake._tables.group_members.rows.push({ group_id: "g1", user_id: "u-late", joined_at: t0, role: "admin" });
    r = await remove("admin", "late");
    assert.equal(r.status, 403, "admin cannot remove admin");
    fake._tables.group_members.rows = fake._tables.group_members.rows.filter((m) => m.user_id !== "u-late");
    fake._tables.group_members.rows.length = 0;

    // Removed view dismissal ("Sohbetten kaldır").
    fake._tables.group_members.rows.push(
      { group_id: "g1", user_id: "u-owner", joined_at: t0, role: "member" },
      { group_id: "g1", user_id: "u-admin", joined_at: t0, role: "admin" },
      { group_id: "g1", user_id: "u-can", joined_at: t0, role: "member" },
      { group_id: "g2", user_id: "u-owner", joined_at: t0, role: "member" },
      { group_id: "g2", user_id: "u-deniz", joined_at: "2026-10-01T00:05:00Z", role: "member" },
      { group_id: "g2", user_id: "u-ece", joined_at: "2026-10-01T00:06:00Z", role: "admin" },
    );
    r = await call("deniz", "GET", "/my");
    assert.ok(r.body.groups.find((g) => g.id === "g1")?.removed, "deniz sees g1 read-only");
    r = await call("deniz", "DELETE", "/g1/removed-view");
    assert.equal(r.status, 200);
    r = await call("deniz", "GET", "/my");
    assert.equal(r.body.groups.find((g) => g.id === "g1"), undefined, "dismissed");
    r = await call("deniz", "GET", "/g1/messages");
    assert.equal(r.status, 403, "dismissed → no more history");

    // Roles: owner only.
    r = await call("admin", "PATCH", "/g1/members/u-can/role", { role: "admin" });
    assert.equal(r.status, 403);
    r = await call("owner", "PATCH", "/g1/members/u-can/role", { role: "boss" });
    assert.equal(r.status, 400);
    r = await call("owner", "PATCH", "/g1/members/u-owner/role", { role: "admin" });
    assert.equal(r.status, 400);
    r = await call("owner", "PATCH", "/g1/members/u-outsider/role", { role: "admin" });
    assert.equal(r.status, 404);
    r = await call("owner", "PATCH", "/g1/members/u-can/role", { role: "admin" });
    assert.equal(r.status, 200);
    assert.equal(fake._tables.group_members.rows.find((m) => m.group_id === "g1" && m.user_id === "u-can").role, "admin");
    assert.equal(events("group:member:role").at(-1).payload.role, "admin");
    r = await call("owner", "GET", "/g1/members");
    // (the fake does not resolve the user:user_id join; roles are per row)
    assert.equal(r.body.members.filter((m) => m.role === "admin").length, 2);

    // Rate limit: 10 removals a minute per actor.
    for (let i = 0; i < 12; i++) fake._tables.group_members.rows.push({ group_id: "g1", user_id: `u-fill${i}`, joined_at: t0, role: "member" });
    fake._tables.users.rows.push(...Array.from({ length: 12 }, (_, i) => ({ id: `u-fill${i}`, username: `fill${i}` })));
    let limited = null;
    for (let i = 0; i < 12; i++) {
      r = await remove("admin", `fill${i}`);
      if (r.status === 429) { limited = i; break; }
      assert.equal(r.status, 200);
    }
    assert.equal(limited, 9, "admin already removed deniz → 10th in the window is refused");
    assert.equal(r.body.code, "RATE_LIMITED");

    // Leave: system row + event; owner leaving hands over to an admin first.
    emitted.length = 0;
    r = await call("deniz", "POST", "/g2/leave");
    assert.equal(r.status, 200);
    const leftRow = fake._tables.group_messages.rows.find((m) => m.message_type === "member_left" && m.group_id === "g2");
    assert.deepEqual(JSON.parse(leftRow.content), { actorId: "u-deniz", actorName: "deniz" });
    const leftEvt = events("group:member:left")[0];
    assert.equal(leftEvt.room, "group:g2");
    assert.equal(leftEvt.payload.userId, "u-deniz");
    assert.equal(leftEvt.payload.memberCount, 2);
    assert.equal(leftEvt.payload.message.id, leftRow.id);
    assert.equal(events("group:left")[0].room, "user:u-deniz");
    r = await call("owner", "POST", "/g2/leave");
    assert.equal(r.status, 200);
    assert.equal(r.body.ownerId, "u-ece", "admin inherits");
    assert.equal(fake._tables.groups.rows.find((g) => g.id === "g2").created_by, "u-ece");
    assert.equal(events("group:member:left").at(-1).payload.ownerId, "u-ece");

    console.log("groupMemberRemoval.integration ok");
  } finally {
    server.close();
  }
}

/** Same flows while migration 20261026 is not applied yet. */
async function runWithoutMigration() {
  const fake2 = createFakeSupabase(
    {
      users,
      groups: [{ id: "g1", name: "X", created_by: "u-owner", avatar_url: null, created_at: t0 }],
      group_members: [
        { group_id: "g1", user_id: "u-owner", joined_at: t0 },
        { group_id: "g1", user_id: "u-can", joined_at: t0 },
      ],
      group_messages: [],
      friendships: [{ id: "f1", user_id: "u-owner", friend_id: "u-can", status: "accepted" }],
    },
    { strictSingle: true, missingTables: ["group_member_removals"] },
  );
  // No role column: a select naming `role` fails like PostgREST (42703).
  const origFrom = fake2.from.bind(fake2);
  fake2.from = (name) => {
    const q = origFrom(name);
    if (name !== "group_members") return q;
    const origSelect = q.select.bind(q);
    q.select = (cols, opts) => {
      if (/\brole\b/.test(String(cols || ""))) {
        q._run = () => ({ data: null, error: { code: "42703", message: "column group_members.role does not exist" } });
      }
      return origSelect(cols, opts);
    };
    return q;
  };
  for (const key of Object.keys(require.cache)) {
    if (key.includes("/routes/groups") || key.includes("/lib/group")) delete require.cache[key];
  }
  require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake2 };
  const router = require("../routes/groups");
  const app = express();
  app.use(express.json());
  app.set("io", { to: () => ({ emit() {} }), in: () => ({ socketsJoin() {}, socketsLeave() {} }) });
  app.use("/api/groups", router);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}/api/groups`;
  const auth = (who) => ({ "content-type": "application/json", authorization: `Bearer ${signToken({ id: `u-${who}`, username: who, sid: `s-${who}` })}` });
  try {
    let res = await fetch(`${base}/my`, { headers: auth("owner") });
    assert.equal(res.status, 200, "GET /my without migration");
    res = await fetch(`${base}/g1/members`, { headers: auth("owner") });
    assert.equal(res.status, 200, "GET members without role column");
    res = await fetch(`${base}/g1/members/u-can/remove`, { method: "POST", headers: auth("owner"), body: "{}" });
    assert.equal(res.status, 200, "remove works without the table");
    res = await fetch(`${base}/g1/members`, { method: "POST", headers: auth("owner"), body: JSON.stringify({ userId: "u-can" }) });
    assert.equal(res.status, 429, "cooldown held in memory");
    res = await fetch(`${base}/g1/members/u-can/role`, { method: "PATCH", headers: auth("owner"), body: JSON.stringify({ role: "admin" }) });
    assert.ok([404, 503].includes(res.status), `role without column: ${res.status}`);
    console.log("groupMemberRemoval.integration (no migration) ok");
  } finally {
    server.close();
  }
}

run()
  .then(runWithoutMigration)
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
