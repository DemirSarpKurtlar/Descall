"use strict";

/**
 * Messaging phase 4: "Görüldü" read receipts. Privacy works both ways and is
 * enforced here, group read positions, the routes, and a database that has
 * not run 20261108_read_receipts.sql yet.
 *   node frontend/backend/test/readReceipts.integration.test.cjs
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = id(1), B = id(2), C = id(3), D = id(4), G = id(10);
const fake = createFakeSupabase({
  users: [
    { id: A, username: "alice", read_receipts: true, active_sessions: [{ id: "s-a" }] },
    { id: B, username: "bora", read_receipts: true, active_sessions: [{ id: "s-b" }] },
    { id: C, username: "ceren", read_receipts: false, active_sessions: [{ id: "s-c" }] },
    { id: D, username: "deniz", read_receipts: true, active_sessions: [{ id: "s-d" }] },
  ],
  group_members: [{ group_id: G, user_id: A }, { group_id: G, user_id: B }, { group_id: G, user_id: C }],
  group_read_state: [],
});
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const rr = require("../lib/readReceipts");

(async () => {
  // ---- privacy, both ways ----
  assert.equal(await rr.receiptsEnabled(A), true);
  assert.equal(await rr.receiptsEnabled(C), false);
  assert.equal(await rr.bothShare(A, B), true);
  assert.equal(await rr.bothShare(A, C), false, "the reader turned it off");
  assert.equal(await rr.bothShare(C, A), false, "turned off: you do not see others either");

  const at = "2026-11-06T10:00:00.000Z";
  const thread = (me, peer) => [
    { id: "m1", from: { id: me }, readAt: at },
    { id: "m2", from: { id: peer }, readAt: at },
  ];
  let out = await rr.maskDmReads(thread(A, B), A, B);
  assert.equal(out[0].readAt, at, "both on: my read time stays");
  out = await rr.maskDmReads(thread(A, C), A, C);
  assert.equal(out[0].readAt, null, "peer off: my message's read time is hidden");
  assert.equal(out[1].readAt, at, "only my own messages are touched");
  out = await rr.maskDmReads(thread(C, A), C, A);
  assert.equal(out[0].readAt, null, "I am off: I do not see theirs");
  const original = thread(A, C);
  await rr.maskDmReads(original, A, C);
  assert.equal(original[0].readAt, at, "masking copies, never mutates the cache");

  // ---- switch ----
  assert.deepEqual(await rr.setReceiptsEnabled(D, false), { ok: true, enabled: false });
  assert.equal(fake._tables?.users ? fake._tables.users.rows.find((u) => u.id === D).read_receipts : false, false);
  assert.equal(await rr.receiptsEnabled(D), false, "cache follows the switch");

  // ---- group read positions ----
  assert.equal(typeof (await rr.markGroupRead(G, B, "2026-11-06T11:00:00.000Z")), "string");
  await rr.markGroupRead(G, C, "2026-11-06T11:05:00.000Z");
  await rr.markGroupRead(G, A, "2026-11-06T11:06:00.000Z");
  await rr.markGroupRead(G, B, "2026-11-06T11:10:00.000Z"); // upsert, one row per member
  let reads = await rr.groupReads(G, A);
  assert.deepEqual(reads, [{ userId: B, at: "2026-11-06T11:10:00.000Z" }], "not me, not members who turned it off, one row per member");
  assert.deepEqual(await rr.groupReads(G, C), [], "off: no one else's reads");

  // ---- routes ----
  const express = require("express");
  const { signToken } = require("../config/jwt");
  const app = express();
  app.use(express.json());
  app.use("/api/read-receipts", require("../routes/readReceipts"));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}/api/read-receipts`;
  const as = (uid, sid) => ({ Authorization: `Bearer ${signToken({ id: uid, username: "x", sid })}`, "Content-Type": "application/json" });
  let res = await fetch(base, { headers: as(A, "s-a") });
  assert.deepEqual(await res.json(), { enabled: true });
  res = await fetch(base, { method: "PUT", headers: as(A, "s-a"), body: JSON.stringify({ enabled: "no" }) });
  assert.equal(res.status, 400);
  res = await fetch(base, { method: "PUT", headers: as(A, "s-a"), body: JSON.stringify({ enabled: false }) });
  assert.deepEqual(await res.json(), { ok: true, enabled: false });
  await rr.setReceiptsEnabled(A, true);
  res = await fetch(`${base}/groups/${G}`, { headers: as(A, "s-a") });
  assert.deepEqual((await res.json()).reads.map((r) => r.userId), [B]);
  res = await fetch(`${base}/groups/${G}`, { headers: as(D, "s-d") });
  assert.equal(res.status, 403, "outsiders cannot read a group's read state");
  res = await fetch(`${base}/groups/not-a-uuid`, { headers: as(A, "s-a") });
  assert.equal(res.status, 400);
  res = await fetch(base);
  assert.equal(res.status, 401);
  server.close();

  // ---- before the migration: everyone counts as on, nothing breaks ----
  rr.__resetReadReceipts();
  const realFrom = fake.from.bind(fake);
  fake.from = (table) => {
    const q = realFrom(table);
    if (table === "users" || table === "group_read_state") {
      const err = table === "users"
        ? { code: "42703", message: "column users.read_receipts does not exist" }
        : { code: "42P01", message: 'relation "public.group_read_state" does not exist' };
      const fail = async () => ({ data: null, error: err });
      q.maybeSingle = fail;
      q.then = (ok, ko) => fail().then(ok, ko);
    }
    return q;
  };
  assert.equal(await rr.receiptsEnabled(C), true);
  assert.equal(await rr.markGroupRead(G, A), null);
  assert.deepEqual(await rr.groupReads(G, A), []);
  fake.from = realFrom;

  // ---- wiring ----
  const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
  const handlers = read("socket/handlers.js");
  assert.ok(/if \(await bothShareReceipts\(myId, withUserId\)\.catch\(\(\) => true\)\) \{\s*emitToUser\(io, withUserId, "dm:peer_read"/.test(handlers), "dm:peer_read only when both share");
  const notify = read("lib/notifyActions.js");
  assert.ok(/if \(await Promise\.resolve\(share\(myId, peerId\)\)\.catch\(\(\) => true\)\) \{\s*emitToUser\(io, peerId, "dm:peer_read"/.test(notify), "notification \"mark as read\" follows the same rule");
  const dmLib = read("lib/dmMessages.js");
  assert.ok(dmLib.includes('require("./readReceipts").maskDmReads(out.messages, myId, peerId)'), "every DM history path is masked");
  const groups = read("socket/groupHandlers.js");
  assert.ok(groups.includes('socket.on("group:mark_read"'));
  assert.ok(/if \(!member\) return;[\s\S]{0,200}markGroupRead\(groupId, myId\)/.test(groups), "members only");
  assert.ok(/if \(at && \(await rr\.receiptsEnabled\(myId\)\)\) \{\s*io\.to\(`group:\$\{groupId\}`\)\.emit\("group:read"/.test(groups), "no broadcast when the reader turned it off");
  console.log("readReceipts integration test OK");
})().catch((err) => { console.error(err); process.exit(1); });
