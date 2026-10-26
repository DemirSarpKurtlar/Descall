"use strict";

/**
 * Kayıt İstatistikleri: GET /api/admin/signup-stats is admin-only (moderators 403),
 * returns aggregates only (no ids / usernames / e-mails), CSV export, requireAuth
 * writes one user_active_days row per Istanbul day, register outcomes go to
 * signup_attempts with a hashed key only.
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";

const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const supabasePath = require.resolve("../db/supabase");
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
const fake = createFakeSupabase({
  users: [
    { id: "u-admin", username: "demir", email: "demir@example.com", is_admin: true, active_sessions: [{ id: "s-a" }], created_at: "2026-04-18T10:00:00.000Z", auth_method: "email", first_touch_source: "direct" },
    { id: "u-mod", username: "mod", email: "mod@example.com", is_admin: false, active_sessions: [{ id: "s-m" }], created_at: new Date().toISOString(), auth_method: "google", first_touch_source: "discord", signup_country: "TR" },
    { id: "u-user", username: "ayse", is_admin: false, active_sessions: [{ id: "s-u" }], created_at: new Date().toISOString(), signup_country: "DE" },
  ],
  analytics_events: [
    { event: "signup_started", visitor_key: "v1", occurred_at: new Date().toISOString() },
    { event: "signup_started", visitor_key: "v1", occurred_at: new Date().toISOString() },
    { event: "signup_started", visitor_key: "v2", occurred_at: new Date().toISOString() },
    { event: "page_view", visitor_key: "v3", occurred_at: new Date().toISOString() },
  ],
  signup_attempts: [],
  user_active_days: [],
});
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken } = require("../config/jwt");
const adminRouter = require("../routes/admin");
const state = require("../runtime/sharedState");
const { trackSignupAttempt } = require("../lib/signupStats");

function assert(c, msg) {
  if (!c) throw new Error("FAIL: " + msg);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const app = express();
  app.use(express.json());
  app.use("/api/admin", adminRouter);
  app.post("/reg/:code", (req, res) => {
    trackSignupAttempt(req, res, { method: "email", countryFromHeaders: (h) => h["cf-ipcountry"] || "" });
    res.status(Number(req.params.code)).json({});
  });
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const admin = signToken({ id: "u-admin", username: "demir", sid: "s-a" });
  const mod = signToken({ id: "u-mod", username: "mod", sid: "s-m" });
  const user = signToken({ id: "u-user", username: "ayse", sid: "s-u" });
  state.userRoles?.set?.("u-mod", "mod");
  const get = (path, token) => fetch(base + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  try {
    for (const tok of [null, user, mod]) {
      const r = await get("/api/admin/signup-stats", tok);
      assert(r.status === 401 || r.status === 403, `non-admin refused (${r.status})`);
      const c = await get("/api/admin/signup-stats/csv", tok);
      assert(c.status === 401 || c.status === 403, `non-admin csv refused (${c.status})`);
    }
    let r = await get("/api/admin/signup-stats?granularity=week", admin);
    assert(r.status === 200, "admin gets stats");
    const body = await r.json();
    const raw = JSON.stringify(body);
    for (const s of ["u-admin", "u-mod", "demir", "example.com", "ayse"]) assert(!raw.includes(s), `no personal data in response (${s})`);
    assert(body.tz === "Europe/Istanbul" && body.range.granularity === "week", "tz + granularity");
    assert(body.kpis.today.value === 2 && body.kpis.total.value === 3, "kpis");
    assert(body.funnel.started === 2 && body.funnel.completed === 2, "one start per visitor per day");
    assert(body.countries[0].code === "DE" || body.countries[0].code === "TR", "countries");

    r = await get(`/api/admin/signup-stats/csv?from=${today}&to=${today}`, admin);
    assert(r.status === 200 && /text\/csv/.test(r.headers.get("content-type")), "csv type");
    const csv = await r.text();
    assert(csv.includes(`${today};2;`), "csv row for today");

    await wait(30);
    const days = fake._tables.user_active_days.rows;
    const ids = days.map((d) => d.user_id).sort().join(",");
    assert(ids === "u-admin,u-mod,u-user" && days.every((d) => d.day === today), `one active day row per signed-in user per day (${ids})`);

    const hdr = { "x-forwarded-for": "203.0.113.7", "user-agent": "UA-test", "cf-ipcountry": "TR" };
    await fetch(base + "/reg/409", { method: "POST", headers: hdr });
    await fetch(base + "/reg/201", { method: "POST", headers: hdr });
    await fetch(base + "/reg/429", { method: "POST", headers: { "user-agent": "other" } });
    await wait(30);
    const at = fake._tables.signup_attempts.rows;
    assert(at.length === 3, "three attempts");
    assert(at[0].status === "failed" && at[0].reason === "conflict" && at[1].status === "completed" && at[2].reason === "rate_limited", "outcomes");
    assert(at[0].attempt_key === at[1].attempt_key && at[0].attempt_key !== at[2].attempt_key, "same browser → same key");
    assert(at[0].country === "TR", "country code only");
    assert(!JSON.stringify(at).includes("203.0.113.7") && !JSON.stringify(at).includes("UA-test"), "no raw ip / user agent stored");
  } finally {
    server.close();
  }
  console.log("signupStats.integration.test ok");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
