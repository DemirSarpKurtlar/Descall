"use strict";

/**
 * Admin "Bakım" tab: admin-only endpoints (server-side checks), lifecycle
 * scheduled → active → completed / cancelled, audit rows, public status and
 * socket fan-out.
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const supabasePath = require.resolve("../db/supabase");
const fake = createFakeSupabase({
  users: [
    { id: "u-admin", username: "demir", is_admin: true, active_sessions: [{ id: "s-a" }] },
    { id: "u-user", username: "ayse", is_admin: false, active_sessions: [{ id: "s-u" }] },
  ],
  maintenance_windows: [],
  maintenance_audit: [],
});
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken } = require("../config/jwt");
const adminRouter = require("../routes/admin");
const statusRouter = require("../routes/maintenanceStatus");
const maint = require("../runtime/maintenanceInstance");

const emitted = [];
maint.attachIo({ emit: (event, payload) => emitted.push({ event, payload }), to: () => ({ emit() {} }) });

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
  const app = express();
  app.use(express.json());
  app.use("/api/admin", adminRouter);
  app.use("/api/maintenance", statusRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const admin = signToken({ id: "u-admin", username: "demir", sid: "s-a" });
  const user = signToken({ id: "u-user", username: "ayse", sid: "s-u" });
  const H = 3600_000;
  try {
    const body = {
      title: "Veritabanı yükseltmesi",
      message: "Kısa bir bakım yapıyoruz.",
      kind: "planned",
      platforms: ["web", "electron", "ios"],
      startsAt: new Date(Date.now() + 2 * H).toISOString(),
      endsAt: new Date(Date.now() + 4 * H).toISOString(),
      announceMinutes: 60,
      adminsBypass: true,
      notifyOnEnd: true,
    };

    // server-side auth
    let r = await call(base, "GET", "/api/admin/maintenance/windows");
    assert(r.status === 401, "anonymous refused");
    r = await call(base, "GET", "/api/admin/maintenance/windows", { token: user });
    assert(r.status === 403, "non-admin refused");
    r = await call(base, "POST", "/api/admin/maintenance/windows", { token: user, body });
    assert(r.status === 403 && fake._tables.maintenance_windows.rows.length === 0, "non-admin cannot create");

    r = await call(base, "GET", "/api/admin/maintenance/windows", { token: admin });
    assert(r.status === 200 && r.body.current === null && r.body.summary.systemStatus === "operational", "empty overview");
    assert(r.body.summary.nextStartsAt === undefined && r.body.summary.monthDowntimeMs === undefined, "no invented cards");

    r = await call(base, "POST", "/api/admin/maintenance/windows", { token: admin, body: { ...body, endsAt: body.startsAt } });
    assert(r.status === 400 && r.body.code === "end_before_start", "validation");
    r = await call(base, "POST", "/api/admin/maintenance/windows", { token: admin, body });
    assert(r.status === 201 && r.body.window.status === "scheduled", "created: " + JSON.stringify(r.body));
    const id = r.body.window.id;
    assert(emitted.some((e) => e.event === "maintenance:state"), "socket push on create");
    r = await call(base, "POST", "/api/admin/maintenance/windows", { token: admin, body });
    assert(r.status === 409 && r.body.code === "overlap", "no overlapping windows");

    // not announced yet → public status hides the message
    r = await call(base, "GET", "/api/maintenance/status");
    assert(r.status === 200 && r.body.maintenance.announced === false && !r.body.maintenance.message, "pre-announce hidden");

    r = await call(base, "PATCH", `/api/admin/maintenance/windows/${id}`, { token: admin, body: { message: "Yeni mesaj" } });
    assert(r.status === 200 && r.body.window.message === "Yeni mesaj", "message edited");
    r = await call(base, "PATCH", `/api/admin/maintenance/windows/${id}`, { token: user, body: { message: "hack" } });
    assert(r.status === 403, "non-admin cannot edit");

    // cancel needs the typed confirmation
    r = await call(base, "POST", `/api/admin/maintenance/windows/${id}/cancel`, { token: admin, body: { confirm: "iptal et" } });
    assert(r.status === 400 && r.body.code === "confirm_required", "confirm required");
    r = await call(base, "POST", `/api/admin/maintenance/windows/${id}/cancel`, { token: user, body: { confirm: "İPTAL" } });
    assert(r.status === 403, "non-admin cannot cancel");
    r = await call(base, "POST", `/api/admin/maintenance/windows/${id}/cancel`, { token: admin, body: { confirm: "İPTAL", reason: "Ertelendi" } });
    assert(r.status === 200 && r.body.window.status === "cancelled" && r.body.window.cancelReason === "Ertelendi", "cancelled");

    // active window: extend + end now
    const row = { ...body, startsAt: new Date(Date.now() + 5 * H).toISOString(), endsAt: new Date(Date.now() + 6 * H).toISOString() };
    r = await call(base, "POST", "/api/admin/maintenance/windows", { token: admin, body: row });
    const id2 = r.body.window.id;
    const stored = fake._tables.maintenance_windows.rows.find((w) => w.id === id2);
    stored.starts_at = new Date(Date.now() - 10 * 60_000).toISOString(); // started 10 min ago
    r = await call(base, "GET", "/api/maintenance/status");
    assert(r.body.maintenance.status === "active" && r.body.maintenance.message === "Kısa bir bakım yapıyoruz.", "public active");
    assert(!("createdByUsername" in r.body.maintenance), "public view has no admin data");
    r = await call(base, "POST", `/api/admin/maintenance/windows/${id2}/cancel`, { token: admin, body: { confirm: "İPTAL" } });
    assert(r.status === 409 && r.body.code === "use_end_now", "active is ended, not cancelled");
    r = await call(base, "POST", `/api/admin/maintenance/windows/${id2}/extend`, { token: admin, body: { minutes: 30 } });
    assert(r.status === 200 && Date.parse(r.body.window.endsAt) === Date.parse(row.endsAt) + 30 * 60_000, "extended");
    r = await call(base, "POST", `/api/admin/maintenance/windows/${id2}/end`, { token: user });
    assert(r.status === 403, "non-admin cannot end");
    emitted.length = 0;
    r = await call(base, "POST", `/api/admin/maintenance/windows/${id2}/end`, { token: admin });
    assert(r.status === 200 && r.body.window.status === "completed", "ended now");
    assert(emitted.some((e) => e.event === "maintenance:ended" && e.payload.notify === true), "end notification pushed");
    r = await call(base, "GET", "/api/maintenance/status");
    assert(r.body.maintenance === null, "nothing after the end");

    r = await call(base, "GET", "/api/admin/maintenance/windows", { token: admin });
    assert(r.body.history.length === 2, "history");
    const actions = r.body.events.map((e) => `${e.actorUsername}:${e.action}`);
    for (const a of ["demir:created", "demir:message_edited", "demir:cancelled", "demir:extended", "demir:ended_early"])
      assert(actions.includes(a), "audit " + a + " in " + actions.join());
    assert(r.body.summary.monthDowntimeMs > 0 || new Date().getUTCDate() === 1, "downtime from real rows");

    console.log("maintenance.integration.test.cjs: ok");
  } finally {
    server.close();
  }
}

run().then(() => process.exit(0)).catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
