"use strict";

/**
 * Desktop migration (Electron -> Tauri) over real HTTP with the fake Supabase:
 * OFF by default, the signed plan (Ed25519, a key generated here at runtime: no key is
 * ever committed), allowlist first then percent, kill switch, minimum Windows build,
 * readiness / outcome reports, the admin console (system section, step-up, reason,
 * audit) and the "migration not applied yet" fallback. The bucket test vector is the
 * same as desktop/crates/descall-migrate/src/plan.rs.
 *   node backend/test/desktopMigration.integration.test.cjs
 */

process.env.NODE_ENV = "test";
process.env.PASSWORD_HIBP = "0";
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.JWT_EXPIRES_IN = "7d";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
delete process.env.DESKTOP_MIGRATION_PLAN_KEY;

const crypto = require("crypto");
const http = require("http");
const { createFakeSupabase } = require("./fakeSupabase.cjs");

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OWNER = id(1);
const SYSADMIN = id(2);
const REPORTSADMIN = id(3);
const ELIF = id(10);
const MERT = id(11);
const TOTP_ON = { totp_enabled_at: "2026-10-01T00:00:00.000Z", totp_secret_enc: "enc" };
const user = (uid, username, extra = {}) => ({ id: uid, username, display_name: username, is_admin: false, active_sessions: [{ id: `s-${username}` }], language: "tr", created_at: "2025-01-01T00:00:00.000Z", ...extra });

const fake = createFakeSupabase({
  users: [
    user(OWNER, "admin", { is_admin: true, ...TOTP_ON }),
    user(SYSADMIN, "demir", { is_admin: true, admin_permissions: ["system"], ...TOTP_ON }),
    user(REPORTSADMIN, "other", { is_admin: true, admin_permissions: ["reports"], ...TOTP_ON }),
    user(ELIF, "elifk"),
    user(MERT, "mert"),
  ],
  admin_audit: [],
  desktop_migration_config: [],
  desktop_migration_reports: [],
});
const supabasePath = require.resolve("../db/supabase");
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };

const express = require("express");
const { signToken, signStepUpToken } = require("../config/jwt");
const adminRouter = require("../routes/admin");
const clientRouter = require("../routes/desktopMigration");
const dm = require("../lib/desktopMigration");
const store = require("../runtime/desktopMigrationStore");
const state = require("../runtime/sharedState");
const { resetLimits } = require("../lib/rateLimit");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

const session = (uid, username) => signToken({ id: uid, username, sid: `s-${username}` });
const stepUpFor = (uid, username) => signStepUpToken({ id: uid, sid: `s-${username}` });

async function call(base, method, path, { body, token, stepUp } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(stepUp ? { "X-Admin-Step-Up": stepUp } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  let json = {};
  try {
    json = JSON.parse(raw);
  } catch {
    json = {};
  }
  return { status: res.status, body: json, raw, headers: res.headers };
}

const ARTIFACTS = {
  migrator: { url: "https://github.com/DemirSarpKurtlar/Descall/releases/download/v4.0.0/DescallMigrator.exe", sha256: "a".repeat(64), size: 740352 },
  setup: { url: "https://github.com/DemirSarpKurtlar/Descall/releases/download/v4.0.0/Descall-Setup-4.0.0.exe", sha256: "b".repeat(64), size: 9_500_000, version: "4.0.0" },
};
const Q = "?installId=3f2c9a1e-1111-4222&v=3.10.0&build=22631&arch=x64&platform=win32";

function unitTests() {
  /* bucket: same FNV-1a 64 as plan.rs, same test vector */
  assert(dm.bucketOf("00000000-0000-4000-8000-000000000001", "descall-migration-v1") === 2249, "Rust/JS bucket vector");
  assert(dm.bucketOf(" ABC ", "s") === dm.bucketOf("abc", "s"), "trimmed, case-insensitive");
  let inWave = 0;
  for (let i = 0; i < 10000; i += 1) if (dm.bucketOf(id(1000 + i), "x") < 500) inWave += 1;
  assert(inWave > 400 && inWave < 600, "5 % is about 5 %: " + inWave);

  /* defaults are OFF */
  assert(dm.DEFAULT_CONFIG.percent === 0 && dm.DEFAULT_CONFIG.allowlist.length === 0 && !dm.DEFAULT_CONFIG.migrator, "OFF by default");
  const ctx = { installId: "3f2c9a1e-1111-4222", winBuild: 22631, arch: "x64", platform: "win32", userId: OWNER, signingReady: true };
  assert(dm.evaluate(dm.DEFAULT_CONFIG, ctx).reason === "not_configured", "default config never migrates");

  /* validation */
  const bad = [
    { percent: 101 },
    { percent: -1 },
    { percent: "x" },
    { allowlist: ["not-a-uuid"] },
    { killSwitch: "yes" },
    { minWinBuild: 5 },
    { migrator: { ...ARTIFACTS.migrator, url: "http://github.com/x.exe" } },
    { migrator: { ...ARTIFACTS.migrator, url: "https://evil.example/x.exe" } },
    { migrator: { ...ARTIFACTS.migrator, sha256: "z".repeat(64) } },
    { migrator: { ...ARTIFACTS.migrator, sha256: "a".repeat(63) } },
    { setup: { ...ARTIFACTS.setup, args: ["/D={dir}", "/S"] } },
    { setup: { ...ARTIFACTS.setup, args: ["/S", "\"{dir}\""] } },
    { setup: { ...ARTIFACTS.setup, args: ["/S"] } },
    { setup: { ...ARTIFACTS.setup, version: "" } },
  ];
  for (const p of bad) assert(dm.applyPatch(dm.DEFAULT_CONFIG, p).error, "rejects " + JSON.stringify(p));
  const ok = dm.applyPatch(dm.DEFAULT_CONFIG, { ...ARTIFACTS, percent: 12.345, allowlist: [OWNER.toUpperCase(), OWNER] }).config;
  assert(ok.percent === 12.35 && ok.allowlist.length === 1 && ok.allowlist[0] === OWNER, "normalised");
  assert(ok.setup.args.join(" ") === "/S /D={dir}", "NSIS args default");
  assert(dm.normalizeStored({ percent: 500, killSwitch: "x" }).percent === 0, "a bad stored row falls back to OFF");

  /* decision order */
  const on = { ...ok, allowlist: [OWNER], percent: 0 };
  assert(dm.evaluate(on, ctx).action === "migrate" && dm.evaluate(on, ctx).wave === "allowlist", "allowlist first");
  assert(dm.evaluate(on, { ...ctx, userId: ELIF }).reason === "not_in_wave", "others wait");
  assert(dm.evaluate({ ...on, killSwitch: true }, ctx).reason === "kill_switch", "kill switch beats the allowlist");
  assert(dm.evaluate(on, { ...ctx, winBuild: 18363 }).reason === "windows_too_old", "minimum build");
  assert(dm.evaluate(on, { ...ctx, arch: "arm64" }).reason === "unsupported_platform", "x64 only");
  assert(dm.evaluate(on, { ...ctx, signingReady: false }).reason === "unsigned", "no key, no plan");
  assert(dm.evaluate({ ...on, percent: 100 }, { ...ctx, userId: ELIF }).wave === "percent:100", "percent");
  // Raising the percent only adds users.
  for (let i = 0; i < 300; i += 1) {
    const c = { ...ctx, userId: id(5000 + i) };
    if (dm.evaluate({ ...on, percent: 10 }, c).action === "migrate") assert(dm.evaluate({ ...on, percent: 30 }, c).action === "migrate", "10 -> 30 keeps the first 10 %");
  }

  /* reports */
  assert(dm.cleanReport({ event: "nope", installId: "3f2c9a1e-1111" }).error === "bad_event", "event whitelist");
  assert(dm.cleanReport({ event: "done", installId: "x" }).error === "bad_install_id", "install id");
  assert(dm.cleanReport({ event: "done", installId: "3f2c9a1e-1111", step: "rm -rf" }).error === "bad_step", "step whitelist");
  const r = dm.cleanReport({ event: "rollback_ok", installId: "3f2c9a1e-1111", step: "install_new", code: "SETUP_EXIT_2", durationMs: 1e12, steps: [{ step: "preflight", ok: true, ms: 5 }, { step: "evil" }], extra: "dropped" }, OWNER).row;
  assert(r.code === "setup_exit_2" && r.duration_ms === 86_400_000 && r.steps.length === 1 && !("extra" in r), "report cleaned");

  /* summary + gate */
  const rows = [
    ...Array.from({ length: 30 }, () => ({ event: "done", strategy: "in_place", duration_ms: 40000, created_at: new Date().toISOString() })),
    { event: "rollback_ok", code: "setup_exit_2", step: "install_new", created_at: new Date().toISOString() },
  ];
  const s = dm.summarize(rows);
  assert(s.byEvent.done === 30 && s.successRate === 96.77 && s.gate.successOk === false && s.gate.rollbackOk === true, "summary " + JSON.stringify(s.gate));
  assert(s.topCodes[0].key === "setup_exit_2" && s.failedSteps[0].key === "install_new", "failure reasons");
}

async function missingTablesFallback() {
  const missing = createFakeSupabase({}, { missingTables: ["desktop_migration_config", "desktop_migration_reports"] });
  const s = dm.createStore(() => missing);
  const c = await s.getConfig();
  assert(c.config.percent === 0 && !c.persisted, "unapplied migration: OFF, from memory");
  const saved = await s.saveConfig({ ...dm.DEFAULT_CONFIG, percent: 5 }, OWNER);
  assert(!saved.persisted && (await s.getConfig({ fresh: true })).config.percent === 5, "admin change still works in memory");
  assert((await s.addReport({ event: "done", install_id: "3f2c9a1e-1111" })) === "memory", "reports in memory");
  const l = await s.listReports();
  assert(l.rows.length === 1 && l.source === "memory", "memory reports listed");
  for (let i = 0; i < 600; i += 1) await s.addReport({ event: "offered", install_id: "3f2c9a1e-1111" });
  assert((await s.listReports()).rows.length === 500, "ring buffer bounded");
}

async function run() {
  unitTests();
  await missingTablesFallback();

  const app = express();
  app.use(express.json());
  app.use("/api/admin", adminRouter);
  app.use("/api/desktop/migration", clientRouter);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const owner = session(OWNER, "admin");
  const ownerStep = stepUpFor(OWNER, "admin");
  const sys = session(SYSADMIN, "demir");
  const sysStep = stepUpFor(SYSADMIN, "demir");
  const elif = session(ELIF, "elifk");
  const mert = session(MERT, "mert");
  const A = "/api/admin/desktop-migration";
  const P = "/api/desktop/migration/plan";
  store.resetForTests();
  try {
    /* ---- plan needs a session; OFF by default ---- */
    let r = await call(base, "GET", P + Q);
    assert(r.status === 401, "plan needs auth");
    r = await call(base, "GET", P + Q, { token: owner });
    assert(r.status === 200 && r.body.action === "none" && r.body.reason === "not_configured", "OFF by default: " + r.raw);
    assert(!r.headers.get("x-descall-plan-sig"), "no key configured: nothing signed");
    assert(r.headers.get("cache-control") === "no-store", "no caching");

    /* ---- admin gate ---- */
    r = await call(base, "GET", A, { token: elif });
    assert(r.status === 403, "users refused");
    r = await call(base, "GET", A, { token: session(REPORTSADMIN, "other") });
    assert(r.status === 403, "admins without the system section refused");
    r = await call(base, "GET", A, { token: sys });
    assert(r.status === 200 && r.body.config.percent === 0 && r.body.config.allowlist.length === 0 && r.body.signing.configured === false, "overview " + r.raw);
    assert(r.body.persisted === true && r.body.storage.configTable === true && fake._tables.desktop_migration_config.rows.length === 0, "table there, no row yet: defaults");

    /* ---- writes: reason + step-up ---- */
    r = await call(base, "PATCH", A, { token: sys, stepUp: sysStep, body: { patch: ARTIFACTS } });
    assert(r.status === 400 && r.body.code === "reason_required" && r.body.error, "reason required");
    r = await call(base, "PATCH", A, { token: sys, body: { patch: ARTIFACTS, reason: "artefacts for 4.0.0" } });
    assert(r.status === 403 && r.body.code === "STEP_UP_REQUIRED", "step-up required");
    r = await call(base, "PATCH", A, { token: sys, stepUp: sysStep, body: { patch: { percent: 300 }, reason: "typo" } });
    assert(r.status === 400 && r.body.code === "bad_percent" && r.body.field === "percent", "validation");
    r = await call(base, "PATCH", A, { token: sys, stepUp: sysStep, body: { patch: ARTIFACTS, reason: "artefacts for 4.0.0" } });
    assert(r.status === 200 && r.body.persisted === true && r.body.config.setup.version === "4.0.0", "artifacts saved " + r.raw);
    assert(fake._tables.desktop_migration_config.rows.length === 1, "stored row");
    assert(state.auditLog.some((e) => e.action === "desktop_migration_update" && e.meta.reason === "artefacts for 4.0.0"), "audited");

    /* ---- still nothing without a signing key ---- */
    r = await call(base, "GET", P + Q, { token: owner });
    assert(r.body.action === "none" && r.body.reason === "unsigned" && !r.headers.get("x-descall-plan-sig"), "unsigned: " + r.raw);

    /* ---- a test key, generated now ---- */
    const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
    process.env.DESKTOP_MIGRATION_PLAN_KEY = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
    const spki = publicKey.export({ format: "der", type: "spki" }).toString("base64");

    r = await call(base, "GET", P + Q, { token: owner });
    assert(r.body.action === "none" && r.body.reason === "not_in_wave", "key but empty allowlist and 0 %: " + r.raw);
    let sig = r.headers.get("x-descall-plan-sig");
    assert(sig && dm.verifyBody(r.raw, sig, spki), "even 'none' is signed");

    /* ---- owner first, via the allowlist (by username) ---- */
    r = await call(base, "POST", `${A}/allowlist`, { token: owner, stepUp: ownerStep, body: { user: "nobody-here", op: "add", reason: "owner test" } });
    assert(r.status === 404, "unknown user");
    r = await call(base, "POST", `${A}/allowlist`, { token: owner, stepUp: ownerStep, body: { user: "admin", op: "add", reason: "owner test" } });
    assert(r.status === 200 && r.body.config.allowlist.includes(OWNER), "owner allowlisted " + r.raw);
    r = await call(base, "GET", P + Q, { token: owner });
    sig = r.headers.get("x-descall-plan-sig");
    assert(r.body.action === "migrate" && r.body.wave === "allowlist", "owner migrates: " + r.raw);
    assert(dm.verifyBody(r.raw, sig, spki), "signature verifies against the exact bytes");
    assert(!dm.verifyBody(r.raw.replace("allowlist", "allowlisT"), sig, spki), "tampered body fails");
    assert(r.body.installId === "3f2c9a1e-1111-4222" && r.body.userId === OWNER && /^mig-[0-9a-f]{24}$/.test(r.body.migrationId), "bound to the install and user");
    assert(r.body.setup.sha256 === "b".repeat(64) && r.body.migrator.size === 740352 && r.body.minWinBuild === 19041, "artifacts in the plan");
    assert(r.body.expiresAt - r.body.issuedAt === 3600, "plan expires");
    const again = await call(base, "GET", P + Q, { token: owner });
    assert(again.body.migrationId === r.body.migrationId, "stable migration id for retries");
    r = await call(base, "GET", P + Q.replace("22631", "18363"), { token: owner });
    assert(r.body.reason === "windows_too_old", "old Windows stays on Electron");
    r = await call(base, "GET", P + Q, { token: elif });
    assert(r.body.action === "none", "everyone else still waits");

    /* ---- preview ---- */
    r = await call(base, "GET", `${A}/preview?user=elifk`, { token: sys });
    assert(r.status === 200 && r.body.decision.reason === "not_in_wave" && Number.isInteger(r.body.bucket), "preview");

    /* ---- percent, then the kill switch ---- */
    r = await call(base, "PATCH", A, { token: sys, stepUp: sysStep, body: { patch: { percent: 100 }, reason: "full wave" } });
    assert(r.status === 200, "percent saved");
    r = await call(base, "GET", P + Q, { token: elif });
    assert(r.body.action === "migrate" && r.body.wave === "percent:100", "percent reaches others");
    r = await call(base, "POST", `${A}/kill`, { token: sys, stepUp: sysStep, body: { on: true } });
    assert(r.status === 400 && r.body.code === "reason_required", "kill needs a reason");
    r = await call(base, "POST", `${A}/kill`, { token: sys, stepUp: sysStep, body: { on: true, reason: "rollback spike" } });
    assert(r.status === 200 && r.body.config.killSwitch === true, "killed");
    for (const t of [owner, elif, mert]) {
      r = await call(base, "GET", P + Q, { token: t });
      assert(r.body.action === "none" && r.body.reason === "kill_switch", "kill switch stops everyone at once");
    }
    assert(state.auditLog.some((e) => e.action === "desktop_migration_kill"), "kill audited");

    /* ---- reports ---- */
    const rep = (event, extra = {}) => ({ installId: "3f2c9a1e-1111-4222", migrationId: "mig-0123456789abcdef01234567", event, winBuild: 22631, electronVersion: "3.10.0", ...extra });
    r = await call(base, "POST", "/api/desktop/migration/report", { body: rep("offered") });
    assert(r.status === 401, "reports need auth");
    r = await call(base, "POST", "/api/desktop/migration/report", { token: elif, body: rep("bogus") });
    assert(r.status === 400 && r.body.code === "bad_event" && r.body.error, "bad event");
    for (const ev of ["offered", "downloaded", "handoff_ok", "started"]) {
      r = await call(base, "POST", "/api/desktop/migration/report", { token: elif, body: rep(ev) });
      assert(r.status === 200 && r.body.stored === "db", ev);
    }
    r = await call(base, "POST", "/api/desktop/migration/report", { token: elif, body: rep("done", { strategy: "in_place", durationMs: 41000, appVersion: "4.0.0", steps: [{ step: "install_new", ok: true, ms: 30000 }] }) });
    assert(r.status === 200, "done stored");
    r = await call(base, "POST", "/api/desktop/migration/report", { token: mert, body: rep("rollback_ok", { step: "await_health", code: "health_timeout", strategy: "side_by_side", perMachine: true }) });
    assert(r.status === 200, "rollback stored");
    const rows = fake._tables.desktop_migration_reports.rows;
    assert(rows.length === 6 && rows.every((x) => x.user_id), "rows with user ids");

    r = await call(base, "GET", A, { token: sys });
    const sum = r.body.summary;
    assert(sum.funnel.offered === 1 && sum.funnel.done === 1 && sum.byEvent.rollback_ok === 1, "funnel " + JSON.stringify(sum.funnel));
    assert(sum.successRate === 50 && sum.topCodes[0].key === "health_timeout", "rates and reasons");
    assert(r.body.recent.length === 6 && r.body.recent[0].event, "recent list");
    assert(r.body.signing.configured && r.body.signing.publicKeySpki === spki, "public key shown for pinning");
    assert(r.body.allowlistUsers[0].username === "admin", "allowlist with usernames");

    /* ---- report rate limit ---- */
    resetLimits();
    let limited = false;
    for (let i = 0; i < 130 && !limited; i += 1) {
      const x = await call(base, "POST", "/api/desktop/migration/report", { token: mert, body: rep("offered") });
      if (x.status === 429) limited = true;
    }
    assert(limited, "reports are rate limited per user");

    /* ---- remove from allowlist, resume ---- */
    r = await call(base, "POST", `${A}/allowlist`, { token: owner, stepUp: ownerStep, body: { user: OWNER, op: "remove", reason: "done testing" } });
    assert(r.status === 200 && !r.body.config.allowlist.includes(OWNER), "removed");
    r = await call(base, "POST", `${A}/kill`, { token: owner, stepUp: ownerStep, body: { on: false, reason: "resume" } });
    assert(r.status === 200 && r.body.config.killSwitch === false, "resumed");

    /* ---- a broken key never signs ---- */
    process.env.DESKTOP_MIGRATION_PLAN_KEY = "not-a-key";
    r = await call(base, "GET", P + Q, { token: elif });
    assert(r.body.reason === "unsigned" && !r.headers.get("x-descall-plan-sig"), "bad key: unsigned");
  } finally {
    delete process.env.DESKTOP_MIGRATION_PLAN_KEY;
    server.close();
  }
}

run().then(
  () => {
    console.log("desktopMigration.integration.test ok");
    process.exit(0);
  },
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
