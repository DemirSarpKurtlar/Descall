"use strict";

/**
 * Cloudflare Turnstile: the human check in front of account creation, password reset
 * and (after repeated wrong passwords) sign-in. Free; provisioned by
 * .github/workflows/cloudflare-turnstile.yml without anyone touching a dashboard.
 *
 * Keys (first match wins):
 *   1. env TURNSTILE_SITE_KEY + TURNSTILE_SECRET_KEY (manual override, e.g. test keys)
 *   2. public.turnstile_config row 'default' (written by the workflow, re-read every 60 s)
 *   Neither: not configured. Every check is skipped; the app works as before.
 *
 * Mode (Güvenlik Merkezi "İnsan doğrulaması", system_settings.config.turnstileMode,
 * changes without a deploy): enforce (default) | monitor (verify and count, never refuse)
 * | off. env TURNSTILE_ENFORCE overrides it: 0/false/off, monitor, 1/true/enforce.
 *
 * Decision for one protected request (gate()):
 *   token valid                         -> allowed            (pass)
 *   token refused by Cloudflare / wrong hostname or action
 *                                       -> 403 turnstile_failed (fail); monitor: allowed
 *   Cloudflare unreachable, 5 s timeout, internal error, bad secret
 *                                       -> allowed, logged     (failOpen): an outage never
 *                                          blocks real people
 *   no token (widget could not load in this app / browser, cancelled script, old app
 *   version that does not know Turnstile)
 *                                       -> allowed while the fallback budget lasts
 *                                          (fallback): TURNSTILE_FALLBACK_PER_IP per address
 *                                          per hour (3) and TURNSTILE_FALLBACK_GLOBAL per
 *                                          hour for everyone (60); after that
 *                                          428 turnstile_required (blocked)
 * The rule is the same on every platform (web, iOS, Android, Electron, Tauri); the
 * client says why it has no token (`turnstileUnavailable`), which is logged only.
 * A current client also sends `turnstileClient: 1`; when such a request has neither a
 * token nor a reason the answer is 428 turnstile_required without touching the budget
 * (challenged), so the client runs the check and sends the request again.
 *
 * Sign-in is checked only as a step-up: after TURNSTILE_STEPUP_IP (5) wrong passwords
 * from one address or TURNSTILE_STEPUP_ACCOUNT (3) on one account name in 15 minutes
 * (the same counters lib/rateLimit.js keeps for the sign-in limiter). Rate limits are
 * unchanged and still apply first.
 *
 * Nothing secret is logged: no token, no secret, no address.
 */

const crypto = require("crypto");
const stats = require("./turnstileStats");
const { apiError } = require("./apiError");

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const VERIFY_TIMEOUT_MS = 5000;
const CONFIG_TTL_MS = 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const STEPUP_WINDOW_MS = 15 * 60 * 1000;
const MODES = Object.freeze(["enforce", "monitor", "off"]);
const ACTIONS = Object.freeze(["register", "login", "password_reset", "social_signup"]);
/** Web hostnames the widget runs on, plus the API hosts that serve the in-app bridge page. */
const DEFAULT_HOSTNAMES = Object.freeze([
  "descall.com",
  "www.descall.com",
  "des-call.onrender.com",
  "api.descall.com",
  "des-call-staging.onrender.com",
  "api-staging.descall.com",
]);
const DEFAULT_BRIDGE_ORIGIN = "https://des-call.onrender.com";
/** Cloudflare's documented dummy keys (always pass / always fail); hostname is not checked. */
const TEST_SITE_KEY_RE = /^[123]x0{20}A[AB]$/;
const UNAVAILABLE_REASONS = Object.freeze(["script", "timeout", "unsupported", "error", "bridge", "config", "offline", "expired", "legacy", "missing"]);

let fetchImpl = (...args) => fetch(...args);
let dbOverride = null;
const db = () => dbOverride || require("../db/supabase");

let cached = null; // { at, value }
let loading = null;
let lastDbError = null;
const health = { misconfiguredAt: null, unreachableAt: null, lastPassAt: null };

/* ---------------- configuration ---------------- */

function envInt(name, fallback, min, max) {
  const n = Number(process.env[name]);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function limits() {
  return {
    fallbackPerIp: envInt("TURNSTILE_FALLBACK_PER_IP", 3, 0, 1000),
    fallbackGlobal: envInt("TURNSTILE_FALLBACK_GLOBAL", 60, 0, 100000),
    stepUpIp: envInt("TURNSTILE_STEPUP_IP", 5, 1, 1000),
    stepUpAccount: envInt("TURNSTILE_STEPUP_ACCOUNT", 3, 1, 1000),
  };
}

function cleanHostnames(list) {
  const out = [];
  for (const raw of Array.isArray(list) ? list : String(list || "").split(",")) {
    const h = String(raw || "").trim().toLowerCase();
    if (h && /^[a-z0-9.-]{1,253}$/.test(h) && !out.includes(h)) out.push(h);
  }
  return out;
}

function envMode() {
  const raw = String(process.env.TURNSTILE_ENFORCE || "").trim().toLowerCase();
  if (!raw) return null;
  if (["0", "false", "off", "no", "disabled"].includes(raw)) return "off";
  if (raw === "monitor" || raw === "log") return "monitor";
  if (["1", "true", "on", "yes", "enforce"].includes(raw)) return "enforce";
  return null;
}

function envKeys() {
  const siteKey = String(process.env.TURNSTILE_SITE_KEY || "").trim();
  const secretKey = String(process.env.TURNSTILE_SECRET_KEY || "").trim();
  if (!siteKey || !secretKey) return null;
  return { siteKey, secretKey, hostnames: cleanHostnames(process.env.TURNSTILE_HOSTNAMES), source: "env", updatedAt: null };
}

function isMissingTable(err) {
  const msg = String(err?.message || err?.details || "");
  return err?.code === "42P01" || err?.code === "PGRST205" || (/turnstile_config/.test(msg) && /does not exist|not find|schema cache/i.test(msg));
}

async function loadDbKeys() {
  try {
    const res = await Promise.race([
      Promise.resolve(db().from("turnstile_config").select("site_key, secret_key, hostnames, updated_at").eq("id", "default").maybeSingle()),
      new Promise((resolve) => setTimeout(() => resolve({ data: null, error: { message: "timeout" } }), 4000)),
    ]);
    if (res?.error) {
      lastDbError = isMissingTable(res.error) ? "missing_table" : "error";
      return undefined; // keep the last good value
    }
    lastDbError = null;
    const row = res?.data;
    if (!row || !row.site_key || !row.secret_key) return null;
    return { siteKey: String(row.site_key), secretKey: String(row.secret_key), hostnames: cleanHostnames(row.hostnames), source: "db", updatedAt: row.updated_at || null };
  } catch {
    lastDbError = "error";
    return undefined;
  }
}

/** { siteKey, secretKey, hostnames, source, updatedAt } or null when not configured. */
async function getKeys({ fresh = false } = {}) {
  const fromEnv = envKeys();
  if (fromEnv) return fromEnv;
  const now = Date.now();
  if (!fresh && cached && now - cached.at < CONFIG_TTL_MS) return cached.value;
  if (!loading) {
    loading = loadDbKeys()
      .then((value) => {
        if (value !== undefined || !cached) cached = { at: Date.now(), value: value === undefined ? null : value };
        else cached = { at: Date.now(), value: cached.value };
        return cached.value;
      })
      .finally(() => {
        loading = null;
      });
  }
  return loading;
}

function settingMode(config) {
  const raw = config && typeof config.turnstileMode === "string" ? config.turnstileMode : "enforce";
  return MODES.includes(raw) ? raw : "enforce";
}

/** Mode in force: env override, else the Güvenlik Merkezi setting. */
function effectiveMode(config) {
  return envMode() || settingMode(config);
}

function systemConfig() {
  try {
    return require("../runtime/sharedState").systemConfig || {};
  } catch {
    return {};
  }
}

function isTestKey(siteKey) {
  return TEST_SITE_KEY_RE.test(String(siteKey || ""));
}

function allowedHostnames(keys) {
  const extra = cleanHostnames(process.env.TURNSTILE_HOSTNAMES);
  const list = keys?.hostnames?.length ? keys.hostnames : DEFAULT_HOSTNAMES;
  return [...new Set([...list, ...extra])];
}

function bridgeOrigin() {
  const raw = String(process.env.TURNSTILE_BRIDGE_ORIGIN || "").trim().replace(/\/+$/, "");
  if (/^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(raw)) return raw;
  return DEFAULT_BRIDGE_ORIGIN;
}

/**
 * Public answer of GET /api/turnstile/config. The site key is public by design.
 * `stepUp` tells the client that sign-in only needs a token when the server asks.
 */
async function publicConfig() {
  const keys = await getKeys();
  const mode = effectiveMode(systemConfig());
  const enabled = Boolean(keys) && mode !== "off";
  return {
    enabled,
    siteKey: enabled ? keys.siteKey : null,
    mode: enabled ? mode : "off",
    actions: enabled ? { register: "always", social_signup: "always", password_reset: "always", login: "stepUp" } : {},
    bridgeUrl: `${bridgeOrigin()}/api/turnstile/frame`,
  };
}

/* ---------------- siteverify ---------------- */

const FAIL_OPEN_CODES = new Set(["internal-error"]);
const MISCONFIG_CODES = new Set(["missing-input-secret", "invalid-input-secret"]);

/**
 * One siteverify call. Resolves { outcome: "pass" | "fail" | "error", reason, hostname,
 * action, codes }. "error" means Cloudflare could not give an answer (fail-open).
 */
async function verifyToken(token, { action, ip, keys, timeoutMs = VERIFY_TIMEOUT_MS } = {}) {
  const t = typeof token === "string" ? token.trim() : "";
  if (!t || t.length > 2048) return { outcome: "fail", reason: "invalid_token", codes: ["invalid-input-response"] };
  if (!keys?.secretKey) return { outcome: "error", reason: "not_configured", codes: [] };
  const idempotencyKey = crypto.randomUUID();
  const body = new URLSearchParams();
  body.set("secret", keys.secretKey);
  body.set("response", t);
  if (ip && ip !== "unknown") body.set("remoteip", ip);
  body.set("idempotency_key", idempotencyKey);

  const started = Date.now();
  let data = null;
  // One retry on a fast network error with the same idempotency key (Cloudflare answers
  // the same result for the same token + key), all inside the 5 s budget.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const left = timeoutMs - (Date.now() - started);
    if (left <= 250) return { outcome: "error", reason: "timeout", codes: [] };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), left);
    try {
      const res = await fetchImpl(SITEVERIFY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: ctrl.signal,
      });
      if (res.status >= 500) {
        if (attempt === 0 && Date.now() - started < timeoutMs / 2) continue;
        return { outcome: "error", reason: `http_${res.status}`, codes: [] };
      }
      data = await res.json().catch(() => null);
      if (!data || typeof data !== "object") return { outcome: "error", reason: "bad_response", codes: [] };
      break;
    } catch (err) {
      const aborted = err?.name === "AbortError" || ctrl.signal.aborted;
      if (!aborted && attempt === 0 && Date.now() - started < timeoutMs / 2) continue;
      return { outcome: "error", reason: aborted ? "timeout" : "unreachable", codes: [] };
    } finally {
      clearTimeout(timer);
    }
  }
  if (!data) return { outcome: "error", reason: "unreachable", codes: [] };

  const codes = Array.isArray(data["error-codes"]) ? data["error-codes"].map(String).slice(0, 8) : [];
  if (data.success !== true) {
    if (codes.some((c) => MISCONFIG_CODES.has(c))) return { outcome: "error", reason: "misconfigured", codes };
    if (codes.some((c) => FAIL_OPEN_CODES.has(c))) return { outcome: "error", reason: "internal_error", codes };
    return { outcome: "fail", reason: codes[0] || "refused", codes };
  }
  const hostname = String(data.hostname || "").toLowerCase();
  const gotAction = data.action == null ? "" : String(data.action);
  if (!isTestKey(keys.siteKey)) {
    if (!allowedHostnames(keys).includes(hostname)) return { outcome: "fail", reason: "hostname", codes, hostname, action: gotAction };
    if (action && gotAction !== action) return { outcome: "fail", reason: "action", codes, hostname, action: gotAction };
  }
  return { outcome: "pass", reason: null, codes, hostname, action: gotAction };
}

/* ---------------- fallback budget (no token) ---------------- */

const fallbackByIp = new Map(); // ip -> stamps
let fallbackGlobal = [];

function pruneStamps(list, now) {
  return list.filter((t) => now - t < HOUR_MS);
}

/** True and recorded when one more no-token request may pass this hour. */
function takeFallback(ip, now = Date.now()) {
  const { fallbackPerIp, fallbackGlobal: globalMax } = limits();
  fallbackGlobal = pruneStamps(fallbackGlobal, now);
  const key = ip || "unknown";
  const mine = pruneStamps(fallbackByIp.get(key) || [], now);
  if (mine.length >= fallbackPerIp || fallbackGlobal.length >= globalMax) {
    fallbackByIp.set(key, mine);
    return false;
  }
  mine.push(now);
  fallbackByIp.set(key, mine);
  fallbackGlobal.push(now);
  if (fallbackByIp.size > 5000) {
    for (const [k, v] of fallbackByIp) if (!pruneStamps(v, now).length) fallbackByIp.delete(k);
  }
  return true;
}

function fallbackUsage(now = Date.now()) {
  fallbackGlobal = pruneStamps(fallbackGlobal, now);
  return { usedThisHour: fallbackGlobal.length, ...limits() };
}

/* ---------------- step-up for sign-in ---------------- */

/** Sign-in needs the check after repeated wrong passwords (see header). */
function loginNeedsCheck({ ip, accountKey, now = Date.now() } = {}) {
  const { recentCount } = require("./rateLimit");
  const l = limits();
  const ipFails = ip ? recentCount(`login:ip:${ip}`, { windowMs: STEPUP_WINDOW_MS, now }) : 0;
  const acctFails = accountKey ? recentCount(accountKey, { windowMs: STEPUP_WINDOW_MS, now }) : 0;
  return ipFails >= l.stepUpIp || acctFails >= l.stepUpAccount;
}

/** Password reset (code + new password) needs the check after 3 wrong tries from one address. */
function passwordResetNeedsCheck({ ip, now = Date.now() } = {}) {
  const { recentCount } = require("./rateLimit");
  return Boolean(ip) && recentCount(`pwconfirm:ip:${ip}`, { windowMs: STEPUP_WINDOW_MS, now }) >= 3;
}

/* ---------------- the gate ---------------- */

function cleanReason(raw) {
  const s = String(raw || "").trim().toLowerCase().replace(/[^a-z0-9_:-]/g, "").slice(0, 40);
  const head = s.split(":")[0];
  return UNAVAILABLE_REASONS.includes(head) ? s : s ? "other" : "missing";
}

function logLine(action, outcome, reason) {
  const msg = `[turnstile] action=${action} outcome=${outcome}${reason ? ` reason=${reason}` : ""}`;
  if (outcome === "failOpen") console.warn(msg);
  else if (outcome !== "pass") console.info(msg);
}

/**
 * Check one request. Resolves { ok: true, outcome } or
 * { ok: false, status, body, outcome } (send it as-is).
 * @param {import("express").Request} req
 * @param {{ action: string, ip?: string, config?: object }} opts
 */
async function gate(req, { action, ip, config } = {}) {
  if (!ACTIONS.includes(action)) throw new Error(`unknown turnstile action ${action}`);
  const mode = effectiveMode(config || systemConfig());
  if (mode === "off") return { ok: true, outcome: "off" };
  const keys = await getKeys();
  if (!keys) return { ok: true, outcome: "unconfigured" };
  const body = req?.body || {};
  const token = typeof body.turnstileToken === "string" ? body.turnstileToken : "";
  const addr = ip || (req ? require("./sessions").clientIp(req) : "unknown");

  if (token) {
    const r = await verifyToken(token, { action, ip: addr, keys });
    if (r.outcome === "pass") {
      health.lastPassAt = new Date().toISOString();
      stats.record(action, "pass");
      return { ok: true, outcome: "pass" };
    }
    if (r.outcome === "error") {
      const now = new Date().toISOString();
      if (r.reason === "misconfigured") health.misconfiguredAt = now;
      else health.unreachableAt = now;
      stats.record(action, "failOpen");
      logLine(action, "failOpen", r.reason);
      return { ok: true, outcome: "failOpen", reason: r.reason };
    }
    if (mode === "monitor") {
      stats.record(action, "monitor");
      logLine(action, "monitor", r.reason);
      return { ok: true, outcome: "monitor", reason: r.reason };
    }
    stats.record(action, "fail");
    logLine(action, "fail", r.reason);
    return {
      ok: false,
      outcome: "fail",
      status: 403,
      body: apiError("The security check could not be verified. Please try again.", null, { code: "turnstile_failed", turnstile: { action, retry: true } }),
    };
  }

  const reason = cleanReason(body.turnstileUnavailable);
  if (mode === "monitor") {
    stats.record(action, "monitor");
    logLine(action, "monitor", reason);
    return { ok: true, outcome: "monitor", reason };
  }
  // A current client (turnstileClient: 1) that sent neither a token nor a reason has not
  // run the check yet (sign-in step-up, or a config it had not loaded): ask for it. This
  // never uses the fallback budget; the client answers with a token or with the reason.
  const capable = body.turnstileClient === 1 || body.turnstileClient === true || body.turnstileClient === "1";
  if (capable && !body.turnstileUnavailable) {
    stats.record(action, "challenged");
    return { ok: false, outcome: "challenged", status: 428, body: requiredBody(action) };
  }
  if (takeFallback(addr)) {
    stats.record(action, "fallback");
    logLine(action, "fallback", reason);
    return { ok: true, outcome: "fallback", reason };
  }
  stats.record(action, "blocked");
  logLine(action, "blocked", reason);
  return { ok: false, outcome: "blocked", status: 428, body: requiredBody(action, { retry: false }) };
}

function requiredBody(action, { retry = true } = {}) {
  return apiError("Complete the security check to continue.", null, { code: "turnstile_required", turnstile: { action, retry } });
}

/** Sends the refusal and returns true when the gate said no. */
async function rejectUnlessHuman(req, res, opts) {
  const r = await gate(req, opts);
  if (r.ok) return false;
  res.status(r.status).json(r.body);
  return true;
}

/* ---------------- admin ---------------- */

function maskKey(k) {
  const s = String(k || "");
  if (s.length <= 10) return s ? `${s.slice(0, 2)}…` : "";
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

/** Güvenlik Merkezi card: configuration, mode, health and the last 24 hours. */
async function adminStatus({ config, now = Date.now() } = {}) {
  const keys = await getKeys().catch(() => null);
  const cfg = config || systemConfig();
  const summary = await stats.summary(now).catch(() => null);
  const mode = effectiveMode(cfg);
  const recent = (iso) => Boolean(iso) && now - Date.parse(iso) < 24 * HOUR_MS;
  return {
    configured: Boolean(keys),
    source: keys ? keys.source : null,
    testKeys: keys ? isTestKey(keys.siteKey) : false,
    siteKey: keys ? maskKey(keys.siteKey) : null,
    hostnames: keys ? allowedHostnames(keys) : [],
    updatedAt: keys?.updatedAt || null,
    setting: settingMode(cfg),
    envOverride: envMode(),
    mode,
    enforcing: Boolean(keys) && mode === "enforce",
    tableMissing: lastDbError === "missing_table" && !envKeys(),
    misconfigured: recent(health.misconfiguredAt),
    unreachable: recent(health.unreachableAt),
    lastPassAt: health.lastPassAt,
    fallback: fallbackUsage(now),
    stats: summary,
  };
}

/** Score check: a configured key, enforcing, and no bad-secret answers in the last day. */
function humanCheckOk(status) {
  return Boolean(status && status.configured && status.enforcing && !status.misconfigured);
}

function __setFetchForTests(fn) {
  fetchImpl = fn || ((...args) => fetch(...args));
}

function __resetForTests({ client = null } = {}) {
  cached = null;
  loading = null;
  lastDbError = null;
  dbOverride = client;
  fallbackByIp.clear();
  fallbackGlobal = [];
  health.misconfiguredAt = null;
  health.unreachableAt = null;
  health.lastPassAt = null;
}

module.exports = {
  SITEVERIFY_URL,
  VERIFY_TIMEOUT_MS,
  MODES,
  ACTIONS,
  DEFAULT_HOSTNAMES,
  UNAVAILABLE_REASONS,
  getKeys,
  effectiveMode,
  settingMode,
  envMode,
  isTestKey,
  allowedHostnames,
  bridgeOrigin,
  publicConfig,
  verifyToken,
  takeFallback,
  fallbackUsage,
  loginNeedsCheck,
  passwordResetNeedsCheck,
  cleanReason,
  gate,
  rejectUnlessHuman,
  adminStatus,
  humanCheckOk,
  maskKey,
  __setFetchForTests,
  __resetForTests,
};
