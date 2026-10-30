"use strict";

/**
 * "Şüpheli Davranışlar" admin tab API (decisions 25 Oct 2026), against the
 * in-memory Supabase fake:
 *   - roles: no token 401, user 403, admin without the section 403, section admin reads; writes the
 *     watch list / trust / release (server-side)
 *   - KPIs, account list (earned from the ledger, held = Faz 0 shadow), detail
 *     extras (7-day earnings, graph, masked hashes for admins only)
 *   - watch rules fire once per event; email + push only behind the flags and
 *     only to admins, counts only
 *   - release stays a 409 stub: no balance / ledger change, nothing sent
 *   - unapplied watch list migration answers 503, the risk job keeps working
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
process.env.NODE_ENV = "test";
delete process.env.DESCOIN_ANTIBOT_MONITOR;
delete process.env.DESCOIN_ANTIBOT_ALERT_EMAIL;
delete process.env.DESCOIN_ANTIBOT_ALERT_PUSH;

const assert = require("assert");
const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const DAY = 24 * 3600_000;
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const HASH_FP = "9f2c0123456789abcdef0123456789abcdef0123456789abcdef01234567e41a";
const HASH_NET = "4be1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa07c3";
const fakeOpts = {};
const fake = createFakeSupabase(
  {
    users: [
      { id: "u-admin", username: "demir", is_admin: true, active_sessions: [{ id: "s-admin" }] },
      { id: "u-mod", username: "moddy", is_admin: true, admin_permissions: ["suspicious"], active_sessions: [{ id: "s-mod" }] },
      { id: "u-lim", username: "limited", is_admin: true, admin_permissions: ["reports"], active_sessions: [{ id: "s-lim" }] },
      { id: "u-user", username: "plain", is_admin: false, active_sessions: [{ id: "s-user" }] },
      { id: "u-k34", username: "kral_farm34", display_name: "kral_farm34", descoin_balance: 50, created_at: iso(now - 6 * DAY), email_confirmed_at: null, auth_provider: "email" },
      { id: "u-k35", username: "kral_farm35", descoin_balance: 0, created_at: iso(now - 6 * DAY), email_confirmed_at: null, auth_provider: "email" },
      { id: "u-deniz", username: "deniz.k", display_name: "Deniz Koç", descoin_balance: 0, created_at: iso(now - 400 * DAY), email_confirmed_at: iso(now - 400 * DAY) },
      { id: "u-gece", username: "gece_kusu", descoin_balance: 0, created_at: iso(now - 2 * DAY), email_confirmed_at: null, auth_provider: "email" },
      { id: "u-new", username: "kral_farm37", descoin_balance: 0, created_at: iso(now - 1 * DAY), email_confirmed_at: null, auth_provider: "email" },
    ],
    descoin_risk: [
      { user_id: "u-k34", score: 100, reasons: ["automation_client", "linked_account", "timing_regular", "headless"], trusted: false, signals: { linked_with: ["u-k35"], shadow: { d1: { would_withhold: 300, blocked: { msg_similar: 128, msg_no_reply: 63 } } } }, updated_at: iso(now) },
      { user_id: "u-k35", score: 60, reasons: ["linked_account", "timing_regular"], trusted: false, signals: { linked_with: ["u-k34"], shadow: { d1: { would_withhold: 200, blocked: {} } } }, updated_at: iso(now) },
      { user_id: "u-deniz", score: 40, reasons: ["timing_regular", "rate_extreme"], trusted: true, signals: {}, updated_at: iso(now) },
      { user_id: "u-gece", score: 30, reasons: ["new_unverified", "rate_extreme", "missing_client_signals"], trusted: false, signals: {}, updated_at: iso(now) },
    ],
    descoin_account_links: [{ user_a: "u-k34", user_b: "u-k35", kinds: ["same_device", "same_subnet"], strength: 2, created_at: iso(now - 5 * DAY), last_seen: iso(now) }],
    descoin_device_seen: [
      { user_id: "u-k34", kind: "fp", hash: HASH_FP, first_seen: iso(now - 5 * DAY), last_seen: iso(now) },
      { user_id: "u-k34", kind: "subnet", hash: HASH_NET, first_seen: iso(now - 5 * DAY), last_seen: iso(now) },
      { user_id: "u-k35", kind: "fp", hash: HASH_FP, first_seen: iso(now - 5 * DAY), last_seen: iso(now) },
      { user_id: "u-k35", kind: "subnet", hash: HASH_NET, first_seen: iso(now - 5 * DAY), last_seen: iso(now) },
    ],
    descoin_ledger: [
      { user_id: "u-k34", amount: 180, reason: "message_activity", balance_after: 180, created_at: iso(now - 2 * DAY) },
      { user_id: "u-k34", amount: 520, reason: "voice_activity", balance_after: 700, created_at: iso(now - 1 * DAY) },
      { user_id: "u-k34", amount: 5000, reason: "admin_grant", balance_after: 5700, created_at: iso(now - 1 * DAY) },
      { user_id: "u-k34", amount: 999, reason: "voice_activity", balance_after: 999, created_at: iso(now - 9 * DAY) },
      { user_id: "u-deniz", amount: 64, reason: "message_activity", balance_after: 64, created_at: iso(now - 1 * DAY) },
    ],
    descoin_risk_alerts: [],
    descoin_admin_audit: [],
    descoin_watchlist: [],
    descoin_watch_rules: [],
    descoin_admin_alerts: [{ user_id: "u-gece", kind: "risk_above", severity: "lo", body: { score: 30 }, created_at: iso(now - 100 * DAY) }],
    referral_rewards: [],
  },
  fakeOpts
);
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken } = require("../config/jwt");
const state = require("../runtime/sharedState");
const antibot = require("../lib/descoinAntibot");
const watch = require("../lib/descoinAntibot/watch");
const adminAntibot = require("../routes/adminAntibot");

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const rowsOf = (t) => (fake._tables[t] ? fake._tables[t].rows : []);
const tok = {
  admin: signToken({ id: "u-admin", username: "demir", sid: "s-admin" }),
  mod: signToken({ id: "u-mod", username: "moddy", sid: "s-mod" }),
  lim: signToken({ id: "u-lim", username: "limited", sid: "s-lim" }),
  user: signToken({ id: "u-user", username: "plain", sid: "s-user" }),
};
let base;
async function req(method, path, { token, body } = {}) {
  const res = await fetch(base + "/api/admin/antibot" + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty */
  }
  return { status: res.status, body: json };
}

let server;
test("start server", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/admin/antibot", adminAntibot);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test("roles: 401 without token, 403 for users and admins without the section, section admins read", async () => {
  const reads = ["/overview", "/accounts", "/users/u-k34/extra", "/watchlist", "/feed"];
  for (const p of reads) {
    assert.strictEqual((await req("GET", p)).status, 401, p);
    assert.strictEqual((await req("GET", p, { token: tok.user })).status, 403, p);
    assert.strictEqual((await req("GET", p, { token: tok.lim })).status, 403, p);
    assert.strictEqual((await req("GET", p, { token: tok.mod })).status, 200, p);
  }
  assert.strictEqual((await req("PUT", "/watch/u-k34", { token: tok.lim, body: { note: "x", rules: [] } })).status, 403);
  assert.strictEqual((await req("DELETE", "/watch/u-k34", { token: tok.lim })).status, 403);
  assert.strictEqual((await req("POST", "/users/u-k34/trust", { token: tok.lim, body: { trusted: true } })).status, 403);
  assert.strictEqual((await req("POST", "/users/u-k34/release", { token: tok.lim })).status, 403);
  assert.strictEqual((await req("PUT", "/watch/u-k34", { token: tok.user, body: { rules: [] } })).status, 403);
  assert.strictEqual(rowsOf("descoin_watchlist").length, 0);
});

test("overview: KPIs and status counts", async () => {
  const r = await req("GET", "/overview", { token: tok.admin });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.role, "admin");
  assert.strictEqual(r.body.kpis.review, 2, "untrusted 40+");
  assert.strictEqual(r.body.kpis.held7d, 500);
  assert.deepStrictEqual(r.body.kpis.clusters, { count: 1, accounts: 2 });
  assert.strictEqual(r.body.kpis.watch, 0);
  assert.deepStrictEqual(r.body.counts, { stopped: 1, half: 1, trusted: 1 });
});

test("accounts: earned from the ledger (activity only, 7 days), held, status, filters, search", async () => {
  const r = await req("GET", "/accounts", { token: tok.mod });
  assert.strictEqual(r.status, 200);
  const ids = r.body.items.map((i) => i.user.id);
  assert.deepStrictEqual(ids, ["u-k34", "u-k35", "u-deniz"], "40+ or trusted, by score");
  const k = r.body.items[0];
  assert.strictEqual(k.earned7d, 700, "admin_grant and >7 day rows excluded");
  assert.strictEqual(k.held7d, 300);
  assert.strictEqual(k.status, "stopped");
  assert.strictEqual(k.linkedCount, 1);
  assert.strictEqual(k.reasons[0], "linked_account", "strongest signal first");
  assert.strictEqual(k.user.emailVerified, false);
  assert.ok(k.user.createdAt);
  assert.strictEqual(r.body.items[2].status, "trusted");
  assert.deepStrictEqual(r.body.totals, { earned7d: 764, held7d: 500 });

  assert.deepStrictEqual((await req("GET", "/accounts?status=half", { token: tok.mod })).body.items.map((i) => i.user.id), ["u-k35"]);
  assert.deepStrictEqual((await req("GET", "/accounts?status=trusted", { token: tok.mod })).body.items.map((i) => i.user.id), ["u-deniz"]);
  assert.deepStrictEqual((await req("GET", "/accounts?q=deniz", { token: tok.mod })).body.items.map((i) => i.user.id), ["u-deniz"]);
  assert.deepStrictEqual((await req("GET", "/accounts?q=Koç", { token: tok.mod })).body.items.map((i) => i.user.id), ["u-deniz"]);
  // Device digest search (masked prefix).
  assert.deepStrictEqual((await req("GET", "/accounts?q=9f2c", { token: tok.admin })).body.items.map((i) => i.user.id).sort(), ["u-k34", "u-k35"]);
  assert.strictEqual((await req("GET", "/accounts?q=9f2c", { token: tok.lim })).status, 403);
});

test("detail extras: 7-day earnings, average, graph, uncounted, hashes masked", async () => {
  const a = await req("GET", "/users/u-k34/extra", { token: tok.admin });
  assert.strictEqual(a.status, 200);
  assert.strictEqual(a.body.earnings.days.length, 7);
  assert.strictEqual(a.body.earnings.total, 700);
  assert.strictEqual(a.body.earnings.days.reduce((n, d) => n + d.amount, 0), 700);
  assert.ok(a.body.earnings.averagePerDay >= 0);
  assert.strictEqual(a.body.rawScore, 105, "sum before the 100 cap");
  assert.strictEqual(a.body.held7d, 300);
  assert.deepStrictEqual(a.body.uncounted, { msg_similar: 128, msg_no_reply: 63 });
  assert.deepStrictEqual(a.body.graph.nodes.map((n) => n.id), ["u-k34", "u-k35"]);
  assert.strictEqual(a.body.graph.edges[0].kinds[0], "same_device");
  assert.strictEqual(a.body.hashes.fp, "9f2c·····e41a");
  assert.strictEqual(a.body.hashes.subnet, "4be1·····07c3");
  assert.ok(a.body.timeline.some((t) => t.kind === "signup") && a.body.timeline.some((t) => t.kind === "link" && t.user === "kral_farm35"));
  const m = await req("GET", "/users/u-k34/extra", { token: tok.mod });
  assert.strictEqual(m.body.hashes.fp, "9f2c·····e41a", "a section admin sees the same masked digest");
  assert.strictEqual((await req("GET", "/users/u-k34/extra", { token: tok.lim })).status, 403);
  for (const body of [a.body, m.body]) {
    const blob = JSON.stringify(body);
    assert.ok(!blob.includes(HASH_FP) && !blob.includes(HASH_NET), "full hashes never leave the server");
  }
  assert.strictEqual((await req("GET", "/users/bad%20id/extra", { token: tok.admin })).status, 400);
});

test("clusters: linked accounts grouped, strongest first, readable with the section", async () => {
  const r = await req("GET", "/clusters", { token: tok.mod });
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.items.length >= 1);
  const c = r.body.items[0];
  assert.ok(c.members.length >= 2);
  assert.ok(c.members[0].score >= c.members[c.members.length - 1].score, "members by score");
  assert.ok(c.members.some((m) => m.user.id === "u-k34"));
  assert.ok(!JSON.stringify(r.body).match(/[0-9a-f]{16,}/), "no hashes");
  assert.strictEqual((await req("GET", "/clusters", { token: tok.user })).status, 403);
});

test("watch list: validation, add, update keeps unchanged rules, audit, remove", async () => {
  const bad = [
    { rules: [{ kind: "nope" }] },
    { rules: [{ kind: "risk_above", threshold: 101 }] },
    { rules: [{ kind: "held_above" }] },
    { rules: "x" },
    { note: "x".repeat(501), rules: [] },
    { rules: Array.from({ length: 7 }, (_, i) => ({ kind: "risk_above", threshold: i + 1 })) },
  ];
  for (const body of bad) assert.strictEqual((await req("PUT", "/watch/u-k34", { token: tok.admin, body })).status, 400, JSON.stringify(body).slice(0, 60));
  assert.strictEqual((await req("PUT", "/watch/u-nobody", { token: tok.admin, body: { rules: [] } })).status, 404);

  const add = await req("PUT", "/watch/u-k34", {
    token: tok.admin,
    body: { note: "Küme A'nın merkezi.", rules: [{ kind: "cluster_join" }, { kind: "held_above", threshold: 5000 }, { kind: "held_above", threshold: 5000 }] },
  });
  assert.strictEqual(add.status, 200);
  assert.strictEqual(rowsOf("descoin_watchlist")[0].added_by, "u-admin");
  assert.strictEqual(rowsOf("descoin_watch_rules").length, 2, "duplicate rule ignored");
  const keepId = rowsOf("descoin_watch_rules").find((r) => r.kind === "cluster_join").id;

  const up = await req("PUT", "/watch/u-k34", { token: tok.admin, body: { note: "Küme A.", rules: [{ kind: "cluster_join" }, { kind: "new_link" }] } });
  assert.strictEqual(up.status, 200);
  const rules = rowsOf("descoin_watch_rules").filter((r) => r.user_id === "u-k34");
  assert.deepStrictEqual(rules.map((r) => r.kind).sort(), ["cluster_join", "new_link"]);
  assert.ok(rules.some((r) => r.id === keepId), "unchanged rule kept (its fired memory too)");
  assert.strictEqual(rowsOf("descoin_watchlist")[0].note, "Küme A.");

  assert.strictEqual((await req("PUT", "/watch/u-gece", { token: tok.admin, body: { note: "gece yoğun", rules: [{ kind: "risk_above", threshold: 40 }, { kind: "new_signal" }] } })).status, 200);
  const wl = await req("GET", "/watchlist", { token: tok.mod });
  assert.strictEqual(wl.status, 200);
  assert.deepStrictEqual(wl.body.items.map((i) => i.user.username).sort(), ["gece_kusu", "kral_farm34"]);
  const k = wl.body.items.find((i) => i.user.id === "u-k34");
  assert.strictEqual(k.addedBy, "demir");
  assert.strictEqual(k.held7d, 300);
  assert.strictEqual(k.status, "stopped");

  // A watched account below 40 still shows in the account list.
  const acc = await req("GET", "/accounts", { token: tok.mod });
  const g = acc.body.items.find((i) => i.user.id === "u-gece");
  assert.ok(g && g.watched && g.score === 30);
  assert.strictEqual((await req("GET", "/overview", { token: tok.mod })).body.kpis.watch, 2);

  const actions = rowsOf("descoin_admin_audit").map((a) => a.action);
  assert.deepStrictEqual(actions, ["watch_add", "watch_update", "watch_add"]);

  assert.strictEqual((await req("PUT", "/watch/u-k35", { token: tok.admin, body: { rules: [] } })).status, 200);
  assert.strictEqual((await req("DELETE", "/watch/u-k35", { token: tok.admin })).status, 200);
  assert.ok(!rowsOf("descoin_watchlist").some((w) => w.user_id === "u-k35"));
  assert.strictEqual(rowsOf("descoin_admin_audit").at(-1).action, "watch_remove");
});

test("rules fire once per event; email + push behind flags, admins only, counts only", async () => {
  // gece_kusu (30) now links to a fresh account on the same device + network → score jumps.
  rowsOf("descoin_device_seen").push(
    { user_id: "u-gece", kind: "fp", hash: "7777000000000000000000000000000000000000000000000000000000000001", first_seen: iso(now), last_seen: iso(now) },
    { user_id: "u-gece", kind: "subnet", hash: "7777000000000000000000000000000000000000000000000000000000000002", first_seen: iso(now), last_seen: iso(now) },
    { user_id: "u-new", kind: "fp", hash: "7777000000000000000000000000000000000000000000000000000000000001", first_seen: iso(now), last_seen: iso(now) },
    { user_id: "u-new", kind: "subnet", hash: "7777000000000000000000000000000000000000000000000000000000000002", first_seen: iso(now), last_seen: iso(now) }
  );
  // gece_kusu's old reasons were stored with the row; the job recomputes them from stored signals.
  process.env.DESCOIN_ANTIBOT_ALERT_EMAIL = "1";
  process.env.DESCOIN_ANTIBOT_ALERT_PUSH = "1";
  const sent = { email: [], push: [] };
  const alertDeps = {
    sendEmail: async (m) => {
      sent.email.push(m);
      return { sent: true };
    },
    sendPush: async (ids, ev) => sent.push.push({ ids, ev }),
    listAdminIds: async () => ["u-admin"],
  };
  try {
    const before = JSON.stringify(rowsOf("users").map((u) => [u.id, u.descoin_balance]));
    const r1 = await antibot.runRiskJob({ userIds: ["u-gece", "u-k34"], alertDeps });
    assert.ok(r1.users === 2, JSON.stringify(r1));
    const fired = rowsOf("descoin_admin_alerts").filter((a) => a.created_at > iso(now - DAY));
    const kinds = fired.map((a) => `${a.user_id}:${a.kind}`).sort();
    assert.ok(kinds.includes("u-gece:risk_above"), kinds.join(","));
    assert.ok(kinds.includes("u-gece:new_signal"), kinds.join(","));
    assert.ok(!kinds.some((k) => k.startsWith("u-k34:")), `k34 had no new event: ${kinds}`);
    const watchEmails = sent.email.filter((m) => /izleme listesinde/.test(m.subject));
    assert.strictEqual(watchEmails.length, 1);
    const watchPush = sent.push.filter((p) => p.ev.type === "admin-antibot-watch");
    assert.strictEqual(watchPush.length, 1);
    assert.deepStrictEqual(watchPush[0].ids, ["u-admin"], "admins only");
    const out = JSON.stringify([watchEmails, watchPush]);
    for (const secret of ["gece_kusu", "u-gece", "kral_farm37", "u-new"]) assert.ok(!out.includes(secret), `no ${secret} in email/push`);

    const n = rowsOf("descoin_admin_alerts").length;
    await antibot.runRiskJob({ userIds: ["u-gece", "u-k34"], alertDeps });
    assert.strictEqual(rowsOf("descoin_admin_alerts").length, n, "same event does not fire twice");

    // k34's cluster grows: u-new joins via a new link to k35.
    rowsOf("descoin_account_links").push({ user_a: "u-k35", user_b: "u-new", kinds: ["same_device", "same_subnet"], strength: 2, created_at: iso(now), last_seen: iso(now) });
    await antibot.runRiskJob({ userIds: ["u-k34"], alertDeps });
    const cj = rowsOf("descoin_admin_alerts").filter((a) => a.user_id === "u-k34" && a.kind === "cluster_join");
    assert.strictEqual(cj.length, 1);
    assert.deepStrictEqual(cj[0].body.joined, ["u-new"]);
    await antibot.runRiskJob({ userIds: ["u-k34"], alertDeps });
    assert.strictEqual(rowsOf("descoin_admin_alerts").filter((a) => a.user_id === "u-k34" && a.kind === "cluster_join").length, 1);

    assert.strictEqual(JSON.stringify(rowsOf("users").map((u) => [u.id, u.descoin_balance])), before, "no balance change");
  } finally {
    delete process.env.DESCOIN_ANTIBOT_ALERT_EMAIL;
    delete process.env.DESCOIN_ANTIBOT_ALERT_PUSH;
  }

  const feed = await req("GET", "/feed", { token: tok.admin });
  assert.strictEqual(feed.status, 200);
  const cjFeed = feed.body.alerts.find((a) => a.kind === "cluster_join");
  assert.strictEqual(cjFeed.user, "kral_farm34");
  assert.deepStrictEqual(cjFeed.body.joined, ["kral_farm37"], "ids become usernames in the panel");
  assert.ok(feed.body.audit.some((a) => a.action === "watch_add" && a.by === "demir" && a.target === "gece_kusu"));
});

test("release stays a 409 stub (admins only): no ledger row, no balance change", async () => {
  const ledger = rowsOf("descoin_ledger").length;
  const bal = rowsOf("users").find((u) => u.id === "u-k34").descoin_balance;
  const r = await req("POST", "/users/u-k34/release", { token: tok.admin });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.body.code, "monitor_mode");
  assert.strictEqual(rowsOf("descoin_ledger").length, ledger);
  assert.strictEqual(rowsOf("users").find((u) => u.id === "u-k34").descoin_balance, bal);
});

test("retention removes rule alerts older than 90 days", async () => {
  assert.ok(rowsOf("descoin_admin_alerts").some((a) => a.created_at < iso(now - 90 * DAY)));
  await antibot.runRetention();
  assert.ok(!rowsOf("descoin_admin_alerts").some((a) => a.created_at < iso(now - 90 * DAY)));
});

test("pure helpers: clusters, masking, rule normalizing", () => {
  assert.deepStrictEqual(watch.clustersOf([{ a: "a", b: "b" }, { a: "b", b: "c" }, { a: "x", b: "y" }, { a: "z", b: "z" }]), [["a", "b", "c"], ["x", "y"]]);
  assert.strictEqual(watch.maskHash("short"), null);
  assert.strictEqual(watch.maskHash("abcdefghijklmnop"), "abcd·····mnop");
  assert.deepStrictEqual(watch.normalizeRules([{ kind: "new_link", threshold: 9 }]).rules, [{ kind: "new_link", threshold: null }]);
  const facts = new Map([["u", { score: 75, prevScore: 75, held: 0, prevHeld: 0, linked: [], prevLinked: [], reasons: ["a"], prevReasons: null }]]);
  assert.deepStrictEqual(watch.evaluateRules([{ user_id: "u", kind: "risk_above", threshold: 70 }, { user_id: "u", kind: "new_signal" }], facts), [], "already above / no baseline: no alert");
});

test("watch list migration not applied: 503 code, risk job unaffected", async () => {
  fakeOpts.missingTables = ["descoin_watchlist", "descoin_watch_rules", "descoin_admin_alerts"];
  require("../lib/descoinAntibot/store")._reset();
  try {
    const w = await req("GET", "/watchlist", { token: tok.admin });
    assert.strictEqual(w.status, 503);
    assert.strictEqual(w.body.code, "watchlist_not_migrated");
    assert.strictEqual((await req("PUT", "/watch/u-k34", { token: tok.admin, body: { rules: [] } })).status, 503);
    assert.strictEqual((await req("GET", "/accounts", { token: tok.admin })).status, 200);
    const job = await antibot.runRiskJob({ userIds: ["u-k34"] });
    assert.strictEqual(job.users, 1);
  } finally {
    fakeOpts.missingTables = [];
  }
});

(async () => {
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`  ok  ${t.name}`);
    } catch (err) {
      failed += 1;
      console.error(`  FAIL ${t.name}\n       ${err && err.stack ? err.stack : err}`);
    }
  }
  if (server) server.close();
  antibot.stopAntibotScheduler();
  console.log(`descoinAntibot tab integration: ${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();
