"use strict";

/**
 * Performans end to end over real HTTP with the fake Supabase:
 *  - beacon: text/plain body (sendBeacon), user id only from the session token, country
 *    from the edge header, 400 on a bad payload, 429 when one page load floods
 *  - job: hourly + daily rollups from the raw events, the Android 4.1.4 INP regression
 *    raised once (admin room message, owner push, Hata Kayıtları entry), not twice
 *  - section: an admin without "perf" gets 403
 *  - summary / table / detail / session timeline / export / views / rules (+ 90-day
 *    preview, step-up) / alert hide + undo / Lighthouse tab
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
const OTHER = id(2); // admin without perf
const ALICE = id(10); // app user
const TOTP_ON = { totp_enabled_at: "2026-10-01T00:00:00.000Z", totp_secret_enc: "enc" };
const user = (uid, username, extra = {}) => ({ id: uid, username, display_name: username, email: `${username}@example.com`, email_confirmed_at: "2026-01-01T00:00:00.000Z", is_admin: false, is_banned: false, active_sessions: [{ id: `s-${username}` }], created_at: "2026-01-01T00:00:00.000Z", ...extra });

const model = require("../lib/perfModel");
const DAY = 86400e3;
const now = Date.now();
const dayStr = (back) => new Date(now - back * DAY).toISOString().slice(0, 10);
// 20 days of 4.1.3 (Android INP ~182 ms), then 4.1.4 from three days ago (~268 ms).
const daily = [];
for (let back = 20; back >= 1; back--) {
  const ver = back <= 3 ? "4.1.4" : "4.1.3";
  const inp = ver === "4.1.4" ? 268 : 182;
  const ev = (metric, value, n, extra = {}) => Array.from({ length: n }, () => ({ metric, value, route: "app/kanal", platform: "android", app_version: ver, device_class: "low", connection: "4g", country: "TR", ...extra }));
  daily.push(...model.rollupFromEvents([...ev("inp", inp, 900), ...ev("sess", 1, 900), ...ev("lcp", 2380, 900), ...ev("inp", 140, 400, { platform: "ios" }), ...ev("sess", 1, 400, { platform: "ios" })], { day: dayStr(back) }));
  daily.push(...model.rollupFromEvents([...ev("inp", 120, 300, { route: "app/ayarlar" }), ...ev("sess", 1, 300, { route: "app/ayarlar" })], { day: dayStr(back) }));
}

const lhRow = (extra) => ({ id: Math.floor(Math.random() * 1e9), created_at: new Date(now - 3600e3).toISOString(), run_id: "r1", run_url: "https://github.com/acme/app/actions/runs/1", repo: "acme/app", event: "pull_request", pr_number: 456, pr_title: "Voice room grid virtualisation", pr_author: "kaan", branch: "kaan/voice-grid", sha: "8f3c2a1", base_sha: "396c9b2", page: "/", form_factor: "mobile", perf: 93, a11y: 100, best_practices: 96, seo: 100, lcp_ms: 1900, cls: 0.01, tbt_ms: 180, bytes: 400000, bundle_gzip: 250000, budgets_failed: 0, ...extra });
const lighthouse = [
  lhRow({}),
  lhRow({ page: "/download", perf: 84, budgets_failed: 1 }),
  lhRow({ run_id: "m1", event: "push", pr_number: null, merged_pr: 455, branch: "main", sha: "396c9b2", created_at: new Date(now - 2 * 3600e3).toISOString(), perf: 96, tbt_ms: 60, bundle_gzip: 211000 }),
  lhRow({ run_id: "m1", event: "push", pr_number: null, merged_pr: 455, branch: "main", sha: "396c9b2", page: "/download", created_at: new Date(now - 2 * 3600e3).toISOString(), perf: 94, tbt_ms: 60, bundle_gzip: 211000 }),
  lhRow({ run_id: "r2", pr_number: 455, pr_title: "Lazy-load emoji picker", pr_author: "ece", sha: "b71e09d", created_at: new Date(now - 5 * 3600e3).toISOString(), perf: 98 }),
];

const fake = createFakeSupabase({
  users: [user(OWNER, "admin", { is_admin: true, ...TOTP_ON }), user(OTHER, "baran", { is_admin: true, admin_permissions: ["moderation"], ...TOTP_ON }), user(ALICE, "alice")],
  perf_rollup_daily: daily,
  lighthouse_runs: lighthouse,
  error_logs: [],
});
fake.rpc = async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function public.perf_hour_buckets" } });
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken, signStepUpToken } = require("../config/jwt");
const adminRouter = require("../routes/admin");
const perfStore = require("../lib/perfStore");
const jobs = require("../lib/perfJobs");
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
const pushes = [];
jobs.__setDeps({ isLeader: () => true, db: () => fake, push: async (ids, alert) => pushes.push({ ids, alert }), mail: async () => {} });
jobs.setIo(io);

async function startServer() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.set("io", io);
  app.use("/api/perf", require("../routes/perfBeacon"));
  app.use("/api/admin", adminRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function call(base, method, path, { body, token, stepUp, raw = null, type = "application/json", headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": type, ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(stepUp ? { "X-Admin-Step-Up": stepUp } : {}) },
    body: raw != null ? raw : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = {};
  }
  return { status: res.status, body: json, raw: text };
}

const session = (uid, username) => signToken({ id: uid, username, sid: `s-${username}` });
const stepUpFor = (uid, username) => signStepUpToken({ id: uid, sid: `s-${username}` });
const q = (obj) => encodeURIComponent(JSON.stringify(obj));

async function run() {
  const { server, base } = await startServer();
  const tok = session(OWNER, "admin");
  const step = stepUpFor(OWNER, "admin");
  try {
    /* ---- beacon ---- */
    const batch = (sid, extra = {}) => ({
      v: 1,
      sid,
      p: "android",
      ver: "4.1.4",
      dc: "low",
      cn: "3g",
      br: "Chrome",
      sr: 0.25,
      tk: session(ALICE, "alice"),
      uid: OTHER,
      e: [
        { m: "sess", v: 1, r: "app", t: 0 },
        { m: "ttfb", v: 620, r: "app" },
        { m: "fcp", v: 1910, r: "app" },
        { m: "lcp", v: 4120, r: "app/kanal", a: { element: "img.server-banner" } },
        { m: "msglist", v: 3380, r: "app/kanal", a: { kind: "server", at: 900 } },
        { m: "inp", v: 1240, r: "app/kanal", a: { target: "form > button.send", type: "keyboard", at: 4400 } },
      ],
      ...extra,
    });
    let r = await call(base, "POST", "/api/perf/beacon", { raw: JSON.stringify(batch("SessAlice01")), type: "text/plain;charset=UTF-8", headers: { "cf-ipcountry": "TR" } });
    assert(r.status === 204, "beacon accepted " + r.status + r.raw);
    r = await call(base, "POST", "/api/perf/beacon", { raw: "{nope", type: "text/plain" });
    assert(r.status === 400, "bad JSON refused " + r.status);
    r = await call(base, "POST", "/api/perf/beacon", { raw: JSON.stringify({ ...batch("SessAlice02"), p: "ps5" }), type: "text/plain" });
    assert(r.status === 400 && r.body.code === "BAD_PLATFORM", "bad platform " + r.raw);
    let limited = 0;
    for (let i = 0; i < 24; i++) {
      const x = await call(base, "POST", "/api/perf/beacon", { raw: JSON.stringify(batch("SessFlood01", { e: [{ m: "lcp", v: 100, r: "/" }] })), type: "text/plain" });
      if (x.status === 429) limited++;
    }
    assert(limited >= 3, "one page load cannot flood " + limited);
    await perfStore.flush();
    const rows = fake._tables.perf_events.rows;
    const alice = rows.filter((e) => e.session_id === "SessAlice01");
    assert(alice.length === 6, "six samples stored " + alice.length);
    assert(alice.every((e) => e.user_id === ALICE), "user id from the token, never the payload");
    assert(alice.every((e) => e.country === "" || e.country === "TR"), "country from the edge header");
    assert(alice.find((e) => e.metric === "inp").rating === 2 && alice.find((e) => e.metric === "inp").attribution.target === "form > button.send", "rating + attribution");
    // anonymous beacon (no token) is fine, no user id
    r = await call(base, "POST", "/api/perf/beacon", { raw: JSON.stringify({ ...batch("SessAnon001"), tk: undefined }), type: "text/plain" });
    assert(r.status === 204, "anonymous beacon");
    await perfStore.flush();
    assert(fake._tables.perf_events.rows.filter((e) => e.session_id === "SessAnon001").every((e) => e.user_id === null), "anonymous has no user");

    /* ---- job ---- */
    const t1 = await jobs.tick({ force: true });
    assert(!t1.error && t1.hours > 0 && t1.days > 0, "rollups written " + JSON.stringify(t1));
    assert(fake._tables.perf_rollup_hourly.rows.length > 0, "hourly rows");
    assert(fake._tables.perf_rollup_daily.rows.some((x) => x.day === new Date(now).toISOString().slice(0, 10)), "today's daily row");
    const alerts = fake._tables.perf_alerts.rows;
    assert(alerts.length === 1 && alerts[0].platform === "android" && alerts[0].metric === "inp" && alerts[0].app_version === "4.1.4", "one regression " + JSON.stringify(alerts.map((a) => a.alert_key)));
    assert(alerts[0].delta_pct > 40, "delta " + alerts[0].delta_pct);
    assert(alerts[0].top_routes.includes("app/kanal"), "top routes " + alerts[0].top_routes);
    assert(emitted.some((e) => e.room === "admin" && e.event === "admin:perf-alert" && e.payload.version === "4.1.4"), "admin room message");
    assert(pushes.length === 1 && pushes[0].ids.includes(OWNER), "owner push");
    assert(fake._tables.error_logs.rows.length === 1 && fake._tables.error_logs.rows[0].source === "perf", "error record opened");
    assert(alerts[0].error_log_id, "alert linked to the error record");
    await jobs.tick({ force: true });
    assert(fake._tables.perf_alerts.rows.length === 1 && pushes.length === 1, "raised once, not again on the next run");

    /* ---- section ---- */
    r = await call(base, "GET", "/api/admin/perf/summary", { token: session(OTHER, "baran") });
    assert(r.status === 403 && r.body.section === "perf", "no perf section " + r.raw);

    /* ---- summary ---- */
    r = await call(base, "GET", `/api/admin/perf/summary?q=${q({ range: "28d" })}&chart=inp`, { token: tok });
    assert(r.status === 200 && r.body.ready, "summary " + r.raw.slice(0, 300));
    const inpTile = r.body.kpis.find((k) => k.metric === "inp");
    assert(r.body.kpis.length === 8 && inpTile.p75 > 150 && inpTile.dist.length === 3, "kpis " + JSON.stringify(inpTile));
    assert(r.body.chart.keys.length === 28 && r.body.chart.series.android && r.body.chart.series.ios, "chart series");
    assert(r.body.chart.markers.some((m) => m.kind === "release" && m.label === "4.1.4" && m.bad), "release marker, red " + JSON.stringify(r.body.chart.markers));
    assert(r.body.releases[0].version === "4.1.4" && r.body.releases[0].inpHot && r.body.releases[0].inpDelta > 40, "release card " + JSON.stringify(r.body.releases[0]));
    assert(r.body.alerts.length === 1 && r.body.alerts[0].topRoutes.includes("app/kanal"), "open alert");
    assert(r.body.mix.android > 50 && r.body.facets.route.includes("app/kanal"), "mix + facets");
    assert(r.body.live >= 1, "live sessions " + r.body.live);
    r = await call(base, "GET", `/api/admin/perf/summary?q=${q({ range: "28d", platform: ["ios"] })}`, { token: tok });
    assert(!r.body.chart.series.android && r.body.chart.series.ios, "platform filter");
    r = await call(base, "GET", `/api/admin/perf/summary?q=${q({ range: "7d", user: ALICE })}`, { token: tok });
    assert(r.body.kpis.find((k) => k.metric === "inp").n === 1, "user filter reads raw events");

    /* ---- table ---- */
    r = await call(base, "GET", `/api/admin/perf/table?q=${q({ range: "28d" })}&group=route&sort=inp`, { token: tok });
    assert(r.status === 200 && r.body.rows[0].key === "app/kanal" && r.body.rows[0].sev === "red", "slowest first " + JSON.stringify(r.body.rows.map((x) => [x.key, x.sev])));
    assert(r.body.rows[0].spark.length === 20 && r.body.rows[0].mix.android > 0, "spark + mix");
    r = await call(base, "GET", `/api/admin/perf/table?q=${q({ range: "28d" })}&group=platform&sort=inp`, { token: tok });
    assert(r.body.rows.map((x) => x.key).join() === "android,ios", "group by platform");

    /* ---- detail ---- */
    r = await call(base, "GET", `/api/admin/perf/detail?q=${q({ range: "28d" })}&dim=route&value=app%2Fkanal`, { token: tok });
    assert(r.status === 200 && r.body.kpis.length === 4, "detail " + r.raw.slice(0, 200));
    assert(r.body.heat.some((h) => h.platform === "android" && h.cells.some((c) => c.device === "low" && c.p75 > 150)) && r.body.heat[0].platform === "android", "heat map " + JSON.stringify(r.body.heat));
    assert(r.body.attribution.inp[0].target === "form > button.send" && r.body.attribution.lcp.element === "img.server-banner", "attribution");
    assert(r.body.slowUsers.users[0].userId === ALICE && r.body.slowUsers.users[0].sessionId === "SessAlice01" && r.body.slowUsers.users[0].sessions === 1, "slow user by id " + JSON.stringify(r.body.slowUsers));
    r = await call(base, "GET", "/api/admin/perf/session/SessAlice01", { token: tok });
    const inpRow = r.body.rows.find((x) => x.metric === "inp");
    assert(r.status === 200 && r.body.rows.length === 5 && inpRow.start === 4400 && inpRow.end === 5640, "timeline " + JSON.stringify(r.body.rows));
    r = await call(base, "GET", "/api/admin/perf/session/..%2F", { token: tok });
    assert(r.status === 400, "bad session id");

    /* ---- export ---- */
    r = await call(base, "GET", `/api/admin/perf/export?q=${q({ range: "28d" })}&group=route&sort=inp`, { token: tok });
    assert(r.status === 200 && r.body.content.includes("app/kanal") && r.body.filename.endsWith(".csv"), "export");
    assert(state.auditLog.some((e) => e.action === "perf_export"), "export audited");

    /* ---- views ---- */
    r = await call(base, "POST", "/api/admin/perf/views", { token: tok, body: { name: "Android 4.1.4", query: { range: "7d", platform: ["android"], version: ["4.1.4"] } } });
    assert(r.status === 200 && r.body.view.query.platform[0] === "android", "view saved without step-up " + r.raw);
    const viewId = r.body.view.id;
    r = await call(base, "GET", "/api/admin/perf/views", { token: tok });
    assert(r.body.views.length === 1, "listed");
    r = await call(base, "DELETE", `/api/admin/perf/views/${viewId}`, { token: tok });
    assert(r.status === 200, "view deleted");

    /* ---- rules ---- */
    r = await call(base, "GET", "/api/admin/perf/rules", { token: tok });
    assert(r.body.isDefault && r.body.rules[0].threshold_pct === 15, "default rule");
    const ruleBody = { metrics: ["inp", "appstart"], platforms: ["android", "ios"], thresholdPct: 15, minSessions: 2000, channels: ["adminRoom", "ownerPush"], mute: "release24h" };
    r = await call(base, "POST", "/api/admin/perf/rules/preview", { token: tok, body: ruleBody });
    assert(r.status === 200 && r.body.count === 1 && r.body.fires[0].version === "4.1.4", "90-day preview " + r.raw);
    r = await call(base, "POST", "/api/admin/perf/rules/preview", { token: tok, body: { ...ruleBody, thresholdPct: 80 } });
    assert(r.body.count === 0, "preview follows the threshold");
    r = await call(base, "PUT", "/api/admin/perf/rules/new", { token: tok, body: ruleBody });
    assert(r.status === 403 && r.body.code === "STEP_UP_REQUIRED", "saving a rule needs step-up " + r.raw);
    r = await call(base, "PUT", "/api/admin/perf/rules/new", { token: tok, stepUp: step, body: ruleBody });
    assert(r.status === 200 && r.body.rule.id, "rule saved " + r.raw);
    r = await call(base, "PUT", "/api/admin/perf/rules/new", { token: tok, stepUp: step, body: { ...ruleBody, metrics: [] } });
    assert(r.status === 400 && r.body.code === "NO_METRIC", "validation");
    assert(state.auditLog.some((e) => e.action === "perf_rule_save"), "rule change audited");

    /* ---- alerts ---- */
    const alertId = fake._tables.perf_alerts.rows[0].id;
    r = await call(base, "POST", `/api/admin/perf/alerts/${alertId}/hide`, { token: tok });
    assert(r.status === 200 && r.body.alert.status === "hidden", "hidden " + r.raw);
    r = await call(base, "GET", `/api/admin/perf/summary?q=${q({ range: "28d" })}`, { token: tok });
    assert(r.body.alerts.length === 0 && r.body.hiddenAlerts.length === 1, "banner gone");
    r = await call(base, "POST", `/api/admin/perf/alerts/${alertId}/unhide`, { token: tok });
    assert(r.body.alert.status === "open", "undo");
    r = await call(base, "POST", `/api/admin/perf/alerts/${alertId}/error-log`, { token: tok });
    assert(r.status === 200 && r.body.existed && fake._tables.error_logs.rows.length === 1, "error record not duplicated");

    /* ---- Lighthouse ---- */
    r = await call(base, "GET", "/api/admin/perf/lighthouse", { token: tok });
    assert(r.status === 200 && r.body.main && r.body.main.sha === "396c9b2", "main " + r.raw.slice(0, 300));
    const pr456 = r.body.prs.find((p) => p.pr === 456);
    assert(pr456 && pr456.status === "over" && pr456.over[0].page === "/download" && pr456.bundleDelta === 39000, "PR over budget " + JSON.stringify(pr456));
    assert(r.body.prs.find((p) => p.pr === 455).merged, "merged PR from the main run");
    assert(r.body.alert && r.body.alert.pr === 456, "budget banner");
    assert(r.body.repo === "acme/app", "repo for links");
  } finally {
    server.close();
  }
  console.log("adminPerf.integration.test: ok");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
