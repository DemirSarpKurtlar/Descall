"use strict";

/**
 * Rule versions and shop limits (shop2_rule_versions, shop2_settings). Version 0 is the built-in
 * default and is active until an admin activates a saved version. A version scheduled for
 * 00:00 becomes active by itself when its time comes (read path), the scheduler only marks it.
 */

const db = require("./db");
const time = require("./time");
const { DEFAULT_RULES, DEFAULT_LIMITS, normalizeRules, normalizeLimits, diff, clone } = require("./rules");

const CACHE_MS = 15_000;
let versionsCache = null;
let limitsCache = null;

function builtIn() {
  return { version: 0, rules: normalizeRules(clone(DEFAULT_RULES)), status: "active", note: "Built-in default", applyAt: null, appliedAt: null, createdAt: null, createdBy: null, basedOn: null, builtIn: true };
}

function fromRow(r) {
  return {
    version: Number(r.version),
    rules: normalizeRules(r.rules || {}),
    status: r.status,
    note: r.note || null,
    applyAt: r.apply_at || null,
    appliedAt: r.applied_at || null,
    createdAt: r.created_at || null,
    createdBy: r.created_by || null,
    basedOn: r.based_on == null ? null : Number(r.based_on),
    builtIn: false,
  };
}

async function listVersions({ fresh = false } = {}) {
  if (!fresh && versionsCache && Date.now() - versionsCache.at < CACHE_MS) return versionsCache.list;
  await db.ready();
  const list = (await db.rows(db.from("shop2_rule_versions").select("*").order("version", { ascending: true }))).map(fromRow);
  versionsCache = { at: Date.now(), list };
  return list;
}

function invalidate() {
  versionsCache = null;
  limitsCache = null;
}

/** The version in force at `t`: the latest active/scheduled version whose time has come. */
function activeAt(list, t = Date.now()) {
  let best = null;
  let bestAt = -Infinity;
  for (const v of list) {
    if (!["active", "scheduled"].includes(v.status)) continue;
    const at = time.ms(v.status === "active" ? v.appliedAt || v.createdAt : v.applyAt);
    if (at == null || at > t) continue;
    if (at > bestAt || (at === bestAt && v.version > (best?.version ?? -1))) {
      best = v;
      bestAt = at;
    }
  }
  return best || builtIn();
}

async function activeRules(t = Date.now()) {
  return activeAt(await listVersions(), t);
}

async function getVersion(version) {
  const n = Number(version);
  if (n === 0) return builtIn();
  return (await listVersions({ fresh: true })).find((v) => v.version === n) || null;
}

async function createVersion({ rules, note, basedOn, actorId }) {
  await db.ready();
  const list = await listVersions({ fresh: true });
  const version = list.reduce((m, v) => Math.max(m, v.version), 0) + 1;
  const row = {
    version,
    rules: normalizeRules(rules || {}),
    status: "draft",
    note: typeof note === "string" ? note.trim().slice(0, 300) || null : null,
    based_on: basedOn == null ? null : Number(basedOn),
    created_by: actorId || null,
    created_at: new Date().toISOString(),
  };
  const data = await db.one(db.from("shop2_rule_versions").insert(row).select("*").single());
  invalidate();
  return fromRow(data || row);
}

async function updateVersion(version, patch) {
  const data = await db.rows(db.from("shop2_rule_versions").update(patch).eq("version", Number(version)).select("*"));
  invalidate();
  return data[0] ? fromRow(data[0]) : null;
}

/* ---------------------------------------------------------------- limits */

async function getLimitsRow() {
  await db.ready();
  return db.one(db.from("shop2_settings").select("*").eq("key", "limits").maybeSingle());
}

async function getLimits() {
  if (limitsCache && Date.now() - limitsCache.at < CACHE_MS) return limitsCache.value;
  const row = await getLimitsRow().catch(() => null);
  const value = normalizeLimits(row?.value || clone(DEFAULT_LIMITS));
  limitsCache = { at: Date.now(), value, version: Number(row?.version) || 0, row };
  return value;
}

async function getLimitsInfo() {
  const row = await getLimitsRow().catch(() => null);
  const value = normalizeLimits(row?.value || clone(DEFAULT_LIMITS));
  const prev = row?.prev_value ? normalizeLimits(row.prev_value) : null;
  return { limits: value, version: Number(row?.version) || 0, updatedAt: row?.updated_at || null, updatedBy: row?.updated_by || null, prev, changes: prev ? diff(prev, value) : [] };
}

/** Merge `patch` into the current limits, bump the version, keep the previous value. */
async function setLimits(patch, { actorId, reason } = {}) {
  const info = await getLimitsInfo();
  const merged = normalizeLimits({
    refresh: { ...info.limits.refresh, ...(patch?.refresh || {}) },
    gifts: { ...info.limits.gifts, ...(patch?.gifts || {}) },
    purchases: { ...info.limits.purchases, ...(patch?.purchases || {}) },
    nightMarket: { ...info.limits.nightMarket, ...(patch?.nightMarket || {}) },
  });
  const changes = diff(info.limits, merged);
  const row = {
    key: "limits",
    value: merged,
    prev_value: info.limits,
    version: info.version + 1,
    reason: reason || null,
    updated_by: actorId || null,
    updated_at: new Date().toISOString(),
  };
  await db.one(db.from("shop2_settings").upsert(row, { onConflict: "key" }).select("*").maybeSingle());
  invalidate();
  return { limits: merged, version: row.version, prev: info.limits, changes };
}

module.exports = { builtIn, listVersions, activeAt, activeRules, getVersion, createVersion, updateVersion, getLimits, getLimitsInfo, setLimits, invalidate };
