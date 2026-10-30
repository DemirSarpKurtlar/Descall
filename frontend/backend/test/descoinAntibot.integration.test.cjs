"use strict";

/**
 * DesCoin anti-bot Faz 0 (monitor only), end to end against the in-memory
 * Supabase fake:
 *   - earning (creditCapped) gives exactly the same coins with the anti-bot on
 *     and a risk score of 100 as with it off (monitor only, balances untouched)
 *   - socket signals → risk job → descoin_risk / links / alerts rows; no raw IP,
 *     no message text stored
 *   - admin API: roles (user 403, admin without the section 403, section admin reads + notes, admin trust), release
 *     is a 409 stub, rate limits, device data only as counts
 *   - an unapplied migration (missing tables) is tolerated everywhere
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

const HOUR = 3600_000;
const now = Date.now();
const fakeOpts = {};
const fake = createFakeSupabase(
  {
    users: [
      { id: "u-admin", username: "boss", is_admin: true, active_sessions: [{ id: "s-admin" }], created_at: new Date(now - 400 * 24 * HOUR).toISOString() },
      { id: "u-lim", username: "limited", is_admin: true, admin_permissions: ["reports"], active_sessions: [{ id: "s-lim" }] },
      { id: "u-mod", username: "moddy", is_admin: true, admin_permissions: ["suspicious"], active_sessions: [{ id: "s-mod" }], created_at: new Date(now - 300 * 24 * HOUR).toISOString() },
      { id: "u-user", username: "plain", is_admin: false, active_sessions: [{ id: "s-user" }], created_at: new Date(now - 200 * 24 * HOUR).toISOString() },
      { id: "u-bot1", username: "farm1", display_name: "Farm 1", is_admin: false, descoin_balance: 0, created_at: new Date(now - 2 * HOUR).toISOString(), email_confirmed_at: null, auth_provider: "email" },
      { id: "u-bot2", username: "farm2", is_admin: false, descoin_balance: 0, created_at: new Date(now - 1 * HOUR).toISOString(), email_confirmed_at: null, auth_provider: "email" },
      { id: "u-real", username: "real", is_admin: false, descoin_balance: 0, created_at: new Date(now - 500 * 24 * HOUR).toISOString(), email_confirmed_at: new Date(now - 500 * 24 * HOUR).toISOString() },
      { id: "u-c1", username: "c1", descoin_balance: 100 },
      { id: "u-c2", username: "c2", descoin_balance: 100 },
    ],
    descoin_ledger: [],
    referral_rewards: [{ inviter_id: "u-bot1", invitee_id: "u-bot2" }],
  },
  fakeOpts
);
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken } = require("../config/jwt");
const state = require("../runtime/sharedState");
const { socketIp } = require("../middleware/socketAuth");
const descoin = require("../lib/descoin");
const antibot = require("../lib/descoinAntibot");
const store = require("../lib/descoinAntibot/store");
const adminAntibot = require("../routes/adminAntibot");

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const tick = () => new Promise((r) => setImmediate(r));
const tableRows = (t) => (fake._tables[t] ? fake._tables[t].rows : []);

let base;
async function req(method, path, { token, body } = {}) {
  const res = await fetch(base + path, {
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

const tok = {
  admin: signToken({ id: "u-admin", username: "boss", sid: "s-admin" }),
  mod: signToken({ id: "u-mod", username: "moddy", sid: "s-mod" }),
  lim: signToken({ id: "u-lim", username: "limited", sid: "s-lim" }),
  user: signToken({ id: "u-user", username: "plain", sid: "s-user" }),
};

function botSocket() {
  return {
    handshake: {
      headers: { "user-agent": "python-requests/2.31", "x-forwarded-for": "203.0.113.5" },
      address: "10.0.0.1",
      auth: {},
    },
  };
}

// -----------------------------------------------------------------------------

test("monitor only: creditCapped coins are identical with anti-bot off vs on + score 100", async () => {
  const seq = [
    ["message_activity", 1],
    ["message_activity", 1],
    ["voice_activity", 12],
    ["voice_activity", 25],
    ["screenshare_activity", 50],
    ["message_activity", 40],
  ];
  process.env.DESCOIN_ANTIBOT_MONITOR = "0";
  const off = [];
  for (const [reason, amount] of seq) off.push(await descoin.creditCapped("u-c1", amount, reason, {}));
  delete process.env.DESCOIN_ANTIBOT_MONITOR;

  antibot._riskCache.set("u-c2", { score: 100, trusted: false, linked: new Set(), at: Date.now() });
  const on = [];
  for (const [reason, amount] of seq) on.push(await descoin.creditCapped("u-c2", amount, reason, {}));

  assert.deepStrictEqual(
    on.map((r) => [r.credited, r.capped, r.balance]),
    off.map((r) => [r.credited, r.capped, r.balance]),
    "same coins, caps and balances"
  );
  const bal = (id) => tableRows("users").find((u) => u.id === id).descoin_balance;
  assert.strictEqual(bal("u-c1"), bal("u-c2"));
  assert.ok(bal("u-c2") > 100, "coins were actually credited");
  const sig = antibot.signalsFor("u-c2");
  const shadowDay = Object.values(sig.shadow)[0];
  assert.ok(shadowDay && shadowDay.would_withhold > 0, "would_withhold is only counted");
  assert.ok(!antibot._users.has("u-c1"), "monitor off collects nothing");
});

test("signals → risk job → risk rows, links, alert; no raw IP or text stored", async () => {
  const s1 = botSocket();
  const s2 = botSocket();
  antibot.onSocketConnect(s1, "u-bot1", socketIp(s1));
  antibot.onSocketConnect(s2, "u-bot2", socketIp(s2));
  antibot.onSocketConnect({ handshake: { headers: { "user-agent": "Mozilla/5.0 Safari/605" }, address: "198.51.100.7", auth: {} } }, "u-real", "198.51.100.7");
  antibot.onClientSignals("u-bot1", { fp: "canvas-fp-abc", webdriver: true, glRenderer: "SwiftShader", platform: "win32" });
  await tick();

  const verdict = await antibot.observeMessage({ userId: "u-bot1", convKey: "group:g1", text: "gizli mesaj içeriği burada" });
  assert.ok(verdict && verdict.reason === "no_reply", "shadow verdict computed");
  await antibot.flush();

  const res = await antibot.runRiskJob({ userIds: ["u-bot1", "u-bot2", "u-real"] });
  assert.strictEqual(res.users, 3);
  const rows = new Map(tableRows("descoin_risk").map((r) => [r.user_id, r]));
  const b1 = rows.get("u-bot1");
  assert.ok(b1.score >= 70, `bot1 score ${b1.score}`);
  for (const r of ["automation_client", "linked_account", "new_unverified", "headless"]) assert.ok(b1.reasons.includes(r), r);
  assert.strictEqual(rows.get("u-real").score, 0);
  assert.strictEqual(rows.get("u-real").reasons.length, 0);

  const links = tableRows("descoin_account_links");
  assert.strictEqual(links.length, 1);
  assert.deepStrictEqual([links[0].user_a, links[0].user_b].sort(), ["u-bot1", "u-bot2"]);
  assert.ok(links[0].kinds.length >= 2);

  const alertsRows = tableRows("descoin_risk_alerts");
  assert.ok(alertsRows.some((a) => a.user_id === "u-bot1"));
  assert.ok(alertsRows.every((a) => a.email_enabled === false && a.push_enabled === false), "sending disabled by default");

  const fps = tableRows("descoin_message_fingerprints");
  assert.strictEqual(fps.length, 1);
  assert.ok(Array.isArray(fps[0].minhash) && fps[0].minhash.length > 0);
  assert.notStrictEqual(fps[0].conv_key_hash, "group:g1");

  const dump = JSON.stringify(fake._tables);
  for (const secret of ["203.0.113", "198.51.100", "10.0.0.1", "canvas-fp-abc", "gizli mesaj", "python-requests"]) {
    assert.ok(!dump.includes(secret), `stored data must not contain ${secret}`);
  }
  assert.strictEqual(tableRows("users").find((u) => u.id === "u-bot1").descoin_balance, 0, "no balance change");
});

let server;
test("admin API: start server", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/admin/antibot", adminAntibot);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test("admin API: no token 401, regular user 403", async () => {
  assert.strictEqual((await req("GET", "/api/admin/antibot/status")).status, 401);
  assert.strictEqual((await req("GET", "/api/admin/antibot/status", { token: tok.user })).status, 403);
  assert.strictEqual((await req("GET", "/api/admin/antibot/flagged", { token: tok.user })).status, 403);
});

test("admin API: an admin granted Şüpheli Davranışlar views the flagged list and detail (counts only)", async () => {
  const st = await req("GET", "/api/admin/antibot/status", { token: tok.mod });
  assert.strictEqual(st.status, 200);
  assert.strictEqual(st.body.role, "admin");
  assert.strictEqual(st.body.phase, "faz0-monitor");
  assert.strictEqual(st.body.flags.withhold, false);

  const fl = await req("GET", "/api/admin/antibot/flagged?min=40", { token: tok.mod });
  assert.strictEqual(fl.status, 200);
  const ids = fl.body.items.map((i) => i.user.id);
  assert.ok(ids.includes("u-bot1") && !ids.includes("u-real"));
  const item = fl.body.items.find((i) => i.user.id === "u-bot1");
  assert.strictEqual(item.user.username, "farm1");
  assert.ok(item.topReasons.length <= 3 && item.topReasons[0] === "linked_account");
  assert.strictEqual(item.linkedCount, 1);
  assert.strictEqual(item.wouldEarnMultiplier, 0);

  const d = await req("GET", "/api/admin/antibot/users/u-bot1", { token: tok.mod });
  assert.strictEqual(d.status, 200);
  assert.strictEqual(d.body.device.subnet.sharedWithAccounts, 1);
  assert.strictEqual(d.body.device.fp.distinct, 1);
  assert.strictEqual(d.body.links[0].user.username, "farm2");
  const blob = JSON.stringify(d.body);
  for (const row of tableRows("descoin_device_seen")) assert.ok(!blob.includes(row.hash), "no hashes in API output");
  assert.ok(!blob.includes("203.0.113"));

  const bad = await req("GET", "/api/admin/antibot/users/bad%20id", { token: tok.mod });
  assert.strictEqual(bad.status, 400);
});

test("admin API: an admin without the section gets 403; the section admin can add a note", async () => {
  for (const [m, path] of [["GET", "/status"], ["GET", "/flagged"], ["POST", "/users/u-bot1/trust"], ["POST", "/users/u-bot1/release"], ["POST", "/run"], ["POST", "/users/u-bot1/note"]]) {
    const r = await req(m, `/api/admin/antibot${path}`, m === "GET" ? { token: tok.lim } : { token: tok.lim, body: { trusted: true, note: "x" } });
    assert.strictEqual(r.status, 403, path);
    assert.strictEqual(r.body.code, "ADMIN_PERMISSION_DENIED", path);
  }
  const n = await req("POST", "/api/admin/antibot/users/u-bot1/note", { token: tok.mod, body: { note: "aynı ağdan iki yeni hesap" } });
  assert.strictEqual(n.status, 200);
  assert.strictEqual((await req("POST", "/api/admin/antibot/users/u-bot1/note", { token: tok.mod, body: { note: "" } })).status, 400);
  assert.strictEqual((await req("POST", "/api/admin/antibot/users/u-nobody/note", { token: tok.mod, body: { note: "x" } })).status, 404);
  assert.ok(tableRows("descoin_risk").find((r) => r.user_id === "u-bot1").trusted !== true);
});

test("admin API: admin trusts (no balance change), release is a 409 stub", async () => {
  const before = JSON.stringify(tableRows("users").map((u) => [u.id, u.descoin_balance]));
  const ledgerBefore = tableRows("descoin_ledger").length;
  assert.strictEqual((await req("POST", "/api/admin/antibot/users/u-bot1/trust", { token: tok.admin, body: {} })).status, 400);
  assert.strictEqual((await req("POST", "/api/admin/antibot/users/u-nobody/trust", { token: tok.admin, body: { trusted: true } })).status, 404);
  const t = await req("POST", "/api/admin/antibot/users/u-bot1/trust", { token: tok.admin, body: { trusted: true, note: "tanıdığım kişi" } });
  assert.strictEqual(t.status, 200);
  const row = tableRows("descoin_risk").find((r) => r.user_id === "u-bot1");
  assert.strictEqual(row.trusted, true);
  assert.strictEqual(row.trusted_by, "u-admin");
  assert.strictEqual(antibot.riskOf("u-bot1").trusted, true);

  // Trusting an account that was never scored creates its row.
  const t2 = await req("POST", "/api/admin/antibot/users/u-user/trust", { token: tok.admin, body: { trusted: true } });
  assert.strictEqual(t2.status, 200);
  assert.strictEqual(tableRows("descoin_risk").find((r) => r.user_id === "u-user").trusted, true);

  const rel = await req("POST", "/api/admin/antibot/users/u-bot1/release", { token: tok.admin });
  assert.strictEqual(rel.status, 409);
  assert.strictEqual(rel.body.code, "monitor_mode");

  assert.strictEqual(JSON.stringify(tableRows("users").map((u) => [u.id, u.descoin_balance])), before, "balances unchanged");
  assert.strictEqual(tableRows("descoin_ledger").length, ledgerBefore, "no ledger rows");
  const actions = tableRows("descoin_admin_audit").map((a) => a.action);
  assert.deepStrictEqual(actions.sort(), ["note", "trust", "trust"]);

  const d = await req("GET", "/api/admin/antibot/users/u-bot1", { token: tok.admin });
  assert.strictEqual(d.body.risk.trusted, true);
  assert.strictEqual(d.body.risk.wouldEarnMultiplier, 1);
  assert.ok(d.body.audit.some((a) => a.note === "aynı ağdan iki yeni hesap" && a.by.username === "moddy"));
  assert.ok(Array.isArray(d.body.signals.conversationPartners7d.top), "admins see top partners");

  const trustedOnly = await req("GET", "/api/admin/antibot/flagged?min=0&trusted=1", { token: tok.admin });
  assert.ok(trustedOnly.body.items.every((i) => i.trusted));
});

test("admin API: run job is rate limited (3 per 10 min)", async () => {
  const codes = [];
  for (let i = 0; i < 4; i += 1) codes.push((await req("POST", "/api/admin/antibot/run", { token: tok.admin })).status);
  assert.deepStrictEqual(codes, [200, 200, 200, 429]);
});

test("admin API: reads are rate limited per user", async () => {
  let got429 = false;
  let n = 0;
  while (n < 200) {
    n += 1;
    const r = await req("GET", "/api/admin/antibot/status", { token: tok.mod });
    if (r.status === 429) {
      got429 = true;
      break;
    }
  }
  assert.ok(got429 && n <= 121, `429 after ${n}`);
});

test("missing tables (migration not applied): earning works, job skips, API 503", async () => {
  fakeOpts.missingTables = [
    "descoin_risk",
    "descoin_device_seen",
    "descoin_account_links",
    "descoin_message_fingerprints",
    "descoin_risk_alerts",
    "descoin_admin_audit",
  ];
  antibot._reset();
  const warns = [];
  const orig = console.warn;
  console.warn = (m) => warns.push(String(m));
  try {
    const s = botSocket();
    antibot.onSocketConnect(s, "u-bot1", socketIp(s));
    await antibot.observeMessage({ userId: "u-bot1", convKey: "dm:a:b", dmPeerId: "u-bot2", text: "merhaba nasılsın bugün" });
    await tick();
    await antibot.flush();
    const r = await descoin.creditCapped("u-real", 2, "message_activity", {});
    assert.strictEqual(r.credited, 2);
    const job = await antibot.runRiskJob({ userIds: ["u-bot1"] });
    assert.strictEqual(job.skipped, true);
    const fl = await req("GET", "/api/admin/antibot/flagged", { token: tok.admin });
    assert.strictEqual(fl.status, 503);
    assert.strictEqual(fl.body.code, "antibot_not_migrated");
    assert.strictEqual((await req("GET", "/api/admin/antibot/users/u-bot1", { token: tok.admin })).status, 503);
    assert.strictEqual((await req("GET", "/api/admin/antibot/status", { token: tok.admin })).status, 200);
    assert.ok(warns.every((w) => !w.includes("u-bot") && !w.includes("203.0.113")), "warnings carry no ids or IPs");
  } finally {
    console.warn = orig;
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
  console.log(`descoinAntibot integration: ${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();
