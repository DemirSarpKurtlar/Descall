"use strict";

/**
 * Admin > Geri Bildirim 3.0: admin-only (moderators and users get 403),
 * enriched rows (user card, PLATFORM / CİHAZ), PATCH whitelist with system
 * lines, user reply vs internal note, delete.
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const supabasePath = require.resolve("../db/supabase");
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15";
const fake = createFakeSupabase({
  users: [
    { id: "u-admin", username: "demir", is_admin: true, active_sessions: [{ id: "s-a" }] },
    { id: "u-mod", username: "mod", is_admin: false, active_sessions: [{ id: "s-m" }] },
    { id: "u-user", username: "ayse", is_admin: false, display_name: "Ayşe", created_at: "2026-03-03T10:00:00.000Z", active_sessions: [{ id: "s-u" }] },
  ],
  user_feedback: [
    { id: "f1", user_id: "u-user", username: "ayse", category: "bug", priority: "medium", status: "new", viewed: false, subject: "Mikrofon", message: "Mikrofon kırmızı kalıyor", attachments: ["https://x/a.png"], platform: IPHONE, app_version: "2.13.13", admin_replies: [], created_at: "2026-10-26T18:35:00.000Z" },
    { id: "f2", user_id: "u-user", username: "ayse", category: "feature", priority: "low", status: "resolved", viewed: true, message: "Renk", attachments: [], platform: "unknown", app_version: "unknown", admin_replies: [], created_at: "2026-10-25T18:35:00.000Z" },
  ],
});
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken } = require("../config/jwt");
const adminRouter = require("../routes/admin");
const fb = require("../lib/feedbackAdmin");
const state = require("../runtime/sharedState");

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
  // Pure helpers
  const p = fb.readPlatform(IPHONE);
  assert(p.platform === "iOS 18.6" && p.device === "iPhone", "iPhone UA → iOS 18.6 / iPhone");
  assert(fb.readPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Electron/30").platform === "Windows · uygulama", "Electron on Windows");
  assert(JSON.stringify(fb.sanitizePatch({ status: "closed", user_id: "x", message: "y", priority: "nope" })) === '{"status":"closed"}', "patch whitelist");
  assert(fb.safeSearch("a,b.or(id.eq.1)") === "a b or id eq 1", "search strips PostgREST grammar");

  const emitted = [];
  const app = express();
  app.use(express.json());
  app.set("io", { to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }) });
  app.use("/api/admin", adminRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const admin = signToken({ id: "u-admin", username: "demir", sid: "s-a" });
  const mod = signToken({ id: "u-mod", username: "mod", sid: "s-m" });
  const user = signToken({ id: "u-user", username: "ayse", sid: "s-u" });
  state.userRoles?.set?.("u-mod", "mod");
  const row = (id) => fake._tables.user_feedback.rows.find((r) => r.id === id);
  try {
    for (const tok of [null, user, mod]) {
      const r = await call(base, "GET", "/api/admin/feedback", { token: tok });
      assert(r.status === 401 || r.status === 403, `non-admin list refused (${r.status})`);
    }
    let r = await call(base, "PATCH", "/api/admin/feedback/f1", { token: mod, body: { status: "closed" } });
    assert(r.status === 403 && row("f1").status === "new", "moderator cannot change status");
    r = await call(base, "DELETE", "/api/admin/feedback/f1", { token: user });
    assert(r.status === 403 && row("f1"), "user cannot delete");

    r = await call(base, "GET", "/api/admin/feedback", { token: admin });
    assert(r.status === 200 && r.body.feedbacks.length === 2, "admin lists");
    const f1 = r.body.feedbacks.find((f) => f.id === "f1");
    assert(f1.user.feedbackCount === 2 && f1.user.createdAt === "2026-03-03T10:00:00.000Z" && f1.user.displayName === "Ayşe", "user card enriched");
    assert(f1.meta.platform === "iOS 18.6" && f1.meta.device === "iPhone" && f1.meta.version === "2.13.13", "meta");
    assert(f1.subject === "Mikrofon" && f1.attachments.length === 1, "subject + attachments");
    assert(!JSON.stringify(r.body).includes("Mozilla"), "raw user agent never sent");
    assert(r.body.stats.byStatus.new === 1 && r.body.stats.unread === 1 && r.body.stats.byCategory.bug === 1, "stats");

    r = await call(base, "PATCH", "/api/admin/feedback/f1", { token: admin, body: { status: "resolved", user_id: "u-admin", message: "hacked" } });
    assert(r.status === 200 && row("f1").status === "resolved" && row("f1").user_id === "u-user" && row("f1").message === "Mikrofon kırmızı kalıyor", "patch applies whitelist only");
    assert(r.body.feedback.replies.some((x) => x.type === "system" && x.text === "demir durumu Çözüldü yaptı"), "system line");
    r = await call(base, "PATCH", "/api/admin/feedback/f1", { token: admin, body: { foo: 1 } });
    assert(r.status === 400, "empty patch 400");

    // 3.7.14: a status change tells the sender (feedback:update), structured status on the line.
    assert(emitted.some((e) => e.room === "user:u-user" && e.event === "feedback:update" && e.payload.status === "resolved"), "sender gets feedback:update");
    assert(row("f1").admin_replies.some((x) => x.type === "system" && x.status === "resolved"), "system line carries the status");
    emitted.length = 0;
    r = await call(base, "POST", "/api/admin/feedback/f1/reply", { token: admin, body: { text: "İç not", internal: true } });
    assert(r.status === 200 && r.body.reply.type === "note" && emitted.length === 0, "internal note: no user event");
    r = await call(base, "POST", "/api/admin/feedback/f1/reply", { token: admin, body: { text: "Düzeltiyoruz" } });
    assert(r.status === 200 && r.body.reply.type === "reply", "user reply");
    const replyEvents = emitted.filter((e) => e.event === "feedback:reply");
    assert(replyEvents.length === 1 && replyEvents[0].room === "user:u-user" && replyEvents[0].payload.feedbackId === "f1", "sender gets feedback:reply with the id");
    r = await call(base, "POST", "/api/admin/feedback/f1/reply", { token: admin, body: { text: "  " } });
    assert(r.status === 400, "blank reply 400");

    r = await call(base, "POST", "/api/admin/feedback/f1/view", { token: admin });
    assert(r.status === 200 && row("f1").viewed === true, "viewed");
    r = await call(base, "DELETE", "/api/admin/feedback/f2", { token: admin });
    assert(r.status === 200 && !row("f2"), "admin deletes");
    console.log("adminFeedback3.integration.test ok");
  } finally {
    server.close();
  }
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
