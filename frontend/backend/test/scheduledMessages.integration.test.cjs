"use strict";

/**
 * Messaging phase 4: scheduled sending. Validation, edit / cancel while
 * pending, the sender (due rows go out once, offline author, failures,
 * interrupted sends never repeat), two instances racing, the route.
 *   node frontend/backend/test/scheduledMessages.integration.test.cjs
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const assert = require("node:assert/strict");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = id(1), B = id(2), G = id(10), X = id(99);
const fake = createFakeSupabase({
  users: [{ id: A, username: "alice", active_sessions: [{ id: "s-a" }] }, { id: B, username: "bora", active_sessions: [{ id: "s-b" }] }],
  scheduled_messages: [],
});
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const { createScheduledMessages, ScheduleError } = require("../lib/scheduledMessages");

let clock = Date.parse("2026-11-06T12:00:00.000Z");
const sent = [];
let failNext = null;
const actions = {
  reply: async (io, userId, opts) => {
    if (failNext) { const e = failNext; failNext = null; throw e; }
    await new Promise((r) => setTimeout(r, 5));
    sent.push({ userId, ...opts });
    return { messageId: `msg-${sent.length}` };
  },
};
const canSend = async (userId, type, convId) => convId !== X;
const emitted = [];
const io = { to: (room) => ({ emit: (ev, p) => emitted.push({ room, ev, p }) }) };
const make = () => createScheduledMessages({ getDb: () => fake, now: () => clock, actions, canSend, log: { warn() {} } });
const svc = make();
const rejects = async (p, status, code) => {
  await assert.rejects(p, (e) => e instanceof ScheduleError && e.status === status && e.code === code, `${status} ${code}`);
};
const iso = (ms) => new Date(clock + ms).toISOString();

(async () => {
  // Validation.
  await rejects(svc.create(A, { convType: "dm", convId: B, content: "  ", sendAt: iso(3600e3) }), 400, "empty");
  await rejects(svc.create(A, { convType: "dm", convId: B, content: "x".repeat(2001), sendAt: iso(3600e3) }), 400, "too_long");
  await rejects(svc.create(A, { convType: "dm", convId: B, content: "/poll a | b", sendAt: iso(3600e3) }), 400, "no_commands");
  await rejects(svc.create(A, { convType: "dm", convId: B, content: "selam", sendAt: iso(10e3) }), 400, "too_soon");
  await rejects(svc.create(A, { convType: "dm", convId: B, content: "selam", sendAt: iso(400 * 86400e3) }), 400, "too_far");
  await rejects(svc.create(A, { convType: "server", convId: B, content: "selam", sendAt: iso(3600e3) }), 400, "bad_conversation");
  await rejects(svc.create(A, { convType: "dm", convId: X, content: "selam", sendAt: iso(3600e3) }), 403, "not_allowed");

  // Create, list, edit, cancel.
  const a = await svc.create(A, { convType: "dm", convId: B, content: "Günaydın!", sendAt: iso(3600e3) });
  const b = await svc.create(A, { convType: "group", convId: G, content: "Toplantı 10'da", sendAt: iso(2 * 3600e3) });
  const c = await svc.create(A, { convType: "dm", convId: B, content: "iptal edilecek", sendAt: iso(3 * 3600e3) });
  assert.equal(a.status, "pending");
  assert.deepEqual((await svc.list(A)).map((x) => x.id), [a.id, b.id, c.id], "ordered by send time");
  assert.deepEqual((await svc.list(A, { convType: "group", convId: G })).map((x) => x.id), [b.id]);
  assert.deepEqual(await svc.list(B), [], "only my own");
  const edited = await svc.update(A, a.id, { content: "Günaydın, hazır mısın?", sendAt: iso(30 * 60e3) });
  assert.equal(edited.content, "Günaydın, hazır mısın?");
  await rejects(svc.update(B, a.id, { content: "hack" }), 404, "not_found");
  await rejects(svc.update(A, a.id, { sendAt: iso(5e3) }), 400, "too_soon");
  assert.equal((await svc.cancel(A, c.id)).status, "cancelled");
  await rejects(svc.cancel(A, c.id), 409, "already_sent");

  // The sender: nothing due yet.
  assert.equal(await svc.tick(io), 0);
  // 31 minutes later: the edited DM goes out, as the author, without marking the chat read.
  clock += 31 * 60e3;
  assert.equal(await svc.tick(io), 1);
  assert.deepEqual(sent[0], { userId: A, conv: `dm:${B}`, text: "Günaydın, hazır mısın?", markRead: false });
  const row = fake._tables?.scheduled_messages?.rows?.find?.((r) => r.id === a.id) || null;
  if (row) assert.equal(row.status, "sent");
  assert.ok(emitted.some((e) => e.ev === "scheduled:update" && e.p.id === a.id && e.p.status === "sent" && e.room === `user:${A}`), "my devices hear it went out");
  await rejects(svc.update(A, a.id, { content: "geç" }), 409, "already_sent");
  assert.equal(await svc.tick(io), 0, "never sent twice");

  // Two instances race for the same due row: it goes out once.
  clock += 2 * 3600e3;
  const other = make();
  const [n1, n2] = await Promise.all([svc.tick(io), other.tick(io)]);
  assert.equal(n1 + n2, 1);
  assert.equal(sent.filter((s) => s.conv === `group:${G}`).length, 1);

  // A refused send is marked failed with the reason.
  const d = await svc.create(A, { convType: "dm", convId: B, content: "engellendi", sendAt: iso(60e3) });
  clock += 2 * 60e3;
  failNext = Object.assign(new Error("blocked"), { code: "blocked" });
  await svc.tick(io);
  const failedEcho = emitted.filter((e) => e.p.id === d.id).pop();
  assert.equal(failedEcho.p.status, "failed");
  assert.equal(failedEcho.p.error, "blocked");
  assert.deepEqual(await svc.list(A), [], "nothing pending is left");

  // A send interrupted mid-way (crash) is failed later, never repeated.
  const e = await svc.create(A, { convType: "dm", convId: B, content: "yarım kaldı", sendAt: iso(60e3) });
  await fake.from("scheduled_messages").update({ status: "sending", updated_at: new Date(clock).toISOString() }).eq("id", e.id);
  clock += 10 * 60e3;
  const before = sent.length;
  await svc.tick(io);
  assert.equal(sent.length, before, "not re-sent");
  assert.equal(emitted.filter((x) => x.p.id === e.id).pop().p.error, "interrupted");

  // Per-user cap.
  for (let i = 0; i < 50; i += 1) await svc.create(B, { convType: "dm", convId: A, content: `n${i}`, sendAt: iso(3600e3 + i) });
  await rejects(svc.create(B, { convType: "dm", convId: A, content: "fazla", sendAt: iso(3600e3) }), 429, "too_many");

  // Route.
  const express = require("express");
  const { signToken } = require("../config/jwt");
  const { createScheduledRouter } = require("../routes/scheduledMessages");
  const app = express();
  app.use(express.json());
  app.set("io", io);
  app.use("/api/scheduled-messages", createScheduledRouter({ service: svc }));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}/api/scheduled-messages`;
  const headers = { Authorization: `Bearer ${signToken({ id: A, username: "alice", sid: "s-a" })}`, "Content-Type": "application/json" };
  let res = await fetch(base, { method: "POST", headers, body: JSON.stringify({ convType: "dm", convId: B, content: "rota", sendAt: iso(3600e3) }) });
  const created = await res.json();
  assert.equal(res.status, 200);
  assert.equal(created.item.content, "rota");
  res = await fetch(base, { method: "POST", headers, body: JSON.stringify({ convType: "dm", convId: B, content: "", sendAt: iso(3600e3) }) });
  assert.deepEqual([res.status, (await res.json()).error], [400, "empty"]);
  res = await fetch(`${base}/${created.item.id}`, { method: "PATCH", headers, body: JSON.stringify({ content: "rota 2" }) });
  assert.equal((await res.json()).item.content, "rota 2");
  res = await fetch(`${base}?convType=dm&convId=${B}`, { headers });
  assert.deepEqual((await res.json()).items.map((x) => x.content), ["rota 2"]);
  res = await fetch(`${base}/${created.item.id}`, { method: "DELETE", headers });
  assert.equal((await res.json()).item.status, "cancelled");
  res = await fetch(base);
  assert.equal(res.status, 401);
  server.close();

  // Before the migration: 503 not_ready, the sender stays quiet.
  const realFrom = fake.from.bind(fake);
  fake.from = (table) => {
    const q = realFrom(table);
    if (table === "scheduled_messages") {
      const err = { code: "42P01", message: 'relation "public.scheduled_messages" does not exist' };
      const fail = async () => ({ data: null, error: err });
      q.single = fail;
      q.maybeSingle = fail;
      q.then = (ok, ko) => fail().then(ok, ko);
    }
    return q;
  };
  const fresh = make();
  assert.equal(await fresh.tick(io), 0);
  await rejects(fresh.create(A, { convType: "dm", convId: B, content: "x", sendAt: iso(3600e3) }), 503, "not_ready");
  fake.from = realFrom;
  console.log("scheduledMessages integration test OK");
})().catch((err) => { console.error(err); process.exit(1); });
