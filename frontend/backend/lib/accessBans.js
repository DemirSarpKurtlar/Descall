"use strict";

/**
 * Erişim yasakları (3.5.0): block an IP address, a network (IPv4 /24, IPv6
 * /64) or a device from signing in, signing up and connecting, on top of the
 * account ban (users.is_banned). Tables: public.access_bans +
 * public.access_ban_hits (supabase/migrations/20261101_access_bans.sql).
 *
 * Privacy (KVKK): addresses and device ids are never stored. Each ban keeps a
 * keyed HMAC of the value plus a masked label for the admin screen
 * ("88.230.x.x"). A hit stores the masked address only.
 *
 * Checks run against an in-memory copy of the active bans (refreshed every
 * 60 s and on every change), so a sign-in or socket connect never waits on
 * the database. Missing tables / no hash key = no bans (fail open), logged once.
 * Admin accounts are never blocked by an IP / device ban (a ban on a shared
 * network must not lock the team out); they are still subject to account bans.
 */

const crypto = require("crypto");
const { ipSubnet, isPrivateSubnet } = require("./descoinAntibot/hashing");
const { maskIp, isPublicIp } = require("./clientIp");

const KINDS = Object.freeze(["ip", "network", "device"]);
const DURATIONS = Object.freeze({ "1d": 86400, "7d": 7 * 86400, "30d": 30 * 86400, "90d": 90 * 86400, permanent: null });
const REFRESH_MS = 60 * 1000;
const DEVICE_RE = /^[A-Za-z0-9_-]{16,80}$/;

let dbOverride = null;
const db = () => dbOverride || require("../db/supabase");

let cachedKey = null;
let cachedFrom = null;
function key(env = process.env) {
  const base = env.ACCESS_BAN_HASH_SECRET || env.JWT_SECRET || "";
  if (!base) return null;
  if (cachedFrom === base && cachedKey) return cachedKey;
  cachedFrom = base;
  cachedKey = crypto.createHash("sha256").update(`descall:access-ban:v1:${base}`).digest();
  return cachedKey;
}
function hmac(value) {
  const k = key();
  if (!k) return null;
  return crypto.createHmac("sha256", k).update(String(value)).digest("hex").slice(0, 48);
}

function normalizeIp(ip) {
  return String(ip || "").trim().replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i, "$1").toLowerCase();
}

/** Hashes this visitor can be matched on: { ip, network, device } (null when unknown / private). */
function fingerprintOf({ ip, deviceId } = {}) {
  const out = { ip: null, network: null, device: null };
  const addr = normalizeIp(ip);
  if (addr && isPublicIp(addr)) {
    out.ip = hmac(`ip:${addr}`);
    const sub = ipSubnet(addr);
    if (sub && !isPrivateSubnet(sub)) out.network = hmac(`net:${sub}`);
  }
  const dev = String(deviceId || "").trim();
  if (DEVICE_RE.test(dev)) out.device = hmac(`dev:${dev}`);
  return out;
}

function cleanDeviceId(value) {
  const s = String(value || "").trim();
  return DEVICE_RE.test(s) ? s : null;
}

/* ---------------- in-memory index ---------------- */

const state = { byHash: new Map(), loadedAt: 0, loading: null, unavailable: false, warned: false };

function isActive(row, now = Date.now()) {
  if (!row || row.revoked_at) return false;
  if (row.expires_at && Date.parse(row.expires_at) <= now) return false;
  return true;
}

function indexRows(rows) {
  const map = new Map();
  for (const r of rows || []) if (isActive(r) && r.hash) map.set(`${r.kind}:${r.hash}`, r);
  return map;
}

async function refresh({ force = false } = {}) {
  if (!force && Date.now() - state.loadedAt < REFRESH_MS) return;
  if (state.loading) return state.loading;
  state.loading = (async () => {
    try {
      // Expired rows are dropped by indexRows (isActive).
      const { data, error } = await db()
        .from("access_bans")
        .select("id, kind, hash, label, reason, expires_at, revoked_at")
        .is("revoked_at", null)
        .limit(5000);
      if (error) throw error;
      state.byHash = indexRows(data);
      state.unavailable = false;
    } catch (err) {
      state.unavailable = true;
      if (!state.warned) {
        state.warned = true;
        console.warn("[access-bans] disabled:", err?.message || err, "(apply supabase/migrations/20261101_access_bans.sql)");
      }
    } finally {
      state.loadedAt = Date.now();
      state.loading = null;
    }
  })();
  return state.loading;
}

/** The active ban matching this visitor, most specific first (device, ip, network), or null. */
function match(fp) {
  if (!fp) return null;
  for (const kind of ["device", "ip", "network"]) {
    const h = fp[kind];
    if (!h) continue;
    const row = state.byHash.get(`${kind}:${h}`);
    if (row && isActive(row)) return row;
  }
  return null;
}

async function recordHit(ban, { action, ip, userId = null }) {
  try {
    await db().from("access_ban_hits").insert({ ban_id: ban.id, action, ip_masked: maskIp(ip), user_id: userId });
    await db().rpc?.("access_ban_touch", { p_ban: ban.id });
  } catch {
    /* best effort */
  }
}

/**
 * Check a visitor. `action` = "login" | "register" | "socket" | "oauth".
 * Returns null (allowed) or { ban, publicBody } to send as 403.
 */
async function check({ ip, deviceId, action, userId = null, isAdmin = false } = {}) {
  if (isAdmin) return null;
  await refresh();
  if (state.unavailable || state.byHash.size === 0) return null;
  const ban = match(fingerprintOf({ ip, deviceId }));
  if (!ban) return null;
  recordHit(ban, { action, ip, userId });
  return {
    ban,
    publicBody: {
      error: "Access to Descall from this device or network is blocked.",
      code: "ACCESS_BANNED",
      expiresAt: ban.expires_at || null,
    },
  };
}

/**
 * Read-only: the active ban that would stop this address / stored device hash,
 * or null. No hit is recorded (Kullanıcının gözünden, 3.7.2).
 */
async function peek({ ip, deviceHash } = {}) {
  await refresh();
  if (state.unavailable || state.byHash.size === 0) return null;
  const fp = fingerprintOf({ ip });
  if (deviceHash) fp.device = String(deviceHash);
  return match(fp);
}

/* ---------------- admin operations ---------------- */

function expiryFor(duration, now = Date.now()) {
  if (!Object.prototype.hasOwnProperty.call(DURATIONS, duration)) return undefined;
  const sec = DURATIONS[duration];
  return sec == null ? null : new Date(now + sec * 1000).toISOString();
}

function publicBan(row) {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    reason: row.reason || null,
    sourceUserId: row.source_user_id || null,
    sourceUsername: row.source_username || null,
    createdBy: row.created_by_username || null,
    createdAt: row.created_at,
    expiresAt: row.expires_at || null,
    revokedAt: row.revoked_at || null,
    revokedBy: row.revoked_by_username || null,
    hits: Number(row.hits || 0),
    lastHitAt: row.last_hit_at || null,
    active: isActive(row),
  };
}

function bad(message, code = "BAD_REQUEST", status = 400) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

async function insertBans(rows) {
  const { data, error } = await db().from("access_bans").insert(rows).select("*");
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") throw bad("Access bans are not enabled yet.", "BANS_UNAVAILABLE", 503);
    throw error;
  }
  await refresh({ force: true });
  return (data || []).map(publicBan);
}

/** Ban a typed IP address (kind "ip") or its network (kind "network"). */
async function banAddress({ ip, kind, duration, reason, actor }) {
  if (kind !== "ip" && kind !== "network") throw bad("Invalid ban type.");
  const addr = normalizeIp(ip);
  if (!addr || !isPublicIp(addr) || !(ipSubnet(addr))) throw bad("Enter a valid, public IP address.", "BAD_IP");
  const expires = expiryFor(duration);
  if (expires === undefined) throw bad("Invalid duration.");
  const fp = fingerprintOf({ ip: addr });
  const hash = fp[kind];
  if (!hash) throw bad("This address can't be banned.", "BAD_IP");
  await refresh({ force: true });
  if (state.byHash.has(`${kind}:${hash}`)) throw bad("This address is already banned.", "ALREADY_BANNED", 409);
  const label = kind === "ip" ? maskIp(addr) : `${maskIp(addr)} network (${ipSubnet(addr).includes(":") ? "/64" : "/24"})`;
  return insertBans([
    {
      kind,
      hash,
      label,
      reason: String(reason || "").trim().slice(0, 300) || null,
      created_by: actor?.id || null,
      created_by_username: actor?.username || null,
      expires_at: expires,
    },
  ]);
}

/**
 * Ban the devices and addresses an account signed in from (its saved
 * sessions). Skips values already banned and returns what was added.
 */
async function banAccountAccess({ userId, duration, reason, actor, includeNetwork = false }) {
  const expires = expiryFor(duration);
  if (expires === undefined) throw bad("Invalid duration.");
  const { data: user, error } = await db().from("users").select("id, username, is_admin, active_sessions").eq("id", userId).maybeSingle();
  if (error) throw error;
  if (!user) throw bad("User not found.", "NOT_FOUND", 404);
  if (user.is_admin || user.username === "admin") throw bad("Admin accounts' devices can't be banned.", "IS_ADMIN", 400);
  await refresh({ force: true });
  const sessions = Array.isArray(user.active_sessions) ? user.active_sessions : [];
  const want = new Map();
  for (const s of sessions) {
    const fp = fingerprintOf({ ip: s?.ip });
    const deviceHash = typeof s?.deviceHash === "string" && /^[0-9a-f]{48}$/.test(s.deviceHash) ? s.deviceHash : null;
    if (deviceHash) want.set(`device:${deviceHash}`, { kind: "device", hash: deviceHash, label: `Cihaz · ${String(s.device || "bilinmiyor").slice(0, 60)}` });
    if (fp.ip) want.set(`ip:${fp.ip}`, { kind: "ip", hash: fp.ip, label: maskIp(s.ip) });
    if (includeNetwork && fp.network) want.set(`network:${fp.network}`, { kind: "network", hash: fp.network, label: `${maskIp(s.ip)} network` });
  }
  const fresh = [...want.entries()].filter(([k]) => !state.byHash.has(k)).map(([, v]) => v);
  if (!fresh.length) return { added: [], skipped: want.size };
  const rows = fresh.map((v) => ({
    ...v,
    reason: String(reason || "").trim().slice(0, 300) || null,
    source_user_id: user.id,
    source_username: user.username,
    created_by: actor?.id || null,
    created_by_username: actor?.username || null,
    expires_at: expires,
  }));
  const added = await insertBans(rows);
  return { added, skipped: want.size - fresh.length };
}

async function revokeBan({ id, actor }) {
  const { data, error } = await db()
    .from("access_bans")
    .update({ revoked_at: new Date().toISOString(), revoked_by: actor?.id || null, revoked_by_username: actor?.username || null })
    .eq("id", id)
    .is("revoked_at", null)
    .select("*");
  if (error) throw error;
  const row = (data || [])[0];
  if (!row) throw bad("Ban not found or already lifted.", "NOT_FOUND", 404);
  await refresh({ force: true });
  return publicBan(row);
}

async function listBans({ status = "active", limit = 200 } = {}) {
  let q = db().from("access_bans").select("*").order("created_at", { ascending: false }).limit(Math.min(500, Math.max(1, Number(limit) || 200)));
  if (status === "active") q = q.is("revoked_at", null);
  const { data, error } = await q;
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return { bans: [], available: false };
    throw error;
  }
  let bans = (data || []).map(publicBan);
  if (status === "active") bans = bans.filter((b) => b.active);
  else if (status === "ended") bans = bans.filter((b) => !b.active);
  return { bans, available: true };
}

async function listHits({ limit = 100 } = {}) {
  const { data, error } = await db()
    .from("access_ban_hits")
    .select("*")
    .order("at", { ascending: false })
    .limit(Math.min(300, Math.max(1, Number(limit) || 100)));
  if (error) return [];
  return (data || []).map((h) => ({ id: h.id, banId: h.ban_id, action: h.action, ipMasked: h.ip_masked || null, userId: h.user_id || null, at: h.at }));
}

function __setDbForTests(client) {
  dbOverride = client;
  state.byHash = new Map();
  state.loadedAt = 0;
  state.unavailable = false;
  state.warned = false;
}

module.exports = {
  KINDS,
  DURATIONS,
  fingerprintOf,
  cleanDeviceId,
  expiryFor,
  isActive,
  match,
  check,
  peek,
  refresh,
  banAddress,
  banAccountAccess,
  revokeBan,
  listBans,
  listHits,
  publicBan,
  __setDbForTests,
};
