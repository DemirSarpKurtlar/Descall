"use strict";

/**
 * Messaging phase 4: per-conversation notification options. Levels, timed
 * mutes, push filtering, the route, and a database without the table yet.
 *   node frontend/backend/test/notifyPrefs.integration.test.cjs
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
const A = id(1), B = id(2), C = id(3), G = id(10);
const fake = createFakeSupabase({
  users: [{ id: A, username: "alice", active_sessions: [{ id: "s-a" }] }],
  conversation_notify_prefs: [],
});
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };
const np = require("../lib/notifyPrefs");

(async () => {
  const now = Date.parse("2026-11-06T12:00:00.000Z");
  // Levels and timed mutes.
  assert.equal(np.effectiveLevel(null, now), "all");
  assert.equal(np.effectiveLevel({ level: "mentions" }, now), "mentions");
  assert.equal(np.effectiveLevel({ level: "all", muted_until: "2026-11-06T13:00:00.000Z" }, now), "none", "muted for now");
  assert.equal(np.effectiveLevel({ level: "mentions", muted_until: "2026-11-06T11:00:00.000Z" }, now), "mentions", "the mute ran out");
  assert.equal(np.allows("all"), true);
  assert.equal(np.allows("mentions"), false);
  assert.equal(np.allows("mentions", { mention: true }), true);
  assert.equal(np.allows("none", { mention: true }), false);

  // Validation.
  assert.equal(np.validatePref({ convType: "server", convId: G, level: "all" }, now).ok, false);
  assert.equal(np.validatePref({ convType: "dm", convId: "x", level: "all" }, now).ok, false);
  assert.equal(np.validatePref({ convType: "dm", convId: B, level: "loud" }, now).ok, false);
  assert.equal(np.validatePref({ convType: "dm", convId: B, level: "all", mutedUntil: "2026-11-06T11:00:00.000Z" }, now).ok, false, "a mute in the past");
  assert.equal(np.validatePref({ convType: "dm", convId: B, level: "all", mutedUntil: "2028-01-01T00:00:00.000Z" }, now).ok, false, "more than a year");
  assert.deepEqual(np.validatePref({ convType: "group", convId: G, level: "none", mutedUntil: null }, now), { ok: true, row: { conv_type: "group", conv_id: G, level: "none", muted_until: null } });

  // Save, read back, push filtering, back to default deletes the row.
  assert.equal((await np.savePref(A, { conv_type: "group", conv_id: G, level: "mentions", muted_until: null })).ok, true);
  assert.equal((await np.savePref(B, { conv_type: "group", conv_id: G, level: "none", muted_until: null })).ok, true);
  np.__resetNotifyPrefs(); // read from the table, not the write cache
  assert.equal(await np.levelFor(A, "group", G), "mentions");
  assert.deepEqual(await np.filterRecipients([A, B, C], "group", G, { mention: false }), [C], "plain message: only members on 'all'");
  assert.deepEqual(await np.filterRecipients([A, B, C], "group", G, { mention: true }), [A, C], "mention: 'mentions' members too, never 'none'");
  assert.deepEqual((await np.listPrefs(A)).map((p) => [p.convType, p.convId, p.level]), [["group", G, "mentions"]]);
  await np.savePref(A, { conv_type: "group", conv_id: G, level: "all", muted_until: null });
  np.__resetNotifyPrefs();
  assert.deepEqual(await np.listPrefs(A), [], "'all' without a mute is the default: no row kept");

  // Route.
  const express = require("express");
  const { signToken } = require("../config/jwt");
  const app = express();
  app.use(express.json());
  const emitted = [];
  app.set("io", { to: (room) => ({ emit: (ev, p) => emitted.push({ room, ev, p }) }) });
  app.use("/api/notify-prefs", require("../routes/notifyPrefs"));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}/api/notify-prefs`;
  const headers = { Authorization: `Bearer ${signToken({ id: A, username: "alice", sid: "s-a" })}`, "Content-Type": "application/json" };
  let res = await fetch(base, { method: "PUT", headers, body: JSON.stringify({ convType: "dm", convId: B, level: "nope" }) });
  assert.equal(res.status, 400);
  const until = new Date(Date.now() + 3600e3).toISOString();
  res = await fetch(base, { method: "PUT", headers, body: JSON.stringify({ convType: "dm", convId: B, level: "mentions", mutedUntil: until }) });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(body.pref, { convType: "dm", convId: B, level: "mentions", mutedUntil: until });
  assert.deepEqual(emitted.pop(), { room: `user:${A}`, ev: "notify-prefs:update", p: body.pref }, "my other devices follow");
  res = await fetch(base, { headers });
  assert.equal((await res.json()).prefs.length, 1);
  assert.equal(await np.levelFor(A, "dm", B), "none", "muted for an hour");
  res = await fetch(base);
  assert.equal(res.status, 401);

  // Before the migration: everything is 'all', saving says not_ready.
  np.__resetNotifyPrefs();
  const realFrom = fake.from.bind(fake);
  fake.from = (table) => {
    const q = realFrom(table);
    if (table === "conversation_notify_prefs") {
      const fail = async () => ({ data: null, error: { code: "42P01", message: 'relation "public.conversation_notify_prefs" does not exist' } });
      q.maybeSingle = fail;
      q.then = (ok, ko) => fail().then(ok, ko);
      const up = q.upsert.bind(q);
      q.upsert = (...a) => { up(...a); return q; };
    }
    return q;
  };
  assert.equal(await np.levelFor(A, "group", G), "all");
  assert.deepEqual(await np.filterRecipients([A, B], "group", G), [A, B]);
  res = await fetch(base, { method: "PUT", headers, body: JSON.stringify({ convType: "dm", convId: B, level: "none" }) });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, "not_ready");
  fake.from = realFrom;
  server.close();

  // Wiring: DM push, group push and the notification quick reply all ask first.
  const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
  assert.ok(/const notifyOk = notifyPrefs\.allows\(await notifyPrefs\.levelFor\(toUserId, "dm", myId\), \{ mention: Boolean\(dmMentioned\) \}\);\s*if \(!muted && notifyOk\)/.test(read("socket/handlers.js")));
  const group = read("socket/groupHandlers.js");
  assert.ok(group.includes('filterRecipients(memberIds.filter((id) => mentionedUserIds?.has(id)), "group", groupId, { mention: true })'));
  assert.ok(group.includes('filterRecipients(memberIds.filter((id) => !mentionedUserIds?.has(id)), "group", groupId, { mention: false })'));
  assert.ok(read("lib/notifyActions.js").includes('if (notifyOk && !(await prefs().isMuted(peerId, myId)))'));
  console.log("notifyPrefs integration test OK");
})().catch((err) => { console.error(err); process.exit(1); });
