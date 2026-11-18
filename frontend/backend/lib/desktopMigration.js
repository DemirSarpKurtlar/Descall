"use strict";

/**
 * Electron -> Tauri desktop migration: rollout rules, the Ed25519-signed plan and the
 * readiness / outcome reports (docs: Rust-gecis-teknik-plan.md section 3).
 *
 * Everything is OFF by default: percent 0, empty allowlist, no artifacts, and without
 * DESKTOP_MIGRATION_PLAN_KEY no plan is signed at all (the Electron bridge only acts on a
 * plan whose signature matches the public key pinned in the app).
 *
 * Order of the decision (evaluate):
 *   kill switch -> Windows x64 only -> artifacts configured -> signing key present
 *   -> Windows build >= minWinBuild -> allowlist (user ids, the owner first) -> percent
 *   (stable bucket per user id, the same FNV-1a 64 as desktop/crates/descall-migrate
 *   plan.rs `bucket`).
 *
 * Storage: table desktop_migration_config (one row "default") and
 * desktop_migration_reports (supabase/migrations/20261118_desktop_migration.sql). Until
 * that migration is applied everything works from memory: the config stays at the OFF
 * defaults after a restart and reports are kept in a bounded ring buffer.
 */

const crypto = require("crypto");

const PLAN_VERSION = 1;
const DEFAULT_SALT = "descall-migration-v1";
const DEFAULT_MIN_WIN_BUILD = 19041;
const MAX_ALLOWLIST = 200;
const MEMORY_REPORTS = 500;
const CONFIG_CACHE_MS = 15_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/;
const INSTALL_ID_RE = /^[A-Za-z0-9-]{8,64}$/;
const MIGRATION_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const CODE_RE = /^[a-z0-9_,.-]{1,80}$/;
const VERSION_RE = /^[0-9A-Za-z.+-]{1,32}$/;
const ALLOWED_DOWNLOAD_HOSTS = new Set(["github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com", "descall.com", "www.descall.com", "api.descall.com", "cdn.descall.com"]);

/** Events the bridge, the migrator outcome and the new app may report. */
const EVENTS = Object.freeze([
  "offered", // a migrate plan was received and verified
  "unsupported_os", // build below the minimum (the bridge stays on Electron)
  "downloaded", // migrator + setup downloaded and verified (size + SHA-256)
  "handoff_ok", // the migrator sealed the handoff ("ready" to run)
  "handoff_failed",
  "started", // --run spawned, Electron quitting
  "done", // the new app is healthy (sent by the new app)
  "skipped", // nothing changed (preflight said no)
  "rollback_ok", // moved back to Electron, session intact
  "rollback_failed",
  "needs_help",
  "cleanup_done", // the 14-day .legacy removal
  "cleanup_failed",
]);
const STEPS = Object.freeze(["ready", "preflight", "wait_electron_exit", "snapshot_registry", "backup_install_dir", "install_new", "patch_shell", "launch_new", "await_health", "commit", "rollback", "done", "skipped", "needs_help"]);
const STRATEGIES = Object.freeze(["in_place", "side_by_side"]);

const DEFAULT_CONFIG = Object.freeze({
  killSwitch: false,
  percent: 0,
  allowlist: [],
  minWinBuild: DEFAULT_MIN_WIN_BUILD,
  salt: DEFAULT_SALT,
  migrator: null,
  setup: null,
  healthTimeoutSec: 180,
  planTtlSec: 3600,
  retryFailed: false,
});

/* ------------------------------------------------------------------ bucket */

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK64 = 0xffffffffffffffffn;

/** 0..9999, identical to plan.rs `bucket(id, salt)` (FNV-1a 64 over `salt:id`). */
function bucketOf(id, salt = DEFAULT_SALT) {
  if (!id) return null;
  let h = FNV_OFFSET;
  const bytes = Buffer.from(`${salt}:${String(id).trim().toLowerCase()}`, "utf8");
  for (const b of bytes) {
    h ^= BigInt(b);
    h = (h * FNV_PRIME) & MASK64;
  }
  return Number(h % 10000n);
}

/* ------------------------------------------------------------------ config */

function cleanArtifact(a, { setup = false } = {}) {
  if (a == null) return { value: null };
  if (typeof a !== "object") return { error: "bad_artifact" };
  let url;
  try {
    url = new URL(String(a.url || ""));
  } catch {
    return { error: "bad_artifact_url" };
  }
  if (url.protocol !== "https:" || !ALLOWED_DOWNLOAD_HOSTS.has(url.hostname)) return { error: "bad_artifact_url" };
  const sha256 = String(a.sha256 || "").toLowerCase();
  if (!SHA256_RE.test(sha256)) return { error: "bad_artifact_sha256" };
  const size = Number(a.size);
  if (!Number.isInteger(size) || size <= 0 || size > 512 * 1024 * 1024) return { error: "bad_artifact_size" };
  const out = { url: url.toString(), sha256, size };
  if (setup) {
    const version = String(a.version || "");
    if (!VERSION_RE.test(version)) return { error: "bad_setup_version" };
    out.version = version;
    const args = a.args == null ? ["/S", "/D={dir}"] : a.args;
    if (!Array.isArray(args) || !args.length || args.length > 16) return { error: "bad_setup_args" };
    for (let i = 0; i < args.length; i += 1) {
      const s = String(args[i]);
      if (!s || s.length > 200 || /["\0\n]/.test(s) || /[{}]/.test(s.replace(/\{dir\}/g, ""))) return { error: "bad_setup_args" };
      if (/^\/D=/i.test(s) && i !== args.length - 1) return { error: "bad_setup_args" };
    }
    if (!args.some((s) => String(s).includes("{dir}"))) return { error: "bad_setup_args" };
    out.args = args.map(String);
  }
  return { value: out };
}

/**
 * Merge `patch` into `current` with validation. Returns { config } or { error, field }.
 * Unknown keys are ignored.
 */
function applyPatch(current, patch) {
  const next = { ...DEFAULT_CONFIG, ...(current || {}) };
  const p = patch && typeof patch === "object" ? patch : {};
  if ("killSwitch" in p) {
    if (typeof p.killSwitch !== "boolean") return { error: "bad_kill_switch", field: "killSwitch" };
    next.killSwitch = p.killSwitch;
  }
  if ("percent" in p) {
    const n = Number(p.percent);
    if (!Number.isFinite(n) || n < 0 || n > 100) return { error: "bad_percent", field: "percent" };
    next.percent = Math.round(n * 100) / 100;
  }
  if ("allowlist" in p) {
    if (!Array.isArray(p.allowlist) || p.allowlist.length > MAX_ALLOWLIST) return { error: "bad_allowlist", field: "allowlist" };
    const ids = [...new Set(p.allowlist.map((x) => String(x || "").trim().toLowerCase()))];
    if (ids.some((x) => !UUID_RE.test(x))) return { error: "bad_allowlist", field: "allowlist" };
    next.allowlist = ids;
  }
  if ("minWinBuild" in p) {
    const n = Number(p.minWinBuild);
    if (!Number.isInteger(n) || n < 10240 || n > 99999) return { error: "bad_min_build", field: "minWinBuild" };
    next.minWinBuild = n;
  }
  if ("salt" in p) {
    const s = String(p.salt || "");
    if (!/^[A-Za-z0-9_-]{4,40}$/.test(s)) return { error: "bad_salt", field: "salt" };
    next.salt = s;
  }
  if ("healthTimeoutSec" in p) {
    const n = Number(p.healthTimeoutSec);
    if (!Number.isInteger(n) || n < 30 || n > 900) return { error: "bad_health_timeout", field: "healthTimeoutSec" };
    next.healthTimeoutSec = n;
  }
  if ("planTtlSec" in p) {
    const n = Number(p.planTtlSec);
    if (!Number.isInteger(n) || n < 300 || n > 86400) return { error: "bad_plan_ttl", field: "planTtlSec" };
    next.planTtlSec = n;
  }
  if ("retryFailed" in p) {
    if (typeof p.retryFailed !== "boolean") return { error: "bad_retry_failed", field: "retryFailed" };
    next.retryFailed = p.retryFailed;
  }
  if ("migrator" in p) {
    const r = cleanArtifact(p.migrator);
    if (r.error) return { error: r.error, field: "migrator" };
    next.migrator = r.value;
  }
  if ("setup" in p) {
    const r = cleanArtifact(p.setup, { setup: true });
    if (r.error) return { error: r.error, field: "setup" };
    next.setup = r.value;
  }
  return { config: next };
}

/** A stored row is re-validated (a hand-edited row must not switch anything on by mistake). */
function normalizeStored(raw) {
  const r = applyPatch(DEFAULT_CONFIG, raw && typeof raw === "object" ? raw : {});
  return r.config || { ...DEFAULT_CONFIG };
}

/* ------------------------------------------------------------------ decision */

function parseClientQuery(q = {}) {
  const installId = String(q.installId || "");
  const build = Number(q.build);
  return {
    installId: INSTALL_ID_RE.test(installId) ? installId : null,
    winBuild: Number.isInteger(build) && build > 0 && build < 1_000_000 ? build : null,
    version: VERSION_RE.test(String(q.v || "")) ? String(q.v) : null,
    arch: String(q.arch || "x64"),
    platform: String(q.platform || "win32"),
  };
}

/**
 * { action: "migrate" | "none", reason, wave }. `signingReady` = a key is configured.
 */
function evaluate(config, ctx) {
  const c = config || DEFAULT_CONFIG;
  const none = (reason) => ({ action: "none", reason, wave: null });
  if (c.killSwitch) return none("kill_switch");
  if (ctx.platform !== "win32" || ctx.arch !== "x64") return none("unsupported_platform");
  if (!ctx.installId) return none("bad_install_id");
  if (!c.migrator || !c.setup) return none("not_configured");
  if (!ctx.signingReady) return none("unsigned");
  if (!ctx.winBuild || ctx.winBuild < c.minWinBuild) return none("windows_too_old");
  const uid = String(ctx.userId || "").toLowerCase();
  if (uid && c.allowlist.includes(uid)) return { action: "migrate", reason: "allowlist", wave: "allowlist" };
  const bp = Math.round(Number(c.percent || 0) * 100);
  const b = bucketOf(uid, c.salt);
  if (b !== null && bp > 0 && b < bp) return { action: "migrate", reason: "percent", wave: `percent:${c.percent}` };
  return none("not_in_wave");
}

/** Stable per user + install + setup: retries of the same move share one id. */
function migrationIdFor(userId, installId, setupSha) {
  const h = crypto.createHash("sha256").update(`${userId}:${installId}:${setupSha || ""}`).digest("hex");
  return `mig-${h.slice(0, 24)}`;
}

function buildPlan(config, ctx, decision, nowSec = Math.floor(Date.now() / 1000)) {
  const base = {
    v: PLAN_VERSION,
    action: decision.action,
    reason: decision.reason,
    installId: ctx.installId,
    userId: ctx.userId || null,
    issuedAt: nowSec,
    expiresAt: nowSec + (config.planTtlSec || DEFAULT_CONFIG.planTtlSec),
  };
  if (decision.action !== "migrate") return base;
  return {
    ...base,
    wave: decision.wave,
    migrationId: migrationIdFor(ctx.userId, ctx.installId, config.setup.sha256),
    minWinBuild: config.minWinBuild,
    healthTimeoutSec: config.healthTimeoutSec,
    retryFailed: Boolean(config.retryFailed),
    migrator: { url: config.migrator.url, sha256: config.migrator.sha256, size: config.migrator.size },
    setup: { url: config.setup.url, sha256: config.setup.sha256, size: config.setup.size, version: config.setup.version, args: config.setup.args },
  };
}

/* ------------------------------------------------------------------ signing */

let keyCache = { raw: undefined, key: null };

/**
 * DESKTOP_MIGRATION_PLAN_KEY: the Ed25519 private key, PEM ("-----BEGIN PRIVATE KEY-----")
 * or base64 PKCS#8 DER. Never committed; scripts/desktopMigrationKeygen.cjs makes one.
 * Returns { privateKey, publicKeySpki (base64 DER), keyId } or null.
 */
function signingKey(env = process.env) {
  const raw = String(env.DESKTOP_MIGRATION_PLAN_KEY || "").trim();
  if (keyCache.raw === raw) return keyCache.key;
  let key = null;
  if (raw) {
    try {
      const privateKey = raw.includes("BEGIN")
        ? crypto.createPrivateKey(raw.replace(/\\n/g, "\n"))
        : crypto.createPrivateKey({ key: Buffer.from(raw, "base64"), format: "der", type: "pkcs8" });
      if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("not ed25519");
      const spki = crypto.createPublicKey(privateKey).export({ format: "der", type: "spki" });
      key = { privateKey, publicKeySpki: spki.toString("base64"), keyId: crypto.createHash("sha256").update(spki).digest("hex").slice(0, 16) };
    } catch (err) {
      console.error("[desktop-migration] DESKTOP_MIGRATION_PLAN_KEY is not a usable Ed25519 private key:", err?.message || err);
      key = null;
    }
  }
  keyCache = { raw, key };
  return key;
}

/** Base64 Ed25519 signature over the exact UTF-8 body bytes. */
function signBody(body, key) {
  return crypto.sign(null, Buffer.from(body, "utf8"), key.privateKey).toString("base64");
}

function verifyBody(body, sigB64, publicKeySpkiB64) {
  try {
    const pub = crypto.createPublicKey({ key: Buffer.from(publicKeySpkiB64, "base64"), format: "der", type: "spki" });
    return crypto.verify(null, Buffer.from(body, "utf8"), pub, Buffer.from(String(sigB64 || ""), "base64"));
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ reports */

function clampInt(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/** Whitelisted report row, or { error }. */
function cleanReport(body, userId) {
  const b = body && typeof body === "object" ? body : {};
  const event = String(b.event || "");
  if (!EVENTS.includes(event)) return { error: "bad_event" };
  const installId = String(b.installId || "");
  if (!INSTALL_ID_RE.test(installId)) return { error: "bad_install_id" };
  const migrationId = b.migrationId == null || b.migrationId === "" ? null : String(b.migrationId);
  if (migrationId !== null && !MIGRATION_ID_RE.test(migrationId)) return { error: "bad_migration_id" };
  const step = b.step == null ? null : String(b.step);
  if (step !== null && !STEPS.includes(step)) return { error: "bad_step" };
  const code = b.code == null || b.code === "" ? null : String(b.code).toLowerCase().slice(0, 80);
  if (code !== null && !CODE_RE.test(code)) return { error: "bad_code" };
  const strategy = b.strategy == null ? null : String(b.strategy);
  if (strategy !== null && !STRATEGIES.includes(strategy)) return { error: "bad_strategy" };
  const steps = Array.isArray(b.steps)
    ? b.steps
        .slice(0, 40)
        .filter((s) => s && STEPS.includes(String(s.step)))
        .map((s) => ({ step: String(s.step), ok: Boolean(s.ok), ms: clampInt(s.ms, 0, 3_600_000) || 0 }))
    : [];
  const ver = (v) => (VERSION_RE.test(String(v || "")) ? String(v) : null);
  return {
    row: {
      user_id: userId || null,
      install_id: installId,
      migration_id: migrationId,
      event,
      step,
      code,
      duration_ms: b.durationMs == null ? null : clampInt(b.durationMs, 0, 86_400_000),
      strategy,
      per_machine: typeof b.perMachine === "boolean" ? b.perMachine : null,
      resumes: b.resumes == null ? null : clampInt(b.resumes, 0, 100),
      win_build: b.winBuild == null ? null : clampInt(b.winBuild, 0, 999_999),
      app_version: ver(b.appVersion),
      electron_version: ver(b.electronVersion),
      steps,
    },
  };
}

/** Counters for the admin console from report rows (newest first). */
function summarize(rows, nowMs = Date.now()) {
  const byEvent = Object.fromEntries(EVENTS.map((e) => [e, 0]));
  const last24h = Object.fromEntries(EVENTS.map((e) => [e, 0]));
  const codes = new Map();
  const failedSteps = new Map();
  const strategies = { in_place: 0, side_by_side: 0 };
  let perMachine = 0;
  const durations = [];
  for (const r of rows) {
    if (!(r.event in byEvent)) continue;
    byEvent[r.event] += 1;
    if (nowMs - Date.parse(r.created_at || 0) < 24 * 3600_000) last24h[r.event] += 1;
    if (r.code && ["handoff_failed", "skipped", "rollback_ok", "rollback_failed", "needs_help", "cleanup_failed"].includes(r.event)) codes.set(r.code, (codes.get(r.code) || 0) + 1);
    if (r.step && ["rollback_ok", "rollback_failed", "needs_help", "skipped"].includes(r.event)) failedSteps.set(r.step, (failedSteps.get(r.step) || 0) + 1);
    if (r.event === "done") {
      if (r.strategy in strategies) strategies[r.strategy] += 1;
      if (r.per_machine) perMachine += 1;
      if (Number.isFinite(r.duration_ms)) durations.push(r.duration_ms);
    }
  }
  const finished = byEvent.done + byEvent.rollback_ok + byEvent.rollback_failed + byEvent.needs_help;
  const rollbacks = byEvent.rollback_ok + byEvent.rollback_failed + byEvent.needs_help;
  const rate = (a, b) => (b ? Math.round((a / b) * 10000) / 100 : null);
  durations.sort((a, b) => a - b);
  const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([key, count]) => ({ key, count }));
  return {
    byEvent,
    last24h,
    funnel: { offered: byEvent.offered, downloaded: byEvent.downloaded, handoffOk: byEvent.handoff_ok, started: byEvent.started, done: byEvent.done },
    successRate: rate(byEvent.done, finished),
    rollbackSuccessRate: rate(byEvent.rollback_ok, rollbacks),
    // Gate for the next wave (plan 3.6): success >= 99.0 %, rollback success >= 99.9 %.
    gate: {
      successOk: finished >= 20 ? rate(byEvent.done, finished) >= 99 : null,
      rollbackOk: rollbacks >= 1 ? rate(byEvent.rollback_ok, rollbacks) >= 99.9 : null,
      sample: finished,
    },
    topCodes: top(codes),
    failedSteps: top(failedSteps),
    strategies,
    perMachine,
    medianDoneMs: durations.length ? durations[Math.floor(durations.length / 2)] : null,
  };
}

/* ------------------------------------------------------------------ store */

function isMissingTable(err) {
  const msg = String(err?.message || "");
  return err?.code === "42P01" || err?.code === "PGRST205" || /does not exist|could not find the table/i.test(msg);
}

function createStore(db) {
  let memoryConfig = { ...DEFAULT_CONFIG };
  let cache = null; // { at, config, persisted }
  const memoryReports = [];
  let configTable = true;
  let reportsTable = true;

  async function getConfig({ fresh = false } = {}) {
    if (!fresh && cache && Date.now() - cache.at < CONFIG_CACHE_MS) return cache;
    let out = { config: memoryConfig, persisted: false };
    if (configTable) {
      try {
        const { data, error } = await db().from("desktop_migration_config").select("id, config, updated_at, updated_by").eq("id", "default").maybeSingle();
        if (error) {
          if (isMissingTable(error)) configTable = false;
          else throw error;
        } else {
          out = { config: data ? normalizeStored(data.config) : { ...DEFAULT_CONFIG }, persisted: true, updatedAt: data?.updated_at || null, updatedBy: data?.updated_by || null };
          memoryConfig = out.config;
        }
      } catch (err) {
        // Database trouble: fall back to the last known config, never to "on".
        console.warn("[desktop-migration] config read failed:", err?.message || err);
        out = { config: cache?.config || memoryConfig, persisted: false };
      }
    }
    cache = { ...out, at: Date.now() };
    return cache;
  }

  async function saveConfig(config, actorId) {
    memoryConfig = config;
    let persisted = false;
    if (configTable) {
      const { error } = await db()
        .from("desktop_migration_config")
        .upsert({ id: "default", config, updated_at: new Date().toISOString(), updated_by: actorId || null }, { onConflict: "id" });
      if (error) {
        if (isMissingTable(error)) configTable = false;
        else throw error;
      } else persisted = true;
    }
    cache = { config, persisted, at: Date.now() };
    return cache;
  }

  async function addReport(row) {
    const withTime = { ...row, created_at: new Date().toISOString() };
    if (reportsTable) {
      try {
        const { error } = await db().from("desktop_migration_reports").insert(withTime);
        if (!error) return "db";
        if (isMissingTable(error)) reportsTable = false;
        else console.warn("[desktop-migration] report insert failed:", error.message || error);
      } catch (err) {
        console.warn("[desktop-migration] report insert failed:", err?.message || err);
      }
    }
    memoryReports.unshift(withTime);
    if (memoryReports.length > MEMORY_REPORTS) memoryReports.length = MEMORY_REPORTS;
    return "memory";
  }

  async function listReports({ sinceMs = 30 * 24 * 3600_000, limit = 2000 } = {}) {
    const since = new Date(Date.now() - sinceMs).toISOString();
    let rows = [];
    let source = "memory";
    if (reportsTable) {
      try {
        const { data, error } = await db().from("desktop_migration_reports").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(limit);
        if (error) {
          if (isMissingTable(error)) reportsTable = false;
          else throw error;
        } else {
          rows = data || [];
          source = "db";
        }
      } catch (err) {
        console.warn("[desktop-migration] report read failed:", err?.message || err);
      }
    }
    const mem = memoryReports.filter((r) => r.created_at >= since);
    return { rows: [...mem, ...rows].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, limit), source };
  }

  function resetForTests() {
    memoryConfig = { ...DEFAULT_CONFIG };
    cache = null;
    memoryReports.length = 0;
    configTable = true;
    reportsTable = true;
  }

  return { getConfig, saveConfig, addReport, listReports, resetForTests, status: () => ({ configTable, reportsTable }) };
}

module.exports = {
  PLAN_VERSION,
  DEFAULT_CONFIG,
  DEFAULT_SALT,
  EVENTS,
  STEPS,
  UUID_RE,
  bucketOf,
  applyPatch,
  normalizeStored,
  parseClientQuery,
  evaluate,
  migrationIdFor,
  buildPlan,
  signingKey,
  signBody,
  verifyBody,
  cleanReport,
  summarize,
  createStore,
  isMissingTable,
};
