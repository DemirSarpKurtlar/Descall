"use strict";

/**
 * Güvenlik Merkezi live threat feed (admin remake, Draft A "Komuta merkezi", Nov 2026).
 *
 * The existing choke points call note():
 *   failed_login    routes/auth.js, wrong password (the account only when it exists)
 *   account_locked  routes/auth.js, the per-account "max login attempts per minute" lock
 *   ip_blocked      routes/auth.js, the per-IP sign-in / sign-up limiter refused
 *   access_ban      lib/accessBans.js check(), an IP / network / device ban stopped someone
 *   rate_limit      lib/platformPolicy.js, the per-user message limit refused a send
 *   signup_denied   routes/auth.js, sign-ups closed / locked, throwaway email
 *   admin_step_up   middleware/adminSecondFactor.js, an admin entered (or failed) a code
 *   brute_force     derived here: many failed logins from one address across accounts
 *
 * Cannot flood the database: notes are merged in memory per (type, address, account,
 * reason) and written every 15 s as one row with a count; at most 300 rows per write
 * and 2000 open buckets (overflow is counted, not stored). Rows older than 30 days are
 * deleted. Table public.security_events (supabase/migrations/20261115_security_center.sql);
 * until it exists the last 2000 rows stay in memory and the page says so.
 *
 * Privacy: the address is never stored. A row keeps the masked address ("88.230.x.x"),
 * the masked network ("88.230.x.0/24") and the same keyed hashes lib/accessBans.js
 * matches on, so "IP engelle" can ban the source without anyone seeing the address.
 */

const crypto = require("crypto");

const TABLE = "security_events";
const TYPES = Object.freeze(["brute_force", "failed_login", "account_locked", "ip_blocked", "access_ban", "rate_limit", "signup_denied", "admin_step_up"]);
const INTERNAL_TYPES = Object.freeze(["posture"]);
/** Feed filter chips (Tümü + these). */
const FILTERS = Object.freeze({
  bruteForce: ["brute_force"],
  failedLogin: ["failed_login", "account_locked"],
  blockedIp: ["ip_blocked", "access_ban"],
  rateLimit: ["rate_limit"],
  signupDenied: ["signup_denied"],
});
const FLUSH_MS = 15 * 1000;
const MAX_PENDING = 2000;
const MAX_ROWS_PER_FLUSH = 300;
const MEMORY_MAX = 2000;
const RETENTION_DAYS = 30;
const BF_WINDOW_MS = 10 * 60 * 1000;
const BF_MIN_ATTEMPTS = 20;
const BF_MIN_ACCOUNTS = 3;
const BF_HARD_ATTEMPTS = 60;
const BF_COOLDOWN_MS = 30 * 60 * 1000;
const PAUSE_MS = 10 * 60 * 1000;

let dbOverride = null;
const db = () => dbOverride || require("../db/supabase");
let ioRef = null;
const pending = new Map();
let dropped = 0;
let flushTimer = null;
const memory = []; // newest first
const bf = new Map(); // ipHash -> { stamps:number[], accounts:Map, users:Map, lastFire, ipMasked, ... }
let pausedUntil = 0;
let warned = false;
let lastPruneAt = 0;

function isMissingTable(err) {
  const msg = String(err?.message || err?.details || "");
  return err?.code === "42P01" || err?.code === "PGRST205" || (/security_events/.test(msg) && /does not exist|not find|schema cache/i.test(msg));
}

function pause(err) {
  pausedUntil = Date.now() + PAUSE_MS;
  if (!warned) {
    warned = true;
    console.warn("[security-events] table missing, keeping events in memory:", err?.message || err, "(apply supabase/migrations/20261115_security_center.sql)");
  }
}

function persistent() {
  return Date.now() >= pausedUntil;
}

function attachIo(io) {
  ioRef = io || null;
}

/* ---------------- source of an event ---------------- */

function headerValue(headers, names) {
  const h = headers || {};
  for (const n of names) {
    const v = h[n];
    if (typeof v === "string" && v.trim()) return v.trim().slice(0, 64);
  }
  return null;
}

function decodeCity(v) {
  if (!v) return null;
  try {
    return decodeURIComponent(v).slice(0, 64);
  } catch {
    return v;
  }
}

/** Masked labels and match hashes of an address; never the address itself. */
function sourceOf(ip) {
  const out = { ipMasked: null, ipHash: null, netHash: null, netLabel: null };
  if (!ip || ip === "unknown") return out;
  try {
    const { maskIp, isPublicIp } = require("./clientIp");
    const accessBans = require("./accessBans");
    const { ipSubnet } = require("./descoinAntibot/hashing");
    out.ipMasked = maskIp(ip);
    if (!isPublicIp(ip)) return out;
    const fp = accessBans.fingerprintOf({ ip });
    out.ipHash = fp.ip || null;
    out.netHash = fp.network || null;
    const sub = ipSubnet(String(ip).replace(/^::ffff:/i, ""));
    if (sub) {
      const v4 = String(sub).match(/^(\d+)\.(\d+)\.\d+\.\d+(\/\d+)?$/);
      out.netLabel = v4 ? `${v4[1]}.${v4[2]}.x.0/24` : `${out.ipMasked} /64`;
    }
  } catch {
    /* labels only */
  }
  return out;
}

function requestIp(req) {
  if (!req) return null;
  try {
    return require("./clientIp").ipOfRequest(req);
  } catch {
    return null;
  }
}

function usernameOf(userId) {
  if (!userId) return null;
  try {
    return require("../runtime/sharedState").usernameById.get(userId) || null;
  } catch {
    return null;
  }
}

/* ---------------- recording ---------------- */

/**
 * Record one security event (fire-and-forget, never throws).
 * @param {string} type one of TYPES
 * @param {object} o
 * @param {object} [o.req]       Express request (address + country / city headers)
 * @param {string} [o.ip]        address when there is no request (socket)
 * @param {string} [o.userId]
 * @param {string} [o.username]  only for accounts that exist
 * @param {string} [o.accountKey] attempted login name, counted for brute force, never stored
 * @param {string} [o.reason]    merge key part + detail.reason
 * @param {object} [o.detail]    small JSON for the feed line
 */
function note(type, o = {}) {
  try {
    if (!TYPES.includes(type)) return;
    const now = o.now || Date.now();
    const ip = o.ip || requestIp(o.req);
    const src = o.source || sourceOf(ip);
    const userId = o.userId || null;
    const username = o.username || usernameOf(userId) || null;
    const reason = o.reason ? String(o.reason).slice(0, 40) : null;
    const key = [type, src.ipHash || src.ipMasked || "", userId || username || "", reason || ""].join("|");
    let row = pending.get(key);
    if (row) {
      row.count += Math.max(1, Number(o.count) || 1);
      row.at = new Date(now).toISOString();
      if (o.detail) row.detail = mergeDetail(row.detail, o.detail);
    } else if (pending.size < MAX_PENDING) {
      row = {
        id: crypto.randomUUID(),
        type,
        at: new Date(now).toISOString(),
        first_at: new Date(now).toISOString(),
        count: Math.max(1, Number(o.count) || 1),
        ip_masked: src.ipMasked,
        ip_hash: src.ipHash,
        net_hash: src.netHash,
        net_label: src.netLabel,
        country: o.req ? headerValue(o.req.headers, ["cf-ipcountry", "x-vercel-ip-country", "x-country"]) : o.country || null,
        city: o.req ? decodeCity(headerValue(o.req.headers, ["cf-ipcity", "x-vercel-ip-city", "x-city"])) : o.city || null,
        user_id: userId,
        username,
        detail: { ...(o.detail || {}), ...(reason ? { reason } : {}) },
      };
      pending.set(key, row);
    } else {
      dropped += 1;
    }
    if (type === "failed_login" && src.ipHash) trackBruteForce(src, o, now);
    scheduleFlush(type === "brute_force" ? 500 : FLUSH_MS);
  } catch {
    /* never break the caller */
  }
}

function mergeDetail(a, b) {
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b || {})) {
    if (typeof v === "number" && typeof out[k] === "number" && k !== "perMinute" && k !== "limit") out[k] = Math.max(out[k], v);
    else out[k] = v;
  }
  return out;
}

function trackBruteForce(src, o, now) {
  let s = bf.get(src.ipHash);
  if (!s) {
    s = { stamps: [], accounts: new Set(), users: [], lastFire: 0 };
    bf.set(src.ipHash, s);
    if (bf.size > 5000) bf.delete(bf.keys().next().value);
  }
  s.stamps = s.stamps.filter((t) => now - t < BF_WINDOW_MS);
  s.stamps.push(now);
  if (o.accountKey) s.accounts.add(String(o.accountKey).toLowerCase().slice(0, 64));
  if (o.username && !s.users.includes(o.username)) s.users.push(o.username);
  if (s.users.length > 5) s.users.length = 5;
  const hot = (s.stamps.length >= BF_MIN_ATTEMPTS && s.accounts.size >= BF_MIN_ACCOUNTS) || s.stamps.length >= BF_HARD_ATTEMPTS;
  if (!hot || now - s.lastFire < BF_COOLDOWN_MS) return;
  s.lastFire = now;
  const minutes = Math.max(1, Math.round((now - s.stamps[0]) / 60000));
  note("brute_force", {
    now,
    source: src,
    req: o.req,
    reason: "burst",
    detail: { attempts: s.stamps.length, accounts: s.accounts.size, minutes, sample: s.users[0] || null },
  });
  s.accounts = new Set();
}

function scheduleFlush(ms) {
  if (flushTimer && ms >= FLUSH_MS) return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush().catch(() => {});
  }, ms);
  if (typeof flushTimer.unref === "function") flushTimer.unref();
}

function remember(rows) {
  for (const r of rows) memory.unshift(r);
  if (memory.length > MEMORY_MAX) memory.length = MEMORY_MAX;
}

/** Write the merged rows, keep them in memory, push them to the admin room. */
async function flush() {
  if (!pending.size && !dropped) return 0;
  const rows = [...pending.values()].sort((a, b) => a.at.localeCompare(b.at));
  pending.clear();
  const write = rows.slice(-MAX_ROWS_PER_FLUSH);
  const lost = rows.length - write.length + dropped;
  dropped = 0;
  if (lost > 0) console.warn(`[security-events] ${lost} events merged away (burst over the write cap)`);
  await resolveLookups(write);
  remember(write);
  let stored = false;
  if (persistent() && write.length) {
    try {
      const { error } = await db().from(TABLE).insert(write);
      if (error) {
        if (isMissingTable(error)) pause(error);
        else console.warn("[security-events] insert:", error.message || error);
      } else {
        stored = true;
      }
    } catch (err) {
      console.warn("[security-events] insert:", err?.message || err);
    }
  }
  // Rows only in memory still show once the table is back (until restart).
  if (!stored) for (const r of write) Object.defineProperty(r, "_mem", { value: true, enumerable: false });
  if (ioRef && write.length) {
    try {
      require("./systemSettingsChange").toSecurityAdmins(ioRef).emit("admin:security", { type: "events", events: write.map(publicEvent) });
    } catch {
      /* no sockets */
    }
  }
  prune().catch(() => {});
  return write.length;
}

/** account_locked notes carry the typed name; keep it only when that account exists. */
async function resolveLookups(rows) {
  const want = rows.filter((r) => r.detail && r.detail.lookup && !r.user_id);
  for (const r of want) {
    const name = String(r.detail.lookup || "");
    delete r.detail.lookup;
    try {
      const { data } = await db().from("users").select("id, username").ilike("username", name.replace(/[%_\\]/g, "")).maybeSingle();
      if (data) {
        r.user_id = data.id;
        r.username = data.username;
      } else {
        r.detail.unknownAccount = true;
      }
    } catch {
      r.detail.unknownAccount = true;
    }
  }
}

async function prune(now = Date.now()) {
  if (now - lastPruneAt < 6 * 3600 * 1000 || !persistent()) return;
  lastPruneAt = now;
  const cutoff = new Date(now - RETENTION_DAYS * 86400000).toISOString();
  try {
    await db().from(TABLE).delete().lt("at", cutoff).neq("type", "posture");
    await db().from(TABLE).delete().lt("at", new Date(now - 120 * 86400000).toISOString()).eq("type", "posture");
  } catch {
    /* best effort */
  }
}

/* ---------------- reading ---------------- */

function publicEvent(r) {
  return {
    id: r.id,
    type: r.type,
    at: r.at,
    firstAt: r.first_at || r.at,
    count: Number(r.count) || 1,
    ipMasked: r.ip_masked || null,
    sourceRef: r.ip_hash || null,
    netRef: r.net_hash || null,
    netLabel: r.net_label || null,
    country: r.country || null,
    city: r.city || null,
    userId: r.user_id || null,
    username: r.username || null,
    detail: r.detail && typeof r.detail === "object" ? r.detail : {},
  };
}

const COLS = "id, type, at, first_at, count, ip_masked, ip_hash, net_hash, net_label, country, city, user_id, username, detail";

/** Raw rows since `sinceIso` (newest first), from the table or memory. */
async function rowsSince(sinceIso, { types = null, limit = 5000 } = {}) {
  if (persistent()) {
    try {
      let q = db().from(TABLE).select(COLS).gte("at", sinceIso).order("at", { ascending: false }).limit(limit);
      if (types) q = q.in("type", types);
      const { data, error } = await q;
      if (error) {
        if (isMissingTable(error)) pause(error);
        else throw error;
      } else {
        return mergePending(data || [], sinceIso, types);
      }
    } catch (err) {
      console.warn("[security-events] read:", err?.message || err);
    }
  }
  return mergePending(memory.filter((r) => r.at >= sinceIso && (!types || types.includes(r.type))), sinceIso, types, true);
}

/** Notes not yet written show at once (live feed); written ones are not doubled. */
function mergePending(rows, sinceIso, types, fromMemory = false) {
  const seen = new Set(rows.map((r) => r.id));
  const extra = [...pending.values()].filter((r) => !seen.has(r.id) && r.at >= sinceIso && (!types || types.includes(r.type)));
  if (!fromMemory) {
    // Rows written while the table was missing are only in memory.
    for (const r of memory) if (r._mem && !seen.has(r.id) && r.at >= sinceIso && (!types || types.includes(r.type))) extra.push(r);
  }
  return [...extra, ...rows].sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/** Feed page: newest first, optional filter key, cursor = ISO time of the last row. */
async function listFeed({ filter = null, before = null, limit = 40, sourceRef = null, userId = null } = {}) {
  const lim = Math.min(200, Math.max(1, Number(limit) || 40));
  const types = filter && FILTERS[filter] ? FILTERS[filter] : TYPES;
  const since = new Date(Date.now() - RETENTION_DAYS * 86400000).toISOString();
  let rows;
  if (persistent()) {
    try {
      let q = db().from(TABLE).select(COLS).in("type", types).order("at", { ascending: false }).limit(lim);
      if (before) q = q.lt("at", before);
      if (sourceRef) q = q.eq("ip_hash", sourceRef);
      if (userId) q = q.eq("user_id", userId);
      const { data, error } = await q;
      if (error) {
        if (isMissingTable(error)) pause(error);
        else throw error;
      } else {
        rows = data || [];
        if (!before) rows = mergePending(rows, since, types).filter((r) => (!sourceRef || r.ip_hash === sourceRef) && (!userId || r.user_id === userId));
      }
    } catch (err) {
      console.warn("[security-events] feed:", err?.message || err);
    }
  }
  if (!rows) {
    rows = mergePending(memory.filter((r) => types.includes(r.type)), since, types, true)
      .filter((r) => (!before || r.at < before) && (!sourceRef || r.ip_hash === sourceRef) && (!userId || r.user_id === userId));
  }
  rows = rows.slice(0, lim);
  return { events: rows.map(publicEvent), nextBefore: rows.length === lim ? rows[rows.length - 1].at : null, persistent: persistent() };
}

async function getEvent(id) {
  const key = String(id || "");
  const local = memory.find((r) => r.id === key) || [...pending.values()].find((r) => r.id === key);
  if (local) return local;
  if (!/^[0-9a-f-]{36}$/i.test(key) || !persistent()) return null;
  try {
    const { data } = await db().from(TABLE).select(COLS).eq("id", key).maybeSingle();
    return data || null;
  } catch {
    return null;
  }
}

/** The newest stored row for this source hash (label + network hash for a ban), or null. */
async function findSource(ipHash) {
  const key = String(ipHash || "");
  if (!/^[0-9a-f]{16,64}$/.test(key)) return null;
  const local = [...pending.values(), ...memory].find((r) => r.ip_hash === key);
  if (local) return local;
  if (!persistent()) return null;
  try {
    const { data } = await db().from(TABLE).select(COLS).eq("ip_hash", key).order("at", { ascending: false }).limit(1);
    return (data || [])[0] || null;
  } catch {
    return null;
  }
}

/* ---------------- posture (score) snapshots ---------------- */

let lastPostureAt = 0;
async function recordPosture(score, now = Date.now()) {
  if (now - lastPostureAt < 12 * 3600 * 1000) return;
  lastPostureAt = now;
  const row = { id: crypto.randomUUID(), type: "posture", at: new Date(now).toISOString(), first_at: new Date(now).toISOString(), count: Math.round(score), detail: {} };
  remember([row]);
  if (!persistent()) return;
  try {
    await db().from(TABLE).insert(row);
  } catch {
    /* best effort */
  }
}

/** Score about a week ago (6 to 8 days back), or null. */
async function postureWeekAgo(now = Date.now()) {
  const from = new Date(now - 8 * 86400000).toISOString();
  const to = new Date(now - 6 * 86400000).toISOString();
  if (persistent()) {
    try {
      const { data, error } = await db().from(TABLE).select("at, count").eq("type", "posture").gte("at", from).lte("at", to).order("at", { ascending: false }).limit(1);
      if (!error) return data && data[0] ? Number(data[0].count) : null;
    } catch {
      /* memory */
    }
  }
  const hit = memory.find((r) => r.type === "posture" && r.at >= from && r.at <= to);
  return hit ? Number(hit.count) : null;
}

/* ---------------- pure stats (tested) ---------------- */

const HOUR = 3600 * 1000;
const BUCKET_MS = 30 * 60 * 1000;
const BUCKETS = 48;

function sumBy(rows, types) {
  let n = 0;
  for (const r of rows) if (types.includes(r.type)) n += Number(r.count) || 1;
  return n;
}

function pctChange(cur, prev) {
  if (!prev) return cur ? null : 0;
  return Math.round(((cur - prev) / prev) * 100);
}

/**
 * Everything the overview shows from the raw rows of the last 48 hours.
 * @param {object[]} rows raw rows (any order)
 * @param {number} now
 * @param {{ activeBans?: number, isBanned?: (row) => boolean }} ctx
 */
function computeStats(rows, now = Date.now(), ctx = {}) {
  const dayAgo = now - 24 * HOUR;
  const twoDays = now - 48 * HOUR;
  const cur = [];
  const prev = [];
  for (const r of rows || []) {
    if (INTERNAL_TYPES.includes(r.type)) continue;
    const t = Date.parse(r.at);
    if (!Number.isFinite(t) || t > now + 60000) continue;
    if (t >= dayAgo) cur.push(r);
    else if (t >= twoDays) prev.push(r);
  }

  const failed = sumBy(cur, ["failed_login"]);
  const failedPrev = sumBy(prev, ["failed_login"]);
  const lockedSet = new Set(cur.filter((r) => r.type === "account_locked").map((r) => r.user_id || r.username || r.id));
  const lockedPrevSet = new Set(prev.filter((r) => r.type === "account_locked").map((r) => r.user_id || r.username || r.id));
  const blocked = sumBy(cur, ["ip_blocked", "access_ban"]);
  const blockedPrev = sumBy(prev, ["ip_blocked", "access_ban"]);
  const rate = sumBy(cur, ["rate_limit"]);
  const ratePrev = sumBy(prev, ["rate_limit"]);
  const kpis = {
    failedLogins: { value: failed, prev: failedPrev, pct: pctChange(failed, failedPrev) },
    lockedAccounts: { value: lockedSet.size, prev: lockedPrevSet.size, delta: lockedSet.size - lockedPrevSet.size },
    blockedIps: { value: blocked, prev: blockedPrev, activeBans: Number(ctx.activeBans) || 0 },
    rateLimits: { value: rate, prev: ratePrev, pct: pctChange(rate, ratePrev) },
  };

  const start = now - BUCKETS * BUCKET_MS;
  const series = { failed: new Array(BUCKETS).fill(0), rate: new Array(BUCKETS).fill(0), blocked: new Array(BUCKETS).fill(0), start: new Date(start).toISOString(), bucketMs: BUCKET_MS };
  for (const r of cur) {
    const i = Math.min(BUCKETS - 1, Math.max(0, Math.floor((Date.parse(r.at) - start) / BUCKET_MS)));
    const n = Number(r.count) || 1;
    if (r.type === "failed_login") series.failed[i] += n;
    else if (r.type === "rate_limit") series.rate[i] += n;
    else if (r.type === "ip_blocked" || r.type === "access_ban") series.blocked[i] += n;
  }

  const bursts = cur.filter((r) => r.type === "brute_force").sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const spike = bursts[0] ? { at: bursts[0].first_at || bursts[0].at, ipMasked: bursts[0].ip_masked || null, id: bursts[0].id } : null;

  const counts = { all: cur.filter((r) => TYPES.includes(r.type)).length };
  for (const [k, types] of Object.entries(FILTERS)) counts[k] = cur.filter((r) => types.includes(r.type)).length;

  const bySource = new Map();
  for (const r of cur) {
    if (!r.ip_hash || r.type === "brute_force" || r.type === "admin_step_up") continue;
    const s = bySource.get(r.ip_hash) || { sourceRef: r.ip_hash, netRef: r.net_hash || null, ipMasked: r.ip_masked, netLabel: r.net_label || null, country: null, city: null, attempts: 0, lastAt: r.at };
    s.attempts += Number(r.count) || 1;
    if (!s.country && r.country) s.country = r.country;
    if (!s.city && r.city) s.city = r.city;
    if (r.at > s.lastAt) s.lastAt = r.at;
    bySource.set(r.ip_hash, s);
  }
  const top = [...bySource.values()].sort((a, b) => b.attempts - a.attempts).slice(0, 4);
  const max = top[0] ? top[0].attempts : 0;
  const sources = top.map((s) => ({
    ...s,
    pct: max ? Math.max(2, Math.round((s.attempts / max) * 100)) : 0,
    banned: typeof ctx.isBanned === "function" ? Boolean(ctx.isBanned(s)) : false,
  }));

  return { kpis, series, spike, counts, sources, bursts24h: bursts.length };
}

/** normal | elevated ("Dikkat") | high, from the last hours of events and the locks. */
function threatLevel(rows, now = Date.now(), { locksActive = 0 } = {}) {
  let burstsHour = 0;
  let bursts3h = 0;
  let failedHour = 0;
  let failedDay = 0;
  for (const r of rows || []) {
    const t = Date.parse(r.at);
    if (!Number.isFinite(t)) continue;
    const age = now - t;
    if (r.type === "brute_force") {
      if (age < HOUR) burstsHour += 1;
      if (age < 3 * HOUR) bursts3h += 1;
    }
    if (r.type === "failed_login" && age < 24 * HOUR) {
      failedDay += Number(r.count) || 1;
      if (age < HOUR) failedHour += Number(r.count) || 1;
    }
  }
  const hourlyAvg = failedDay / 24;
  if (burstsHour >= 2 || (failedHour >= 200 && failedHour > hourlyAvg * 4)) return "high";
  if (bursts3h >= 1 || locksActive > 0 || (failedHour >= 30 && failedHour > hourlyAvg * 2)) return "elevated";
  return "normal";
}

function __resetForTests(client) {
  dbOverride = client === undefined ? null : client;
  pending.clear();
  memory.length = 0;
  bf.clear();
  dropped = 0;
  pausedUntil = 0;
  warned = false;
  lastPostureAt = 0;
  lastPruneAt = Date.now();
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
}

function __pendingForTests() {
  return [...pending.values()];
}

module.exports = {
  TABLE,
  TYPES,
  FILTERS,
  FLUSH_MS,
  MAX_PENDING,
  MAX_ROWS_PER_FLUSH,
  BF_MIN_ATTEMPTS,
  BF_MIN_ACCOUNTS,
  attachIo,
  note,
  flush,
  sourceOf,
  publicEvent,
  rowsSince,
  listFeed,
  getEvent,
  findSource,
  recordPosture,
  postureWeekAgo,
  computeStats,
  threatLevel,
  persistent,
  __resetForTests,
  __pendingForTests,
};
