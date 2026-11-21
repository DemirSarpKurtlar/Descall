"use strict";

/**
 * Admin Token (owner request, Nov 2026): pure helpers shared by the store, the auth
 * hook, the usage tracker and the routes. No database, no clock unless passed.
 *
 *  - Secret format: "dsk_admin_" + 43 base64url characters (32 random bytes). Only the
 *    SHA-256 hex of the full secret is stored; prefix = first 4 random characters,
 *    last4 = last 4, shown as "dsk_admin_7Hq2…k9Xa".
 *  - Expiry options: 1h, 1d, 7d, 30d, 90d, never.
 *  - IP allowlist: plain IPv4 / IPv6 addresses or CIDR ranges (proxy-addr syntax).
 *  - Destructive requests: bans, deletes, DesCoin / credit grants and mass announcements
 *    or popups, classified from the method and the path.
 */

const crypto = require("crypto");
const net = require("net");

const SECRET_PREFIX = "dsk_admin_";
const SECRET_RE = /^dsk_admin_[A-Za-z0-9_-]{43}$/;
const EXPIRY = Object.freeze({
  "1h": 3600e3,
  "1d": 86400e3,
  "7d": 7 * 86400e3,
  "30d": 30 * 86400e3,
  "90d": 90 * 86400e3,
  never: null,
});
const EXPIRY_OPTIONS = Object.freeze(Object.keys(EXPIRY));
const REVOKE_REASONS = Object.freeze(["leaked", "unused", "replaced", "other"]);
const GRACE_OPTIONS = Object.freeze([0, 60, 1440]);
const RESTORE_WINDOW_MS = 10 * 60 * 1000;
const NAME_MAX = 60;
const MAX_ALLOWLIST = 50;
const REVOKE_ALL_CONFIRM = "TÜMÜNÜ İPTAL ET";
const ALERT_KINDS = Object.freeze(["new_ip", "new_country", "burst"]);

function newSecret() {
  return SECRET_PREFIX + crypto.randomBytes(32).toString("base64url");
}

function hashSecret(secret) {
  return crypto.createHash("sha256").update(String(secret)).digest("hex");
}

function looksLikeToken(value) {
  return typeof value === "string" && value.startsWith(SECRET_PREFIX);
}

function isWellFormed(value) {
  return typeof value === "string" && SECRET_RE.test(value);
}

/** { prefix, last4 } of a secret (the 4 random characters after the prefix, and the last 4). */
function displayParts(secret) {
  const body = String(secret).slice(SECRET_PREFIX.length);
  return { prefix: body.slice(0, 4), last4: body.slice(-4) };
}

function masked(prefix, last4) {
  return `${SECRET_PREFIX}${prefix || ""}…${last4 || ""}`;
}

/** Timing-safe comparison of two hex digests. */
function sameHash(a, b) {
  const x = Buffer.from(String(a || ""), "utf8");
  const y = Buffer.from(String(b || ""), "utf8");
  if (x.length !== y.length || !x.length) return false;
  return crypto.timingSafeEqual(x, y);
}

function cleanName(value) {
  const s = String(value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return { ok: false, code: "NAME_REQUIRED" };
  if (s.length > NAME_MAX) return { ok: false, code: "NAME_REQUIRED" };
  return { ok: true, value: s };
}

function expiresAtFor(expiresIn, now = Date.now()) {
  if (!Object.prototype.hasOwnProperty.call(EXPIRY, expiresIn)) return { ok: false, code: "BAD_EXPIRY" };
  const ms = EXPIRY[expiresIn];
  return { ok: true, value: ms == null ? null : new Date(now + ms).toISOString() };
}

/** "203.0.113.7" / "2001:db8::1" / "10.0.0.0/8" / "2001:db8::/32" -> normalised string, else null. */
function cleanIpEntry(value) {
  const s = String(value ?? "").trim().replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i, "$1");
  if (!s || s.length > 64) return null;
  const [addr, bits, extra] = s.split("/");
  if (extra !== undefined) return null;
  const family = net.isIP(addr);
  if (!family) return null;
  if (bits === undefined) return addr.toLowerCase();
  if (!/^\d{1,3}$/.test(bits)) return null;
  const n = Number(bits);
  if (n < 0 || n > (family === 4 ? 32 : 128)) return null;
  return `${addr.toLowerCase()}/${n}`;
}

/** Validate an allowlist: { ok, value: string[] } or { ok: false, code: "BAD_IP", entry }. */
function cleanAllowlist(list) {
  if (list == null) return { ok: true, value: [] };
  if (!Array.isArray(list)) return { ok: false, code: "BAD_IP", entry: String(list).slice(0, 64) };
  const out = [];
  for (const raw of list) {
    if (raw == null || String(raw).trim() === "") continue;
    const v = cleanIpEntry(raw);
    if (!v) return { ok: false, code: "BAD_IP", entry: String(raw).slice(0, 64) };
    if (!out.includes(v)) out.push(v);
  }
  if (out.length > MAX_ALLOWLIST) return { ok: false, code: "BAD_IP", entry: `max ${MAX_ALLOWLIST}` };
  return { ok: true, value: out };
}

const compiled = new Map();

/** Does ip fall inside the allowlist? An empty list allows every address. */
function ipAllowed(ip, list) {
  if (!Array.isArray(list) || !list.length) return true;
  const addr = String(ip || "").trim().replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i, "$1");
  if (!net.isIP(addr)) return false;
  const key = list.join(",");
  let fn = compiled.get(key);
  if (!fn) {
    try {
      fn = require("proxy-addr").compile(list);
    } catch {
      return false;
    }
    if (compiled.size > 200) compiled.clear();
    compiled.set(key, fn);
  }
  try {
    return Boolean(fn(addr, 0));
  } catch {
    return false;
  }
}

/** Derived status of a stored row. */
function statusOf(row, now = Date.now()) {
  if (!row) return "revoked";
  if (row.revoked_at) return "revoked";
  if (row.expires_at && Date.parse(row.expires_at) <= now) return "expired";
  if (row.paused) return "paused";
  return "active";
}

function restorableUntil(row, now = Date.now()) {
  if (!row?.revoked_at) return null;
  const until = Date.parse(row.revoked_at) + RESTORE_WINDOW_MS;
  return until > now ? new Date(until).toISOString() : null;
}

function graceUntil(row, now = Date.now()) {
  if (!row?.grace_hash || !row?.grace_until) return null;
  return Date.parse(row.grace_until) > now ? row.grace_until : null;
}

/**
 * Normalised path for the usage views: no query string, no /api prefix difference,
 * ids (uuid, numbers, long hex / base64-ish segments, usernames after /users/) -> :id.
 */
function normalisePath(raw) {
  let p = String(raw || "/").split("?")[0].split("#")[0];
  if (!p.startsWith("/")) p = `/${p}`;
  p = p.replace(/\/{2,}/g, "/");
  if (p.length > 1) p = p.replace(/\/+$/, "");
  const segs = p.split("/").map((s, i, all) => {
    if (i === 0 || !s) return s;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return ":id";
    if (/^\d+$/.test(s)) return ":id";
    if (/^[0-9]{10,}-[a-z0-9]+$/i.test(s)) return ":id";
    if (/^[0-9a-f]{16,}$/i.test(s)) return ":id";
    if (s.length >= 20 && /^[A-Za-z0-9_-]+$/.test(s) && /\d/.test(s) && /[A-Za-z]/.test(s)) return ":id";
    // DM conversation keys ("<uuid>:<uuid>", URL-encoded or not) after /admin/dm/.
    if (all[i - 1] === "dm" && !["conversations", "groups", "block", "unblock"].includes(s)) return ":id";
    if (/%3A|:/i.test(s)) return ":id";
    return s;
  });
  return segs.join("/").slice(0, 200) || "/";
}

/** Path relative to the admin router ("/users/:id/ban"), or null for non-admin paths. */
function adminRelative(path) {
  const p = String(path || "");
  const m = p.match(/^(?:\/api)?\/admin(\/.*|$)/);
  if (!m) return null;
  return m[1] || "/";
}

const DESTRUCTIVE_RULES = [
  // Bans (account, report, bulk, IP / device)
  ["ban", "POST", /^\/admin\/users\/[^/]+\/ban$/],
  ["ban", "POST", /^\/admin\/reports\/[^/]+\/ban$/],
  ["ban", "POST", /^\/admin\/users\/bulk$/],
  ["ban", "POST", /^\/admin\/moderation\/bulk$/],
  ["ban", "POST", /^\/admin\/access-bans$/],
  ["ban", "POST", /^\/admin\/moderation\/sanctions\/[^/]+\/extend$/],
  // DesCoin, game credits and gifts that move value
  ["descoin", "POST", /^\/admin\/descoin\/grant$/],
  ["descoin", "POST", /^\/admin\/descoin\/reconciliation\/fix$/],
  ["descoin", "POST", /^\/admin\/credits\/update$/],
  ["descoin", "POST", /^\/admin\/credits\/players\/[^/]+\/(adjust|reset)$/],
  ["descoin", "POST", /^\/admin\/shop\/gifts?$/],
  ["descoin", "POST", /^\/admin\/special-badges\/[^/]+\/grant$/],
  ["descoin", "POST", /^\/admin\/premium\/(users\/[^/]+\/apply|bulk)$/],
  // Mass announcements and popups
  ["broadcast", "POST", /^\/admin\/announcements$/],
  ["broadcast", "POST", /^\/admin\/announcements\/[^/]+\/(publish|approve|reopen)$/],
  ["broadcast", "POST", /^\/admin\/popup\/campaigns$/],
  ["broadcast", "POST", /^\/admin\/popup\/campaigns\/[^/]+\/(send-now|resend)$/],
  ["broadcast", "POST", /^\/admin\/system\/broadcast$/],
  ["broadcast", "POST", /^\/admin\/security\/remind-2fa$/],
];

/** "ban" | "delete" | "descoin" | "broadcast" | null for one request. */
function destructiveKind(method, path) {
  const m = String(method || "GET").toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return null;
  let p = normalisePath(path).replace(/^\/api(?=\/)/, "");
  if (m === "DELETE") return "delete";
  if (/^\/admin\/server-review\/servers\/[^/]+$/.test(p)) return "delete";
  for (const [kind, verb, re] of DESTRUCTIVE_RULES) {
    if (verb === m && re.test(p)) return kind;
  }
  return null;
}

/** "Claude Code 2.4" style label from an MCP clientInfo or a User-Agent. */
function clientLabel({ clientInfo = null, userAgent = "" } = {}) {
  if (clientInfo && (clientInfo.name || clientInfo.title)) {
    const name = String(clientInfo.title || clientInfo.name).replace(/[\r\n\t]+/g, " ").trim().slice(0, 40);
    const prettyName = name === "claude-code" ? "Claude Code" : name === "claude-ai" ? "Claude Desktop" : name;
    const version = clientInfo.version ? String(clientInfo.version).trim().split(/\s+/)[0].slice(0, 16) : "";
    return `${prettyName}${version ? ` ${version.split(".").slice(0, 2).join(".")}` : ""}`.slice(0, 60);
  }
  const ua = String(userAgent || "").replace(/[\r\n\t]+/g, " ").trim();
  if (!ua) return null;
  const known = [
    [/claude-code\/(\d+(?:\.\d+)?)/i, "Claude Code"],
    [/claude-cli\/(\d+(?:\.\d+)?)/i, "Claude Code"],
    [/Claude\/(\d+(?:\.\d+)?)/, "Claude Desktop"],
    [/curl\/(\d+(?:\.\d+)?)/i, "curl"],
    [/python-requests\/(\d+(?:\.\d+)?)/i, "Python requests"],
    [/node-fetch|undici/i, "Node.js"],
    [/PostmanRuntime\/(\d+(?:\.\d+)?)/i, "Postman"],
  ];
  for (const [re, label] of known) {
    const m = ua.match(re);
    if (m) return m[1] ? `${label} ${m[1]}` : label;
  }
  return ua.split(" ")[0].slice(0, 60);
}

/** Country code from the edge headers (Cloudflare / Vercel), like lib/securityEvents.js. */
function countryOf(headers) {
  const h = headers || {};
  for (const name of ["cf-ipcountry", "x-vercel-ip-country", "x-country"]) {
    const v = h[name];
    const s = String(Array.isArray(v) ? v[0] : v || "").trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(s) && s !== "XX" && s !== "T1") return s;
  }
  return null;
}

/** Start of the UTC hour of t, as ISO. */
function hourKey(t) {
  const d = new Date(typeof t === "number" ? t : Date.parse(t));
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
}

function percentile(values, p) {
  const list = (values || []).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!list.length) return 0;
  const idx = Math.min(list.length - 1, Math.max(0, Math.ceil((p / 100) * list.length) - 1));
  return list[idx];
}

module.exports = {
  SECRET_PREFIX,
  EXPIRY,
  EXPIRY_OPTIONS,
  REVOKE_REASONS,
  GRACE_OPTIONS,
  RESTORE_WINDOW_MS,
  NAME_MAX,
  MAX_ALLOWLIST,
  REVOKE_ALL_CONFIRM,
  ALERT_KINDS,
  newSecret,
  hashSecret,
  looksLikeToken,
  isWellFormed,
  displayParts,
  masked,
  sameHash,
  cleanName,
  expiresAtFor,
  cleanIpEntry,
  cleanAllowlist,
  ipAllowed,
  statusOf,
  restorableUntil,
  graceUntil,
  normalisePath,
  adminRelative,
  destructiveKind,
  clientLabel,
  countryOf,
  hourKey,
  percentile,
};
