"use strict";

/**
 * Kullanıcı dosyası (admin user file, Nov 2026 remake): pure helpers shared by
 * lib/userDossier.js and lib/userDossierSections.js. No database, no clock
 * unless one is passed in. Tested by userDossierModel.selftest.cjs.
 */

// Same as userReports.AUTO_DOSSIER_THRESHOLD (kept here so this file stays free of the database client).
const AUTO_DOSSIER_THRESHOLD = 3;

const DAY_MS = 86400000;
const NOTE_MAX = 2000;
const APP_TZ = "Europe/Istanbul";

/** "88.230.12.4" -> "88.230.x.x"; IPv6 keeps the first two groups. Raw IPs never leave the server. */
function maskIp(ip) {
  const s = String(ip || "").trim().replace(/^::ffff:/i, "");
  if (!s || s === "unknown") return null;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(s);
  if (v4) return `${v4[1]}.${v4[2]}.x.x`;
  if (s.includes(":")) {
    const parts = s.split(":").filter(Boolean);
    if (parts.length >= 2) return `${parts[0]}:${parts[1]}:x:x`;
  }
  return null;
}

/** "k***@gmail.com" for the dossier header (the full address stays a click away for admins). */
function maskEmail(email) {
  const s = String(email || "").trim();
  const at = s.indexOf("@");
  if (at < 1) return null;
  return `${s[0]}***${s.slice(at)}`;
}

function riskLevel(score) {
  const n = Number(score) || 0;
  if (n >= 70) return "critical";
  if (n >= 40) return "high";
  if (n >= 15) return "watch";
  return "low";
}

/**
 * Explainable risk for the dossier: the same weights as userReports.scoreRisk
 * plus two dossier signals (a banned account on the same device, a brand new
 * account). Every point is one reason row; the score is their sum, 0..100.
 */
function scoreDossierRisk({
  openReports = 0,
  totalReports = 0,
  banned = false,
  timedOut = false,
  suspiciousSignup = false,
  historyCount = 0,
  linkedBanned = 0,
  accountAgeDays = null,
} = {}) {
  const reasons = [];
  const add = (id, points, vars = {}) => reasons.push({ id, points, vars });
  const open = Math.max(0, Number(openReports) || 0);
  const total = Math.max(open, Number(totalReports) || 0);
  const history = Math.max(0, Number(historyCount) || 0);
  const linked = Math.max(0, Number(linkedBanned) || 0);

  if (open >= AUTO_DOSSIER_THRESHOLD) add("repeat_reports", 45, { n: open });
  else if (open > 0) add("open_reports", 15 * open, { n: open });
  if (total >= 6) add("report_history", 10, { n: total });
  if (banned) add("banned", 30);
  else if (timedOut) add("timeout", 15);
  if (suspiciousSignup) add("suspicious_signup", 10);
  if (history >= 3) add("prior_sanctions", 10, { n: history });
  else if (history >= 1) add("prior_sanctions", 4, { n: history });
  if (linked > 0) add("linked_banned", 15, { n: linked });
  const age = accountAgeDays == null || accountAgeDays === "" ? NaN : Number(accountAgeDays);
  if (Number.isFinite(age) && age >= 0) {
    if (age < 7) add("new_account", 5, { days: Math.floor(age) });
    else add("account_age", 0, { days: Math.floor(age) });
  }
  const raw = reasons.reduce((s, r) => s + r.points, 0);
  const score = Math.max(0, Math.min(100, raw));
  return { score, level: riskLevel(score), flags: reasons.filter((r) => r.points > 0).map((r) => r.id), reasons };
}

function ms(value) {
  const t = Date.parse(value || "");
  return Number.isFinite(t) ? t : NaN;
}

/** Timeline: one list, newest first, no duplicate ids, rows without a valid time dropped. */
function mergeTimeline(lists, { limit = 250 } = {}) {
  const seen = new Set();
  const out = [];
  for (const list of lists || []) {
    for (const item of list || []) {
      if (!item || !item.id || !item.type) continue;
      if (!Number.isFinite(ms(item.at))) continue;
      const key = `${item.type}:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  out.sort((a, b) => ms(b.at) - ms(a.at));
  return out.slice(0, Math.max(1, limit));
}

/** YYYY-MM-DD in the app time zone (Europe/Istanbul), like the rest of the admin charts. */
function dayKey(value, tz = APP_TZ) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** The last `days` day keys, oldest first, ending today. */
function lastDays(days, now = Date.now()) {
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) out.push(dayKey(now - i * DAY_MS));
  return [...new Set(out)];
}

/**
 * Per-day series for the activity tab: messages (counts only), voice minutes, screen shares.
 * @param {{messages: string[], voice: {at: string, seconds: number}[], screens: string[]}} input
 */
function activitySeries({ messages = [], voice = [], screens = [] } = {}, { days = 30, now = Date.now() } = {}) {
  const keys = lastDays(days, now);
  const idx = new Map(keys.map((k, i) => [k, i]));
  const series = keys.map((day) => ({ day, messages: 0, voiceMinutes: 0, screenShares: 0 }));
  for (const at of messages) {
    const i = idx.get(dayKey(at));
    if (i != null) series[i].messages += 1;
  }
  let voiceSeconds = 0;
  for (const v of voice) {
    const i = idx.get(dayKey(v?.at));
    const sec = Math.max(0, Number(v?.seconds) || 0);
    if (i == null) continue;
    voiceSeconds += sec;
    series[i].voiceMinutes += sec / 60;
  }
  for (const at of screens) {
    const i = idx.get(dayKey(at));
    if (i != null) series[i].screenShares += 1;
  }
  for (const d of series) d.voiceMinutes = Math.round(d.voiceMinutes);
  return {
    days: series,
    totals: {
      messages: series.reduce((s, d) => s + d.messages, 0),
      voiceSeconds: Math.round(voiceSeconds),
      screenShares: series.reduce((s, d) => s + d.screenShares, 0),
      activeDays: series.filter((d) => d.messages || d.voiceMinutes || d.screenShares).length,
    },
  };
}

/** Seconds of one voice row: duration_seconds, else left_at - joined_at, else up to now while open. */
function voiceSeconds(row, now = Date.now()) {
  const d = Number(row?.duration_seconds);
  if (Number.isFinite(d) && d > 0) return d;
  const a = ms(row?.joined_at);
  if (!Number.isFinite(a)) return 0;
  const b = Number.isFinite(ms(row?.left_at)) ? ms(row.left_at) : Math.min(now, a + 6 * 3600000);
  return Math.max(0, Math.round((b - a) / 1000));
}

const LINK_KIND_ORDER = ["device", "session_device", "same_ip", "network", "referral_pair", "signup_close", "insular_pair"];

/**
 * Accounts that share a device or a network with this one.
 * @param {string} userId
 * @param {{
 *   seen?: {user_id: string, kind: string, hash: string, last_seen?: string}[],
 *   mine?: {kind: string, hash: string, last_seen?: string}[],
 *   links?: {user_a: string, user_b: string, kinds?: string[], last_seen?: string}[],
 *   sessionDevice?: {userId: string, at?: string}[],
 *   sessionIp?: {userId: string, at?: string}[],
 * }} input
 * @returns {{userId: string, kinds: string[], lastSharedAt: string|null}[]}
 */
function linkedAccounts(userId, { seen = [], mine = [], links = [], sessionDevice = [], sessionIp = [] } = {}) {
  const me = String(userId);
  const byOther = new Map();
  const touch = (other, kind, at) => {
    const id = String(other || "");
    if (!id || id === me) return;
    const row = byOther.get(id) || { userId: id, kinds: new Set(), lastSharedAt: null };
    row.kinds.add(kind);
    if (at && (!row.lastSharedAt || ms(at) > ms(row.lastSharedAt))) row.lastSharedAt = at;
    byOther.set(id, row);
  };
  const myHash = new Map((mine || []).map((m) => [`${m.kind}:${m.hash}`, m.last_seen || null]));
  const perHash = new Map();
  for (const r of seen || []) {
    const key = `${r.kind}:${r.hash}`;
    perHash.set(key, (perHash.get(key) || 0) + 1);
  }
  for (const r of seen || []) {
    const key = `${r.kind}:${r.hash}`;
    if (!myHash.has(key)) continue;
    // A hash shared by many accounts (campus / mobile carrier NAT) is never evidence.
    if ((perHash.get(key) || 0) > 25) continue;
    const mineAt = myHash.get(key);
    const at = mineAt && r.last_seen ? (ms(mineAt) < ms(r.last_seen) ? mineAt : r.last_seen) : r.last_seen || mineAt;
    touch(r.user_id, r.kind === "fp" ? "device" : "network", at);
  }
  for (const l of links || []) {
    const other = String(l.user_a) === me ? l.user_b : String(l.user_b) === me ? l.user_a : null;
    if (!other) continue;
    for (const k of Array.isArray(l.kinds) ? l.kinds : []) {
      const kind = k === "same_device" ? "device" : k === "same_subnet" ? "network" : k;
      touch(other, kind, l.last_seen || null);
    }
  }
  for (const s of sessionDevice || []) touch(s.userId, "session_device", s.at || null);
  for (const s of sessionIp || []) touch(s.userId, "same_ip", s.at || null);
  const rank = (k) => {
    const i = LINK_KIND_ORDER.indexOf(k);
    return i < 0 ? LINK_KIND_ORDER.length : i;
  };
  return [...byOther.values()]
    .map((r) => ({ userId: r.userId, kinds: [...r.kinds].sort((a, b) => rank(a) - rank(b)), lastSharedAt: r.lastSharedAt }))
    .sort((a, b) => {
      const strong = (x) => (x.kinds.includes("device") || x.kinds.includes("session_device") ? 1 : 0);
      return strong(b) - strong(a) || b.kinds.length - a.kinds.length || (ms(b.lastSharedAt) || 0) - (ms(a.lastSharedAt) || 0);
    });
}

/** Admin note body: trimmed, 1..2000 characters, or null when invalid. */
function cleanNote(body) {
  const s = String(body ?? "").replace(/\r\n/g, "\n").trim();
  if (!s || s.length > NOTE_MAX) return null;
  return s;
}

/** Timeline group of a type (the filter pills on the client use the same map). */
const TIMELINE_GROUPS = Object.freeze({
  signup: "profile",
  first_message: "profile",
  login: "security",
  report: "report",
  mod: "moderation",
  ledger: "wallet",
  purchase: "wallet",
  subscription: "subscription",
  server_join: "community",
  server_own: "community",
  group_join: "community",
  admin: "admin",
  note: "admin",
});

function groupOf(type) {
  return TIMELINE_GROUPS[type] || "admin";
}

module.exports = {
  NOTE_MAX,
  DAY_MS,
  maskIp,
  maskEmail,
  riskLevel,
  scoreDossierRisk,
  mergeTimeline,
  dayKey,
  lastDays,
  activitySeries,
  voiceSeconds,
  linkedAccounts,
  cleanNote,
  TIMELINE_GROUPS,
  groupOf,
};
