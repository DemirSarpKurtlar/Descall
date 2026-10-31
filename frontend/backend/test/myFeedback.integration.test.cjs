"use strict";

/**
 * 3.7.14 Geri bildirim A, sender side: submit (new + old body, rate limit,
 * admins told live), my list / one thread / reply / read, ownership (another
 * user's id is 404), internal notes never leave the server, closed = 409,
 * a reply reopens a resolved item and reaches the admin room.
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const supabasePath = require.resolve("../db/supabase");
const F1 = "11111111-1111-4111-8111-111111111111";
const F2 = "22222222-2222-4222-8222-222222222222";
const F3 = "33333333-3333-4333-8333-333333333333";
const fake = createFakeSupabase({
  users: [
    { id: "u-ayse", username: "ayse", active_sessions: [{ id: "s-a" }] },
    { id: "u-ali", username: "ali", active_sessions: [{ id: "s-b" }] },
  ],
  user_feedback: [
    { id: F1, user_id: "u-ayse", username: "ayse", kind: "bug", category: "bug", priority: "medium", status: "in_progress", subject: "Ses gidiyor", message: "Ses gidiyor", attachments: [], platform: "Mozilla/5.0 (Windows NT 10.0) Electron/30", app_version: "3.7.13",
      admin_replies: [
        { id: "n1", text: "GIZLI-NOT", internal: true, isAdmin: true, adminId: "u-admin", adminUsername: "demir", created_at: "2026-10-30T10:00:00.000Z" },
        { id: "r1", text: "Bluetooth mu?", internal: false, isAdmin: true, adminId: "u-admin", adminUsername: "demir", created_at: "2026-10-30T10:01:00.000Z" },
      ],
      user_last_read_at: "2026-10-30T09:00:00.000Z", created_at: "2026-10-30T09:00:00.000Z", updated_at: "2026-10-30T10:01:00.000Z" },
    { id: F2, user_id: "u-ali", username: "ali", kind: "suggestion", category: "feature", priority: "low", status: "new", message: "Ali'nin fikri", attachments: [], admin_replies: [], created_at: "2026-10-30T09:00:00.000Z", updated_at: "2026-10-30T09:00:00.000Z" },
    { id: F3, user_id: "u-ayse", username: "ayse", kind: "praise", category: "improvement", priority: "low", status: "closed", message: "Kapalı olan", attachments: [], admin_replies: [], created_at: "2026-10-29T09:00:00.000Z", updated_at: "2026-10-29T09:00:00.000Z" },
  ],
});
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken } = require("../config/jwt");
const { requireAuth } = require("../middleware/auth");
const myFeedback = require("../routes/myFeedback");
const { resetLimits } = require("../lib/rateLimit");

function assert(c, msg) {
  if (!c) throw new Error("FAIL: " + msg);
}

async function call(base, method, path, { body, token } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function run() {
  resetLimits();
  const emitted = [];
  const app = express();
  app.use(express.json());
  app.set("io", { to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }) });
  app.post("/api/feedback/submit", requireAuth, myFeedback.submitHandler({ sendFeedbackEmail: async () => ({ sent: false, skipped: true }) }));
  app.use("/api/me/feedback", myFeedback);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const ayse = signToken({ id: "u-ayse", username: "ayse", sid: "s-a" });
  const ali = signToken({ id: "u-ali", username: "ali", sid: "s-b" });
  const row = (id) => fake._tables.user_feedback.rows.find((r) => r.id === id);
  try {
    let r = await call(base, "GET", "/api/me/feedback");
    assert(r.status === 401, "list needs a session");

    r = await call(base, "GET", "/api/me/feedback", { token: ayse });
    assert(r.status === 200 && r.body.items.length === 2, "only own rows");
    assert(!JSON.stringify(r.body).includes("GIZLI-NOT") && !JSON.stringify(r.body).includes("demir"), "no notes / admin names in the list");
    assert(r.body.unread === 1, "one unread team reply");
    assert(!("thread" in r.body.items[0]), "list has no thread");

    r = await call(base, "GET", "/api/me/feedback/unread", { token: ayse });
    assert(r.status === 200 && r.body.unread === 1, "unread endpoint");

    r = await call(base, "GET", `/api/me/feedback/${F2}`, { token: ayse });
    assert(r.status === 404, "someone else's feedback is 404");
    r = await call(base, "GET", "/api/me/feedback/not-a-uuid", { token: ayse });
    assert(r.status === 404, "bad id is 404");

    r = await call(base, "GET", `/api/me/feedback/${F1}`, { token: ayse });
    assert(r.status === 200 && r.body.item.thread.length === 1 && r.body.item.thread[0].fromTeam, "thread without the note");
    assert(!JSON.stringify(r.body).includes("GIZLI-NOT") && !JSON.stringify(r.body).includes("Mozilla"), "no note, no raw UA");
    assert(r.body.item.device === "Windows · 3.7.13", "device label");
    assert(row(F1).user_last_read_at > "2026-10-30T10:01:00.000Z", "opening marks it read");
    r = await call(base, "GET", "/api/me/feedback/unread", { token: ayse });
    assert(r.body.unread === 0, "read after opening");

    r = await call(base, "POST", `/api/me/feedback/${F1}/reply`, { token: ali, body: { text: "araya giriyorum" } });
    assert(r.status === 404, "cannot reply to someone else's");
    r = await call(base, "POST", `/api/me/feedback/${F1}/reply`, { token: ayse, body: { text: "   " } });
    assert(r.status === 400, "empty reply 400");
    r = await call(base, "POST", `/api/me/feedback/${F3}/reply`, { token: ayse, body: { text: "selam" } });
    assert(r.status === 409 && r.body.code === "FEEDBACK_CLOSED", "closed 409");

    row(F1).status = "resolved";
    emitted.length = 0;
    r = await call(base, "POST", `/api/me/feedback/${F1}/reply`, { token: ayse, body: { text: "Hâlâ oluyor" } });
    assert(r.status === 200 && r.body.item.thread.some((m) => !m.fromTeam && m.text === "Hâlâ oluyor"), "reply in the thread");
    assert(row(F1).status === "in_progress", "reply reopens a resolved item");
    assert(row(F1).admin_replies.some((x) => x.isAdmin === false && x.type === "reply"), "stored as a user reply");
    assert(row(F1).admin_replies.some((x) => x.internal), "the note stays in the database");
    assert(emitted.some((e) => e.room === "admin" && e.event === "feedback:user_reply" && e.payload.feedbackId === F1), "admins told live");

    // Submit (new body)
    emitted.length = 0;
    r = await call(base, "POST", "/api/feedback/submit", { token: ali, body: { kind: "bug", message: "Ekran paylaşımı donuyor", area: "voice", frequency: "always", includeDevice: true, platform: "Windows", appVersion: "3.7.14", attachments: ["https://evil.example/x.png"] } });
    assert(r.status === 200 && r.body.success && r.body.feedbackId, "submit ok");
    const created = row(r.body.feedbackId);
    assert(created.kind === "bug" && created.priority === "high" && created.details.area === "voice" && created.attachments.length === 0, "stored fields, foreign URL dropped");
    assert(created.user_id === "u-ali" && created.status === "new", "owner + status");
    assert(emitted.some((e) => e.room === "admin" && e.event === "feedback:new"), "admins told about new feedback");
    r = await call(base, "POST", "/api/feedback/submit", { token: ali, body: { message: "abc" } });
    assert(r.status === 400 && r.body.code === "TOO_SHORT", "too short 400");
    // Old body still accepted.
    r = await call(base, "POST", "/api/feedback/submit", { token: ali, body: { category: "improvement", priority: "low", message: "Eski istemciden övgü" } });
    assert(r.status === 200 && row(r.body.feedbackId).kind === "praise", "old client body");
    // Rate limit: 8 per hour.
    for (let i = 0; i < 6; i++) await call(base, "POST", "/api/feedback/submit", { token: ali, body: { kind: "suggestion", message: `Fikir numarası ${i}` } });
    r = await call(base, "POST", "/api/feedback/submit", { token: ali, body: { kind: "suggestion", message: "Bir fikir daha" } });
    assert(r.status === 429, `submit rate limited (${r.status})`);
    console.log("myFeedback.integration.test ok");
  } finally {
    server.close();
  }
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
