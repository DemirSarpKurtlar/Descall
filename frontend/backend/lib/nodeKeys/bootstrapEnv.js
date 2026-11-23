"use strict";

/**
 * Which environment variables the primary hands to a secondary node (the owner's PC) on
 * POST /api/node/bootstrap. Every name the backend reads is classified here, once:
 *
 *   SHARED  same value on every node (Supabase, JWT, push keys, mail, feature switches ...):
 *           returned to the PC when it is set on the primary
 *   LOCAL   belongs to this node or its platform (REDIS_URL: the primary only knows the
 *           internal address; PORT, NODE_ENV, the node identity, Render / Vercel build vars,
 *           machine paths, the edge bridge that only the primary holds): never returned
 *
 * plus every name starting with one of LOCAL_PREFIXES and the OS variables (never read by
 * the backend, refused anyway). Nothing outside SHARED is ever sent, so an unclassified new
 * name stays on the primary; lib/nodeKeys/bootstrapEnv.selftest.cjs scans the backend
 * source (process.env.X, env.X, env["X"] and names given to an env[name] helper) and fails
 * when a name is read that is not classified, or a listed one is no longer read.
 */

const fs = require("fs");
const path = require("path");

const SHARED = Object.freeze([
  "ACCESS_BAN_HASH_SECRET",
  "ANTHROPIC_API_KEY",
  "APNS_BUNDLE_ID",
  "APNS_KEY_ID",
  "APNS_PRIVATE_KEY",
  "APNS_TEAM_ID",
  "APNS_USE_SANDBOX",
  "APPLE_CLIENT_ID",
  "APPLE_EXTRA_AUDIENCES",
  "APPLE_SIGNIN_KEY_ID",
  "APPLE_SIGNIN_PRIVATE_KEY",
  "APPLE_TEAM_ID",
  "APP_ENV",
  "APP_ORIGIN",
  "CLOUDFLARE_TURN_API_TOKEN",
  "CLOUDFLARE_TURN_KEY_ID",
  "DESCALL_CLUSTER_ALIVE_TTL_MS",
  "DESCALL_CLUSTER_BEAT_MS",
  "DESCALL_CLUSTER_LEADER_TTL_MS",
  "DESCALL_CLUSTER_METRICS_MS",
  "DESCALL_CLUSTER_REMOTE_GRACE_MS",
  "DESCALL_CLUSTER_WATCH_MS",
  "DESCALL_KV_MAX_MB",
  "DESCOIN_ANTIBOT_ALERT_EMAIL",
  "DESCOIN_ANTIBOT_ALERT_EMAIL_TO",
  "DESCOIN_ANTIBOT_ALERT_MIN",
  "DESCOIN_ANTIBOT_ALERT_PUSH",
  "DESCOIN_ANTIBOT_HASH_SECRET",
  "DESCOIN_ANTIBOT_MEDIA_RULES",
  "DESCOIN_ANTIBOT_MESSAGE_RULES",
  "DESCOIN_ANTIBOT_MONITOR",
  "DESCOIN_ANTIBOT_RATES",
  "DESCOIN_ANTIBOT_REFERRAL_PENDING",
  "DESCOIN_ANTIBOT_SCHEDULER",
  "DESCOIN_ANTIBOT_WITHHOLD",
  "DESCOIN_RECONCILE_DISABLED",
  "DESKTOP_MIGRATION_PLAN_KEY",
  "DESKTOP_TAURI_LATEST_JSON_URL",
  "DESKTOP_TAURI_UPDATES_PAUSED",
  "DIMA_KEY_ENCRYPTION_SECRET",
  "EDGE_PUBLIC_BASE",
  "EDGE_REALTIME_URL",
  "EMAIL_FROM",
  "FEEDBACK_EMAIL_FROM",
  "FEEDBACK_EMAIL_TO",
  "FIREBASE_SERVICE_ACCOUNT_JSON",
  "FORCE_CANONICAL_HOST",
  "GH_TOKEN",
  "GITHUB_RELEASE_REPO",
  "GITHUB_RELEASE_TOKEN",
  "GITHUB_TOKEN",
  "GOOGLE_CLIENT_ID",
  "ICE_SERVERS_JSON",
  "IOS_COMM_NOTIFICATIONS",
  "JWT_ES256_PRIVATE_KEY",
  "JWT_EXPIRES_IN",
  "JWT_SECRET",
  "JWT_SIGN_ALG",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
  "LIVEKIT_FORCE",
  "LIVEKIT_URL",
  "LIVEKIT_URLS",
  "MEDIA_HOSTS",
  "MEDIA_PUBLIC_BASE_URL",
  "MEDIA_URL_SECRET",
  "PASSWORD_HIBP",
  "PREMIUM_SCHEDULER",
  "PROMO_IP_HASH_KEY",
  "PROMO_RISK_UNKNOWN",
  "PUBLIC_API_URL",
  "PUBLIC_APP_URL",
  "REENGAGE_DRY_RUN",
  "REENGAGE_ENABLED",
  "REENGAGE_FEATURES",
  "REENGAGE_MAX_EMAILS_PER_TICK",
  "REENGAGE_UNSUB_SECRET",
  "REPORT_ALERT_ADMIN_URL",
  "REPORT_ALERT_EMAIL",
  "REPORT_ALERT_MAX_PER_HOUR",
  "RESEND_API_KEY",
  "REVIEW_DEMO_USERNAMES",
  "SENTRY_DSN",
  "SERVER_EVERYONE_COOLDOWN_SEC",
  "SERVER_EVERYONE_PING_POLICY",
  "SERVER_IMAGE_HOSTS",
  "SERVER_MAX_MEMBERS",
  "SERVER_MAX_ROLE_PINGS",
  "SIGNUP_NOTIFY_ADMIN_URL",
  "SIGNUP_NOTIFY_TO",
  "SIGNUP_STATS_HASH_KEY",
  "SITE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_URL",
  "TOTP_ENC_KEY",
  "TURNSTILE_BRIDGE_ORIGIN",
  "TURNSTILE_ENFORCE",
  "TURNSTILE_FALLBACK_GLOBAL",
  "TURNSTILE_FALLBACK_PER_IP",
  "TURNSTILE_HOSTNAMES",
  "TURNSTILE_SECRET_KEY",
  "TURNSTILE_SITE_KEY",
  "TURNSTILE_STEPUP_ACCOUNT",
  "TURNSTILE_STEPUP_IP",
  "TURN_CREDENTIAL",
  "TURN_CREDENTIAL_TTL_S",
  "TURN_PASSWORD",
  "TURN_SHARED_SECRET",
  "TURN_STATIC_AUTH_SECRET",
  "TURN_URI",
  "TURN_URL",
  "TURN_URLS",
  "TURN_USERNAME",
  "VITE_API_BASE_URL",
  "VITE_GOOGLE_CLIENT_ID",
  "VOICE_SEAT_GRACE_MS",
  "VOICE_TOKEN_SEAT_WAIT_MS",
  "VOIP_STATUS_SECRET",
  "WAITLIST_NOTIFY_TO",
  "WEB_PUSH_PRIVATE_KEY",
  "WEB_PUSH_PUBLIC_KEY",
  "WEB_PUSH_SUBJECT",
]);

/** Read by the backend, but node or platform specific: never sent. */
const LOCAL = Object.freeze([
  "DESCALL_PRIMARY_URL",
  "DESCALL_VERSION",
  "EDGE_BRIDGE_FLUSH_MS",
  "EDGE_BRIDGE_RATE",
  "EDGE_BRIDGE_SECRET",
  "EDGE_BRIDGE_URL",
  "ENABLE_DEBUG_ROUTES",
  "FFMPEG_PATH",
  "GIT_COMMIT",
  "NODE_ENV",
  "PORT",
  "REDIS_URL",
  "SOURCE_VERSION",
  "SYSTEM_MEMORY_LIMIT_MB",
  "VERCEL",
]);

/** DESCALL_NODE_*: the node identity the app sets; RENDER*: Render's own variables. */
const LOCAL_PREFIXES = Object.freeze(["DESCALL_NODE_", "RENDER"]);

/** Operating system / shell variables: never read by the backend, never sent. */
const OS_VARS = Object.freeze(["HOME", "PATH", "HOSTNAME", "USER", "SHELL", "PWD", "TMPDIR", "TEMP", "TMP", "LANG", "TZ", "NODE_OPTIONS", "NODE_PATH", "NPM_CONFIG_PREFIX", "SystemRoot", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "ComSpec"]);

const SHARED_SET = new Set(SHARED);
const LOCAL_SET = new Set([...LOCAL, ...OS_VARS]);
const NAME_RE = /^[A-Z][A-Z0-9_]*$/;
/** A single value larger than this is not sent (env values are small; a PEM key is ~2 KB). */
const MAX_VALUE = 32 * 1024;

function isLocal(name) {
  const n = String(name || "");
  return LOCAL_SET.has(n) || LOCAL_PREFIXES.some((p) => n.startsWith(p));
}

/** May this name ever leave the primary? */
function isShared(name) {
  const n = String(name || "");
  return NAME_RE.test(n) && SHARED_SET.has(n) && !isLocal(n);
}

/**
 * The environment a secondary gets: SHARED names that are set (non-empty string) in `env`,
 * sorted by name. Never logs.
 */
function pick(env = process.env) {
  const out = {};
  for (const name of SHARED) {
    if (!isShared(name)) continue;
    const v = env[name];
    if (typeof v !== "string" || v === "" || v.length > MAX_VALUE || v.includes("\u0000")) continue;
    out[name] = v;
  }
  return out;
}

/* ---------------- source scan (selftest only) ---------------- */

const SKIP_DIRS = new Set(["node_modules", "test", "i18n"]);
const SOURCE_RE = /\.(c?js|mjs)$/;
const NOT_SOURCE_RE = /selftest|\.test\.|bench\.cjs$/;

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (SOURCE_RE.test(name) && !NOT_SOURCE_RE.test(name) && p !== __filename) out.push(p);
  }
  return out;
}

/**
 * Every environment variable name the backend source reads: `process.env.X`, `env.X`,
 * `env["X"]`, and, in a file that reads `env[someName]`, every quoted UPPER_SNAKE literal
 * (the names given to such a helper, e.g. flag("DESCOIN_ANTIBOT_RATES")).
 * @returns {Map<string, string[]>} name -> files (relative to root)
 */
function scanSource(root = path.join(__dirname, "..", "..")) {
  const names = new Map();
  for (const file of walk(root)) {
    const src = fs.readFileSync(file, "utf8");
    const rel = path.relative(root, file).split(path.sep).join("/");
    const add = (n) => {
      if (!names.has(n)) names.set(n, []);
      if (!names.get(n).includes(rel)) names.get(n).push(rel);
    };
    for (const m of src.matchAll(/\b(?:process\.)?env\.([A-Z][A-Z0-9_]*)\b/g)) add(m[1]);
    for (const m of src.matchAll(/\b(?:process\.)?env\[\s*["'`]([A-Z][A-Z0-9_]*)["'`]\s*\]/g)) add(m[1]);
    if (/\benv\[\s*[A-Za-z_$]/.test(src)) for (const m of src.matchAll(/["'`]([A-Z][A-Z0-9]*_[A-Z0-9_]+)["'`]/g)) add(m[1]);
  }
  return names;
}

/** { unclassified, both, stale } for the selftest. */
function audit(scanned = scanSource()) {
  const read = new Set(scanned.keys());
  const unclassified = [...read].filter((n) => !SHARED_SET.has(n) && !isLocal(n)).sort();
  const both = SHARED.filter((n) => isLocal(n));
  const stale = [...SHARED, ...LOCAL].filter((n) => !read.has(n)).sort();
  return { unclassified, both, stale };
}

module.exports = { SHARED, LOCAL, LOCAL_PREFIXES, OS_VARS, MAX_VALUE, isShared, isLocal, pick, scanSource, audit };
