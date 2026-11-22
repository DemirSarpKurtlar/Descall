"use strict";

/**
 * Sunucu Ağı database access (supabase/migrations/20261122_node_cluster.sql):
 *   node_keys      PC node keys (SHA-256 of the secret only), at most 5 active
 *   node_settings  id "pc" = the PC config (dc:cfg:pc copy), id "ledger" = this month's
 *                  PC GB-hours (saved-cost line)
 *   node_events    durable copy of the events table (owner actions, alerts)
 *
 * 20261122b_node_bootstrap.sql adds node_keys.bootstrap_until / bootstrapped_at (the PC's
 * enrollment window for POST /api/node/bootstrap). Until it is applied the window is
 * created_at + 30 min and cannot be reopened (BOOTSTRAP_UNAVAILABLE); the rest is unchanged.
 *
 * Until the migration is applied every table answers "missing": available() is false,
 * key management answers KEYS_UNAVAILABLE (the tab says so), settings stay in the
 * cluster / memory and events in the cluster ring. Rechecked every 60 s, so applying the
 * migration switches it on without a restart. Never throws for a missing table outside
 * the key calls.
 */

const M = require("./model");

const TABLES = Object.freeze({ keys: "node_keys", settings: "node_settings", events: "node_events" });
const KEY_COLS = "id, name, secret_hash, prefix, last4, created_at, created_by, last_used_at, last_used_node, last_used_ip, revoked_at, revoked_by, revoke_reason";
/** 20261122b_node_bootstrap.sql */
const BOOTSTRAP_COLS = "bootstrap_until, bootstrapped_at";
/** A key may fetch the node environment this long after it was created or reopened. */
const BOOTSTRAP_WINDOW_MS = 30 * 60 * 1000;
const RECHECK_MS = 60 * 1000;
const CACHE_MS = 5000;
const TOUCH_MS = 60 * 1000;

let dbOverride = null;
const db = () => dbOverride || require("../../db/supabase");

let availability = { value: null, at: 0 };
/** Are the bootstrap columns there? null unknown, false for RECHECK_MS after a miss. */
let bootstrapCols = { value: null, at: 0 };
let warned = false;
let warnedCols = false;
const byHash = new Map(); // hash -> { at, row }
const touched = new Map(); // id -> ms
let memLedger = { month: M.monthKey(), gbHours: 0, pcHours: 0 };

class StoreError extends Error {
  constructor(code, message, status = 500) {
    super(message || code);
    this.code = code;
    this.status = status;
  }
}

/** A missing bootstrap column (42703 select / PGRST204 write), not a missing table. */
function isMissingColumn(err) {
  const msg = String(err?.message || err?.details || "");
  return err?.code === "42703" || err?.code === "PGRST204" || (/bootstrap(_until|ped_at)/.test(msg) && /does not exist|not find|schema cache/i.test(msg));
}

function isMissingTable(err) {
  if (isMissingColumn(err)) return false;
  const msg = String(err?.message || err?.details || "");
  return err?.code === "42P01" || err?.code === "PGRST205" || (/node_(keys|settings|events)/.test(msg) && /does not exist|not find|schema cache/i.test(msg));
}

function markUnavailable(err) {
  availability = { value: false, at: Date.now() };
  byHash.clear();
  if (!warned) {
    warned = true;
    console.warn("[node-keys] tables missing; apply supabase/migrations/20261122_node_cluster.sql to enable node keys", err?.message ? `(${err.message})` : "");
  }
}

function check(res) {
  if (!res?.error) return res;
  if (isMissingTable(res.error)) {
    markUnavailable(res.error);
    throw new StoreError("KEYS_UNAVAILABLE", "Node keys are not set up yet.", 503);
  }
  throw res.error;
}

/** Is the migration applied? true until a missing-table error, false for 60 s. */
async function available({ now = Date.now() } = {}) {
  if (availability.value === true) return true;
  if (availability.value === false && now - availability.at < RECHECK_MS) return false;
  try {
    const res = await db().from(TABLES.keys).select("id").limit(1);
    if (res?.error) {
      if (isMissingTable(res.error)) {
        markUnavailable(res.error);
        return false;
      }
      return availability.value === true;
    }
    availability = { value: true, at: now };
    return true;
  } catch {
    return false;
  }
}

/* ---------------- keys ---------------- */

function keyView(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    last4: row.last4,
    masked: M.maskedKey(row.prefix, row.last4),
    status: row.revoked_at ? "revoked" : "active",
    createdAt: row.created_at || null,
    lastUsedAt: row.last_used_at || null,
    lastUsedNode: row.last_used_node || null,
    revokedAt: row.revoked_at || null,
    revokeReason: row.revoke_reason || null,
    bootstrapUntil: row.revoked_at ? null : new Date(bootstrapUntilMs(row)).toISOString(),
    bootstrappedAt: row.bootstrapped_at || null,
  };
}

/* ---------------- bootstrap window ---------------- */

/**
 * End of the enrollment window (ms): the owner's explicit window (bootstrap_until, set by
 * "Kurulum penceresini aç" / closed early) when there is one, else created_at + 30 min.
 */
function bootstrapUntilMs(row) {
  if (!row) return 0;
  const explicit = Date.parse(row.bootstrap_until || "");
  if (Number.isFinite(explicit)) return explicit;
  const created = Date.parse(row.created_at || "");
  return Number.isFinite(created) ? created + BOOTSTRAP_WINDOW_MS : 0;
}

function colsAvailable(now = Date.now()) {
  if (bootstrapCols.value === false && now - bootstrapCols.at >= RECHECK_MS) bootstrapCols = { value: null, at: 0 };
  return bootstrapCols.value !== false;
}

function markColsMissing(err) {
  bootstrapCols = { value: false, at: Date.now() };
  if (!warnedCols) {
    warnedCols = true;
    console.warn("[node-keys] bootstrap columns missing; apply supabase/migrations/20261122b_node_bootstrap.sql to reopen the PC setup window", err?.code ? `(${err.code})` : "");
  }
}


/** Select key rows with the bootstrap columns when they exist, without them otherwise. */
async function selectKeys(build) {
  if (colsAvailable()) {
    const res = await build(`${KEY_COLS}, ${BOOTSTRAP_COLS}`);
    if (!res?.error) {
      bootstrapCols = { value: true, at: Date.now() };
      return res;
    }
    if (!isMissingColumn(res.error)) return res;
    markColsMissing(res.error);
  }
  return build(KEY_COLS);
}

async function listKeys() {
  const res = check(await selectKeys((cols) => db().from(TABLES.keys).select(cols).order("created_at", { ascending: false }).limit(100)));
  availability = { value: true, at: Date.now() };
  return (res.data || []).map(keyView);
}

async function activeCount() {
  const res = check(await db().from(TABLES.keys).select("id").is("revoked_at", null));
  return (res.data || []).length;
}

/** Create a key. Returns { key, secret } (the secret exists only in this answer). */
async function createKey({ name, actorId }) {
  if ((await activeCount()) >= M.KEY_ACTIVE_MAX) throw new StoreError("KEY_LIMIT", `At most ${M.KEY_ACTIVE_MAX} active node keys.`, 409);
  const secret = M.newKeySecret();
  const { prefix, last4 } = M.keyParts(secret);
  const res = check(
    await db()
      .from(TABLES.keys)
      .insert({ name, secret_hash: M.hashKey(secret), prefix, last4, created_by: actorId || null, created_at: new Date().toISOString() })
      .select(KEY_COLS)
      .single()
  );
  // A new key opens its enrollment window by itself (created_at + 30 min).
  return { key: keyView(res.data), secret };
}

async function getKey(id) {
  const res = check(await selectKeys((cols) => db().from(TABLES.keys).select(cols).eq("id", id).maybeSingle()));
  return res.data || null;
}

/**
 * Bootstrap state of an active key: { open, until (ms), explicit, bootstrappedAt, name }.
 * null when the key is unknown or revoked. Never throws.
 */
async function bootstrapWindow(id, { now = Date.now() } = {}) {
  try {
    const row = await getKey(id);
    if (!row || row.revoked_at) return null;
    const until = bootstrapUntilMs(row);
    return { open: now < until, until, explicit: Boolean(row.bootstrap_until), bootstrappedAt: row.bootstrapped_at || null, name: row.name };
  } catch {
    return null;
  }
}

/**
 * Owner action: open the window for 30 minutes from now (open: true) or close it now.
 * Needs the bootstrap columns: BOOTSTRAP_UNAVAILABLE (503) before 20261122b is applied.
 */
async function setBootstrapWindow(id, { open, now = Date.now() } = {}) {
  const row = await getKey(id);
  if (!row) throw new StoreError("KEY_NOT_FOUND", "Node key not found.", 404);
  if (row.revoked_at) throw new StoreError("KEY_REVOKED", "This node key is already revoked.", 409);
  const until = new Date(open ? now + BOOTSTRAP_WINDOW_MS : now).toISOString();
  if (!colsAvailable(now)) throw new StoreError("BOOTSTRAP_UNAVAILABLE", "The setup window needs a database update.", 503);
  const res = await db().from(TABLES.keys).update({ bootstrap_until: until }).eq("id", id).select(`${KEY_COLS}, ${BOOTSTRAP_COLS}`).maybeSingle();
  if (res?.error) {
    if (isMissingColumn(res.error)) {
      markColsMissing(res.error);
      throw new StoreError("BOOTSTRAP_UNAVAILABLE", "The setup window needs a database update.", 503);
    }
    check(res);
  }
  return keyView(res?.data || { ...row, bootstrap_until: until });
}

/** A successful bootstrap: remember when (best effort; the event row is the record). */
async function markBootstrapped(id, { now = Date.now() } = {}) {
  if (!colsAvailable(now)) return false;
  try {
    const res = await db().from(TABLES.keys).update({ bootstrapped_at: new Date(now).toISOString() }).eq("id", id);
    if (res?.error) {
      if (isMissingColumn(res.error)) markColsMissing(res.error);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function revokeKey(id, { reason, actorId }) {
  const row = await getKey(id);
  if (!row) throw new StoreError("KEY_NOT_FOUND", "Node key not found.", 404);
  if (row.revoked_at) throw new StoreError("KEY_REVOKED", "This node key is already revoked.", 409);
  const patch = { revoked_at: new Date().toISOString(), revoked_by: actorId || null, revoke_reason: reason };
  const res = check(await db().from(TABLES.keys).update(patch).eq("id", id).select(KEY_COLS).maybeSingle());
  for (const [h, v] of byHash) if (v.row?.id === id) byHash.delete(h);
  return keyView(res.data || { ...row, ...patch });
}

/**
 * Check a `dsk_node_` bearer (node-to-node routes, owned by agent 2). Returns
 * { id, name } for an active key, else null. Never throws.
 */
async function verify(secret, { nodeId = null, ip = null, now = Date.now() } = {}) {
  if (!M.isWellFormedKey(secret)) return null;
  const hash = M.hashKey(secret);
  try {
    let hit = byHash.get(hash);
    if (!hit || now - hit.at > CACHE_MS) {
      const res = await db().from(TABLES.keys).select("id, name, secret_hash, revoked_at").eq("secret_hash", hash).maybeSingle();
      if (res?.error) {
        if (isMissingTable(res.error)) markUnavailable(res.error);
        return null;
      }
      hit = { at: now, row: res.data || null };
      byHash.set(hash, hit);
    }
    const row = hit.row;
    if (!row || row.revoked_at || row.secret_hash !== hash) return null;
    if (now - (touched.get(row.id) || 0) > TOUCH_MS) {
      touched.set(row.id, now);
      db()
        .from(TABLES.keys)
        .update({ last_used_at: new Date(now).toISOString(), last_used_node: nodeId ? String(nodeId).slice(0, 40) : null, last_used_ip: ip ? String(ip).slice(0, 64) : null })
        .eq("id", row.id)
        .then(() => {}, () => {});
    }
    return { id: row.id, name: row.name };
  } catch {
    return null;
  }
}

/** { available, active, everUsed, lastUsedAt } for the overview; never throws. */
async function keySummary() {
  if (!(await available())) return { available: false, active: 0, everUsed: false, lastUsedAt: null };
  try {
    const keys = await listKeys();
    const used = keys.map((k) => k.lastUsedAt).filter(Boolean).sort();
    return { available: true, active: keys.filter((k) => k.status === "active").length, everUsed: used.length > 0, lastUsedAt: used[used.length - 1] || null };
  } catch {
    return { available: false, active: 0, everUsed: false, lastUsedAt: null };
  }
}

/* ---------------- settings, ledger, events (never throw) ---------------- */

async function loadSetting(id) {
  try {
    const res = await db().from(TABLES.settings).select("id, value, updated_at").eq("id", id).maybeSingle();
    if (res?.error) {
      if (isMissingTable(res.error)) markUnavailable(res.error);
      return null;
    }
    return res.data || null;
  } catch {
    return null;
  }
}

async function saveSetting(id, value, actorId = null) {
  try {
    const res = await db()
      .from(TABLES.settings)
      .upsert({ id, value, updated_at: new Date().toISOString(), updated_by: actorId || null }, { onConflict: "id" });
    if (res?.error) {
      if (isMissingTable(res.error)) markUnavailable(res.error);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function loadCfg() {
  const row = await loadSetting("pc");
  return row?.value && typeof row.value === "object" ? row.value : null;
}

function saveCfg(cfg, actorId) {
  return saveSetting("pc", cfg, actorId);
}

/** This month's ledger (memory first; the durable row when it is newer). */
async function loadLedger(now = Date.now()) {
  const month = M.monthKey(now);
  if (memLedger.month !== month) memLedger = { month, gbHours: 0, pcHours: 0 };
  const row = await loadSetting("ledger");
  const v = row?.value;
  if (v && v.month === month && Number(v.gbHours) > memLedger.gbHours) memLedger = { month, gbHours: Number(v.gbHours) || 0, pcHours: Number(v.pcHours) || 0 };
  return { ...memLedger };
}

/** Add PC serving time (minutes at `ramMb`) to this month's ledger. */
async function addLedger({ minutes, ramMb, now = Date.now() }) {
  const month = M.monthKey(now);
  if (memLedger.month !== month) memLedger = { month, gbHours: 0, pcHours: 0 };
  const h = Math.max(0, Number(minutes) || 0) / 60;
  memLedger.pcHours += h;
  memLedger.gbHours += h * (Math.max(0, Number(ramMb) || 0) / 1024);
  await saveSetting("ledger", { ...memLedger });
  return { ...memLedger };
}

async function addEvent({ kind, nodeId = null, detail = null, actorId = null, at = new Date().toISOString() }) {
  try {
    const res = await db().from(TABLES.events).insert({ at, kind, node_id: nodeId, detail, actor_id: actorId });
    if (res?.error && isMissingTable(res.error)) markUnavailable(res.error);
  } catch {
    /* durable copy optional */
  }
}

async function listEvents(limit = 50) {
  try {
    const res = await db().from(TABLES.events).select("at, kind, node_id, detail").order("at", { ascending: false }).limit(limit);
    if (res?.error) return [];
    return (res.data || []).map((r) => ({ at: r.at, kind: r.kind, nodeId: r.node_id || null, detail: r.detail || null }));
  } catch {
    return [];
  }
}

function __setDbForTests(fake) {
  dbOverride = fake;
}

function __resetForTests() {
  availability = { value: null, at: 0 };
  bootstrapCols = { value: null, at: 0 };
  byHash.clear();
  touched.clear();
  memLedger = { month: M.monthKey(), gbHours: 0, pcHours: 0 };
}

module.exports = {
  TABLES,
  StoreError,
  available,
  listKeys,
  createKey,
  getKey,
  revokeKey,
  verify,
  bootstrapWindow,
  setBootstrapWindow,
  markBootstrapped,
  bootstrapUntilMs,
  BOOTSTRAP_WINDOW_MS,
  keySummary,
  loadCfg,
  saveCfg,
  loadLedger,
  addLedger,
  addEvent,
  listEvents,
  isMissingTable,
  isMissingColumn,
  __setDbForTests,
  __resetForTests,
};
