"use strict";

/**
 * Admin panel guards (polish admin-b): routes on the real /api/admin chain over the
 * fake db.
 *  - Accounts are never created or hard-deleted from the panel (410), even by a
 *    legacy admin holding the "directory" section; the owner row survives.
 *  - Two-person rule: an approved urgent announcement to everyone cannot be rewritten
 *    while live, and an edit after it ended drops the approval (reopen refuses).
 *  - DesCoin grant: a reason is required and a non-owner admin cannot move more than
 *    1,000,000 in one change.
 *  - Genel Bakis leaves out audit entries, report targets and feedback excerpts for an
 *    admin without those sections.
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.JWT_EXPIRES_IN = "7d";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const OWNER = "00000000-0000-4000-8000-000000000001";
const LEGACY = "00000000-0000-4000-8000-000000000002";
const KAAN = "00000000-0000-4000-8000-000000000003";
const LIMITED = "00000000-0000-4000-8000-000000000004";

function user(id, username, extra = {}) {
  return { id, username, is_admin: false, active_sessions: [{ id: `s-${username}` }], ...extra };
}

const fake = createFakeSupabase({
  users: [
    user(OWNER, "admin", { is_admin: true, is_super_admin: true }),
    // admin_permissions NULL = every legacy section, "directory" included.
    user(LEGACY, "legacyadmin", { is_admin: true, admin_permissions: null }),
    user(KAAN, "kaan"),
    user(LIMITED, "annconly", { is_admin: true, admin_permissions: ["announcements"] }),
  ],
  admin_audit: [],
  announcements: [],
  announcement_versions: [],
  announcement_reads: [],
  announcement_templates: [],
});
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken } = require("../config/jwt");
const adminRouter = require("../routes/admin");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

async function startServer() {
  const app = express();
  app.use(express.json());
  app.set("io", { to: () => ({ emit() {} }), emit() {}, sockets: { sockets: new Map(), adapter: { rooms: new Map() } } });
  app.use("/api/admin", adminRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function call(base, method, path, { body, token } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = {};
  try {
    json = await res.json();
  } catch {
    json = {};
  }
  return { status: res.status, body: json };
}

const session = (id, username) => signToken({ id, username, sid: `s-${username}` });
const row = (id) => fake._tables.users.rows.find((u) => u.id === id);

(async () => {
  const { server, base } = await startServer();
  const legacy = session(LEGACY, "legacyadmin");
  const owner = session(OWNER, "admin");
  try {
    let r = await call(base, "DELETE", `/api/admin/users/${OWNER}`, { token: legacy });
    assert(r.status === 410 && r.body.code === "ACCOUNT_ROUTE_REMOVED", `legacy delete of the owner is refused: ${r.status} ${JSON.stringify(r.body)}`);
    assert(row(OWNER), "owner row still exists");
    r = await call(base, "DELETE", `/api/admin/users/${KAAN}`, { token: owner });
    assert(r.status === 410, `even the owner cannot hard-delete from the panel: ${r.status}`);
    assert(row(KAAN), "member row still exists");
    r = await call(base, "POST", "/api/admin/users", { token: legacy, body: { username: "sock1", password: "Zx9!long-pass-phrase" } });
    assert(r.status === 410, `account creation is gone: ${r.status}`);
    assert(!fake._tables.users.rows.some((u) => u.username === "sock1"), "no account was created");

    // ---- announcements: approval stays bound to the approved content ----
    r = await call(base, "POST", "/api/admin/announcements", { token: owner, body: { title: "Acil bakim", content: "Sunucular 10 dk kapali", priority: "urgent", audience: { type: "everyone" } } });
    assert(r.status < 300 && r.body.item?.id, `create urgent: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    const id = r.body.item.id;
    if (r.body.item.status !== "pending") {
      r = await call(base, "POST", `/api/admin/announcements/${id}/publish`, { token: owner, body: {} });
    }
    r = await call(base, "POST", `/api/admin/announcements/${id}/approve`, { token: legacy, body: {} });
    assert(r.status === 200 && r.body.item?.status === "live", `second admin approves: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    r = await call(base, "PUT", `/api/admin/announcements/${id}`, { token: owner, body: { title: "Hesabiniz kapatilacak", content: "Hemen bu linke tiklayin" } });
    assert(r.status === 409 && r.body.code === "NEEDS_REAPPROVAL", `live rewrite refused: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    r = await call(base, "POST", `/api/admin/announcements/${id}/end`, { token: owner, body: { reason: "outdated" } });
    assert(r.status === 200, `end: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    r = await call(base, "PUT", `/api/admin/announcements/${id}`, { token: owner, body: { title: "Hesabiniz kapatilacak", content: "Hemen bu linke tiklayin" } });
    assert(r.status === 200, `edit after end: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    const stored = fake._tables.announcements.rows.find((a) => a.id === id);
    assert(stored && !stored.approved_by, "edit after end drops the approval");
    r = await call(base, "POST", `/api/admin/announcements/${id}/reopen`, { token: owner, body: {} });
    assert(r.status === 409 && r.body.code === "NEEDS_APPROVAL", `reopen without approval refused: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    r = await call(base, "POST", `/api/admin/announcements/${id}/publish`, { token: owner, body: {} });
    assert(r.status === 200 && r.body.result === "pending", `publish goes back to approval: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);

    // ---- DesCoin grant: reason + per-change cap for non-owner admins ----
    r = await call(base, "POST", "/api/admin/descoin/grant", { token: legacy, body: { userId: KAAN, amount: 500 } });
    assert(r.status === 400 && r.body.code === "REASON_REQUIRED", `grant without reason refused: ${r.status} ${JSON.stringify(r.body)}`);
    r = await call(base, "POST", "/api/admin/descoin/grant", { token: legacy, body: { userId: KAAN, amount: 2000000, reason: "Etkinlik odulu" } });
    assert(r.status === 400 && r.body.code === "AMOUNT_TOO_LARGE" && r.body.max === 1000000, `legacy admin cap: ${r.status} ${JSON.stringify(r.body)}`);
    r = await call(base, "POST", "/api/admin/descoin/grant", { token: legacy, body: { userId: KAAN, amount: -2000000, reason: "Hata duzeltme" } });
    assert(r.status === 400 && r.body.code === "AMOUNT_TOO_LARGE", `cap applies to takes too: ${r.status}`);

    // ---- analytics reads every row (paged) ----
    r = await call(base, "GET", "/api/admin/analytics", { token: owner });
    assert(r.status === 200 && r.body.totalSignups === 4, `analytics: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);

    // ---- Genel Bakis: blocks of closed sections are left out ----
    r = await call(base, "GET", "/api/admin/overview", { token: session(LIMITED, "annconly") });
    assert(r.status === 200, `overview for a limited admin: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    assert(Array.isArray(r.body.recentAudit) && r.body.recentAudit.length === 0, "no audit entries without the audit section");
    assert(Array.isArray(r.body.safety?.hotTargets) && r.body.safety.hotTargets.length === 0 && !r.body.safety.autoOpenUserId, "no report targets without reports");
    assert(r.body.product?.feedbackFocus == null, "no feedback excerpt without feedback");
    r = await call(base, "GET", "/api/admin/overview", { token: owner });
    assert(r.status === 200 && r.body.recentAudit.length > 0, `owner still sees recent admin actions: ${JSON.stringify(r.body.recentAudit)}`);

    console.log("adminPanelGuards: ok");
  } finally {
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
