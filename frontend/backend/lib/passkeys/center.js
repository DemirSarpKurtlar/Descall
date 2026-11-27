"use strict";

/**
 * Passkey control center (Settings > Security > Passkeys, draft A): pure helpers the routes
 * use for coarse places, new-place detection, the sign-in method mix, the security score and
 * the one-time "Ben degildim" links. No I/O here; selftest: center.selftest.cjs.
 */

const crypto = require("crypto");

const MAX_PLACES = 12;
const REPORT_TTL_MS = 7 * 24 * 3600 * 1000;
const STALE_DAYS = 30;
const USAGE_DAYS = 30;
const REMOVE_REASONS = new Set(["lost", "unused", "readd", "other", "undo"]);
const PASSWORD_METHODS = new Set(["password", "2fa_totp", "2fa_email", "2fa_recovery"]);
const SOCIAL_METHODS = new Set(["google", "apple"]);

function headerValue(headers, names) {
  if (!headers || typeof headers !== "object") return "";
  for (const name of names) {
    const raw = headers[name] ?? headers[name.toLowerCase()];
    if (raw == null) continue;
    const text = String(Array.isArray(raw) ? raw[0] : raw).trim();
    if (text) return text;
  }
  return "";
}

function decodeText(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return decodeURIComponent(raw.replace(/\+/g, " ")).replace(/\s+/g, " ").trim();
  } catch {
    return raw.replace(/\+/g, " ").replace(/\s+/g, " ").trim();
  }
}

/**
 * Coarse place of a request from the CDN's geo headers (Cloudflare cf-ipcountry / cf-ipcity,
 * Vercel x-vercel-ip-country / x-vercel-ip-city on the /api rewrite). Never the IP address.
 * { country: "TR" | "", city: "Istanbul" | "" }; city is "" when the edge sends none.
 */
function placeFromHeaders(headers = {}) {
  const lower = {};
  for (const [k, v] of Object.entries(headers || {})) lower[String(k).toLowerCase()] = v;
  const code = headerValue(lower, ["cf-ipcountry", "x-vercel-ip-country", "cloudfront-viewer-country"]).toUpperCase();
  const country = /^[A-Z]{2}$/.test(code) && code !== "XX" && code !== "T1" ? code : "";
  const rawCity = decodeText(headerValue(lower, ["cf-ipcity", "x-vercel-ip-city"]));
  const city = country && rawCity && rawCity.length <= 80 && !/[<>{}\u0000-\u001f]/.test(rawCity) ? rawCity : "";
  return { country, city };
}

/** City for comparing: case, accents and the Turkish dotted / dotless i do not matter. */
const normCity = (c) =>
  String(c || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\u0131/g, "i")
    .trim();
const placeKey = (p) => `${p?.country || ""}|${normCity(p?.city)}`;

/**
 * Is `geo` a place this passkey has not been used from? A place without a country never
 * counts. A city-less place matches any city in the same country (and the other way round),
 * so a request that only carries the country never raises a false alarm.
 */
function isNewPlace(places, geo) {
  if (!geo?.country) return false;
  const list = Array.isArray(places) ? places : [];
  if (!list.length) return false;
  return !list.some((p) => {
    if (p?.country !== geo.country) return false;
    if (!geo.city || !p.city) return true;
    return normCity(p.city) === normCity(geo.city);
  });
}

/** places with `geo` counted at `atIso` (newest first, at most MAX_PLACES). */
function mergePlace(places, geo, atIso) {
  const list = (Array.isArray(places) ? places : []).filter((p) => p && p.country).map((p) => ({ ...p }));
  if (!geo?.country) return list;
  const key = placeKey(geo);
  let hit = list.find((p) => placeKey(p) === key);
  // A city-less entry of the same country is upgraded once the city is known.
  if (!hit && geo.city) hit = list.find((p) => p.country === geo.country && !p.city);
  if (hit) {
    hit.city = hit.city || geo.city || "";
    hit.last = atIso;
    hit.n = (Number(hit.n) || 0) + 1;
  } else {
    list.push({ country: geo.country, city: geo.city || "", first: atIso, last: atIso, n: 1 });
  }
  return list.sort((a, b) => String(b.last).localeCompare(String(a.last))).slice(0, MAX_PLACES);
}

/** One-time token for a "Ben degildim" link; only the hash is stored. */
function newReportToken(nowMs = Date.now()) {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, hash: sha256hex(token), expiresAt: new Date(nowMs + REPORT_TTL_MS).toISOString() };
}

function sha256hex(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}

function isReportToken(t) {
  return typeof t === "string" && /^[A-Za-z0-9_-]{43}$/.test(t);
}

/** Client-reported ceremony time in ms (null when missing or implausible). */
function cleanDuration(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= 150 && r <= 180000 ? r : null;
}

function cleanReason(v) {
  const r = String(v || "").trim().toLowerCase();
  return REMOVE_REASONS.has(r) ? r : "other";
}

/**
 * How the account signed in lately, from users.active_sessions[].method (the newest
 * sessions, at most 10). { passkey, password, social, total } plus averages of the
 * client-measured sign-in time per family (null without data).
 */
function methodMix(sessions = []) {
  const out = { passkey: 0, password: 0, social: 0, total: 0, avgPasswordMs: null };
  const pw = [];
  for (const s of Array.isArray(sessions) ? sessions : []) {
    const m = String(s?.method || "");
    if (m === "passkey") out.passkey += 1;
    else if (PASSWORD_METHODS.has(m)) {
      out.password += 1;
      const ms = cleanDuration(s.signInMs);
      if (ms) pw.push(ms);
    } else if (SOCIAL_METHODS.has(m)) out.social += 1;
    else continue;
    out.total += 1;
  }
  if (pw.length) out.avgPasswordMs = Math.round(pw.reduce((a, b) => a + b, 0) / pw.length);
  return out;
}

/** Days since the passkey was last used (or added, if never used). */
function idleDays(row, nowMs = Date.now()) {
  const ref = Date.parse(row?.last_used_at || row?.lastUsedAt || row?.created_at || row?.createdAt || "");
  if (!Number.isFinite(ref)) return 0;
  return Math.max(0, Math.floor((nowMs - ref) / 86400000));
}

/** Platform family of a passkey for the "second passkey on another platform" advice. */
function familyOf(row) {
  const transports = Array.isArray(row?.transports) ? row.transports : [];
  const synced = Boolean(row?.backup_state ?? row?.synced);
  const provider = String(row?.provider || "").toLowerCase();
  if (!synced && (transports.includes("usb") || transports.includes("nfc")) && !transports.includes("internal")) return "key";
  if (/icloud|apple/.test(provider)) return "apple";
  if (/google/.test(provider)) return "google";
  if (/windows/.test(provider)) return "windows";
  const p = String(row?.platform || "");
  if (p === "ios" || p === "macos") return "apple";
  if (p === "android") return "google";
  if (p === "windows" || p === "electron") return "windows";
  return provider ? "manager" : "other";
}

/**
 * Security score 0..100 and the checks behind it (each `ok` with its weight):
 *   password 20 (an account without one: a confirmed e-mail with Google / Apple sign-in),
 *   email 10 (confirmed), second factor 20 (e-mail code or authenticator app),
 *   passkey 20 (one that works), backup 15 (a second passkey on another platform family),
 *   fresh 15 (none unused for STALE_DAYS, none turned off as a possible copy).
 */
function securityScore({ user = {}, totp = false, passkeys = [], nowMs = Date.now() } = {}) {
  const active = passkeys.filter((p) => !(p.suspended_at || p.suspended));
  const families = new Set(active.map(familyOf));
  const stale = active.filter((p) => idleDays(p, nowMs) >= STALE_DAYS);
  const suspended = passkeys.length - active.length;
  const checks = [
    { id: "password", weight: 20, ok: Boolean(user.password_hash) || Boolean(user.email_confirmed_at) },
    { id: "email", weight: 10, ok: Boolean(user.email && user.email_confirmed_at) },
    { id: "secondFactor", weight: 20, ok: Boolean(totp || user.two_factor_enabled) },
    { id: "passkey", weight: 20, ok: active.length > 0 },
    { id: "backup", weight: 15, ok: families.size >= 2 },
    { id: "fresh", weight: 15, ok: active.length > 0 && stale.length === 0 && suspended === 0 },
  ];
  const value = checks.reduce((s, c) => s + (c.ok ? c.weight : 0), 0);
  const level = value >= 85 ? "excellent" : value >= 65 ? "good" : value >= 40 ? "fair" : "weak";
  // Ways to sign in: password, a second factor and passkeys count as separate methods.
  const methods = (user.password_hash ? 1 : 0) + (totp || user.two_factor_enabled ? 1 : 0) + (active.length ? 1 : 0);
  return { value, level, checks, methods, staleCount: stale.length, suspendedCount: suspended, families: [...families] };
}

/** Public shape of an event (never the report hash). */
function publicEvent(e) {
  if (!e) return null;
  return {
    id: e.id,
    kind: e.kind,
    at: e.at,
    passkeyId: e.credential_row_id || null,
    name: e.credential_name || null,
    platform: e.platform || null,
    device: e.device || null,
    country: e.country || null,
    city: e.city || null,
    durationMs: e.duration_ms ?? null,
    reason: e.detail?.reason || null,
    resolvedAt: e.resolved_at || null,
    resolution: e.resolution || null,
    previous: Array.isArray(e.detail?.previous) ? e.detail.previous.slice(0, 3) : undefined,
  };
}

module.exports = {
  MAX_PLACES,
  REPORT_TTL_MS,
  STALE_DAYS,
  USAGE_DAYS,
  REMOVE_REASONS,
  placeFromHeaders,
  isNewPlace,
  mergePlace,
  newReportToken,
  isReportToken,
  sha256hex,
  cleanDuration,
  cleanReason,
  methodMix,
  idleDays,
  familyOf,
  securityScore,
  publicEvent,
};
