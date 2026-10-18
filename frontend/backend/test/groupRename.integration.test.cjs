"use strict";

/**
 * POST /api/groups/:id/rename end to end (routes/groups.js + lib/groupRename):
 * any member may rename, non-members get 403, names are normalized and
 * persisted, and every member's room gets a group:renamed broadcast.
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const assert = require("node:assert/strict");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const supabasePath = require.resolve("../db/supabase");
const fake = createFakeSupabase({
  users: [
    { id: "u-owner", username: "owner", active_sessions: [{ id: "s-owner" }] },
    { id: "u-member", username: "member", active_sessions: [{ id: "s-member" }] },
    { id: "u-outsider", username: "outsider", active_sessions: [{ id: "s-outsider" }] },
  ],
  groups: [{ id: "g1", name: "Eski Ad", created_by: "u-owner", avatar_url: null }],
  group_members: [
    { group_id: "g1", user_id: "u-owner" },
    { group_id: "g1", user_id: "u-member" },
  ],
});
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken } = require("../config/jwt");
const groupsRouter = require("../routes/groups");

async function run() {
  const emitted = [];
  const app = express();
  app.use(express.json());
  app.set("io", { to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }) });
  app.use("/api/groups", groupsRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}/api/groups`;
  const post = async (who, body) => {
    const res = await fetch(`${base}/g1/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signToken({ id: who, username: who.slice(2), sid: `s-${who.slice(2)}` })}` },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  const nameNow = async () => (await fake.from("groups").select("name").eq("id", "g1").maybeSingle()).data?.name;

  try {
    // A plain member (not the creator) can rename: this was the reported bug.
    let r = await post("u-member", { name: "  Hafta   Sonu Ekibi " });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.name, "Hafta Sonu Ekibi");
    assert.equal(await nameNow(), "Hafta Sonu Ekibi");
    assert.equal(emitted.length, 1);
    assert.deepEqual(
      { room: emitted[0].room, event: emitted[0].event, groupId: emitted[0].payload.groupId, name: emitted[0].payload.name, by: emitted[0].payload.renamedBy },
      { room: "group:g1", event: "group:renamed", groupId: "g1", name: "Hafta Sonu Ekibi", by: "u-member" },
    );

    // Owner too.
    r = await post("u-owner", { name: "VAL Night" });
    assert.equal(r.status, 200);
    assert.equal(await nameNow(), "VAL Night");

    // Same name: success, no extra broadcast.
    r = await post("u-owner", { name: "VAL Night" });
    assert.equal(r.status, 200);
    assert.equal(emitted.length, 2);

    // Outsider: 403, unchanged.
    r = await post("u-outsider", { name: "Hack" });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, "NOT_MEMBER");
    assert.equal(await nameNow(), "VAL Night");

    // Validation.
    r = await post("u-member", { name: "   " });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, "NAME_REQUIRED");
    r = await post("u-member", { name: "x".repeat(51) });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, "NAME_TOO_LONG");

    // Unknown group.
    const res = await fetch(`${base}/nope/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signToken({ id: "u-member", username: "member", sid: "s-member" })}` },
      body: JSON.stringify({ name: "Yeni" }),
    });
    assert.equal(res.status, 404);
    assert.equal(emitted.length, 2);
    console.log("groupRename.integration ok");
  } finally {
    server.close();
  }
}

run().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
