"use strict";

/**
 * Special badges (Özel rozetler). Everything that changes data goes through the Postgres
 * functions in supabase/migrations/20261026_special_badges.sql, which hold the rules
 * (one live copy per person, #001 has one holder, Facebook is admin-only, one worn badge).
 * Reads are tolerant: before the migration is applied they return "nothing" instead of
 * failing, so profiles and member lists keep working.
 */

const supabase = require("../db/supabase");

const BADGE_ID_RE = /^[a-z0-9]{2,32}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class SpecialBadgeError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

const STATUS_BY_ERROR = {
  badge_not_found: 404,
  user_not_found: 404,
  not_owned: 404,
  badge_inactive: 409,
  admin_only: 409,
  owned: 409,
  taken: 409,
  source: 400,
  invalid_input: 400,
};

function isBadgeId(id) {
  return typeof id === "string" && BADGE_ID_RE.test(id);
}
function isUuid(id) {
  return typeof id === "string" && UUID_RE.test(id);
}

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    const err = new SpecialBadgeError("server_error", 500);
    err.cause = error;
    throw err;
  }
  return data;
}

/** Same call, but "not migrated yet" (or any read failure) reads as `fallback`. */
async function softRpc(name, args, fallback) {
  try {
    const { data, error } = await supabase.rpc(name, args);
    if (error) return fallback;
    return data ?? fallback;
  } catch {
    return fallback;
  }
}

function fail(result) {
  const code = result?.error || "invalid_input";
  throw new SpecialBadgeError(code, STATUS_BY_ERROR[code] || 400);
}

// ---- catalog (cached briefly; holder counts change only on grant/take-back)
let catalogCache = { at: 0, rows: null };
const CATALOG_TTL_MS = 30_000;

function invalidateCatalog() {
  catalogCache = { at: 0, rows: null };
}

async function catalog({ fresh = false } = {}) {
  if (!fresh && catalogCache.rows && Date.now() - catalogCache.at < CATALOG_TTL_MS) return catalogCache.rows;
  const rows = await softRpc("special_badge_catalog", {}, null);
  if (!Array.isArray(rows)) return [];
  catalogCache = { at: Date.now(), rows };
  return rows;
}

/** Public shape: admins also see grant rules; everybody sees names, tiers and holder counts. */
function publicCatalogRow(row, { admin = false } = {}) {
  const out = {
    id: row.id,
    no: row.no,
    name: row.name,
    tier: row.tier,
    description: row.description,
    holders: Number(row.holders) || 0,
    maxHolders: row.maxHolders ?? null,
  };
  if (admin) {
    out.grantMode = row.grantMode;
    out.active = row.active !== false;
  }
  return out;
}

// ---- per person
async function badgesForUser(userId) {
  if (!isUuid(userId)) return [];
  const rows = await softRpc("special_badge_user_badges", { p_user_id: userId }, []);
  return Array.isArray(rows) ? rows : [];
}

/** Map userId -> { id, serial } for the worn badge of each user (tolerant). */
async function equippedForUsers(userIds) {
  const ids = [...new Set((userIds || []).filter(isUuid))];
  const out = new Map();
  if (!ids.length) return out;
  const rows = await softRpc("special_badge_equipped_for", { p_user_ids: ids }, []);
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row && row.userId && row.id) out.set(row.userId, { id: row.id, serial: row.serial });
  }
  return out;
}

async function equip(userId, badgeId) {
  if (badgeId !== null && !isBadgeId(badgeId)) throw new SpecialBadgeError("invalid_input", 400);
  const res = await rpc("special_badge_equip", { p_user_id: userId, p_badge_id: badgeId });
  if (!res?.ok) fail(res);
  return { equipped: res.equipped ?? null, previous: res.previous ?? null };
}

// ---- admin
async function grant({ userId, badgeId, actorId, note }) {
  if (!isUuid(userId) || !isBadgeId(badgeId)) throw new SpecialBadgeError("invalid_input", 400);
  const cleanNote = typeof note === "string" ? note.trim().slice(0, 280) || null : null;
  const res = await rpc("special_badge_grant", {
    p_user_id: userId, p_badge_id: badgeId, p_source: "admin", p_actor_id: actorId || null, p_note: cleanNote,
  });
  if (!res?.ok || res.granted === false) fail(res);
  invalidateCatalog();
  return { serial: res.serial, rowId: res.id };
}

async function revoke({ userId, badgeId, actorId, reason }) {
  if (!isUuid(userId) || !isBadgeId(badgeId)) throw new SpecialBadgeError("invalid_input", 400);
  const cleanReason = typeof reason === "string" ? reason.trim().slice(0, 280) || null : null;
  const res = await rpc("special_badge_revoke", {
    p_user_id: userId, p_badge_id: badgeId, p_actor_id: actorId || null, p_reason: cleanReason,
  });
  if (!res?.ok) fail(res);
  invalidateCatalog();
  return { serial: res.serial, wasEquipped: Boolean(res.wasEquipped) };
}

async function holders(badgeId, limit = 200) {
  if (!isBadgeId(badgeId)) throw new SpecialBadgeError("invalid_input", 400);
  return (await rpc("special_badge_holders", { p_badge_id: badgeId, p_limit: limit })) || [];
}

async function auditLog({ limit = 50, badgeId = null } = {}) {
  if (badgeId !== null && !isBadgeId(badgeId)) throw new SpecialBadgeError("invalid_input", 400);
  return (await rpc("special_badge_audit_list", { p_limit: limit, p_badge_id: badgeId })) || [];
}

async function overview() {
  return (await rpc("special_badge_admin_overview", {})) || {};
}

/**
 * Promo admin form guard: may a promo code carry this badge? Mirrors the database trigger
 * (active, not admin-only, a limited badge only while it has room) so the form gets a clear
 * "reward_badge" error instead of a failed insert.
 */
async function promoGrantable(badgeId) {
  if (!isBadgeId(badgeId)) return false;
  const rows = await catalog({ fresh: true });
  // Catalog not installed (migration not applied yet): let the database answer badges_unavailable.
  if (!rows.length) return null;
  const row = rows.find((b) => b.id === badgeId);
  if (!row || row.active === false || row.grantMode !== "promo") return false;
  if (row.maxHolders != null && Number(row.holders) >= Number(row.maxHolders)) return false;
  return true;
}

// ---- deferred popups (granted / taken back while offline)
async function pendingFor(userId) {
  const res = await softRpc("special_badge_pending", { p_user_id: userId }, null);
  return {
    granted: Array.isArray(res?.granted) ? res.granted : [],
    revoked: Array.isArray(res?.revoked) ? res.revoked : [],
  };
}

async function markNotified(userId, rowIds) {
  const ids = (rowIds || []).filter(isUuid);
  if (!ids.length) return 0;
  return softRpc("special_badge_mark_notified", { p_user_id: userId, p_row_ids: ids }, 0);
}

/** Account deletion: every live badge goes back (frees #001 for someone else). */
async function releaseUser(userId) {
  return softRpc("special_badge_release_user", { p_user_id: userId, p_reason: "account_deleted" }, 0);
}

module.exports = {
  SpecialBadgeError,
  isBadgeId,
  isUuid,
  catalog,
  publicCatalogRow,
  invalidateCatalog,
  badgesForUser,
  equippedForUsers,
  equip,
  grant,
  revoke,
  holders,
  auditLog,
  overview,
  promoGrantable,
  pendingFor,
  markNotified,
  releaseUser,
};
