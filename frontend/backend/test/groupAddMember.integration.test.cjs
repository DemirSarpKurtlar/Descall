"use strict";

/**
 * POST /api/groups/:id/members end to end (routes/groups.js +
 * lib/groupMembership + lib/groupList.loadGroupById).
 *
 * Regression (Oct 2026, "üye eklendi ama eklenmemiş görünüyor"):
 *  1. Friends with friendship rows in both directions (A→B and B→A, both
 *     accepted — 14 such pairs in production) got 403 "You can only add your
 *     friends": `.maybeSingle()` over two rows is PGRST116 with data = null.
 *     The fake runs with strictSingle so it behaves like PostgREST.
 *  2. The response / sockets did not carry what clients need: existing
 *     members get `group:member:added` with the user + count, the new member
 *     gets `group:invited` with the full group on every device (`user:<id>`
 *     room, not one socket) and joins the group room.
 *  3. Adding someone who is already in the group is an idempotent 200, so a
 *     stale client repairs its list instead of showing an error.
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const assert = require("node:assert/strict");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const users = ["owner", "member", "bidir", "oneway", "pending", "stranger", "outsider"].map((n) => ({
  id: `u-${n}`,
  username: n,
  avatar_url: null,
  status: "online",
  is_admin: false,
  active_sessions: [{ id: `s-${n}` }],
}));

const supabasePath = require.resolve("../db/supabase");
const fake = createFakeSupabase(
  {
    users,
    groups: [{ id: "g1", name: "Ekip", created_by: "u-owner", avatar_url: null, created_at: "2026-10-01T00:00:00Z" }],
    group_members: [
      { group_id: "g1", user_id: "u-owner", joined_at: "2026-10-01T00:00:00Z" },
      { group_id: "g1", user_id: "u-member", joined_at: "2026-10-01T00:00:00Z" },
    ],
    group_messages: [],
    friendships: [
      // Both directions accepted: the pair that used to 403.
      { id: "f1", user_id: "u-owner", friend_id: "u-bidir", status: "accepted" },
      { id: "f2", user_id: "u-bidir", friend_id: "u-owner", status: "accepted" },
      // One direction, requested by the friend.
      { id: "f3", user_id: "u-oneway", friend_id: "u-owner", status: "accepted" },
      { id: "f4", user_id: "u-owner", friend_id: "u-pending", status: "pending" },
      { id: "f5", user_id: "u-member", friend_id: "u-owner", status: "accepted" },
    ],
  },
  { strictSingle: true, uniqueKeys: { group_members: ["group_id", "user_id"] } },
);
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken } = require("../config/jwt");
const groupsRouter = require("../routes/groups");

async function run() {
  const emitted = [];
  const joins = [];
  const app = express();
  app.use(express.json());
  app.set("io", {
    to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }),
    in: (room) => ({ socketsJoin: (target) => joins.push({ room, target }) }),
  });
  app.use("/api/groups", groupsRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}/api/groups`;
  const token = (who) => signToken({ id: `u-${who}`, username: who, sid: `s-${who}` });
  const add = async (who, userId, groupId = "g1") => {
    const res = await fetch(`${base}/${groupId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token(who)}` },
      body: JSON.stringify({ userId }),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  const membersNow = () => fake._tables.group_members.rows.filter((r) => r.group_id === "g1").map((r) => r.user_id).sort();

  try {
    // 1. Bidirectional friendship: was 403, must add.
    let r = await add("owner", "u-bidir");
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(membersNow(), ["u-bidir", "u-member", "u-owner"]);
    assert.equal(r.body.user.id, "u-bidir");
    assert.equal(r.body.user.username, "bidir");
    assert.equal(r.body.group.id, "g1");
    assert.equal(r.body.group.memberCount, 3);
    assert.deepEqual([...r.body.group.memberIds].sort(), ["u-bidir", "u-member", "u-owner"]);
    assert.ok(r.body.group.members.some((m) => m.id === "u-bidir"), "response group lists the new member");

    const added = emitted.find((e) => e.event === "group:member:added");
    assert.ok(added, "existing members get group:member:added");
    assert.equal(added.room, "group:g1");
    assert.equal(added.payload.groupId, "g1");
    assert.equal(added.payload.user.id, "u-bidir");
    assert.equal(added.payload.memberCount, 3);
    assert.equal(added.payload.addedBy, "u-owner");

    const invited = emitted.find((e) => e.event === "group:invited");
    assert.ok(invited, "new member gets group:invited");
    assert.equal(invited.room, "user:u-bidir", "every device of the new member, not one socket");
    assert.equal(invited.payload.group.id, "g1");
    assert.equal(invited.payload.group.memberCount, 3);
    assert.ok(invited.payload.group.members.some((m) => m.id === "u-owner"));
    assert.deepEqual(joins, [{ room: "user:u-bidir", target: "group:g1" }], "new member's sockets join the group room");

    // 2. One-direction friendship (row owned by the friend) and a non-owner adder.
    r = await add("member", "u-owner");
    assert.equal(r.status, 200, "already member → idempotent 200");
    assert.equal(r.body.alreadyMember, true);
    r = await add("owner", "u-oneway");
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.group.memberCount, 4);

    // 3. Already a member: 200 + alreadyMember, no duplicate row, no broadcast.
    const before = emitted.length;
    r = await add("owner", "u-bidir");
    assert.equal(r.status, 200);
    assert.equal(r.body.alreadyMember, true);
    assert.equal(r.body.group.memberCount, 4);
    assert.equal(emitted.length, before);
    assert.equal(membersNow().length, 4);

    // 4. Refusals.
    r = await add("owner", "u-pending");
    assert.equal(r.status, 403);
    assert.equal(r.body.code, "NOT_FRIENDS");
    r = await add("owner", "u-stranger");
    assert.equal(r.status, 403);
    r = await add("outsider", "u-owner");
    assert.equal(r.status, 403);
    assert.equal(r.body.code, "NOT_MEMBER");
    r = await add("owner", "");
    assert.equal(r.status, 400);
    r = await add("owner", "x),or(id.neq.0");
    assert.equal(r.status, 400, "filter injection is rejected");
    assert.equal(membersNow().length, 4);

    // 5. Capacity: 15 members max.
    for (let i = 0; i < 11; i++) fake._tables.group_members.rows.push({ group_id: "g1", user_id: `u-fill${i}` });
    fake._tables.friendships.rows.push({ id: "f9", user_id: "u-owner", friend_id: "u-stranger", status: "accepted" });
    r = await add("owner", "u-stranger");
    assert.equal(r.status, 400);
    assert.equal(r.body.code, "GROUP_FULL");

    console.log("groupAddMember.integration ok");
  } finally {
    server.close();
  }
}

run().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
