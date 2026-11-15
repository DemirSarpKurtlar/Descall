"use strict";

/**
 * İşlem kaydı console (section audit) over real HTTP with the fake Supabase:
 *  - section: an admin without "audit" gets 403 and an access_denied entry is written
 *  - GET /audit: one row per real action (moderation_actions twin folded,
 *    duplicate merged), filters (actor, category, target by username), request facts
 *  - summary: KPIs, chart, leaderboard, the 9-bans-in-60-s alert with the actor's sections
 *  - review: undo the alert's bans (each audited with undoOf, users unbanned), then the alert is closed
 *  - undo one entry: reason required, step-up required, ALREADY_UNDONE on the second try
 *  - views / rules / notes before the migration: 503 / defaults
 *  - export: CSV content, the export itself audited
 */

process.env.NODE_ENV = "test";
process.env.PASSWORD_HIBP = "0";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.JWT_EXPIRES_IN = "7d";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OWNER = id(1);
const AUDITOR = id(2); // admin granted audit + moderation
const MOD = id(3); // admin granted moderation only
const BARAN = id(4); // admin who banned 9 people
const KAAN = id(10);
const MERT = id(11);
const targets = Array.from({ length: 9 }, (_, i) => id(100 + i));

const TOTP_ON = { totp_enabled_at: "2026-10-01T00:00:00.000Z", totp_secret_enc: "enc" };
function user(uid, username, extra = {}) {
  return {
    id: uid,
    username,
    display_name: username,
    email: `${username}@example.com`,
    email_confirmed_at: "2026-01-01T00:00:00.000Z",
    is_admin: false,
    is_banned: false,
    active_sessions: [{ id: `s-${username}` }],
    created_at: "2026-01-01T00:00:00.000Z",
    ...extra,
  };
}

const now = Date.now();
const ago = (sec) => new Date(now - sec * 1000).toISOString();
let n = 0;
const auditRow = (actorId, actorUsername, action, target, sec, meta = {}) => ({
  id: `seed-${++n}`,
  at: ago(sec),
  actor_id: actorId,
  actor_username: actorUsername,
  action,
  target,
  meta,
});

const seedAudit = [
  // one ban written twice (memory replay) + its moderation_actions twin
  auditRow(AUDITOR, "denetci", "ban", KAAN, 3600, { category: "harassment", reason: "Taciz", expiresAt: new Date(now + 6 * 86400e3).toISOString() }),
  auditRow(AUDITOR, "denetci", "ban", KAAN, 3599.4, { category: "harassment" }),
  auditRow(AUDITOR, "denetci", "timeout", MERT, 1800, { category: "spam", until: new Date(now + 3600e3).toISOString() }),
  auditRow(AUDITOR, "denetci", "agent_tool", "user_lookup", 1700, { path: "/admin/people/x", status: 200, threadId: "t1" }),
  auditRow(AUDITOR, "denetci", "agent_tool", "suspicious", 1690, { path: "/admin/antibot", status: 200, threadId: "t1" }),
  ...targets.map((t, i) => auditRow(BARAN, "baran", "ban", t, 600 - i * 6, { category: "spam", reason: "Spam" })),
];

const fake = createFakeSupabase(
  {
    users: [
      user(OWNER, "admin", { is_admin: true, ...TOTP_ON }),
      user(AUDITOR, "denetci", { is_admin: true, admin_permissions: ["audit", "moderation"], ...TOTP_ON }),
      user(MOD, "moddy", { is_admin: true, admin_permissions: ["moderation"], ...TOTP_ON }),
      user(BARAN, "baran", { is_admin: true, admin_permissions: ["moderation", "casino", "reports"], ...TOTP_ON }),
      user(KAAN, "kaan", { is_banned: true }),
      user(MERT, "mert.k", { timeout_until: new Date(now + 3600e3).toISOString() }),
      ...targets.map((t, i) => user(t, `spam${i}`, { is_banned: true })),
    ],
    admin_audit: seedAudit,
    moderation_actions: [
      { id: id(900), action_type: "ban", target_user_id: KAAN, actor_user_id: AUDITOR, created_at: ago(3599.8), category: "harassment", reason: "Taciz", meta: {} },
    ],
    server_members: targets.map((t) => ({ server_id: id(700), user_id: t, joined_at: ago(86400 * 2) })),
    servers: [{ id: id(700), name: "Kasım Çekilişi" }],
  },
  { missingTables: ["admin_audit_views", "admin_audit_rules", "admin_audit_reviews", "admin_audit_notes", "access_bans"] }
);
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken, signStepUpToken } = require("../config/jwt");
const adminRouter = require("../routes/admin");
const state = require("../runtime/sharedState");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

const emitted = [];
const io = {
  to(room) {
    return { emit: (event, payload) => emitted.push({ room, event, payload }) };
  },
  in() {
    return { fetchSockets: async () => [] };
  },
  sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
};

async function startServer() {
  const app = express();
  app.use(express.json());
  app.set("io", io);
  app.use("/api/admin", adminRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function call(base, method, path, { body, token, stepUp, ua } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(ua ? { "User-Agent": ua } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(stepUp ? { "X-Admin-Step-Up": stepUp } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  let json = {};
  try {
    json = JSON.parse(raw);
  } catch {
    json = {};
  }
  return { status: res.status, body: json, raw };
}

const session = (uid, username) => signToken({ id: uid, username, sid: `s-${username}` });
const stepUpFor = (uid, username) => signStepUpToken({ id: uid, sid: `s-${username}` });
const audits = (action) => state.auditLog.filter((e) => e.action === action);

async function run() {
  for (const t of targets) state.bannedUserIds.add(t);
  state.bannedUserIds.add(KAAN);
  const { server, base } = await startServer();
  const tok = session(AUDITOR, "denetci");
  const step = stepUpFor(AUDITOR, "denetci");
  try {
    /* ---- 1. section ---- */
    let r = await call(base, "GET", "/api/admin/audit", { token: session(MOD, "moddy") });
    assert(r.status === 403 && r.body.section === "audit", "moderation-only admin refused " + r.raw);
    const denied = audits("access_denied")[0];
    assert(denied && denied.actorUsername === "moddy" && denied.target === "audit", "refusal audited");
    assert(denied.request && denied.request.endpoint === "GET /admin/audit" && denied.request.requestId, "request facts on the entry " + JSON.stringify(denied.request));
    r = await call(base, "GET", "/api/admin/audit", { token: session(MOD, "moddy") });
    assert(audits("access_denied").length === 1, "one denied entry per 10 minutes");

    /* ---- 2. merged list ---- */
    r = await call(base, "GET", "/api/admin/audit?limit=100", { token: tok });
    assert(r.status === 200, "list " + r.raw.slice(0, 300));
    const kaanBans = r.body.entries.filter((e) => e.action === "ban" && e.target === KAAN);
    assert(kaanBans.length === 1, "one ban row for kaan " + kaanBans.length);
    assert(kaanBans[0].merged.length === 1 && kaanBans[0].twins.length === 1, "duplicate merged + twin folded " + JSON.stringify(kaanBans[0]));
    assert(kaanBans[0].targetUsername === "kaan" && r.body.users[KAAN].username === "kaan", "target resolved");
    const run = r.body.entries.find((e) => e.action === "agent_run");
    assert(run && run.count === 2 && run.tools[0].tool === "user_lookup", "agent burst collapsed");
    assert(!r.body.entries.some((e) => e.source === "moderation_actions" && e.target === KAAN), "no separate moderation row");

    r = await call(base, "GET", "/api/admin/audit?actor=@baran", { token: tok });
    assert(r.body.entries.length === 9 && r.body.entries.every((e) => e.actorUsername === "baran"), "actor filter " + r.body.entries.length);
    r = await call(base, "GET", "/api/admin/audit?target=@kaan", { token: tok });
    assert(r.body.entries.length >= 1 && r.body.entries.every((e) => e.target === KAAN), "target by username");
    r = await call(base, "GET", "/api/admin/audit?cat=agent", { token: tok });
    assert(r.body.entries.length === 1 && r.body.entries[0].action === "agent_run", "category filter");
    r = await call(base, "GET", "/api/admin/audit?sev=critical&limit=5", { token: tok });
    assert(r.body.entries.length === 5 && r.body.nextCursor, "paging with a cursor");
    const page2 = await call(base, "GET", `/api/admin/audit?sev=critical&limit=5&cursor=${encodeURIComponent(r.body.nextCursor)}`, { token: tok });
    const ids1 = new Set(r.body.entries.map((e) => e.id));
    assert(page2.body.entries.length >= 4 && page2.body.entries.every((e) => !ids1.has(e.id)), "page 2 continues " + page2.body.entries.length);

    /* ---- 3. summary + alert ---- */
    r = await call(base, "GET", "/api/admin/audit/summary", { token: tok });
    assert(r.status === 200, "summary " + r.raw.slice(0, 300));
    assert(r.body.kpis.total.value >= 12 && r.body.kpis.agent.value === 2 && r.body.kpis.agent.runs === 1, "kpis " + JSON.stringify(r.body.kpis));
    assert(r.body.chart.buckets.length === 24 && r.body.chart.series.includes("baran"), "chart");
    assert(r.body.leaderboard[0].key === "baran" && r.body.leaderboard[0].count === 9, "leaderboard");
    const alert = r.body.anomalies[0];
    assert(alert && alert.rule === "ban_burst" && alert.count === 9, "alert " + JSON.stringify(r.body.anomalies).slice(0, 300));
    assert(alert.actor.sections.includes("moderation") && alert.section === "moderation", "actor sections");
    assert(alert.targets.length === 9 && alert.targets[0].user.username.startsWith("spam"), "targets resolved");
    assert(alert.common && alert.common.name === "Kasım Çekilişi", "common server " + JSON.stringify(alert.common));
    assert(r.body.counts.all >= 12 && r.body.counts.critical >= 10 && r.body.viewsReady === false, "view counts");
    assert(r.body.admins.some((a) => a.username === "baran"), "admins for the query bar");

    /* ---- 4. review: undo 2 of the 9 bans ---- */
    r = await call(base, "POST", "/api/admin/audit/anomalies/review", { token: tok, body: { key: alert.key, decision: "undo", reason: "Yanlış hesaplar" } });
    assert(r.status === 403 && r.body.code === "STEP_UP_REQUIRED", "review needs the code " + r.raw);
    r = await call(base, "POST", "/api/admin/audit/anomalies/review", { token: tok, stepUp: step, body: { key: alert.key, decision: "undo", reason: "x" } });
    assert(r.status === 400 && r.body.code === "REASON_REQUIRED", "reason required");
    r = await call(base, "POST", "/api/admin/audit/anomalies/review", {
      token: tok,
      stepUp: step,
      body: { key: alert.key, decision: "undo", reason: "Çekiliş sunucusundaki gerçek kullanıcılar", entryIds: alert.entryIds.slice(0, 2) },
    });
    assert(r.status === 200 && r.body.undone === 2, "two bans lifted " + r.raw);
    const unbans = audits("unban");
    assert(unbans.length === 2 && unbans.every((u) => u.meta.undoOf && u.meta.batch === alert.key && u.meta.via === "audit"), "unbans audited with undoOf");
    assert(!state.bannedUserIds.has(alert.targets[0].target), "user unbanned");
    assert(audits("audit_review").length === 1, "review audited");
    r = await call(base, "GET", "/api/admin/audit/summary?fresh=1", { token: tok });
    assert(!r.body.anomalies.some((a) => a.key === alert.key), "alert closed (memory review)");
    assert(r.body.kpis.undone.value === 2, "undone KPI");

    /* ---- 5. undo one entry ---- */
    r = await call(base, "GET", "/api/admin/audit?action=timeout", { token: tok });
    const to = r.body.entries[0];
    r = await call(base, "GET", `/api/admin/audit/entry/${encodeURIComponent(to.id)}`, { token: tok });
    assert(r.status === 200 && r.body.undo.available === true && r.body.undo.reverse === "untimeout", "detail undo state " + r.raw.slice(0, 300));
    assert(r.body.notesReady === false, "notes not ready before the migration");
    state.timeoutsByUser?.set?.(MERT, { until: new Date(now + 3600e3).toISOString() });
    const moderation = require("../lib/moderation");
    const realTimed = moderation.isTimedOut;
    moderation.isTimedOut = (uid) => uid === MERT;
    r = await call(base, "POST", `/api/admin/audit/entry/${encodeURIComponent(to.id)}/undo`, { token: tok, stepUp: step, body: { reason: "Yanlış hesap susturuldu" } });
    moderation.isTimedOut = realTimed;
    assert(r.status === 200 && r.body.reverse === "untimeout", "timeout undone " + r.raw);
    assert(audits("untimeout")[0].meta.undoOf === to.id, "untimeout points at the entry");
    r = await call(base, "POST", `/api/admin/audit/entry/${encodeURIComponent(to.id)}/undo`, { token: tok, stepUp: step, body: { reason: "Yanlış hesap susturuldu" } });
    assert(r.status === 409 && r.body.code === "ALREADY_UNDONE", "second undo refused " + r.raw);
    r = await call(base, "POST", `/api/admin/audit/entry/${encodeURIComponent(to.id)}/notes`, { token: tok, stepUp: step, body: { body: "Konuşuldu" } });
    assert(r.status === 503 && r.body.code === "NOTES_UNAVAILABLE", "notes need their table");

    /* ---- 6. views / rules before the migration ---- */
    r = await call(base, "POST", "/api/admin/audit/views", { token: tok, body: { name: "Gece vardiyası", query: { sev: "critical" } } });
    assert(r.status === 503 && r.body.code === "VIEWS_UNAVAILABLE", "views need their table (no step-up) " + r.raw);
    r = await call(base, "GET", "/api/admin/audit/rules", { token: tok });
    assert(r.body.ready === false && r.body.rules.find((x) => x.key === "ban_burst").limit === 5, "default rules");
    r = await call(base, "PUT", "/api/admin/audit/rules", { token: tok, stepUp: step, body: { rules: [{ key: "ban_burst", limit: 3, windowSec: 60 }] } });
    assert(r.status === 503 && r.body.code === "RULES_UNAVAILABLE", "rules need their table");

    /* ---- 7. export ---- */
    r = await call(base, "GET", "/api/admin/audit/export?format=csv&actor=@baran", { token: tok, ua: "DescallTest/1.0" });
    assert(r.status === 200 && r.body.content.startsWith("id,at_utc") && r.body.rows === 9, "csv " + r.raw.slice(0, 200));
    const exp = audits("audit_export")[0];
    assert(exp && exp.meta.rows === 9 && exp.meta.format === "csv", "export audited");
    assert(exp.request && exp.request.userAgent === "DescallTest/1.0" && /x\.x|…|unknown/.test(exp.request.ipMasked || ""), "masked request facts " + JSON.stringify(exp.request));
    const durable = fake._tables.admin_audit.rows.find((x) => x.id === exp.id);
    assert(durable && durable.user_agent === "DescallTest/1.0" && durable.endpoint === "GET /admin/audit/export", "request columns written " + JSON.stringify(durable));
    r = await call(base, "GET", "/api/admin/audit/export?format=json&cat=agent", { token: tok });
    assert(JSON.parse(r.body.content).entries[0].action === "agent_run", "json export");

    /* ---- 8. live stream ping ---- */
    assert(emitted.some((x) => x.room === "admin" && x.event === "admin:audit" && x.payload.action === "audit_export"), "live ping to the admin room");

    console.log("adminAuditConsole integration test ok");
  } finally {
    server.close();
  }
}

run().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
