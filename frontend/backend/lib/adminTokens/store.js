"use strict";

/**
 * Admin Token database access (supabase/migrations/20261121_admin_api_tokens.sql).
 *
 * Until the migration is applied every table answers "missing": available() is false,
 * the tab shows "not set up" and dsk_admin_ bearer tokens are refused. The check is
 * repeated every 60 s, so applying the migration switches the feature on without a
 * restart.
 *
 * Token lookups by hash are cached for a few seconds (CACHE_MS), and every change made
 * here drops the token's cache entries at once, so a revoke or pause takes effect within
 * seconds even for a lookup that was cached elsewhere in the process.
 */

const TABLES = Object.freeze({
  tokens: "admin_api_tokens",
  hourly: "admin_api_token_usage_hourly",
  calls: "admin_api_token_calls",
  ips: "admin_api_token_ips",
  alerts: "admin_api_token_alerts",
  settings: "admin_api_token_settings",
});
const TOKEN_COLS =
  "id, owner_id, name, secret_hash, prefix, last4, expires_in, expires_at, ip_allowlist, paused, paused_at, paused_reason, " +
  "revoked_at, revoked_by, revoke_reason, revoke_note, grace_hash, grace_until, rotated_at, created_at, created_by, created_ip, " +
  "last_used_at, last_used_ip, last_used_country, last_client, request_count, updated_at";
const CACHE_MS = 4000;
const RECHECK_MS = 60 * 1000;
const SETTINGS_MS = 10 * 1000;
const OWNER_MS = 10 * 1000;
const DEFAULT_SETTINGS = Object.freeze({ enabled: true, rules: Object.freeze({ newCountry: true, newIp: false, burst: true }) });

const core = () => require("./core");

let dbOverride = null;
const db = () => dbOverride || require("../../db/supabase");

let availability = { value: null, at: 0 };
let warned = false;
const byHash = new Map(); // hash -> { at, row, viaGrace }
let settingsCache = null; // { at, value }
const ownerCache = new Map(); // userId -> { at, row }

function isMissingTable(err) {
  const msg = String(err?.message || err?.details || "");
  return err?.code === "42P01" || err?.code === "PGRST205" || (/admin_api_token/.test(msg) && /does not exist|not find|schema cache/i.test(msg));
}

class StoreError extends Error {
  constructor(code, message, status = 500) {
    super(message || code);
    this.code = code;
    this.status = status;
  }
}

function markUnavailable(err) {
  availability = { value: false, at: Date.now() };
  byHash.clear();
  if (!warned) {
    warned = true;
    console.warn("[admin-tokens] tables missing; apply supabase/migrations/20261121_admin_api_tokens.sql to enable admin tokens", err?.message ? `(${err.message})` : "");
  }
}

/** Throw TOKENS_UNAVAILABLE for a missing table, else the raw error. */
function check(res) {
  if (!res?.error) return res;
  if (isMissingTable(res.error)) {
    markUnavailable(res.error);
    throw new StoreError("TOKENS_UNAVAILABLE", "Admin tokens are not set up yet.", 503);
  }
  throw res.error;
}

/** Is the migration applied? Cached: true until a missing-table error, false for 60 s. */
async function available({ now = Date.now() } = {}) {
  if (availability.value === true) return true;
  if (availability.value === false && now - availability.at < RECHECK_MS) return false;
  try {
    const res = await db().from(TABLES.tokens).select("id").limit(1);
    if (res?.error) {
      if (isMissingTable(res.error)) {
        markUnavailable(res.error);
        return false;
      }
      // A transient error is not "missing": keep the previous answer (unknown counts as available).
      return availability.value !== false;
    }
    availability = { value: true, at: now };
    return true;
  } catch {
    return availability.value !== false;
  }
}

/* ---------------- tokens ---------------- */

function cleanRow(row) {
  if (!row) return null;
  return {
    ...row,
    ip_allowlist: Array.isArray(row.ip_allowlist) ? row.ip_allowlist : [],
    paused: Boolean(row.paused),
    request_count: Number(row.request_count) || 0,
  };
}

/**
 * Token row whose secret (or, after a rotate, grace secret) has this hash.
 * @returns {Promise<{row: object, viaGrace: boolean} | null>}
 */
async function findByHash(hash, { now = Date.now() } = {}) {
  const hit = byHash.get(hash);
  if (hit && now - hit.at < CACHE_MS) return hit.row ? { row: hit.row, viaGrace: hit.viaGrace } : null;
  let res = check(await db().from(TABLES.tokens).select(TOKEN_COLS).eq("secret_hash", hash).limit(1));
  let row = (res.data || [])[0] || null;
  let viaGrace = false;
  if (!row) {
    res = check(await db().from(TABLES.tokens).select(TOKEN_COLS).eq("grace_hash", hash).limit(1));
    row = (res.data || [])[0] || null;
    viaGrace = Boolean(row);
  }
  availability = { value: true, at: now };
  const clean = cleanRow(row);
  byHash.set(hash, { at: now, row: clean, viaGrace });
  if (byHash.size > 500) byHash.delete(byHash.keys().next().value);
  return clean ? { row: clean, viaGrace } : null;
}

/** Drop cached lookups of one token (or all). */
function invalidateLocal(tokenId = null) {
  if (!tokenId) {
    byHash.clear();
    return;
  }
  for (const [hash, v] of byHash) if (!v.row || v.row.id === tokenId) byHash.delete(hash);
}
// Hybrid server: clearing this cache also clears it on the other nodes (no-op on a single node).
const invalidate = require("../cluster").linkInvalidate("adminTokens", invalidateLocal);

async function getById(id) {
  const res = check(await db().from(TABLES.tokens).select(TOKEN_COLS).eq("id", String(id)).maybeSingle());
  return cleanRow(res.data);
}

const INACTIVE_LIST_MAX = 100;
const ACTIVE_MAX = 50;

/** Tokens that are neither revoked nor expired (every one, no limit; at most ACTIVE_MAX exist). */
async function listActive({ now = Date.now() } = {}) {
  const at = new Date(now).toISOString();
  const res = check(
    await db()
      .from(TABLES.tokens)
      .select(TOKEN_COLS)
      .is("revoked_at", null)
      .or(`expires_at.is.null,expires_at.gt.${at}`)
      .order("created_at", { ascending: false })
  );
  return (res.data || []).map(cleanRow).filter((r) => core().statusOf(r, now) === "active" || core().statusOf(r, now) === "paused");
}

/**
 * Every active (or paused) token, plus the newest INACTIVE_LIST_MAX expired and the newest
 * INACTIVE_LIST_MAX revoked ones; newest first.
 */
async function listTokens({ now = Date.now() } = {}) {
  const at = new Date(now).toISOString();
  const active = await listActive({ now });
  const expired = check(
    await db().from(TABLES.tokens).select(TOKEN_COLS).is("revoked_at", null).lte("expires_at", at).order("expires_at", { ascending: false }).limit(INACTIVE_LIST_MAX)
  );
  const revoked = check(
    await db().from(TABLES.tokens).select(TOKEN_COLS).not("revoked_at", "is", null).order("revoked_at", { ascending: false }).limit(INACTIVE_LIST_MAX)
  );
  const byId = new Map();
  for (const r of [...active, ...(expired.data || []).map(cleanRow), ...(revoked.data || []).map(cleanRow)]) byId.set(r.id, r);
  return [...byId.values()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

/**
 * Revoke every token that is not revoked yet, in single updates (rows created meanwhile
 * are caught by the next round). Returns the revoked rows ({ id, name }).
 */
async function revokeAllActive(patch, { maxRounds = 5 } = {}) {
  const out = [];
  for (let round = 0; round < maxRounds; round += 1) {
    const res = check(
      await db()
        .from(TABLES.tokens)
        .update({ ...patch, updated_at: new Date().toISOString() })
        .is("revoked_at", null)
        .select("id, name")
    );
    out.push(...(res.data || []));
    const left = check(await db().from(TABLES.tokens).select("id").is("revoked_at", null).limit(1));
    if (!(left.data || []).length) break;
  }
  invalidate();
  return out;
}

async function insertToken(row) {
  const res = check(await db().from(TABLES.tokens).insert(row).select(TOKEN_COLS).single());
  invalidate();
  return cleanRow(res.data);
}

async function updateToken(id, patch) {
  const res = check(
    await db()
      .from(TABLES.tokens)
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", String(id))
      .select(TOKEN_COLS)
      .maybeSingle()
  );
  invalidate(String(id));
  return cleanRow(res.data);
}

/* ---------------- owner ---------------- */

/** users row of the token's owner (id, username, is_admin, is_super_admin), cached briefly. */
async function ownerRow(userId, { now = Date.now() } = {}) {
  const hit = ownerCache.get(userId);
  if (hit && now - hit.at < OWNER_MS) return hit.row;
  let res = await db().from("users").select("id, username, is_admin, is_super_admin").eq("id", userId).maybeSingle();
  if (res?.error) res = await db().from("users").select("id, username, is_admin").eq("id", userId).maybeSingle();
  if (res?.error) throw res.error;
  const row = res?.data || null;
  ownerCache.set(userId, { at: now, row });
  if (ownerCache.size > 50) ownerCache.delete(ownerCache.keys().next().value);
  return row;
}

function isOwnerRow(row) {
  return Boolean(row) && (row.username === "admin" || Boolean(row.is_super_admin));
}

/* ---------------- auto-pause settings ---------------- */

function settingsFromRow(row) {
  if (!row) return { enabled: DEFAULT_SETTINGS.enabled, rules: { ...DEFAULT_SETTINGS.rules } };
  return {
    enabled: row.auto_pause_enabled !== false,
    rules: {
      newCountry: row.rule_new_country !== false,
      newIp: row.rule_new_ip === true,
      burst: row.rule_burst !== false,
    },
  };
}

async function getSettings({ now = Date.now() } = {}) {
  if (settingsCache && now - settingsCache.at < SETTINGS_MS) return settingsCache.value;
  let value;
  try {
    const res = await db().from(TABLES.settings).select("*").eq("id", 1).maybeSingle();
    if (res?.error) value = settingsFromRow(null);
    else value = settingsFromRow(res.data);
  } catch {
    value = settingsFromRow(null);
  }
  settingsCache = { at: now, value };
  return value;
}

async function saveSettings({ enabled, rules }, actorId) {
  const row = {
    id: 1,
    auto_pause_enabled: Boolean(enabled),
    rule_new_country: Boolean(rules?.newCountry),
    rule_new_ip: Boolean(rules?.newIp),
    rule_burst: Boolean(rules?.burst),
    updated_at: new Date().toISOString(),
    updated_by: actorId || null,
  };
  check(await db().from(TABLES.settings).upsert(row, { onConflict: "id" }));
  settingsCache = null;
  return settingsFromRow(row);
}

/* ---------------- alerts ---------------- */

const ALERT_COLS = "id, token_id, kind, ip, country, detail, status, auto_paused, created_at, handled_at, handled_by, handled_action";

async function insertAlert(row) {
  const res = check(await db().from(TABLES.alerts).insert(row).select(ALERT_COLS).single());
  return res.data;
}

async function listAlerts({ limit = 200, tokenId = null } = {}) {
  let q = db().from(TABLES.alerts).select(ALERT_COLS);
  if (tokenId) q = q.eq("token_id", String(tokenId));
  const res = check(await q.order("created_at", { ascending: false }).limit(limit));
  return res.data || [];
}

async function getAlert(id) {
  const res = check(await db().from(TABLES.alerts).select(ALERT_COLS).eq("id", String(id)).maybeSingle());
  return res.data || null;
}

async function updateAlert(id, patch) {
  const res = check(await db().from(TABLES.alerts).update(patch).eq("id", String(id)).select(ALERT_COLS).maybeSingle());
  return res.data || null;
}

function __setDbForTests(client) {
  dbOverride = client;
  __resetForTests();
}

function __resetForTests() {
  availability = { value: null, at: 0 };
  warned = false;
  byHash.clear();
  settingsCache = null;
  ownerCache.clear();
}

module.exports = {
  TABLES,
  TOKEN_COLS,
  CACHE_MS,
  DEFAULT_SETTINGS,
  StoreError,
  isMissingTable,
  check,
  db,
  available,
  markUnavailable,
  findByHash,
  invalidate,
  getById,
  listTokens,
  listActive,
  revokeAllActive,
  ACTIVE_MAX,
  INACTIVE_LIST_MAX,
  insertToken,
  updateToken,
  ownerRow,
  isOwnerRow,
  getSettings,
  saveSettings,
  settingsFromRow,
  insertAlert,
  listAlerts,
  getAlert,
  updateAlert,
  __setDbForTests,
  __resetForTests,
};
