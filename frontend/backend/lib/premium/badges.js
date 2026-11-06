"use strict";

/**
 * Descall+ / Ultra badges of other people: which plan each user has right now, for the public user
 * payloads (profile, friends, members, presence). One premium_active_for(uuid[]) call per batch of
 * up to 200 unknown ids, a short cache (60 s fresh, read for up to 10 min by the synchronous payload
 * builders) and one shared request per id in flight, so lists never cost one query per person.
 * premium:updated (socket/premium.js) drops the user's entry. Fails closed: an error means no badge.
 */

const FRESH_MS = 60 * 1000;
const STALE_MS = 10 * 60 * 1000;
const BATCH = 200;
const MAX_ENTRIES = 50000;
const PAUSE_MS = 10 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLANS = new Set(["plus", "ultra"]);

const cache = new Map(); // id -> { plan: "plus" | "ultra" | null, at }
const inflight = new Map(); // id -> Promise<void>
let pausedUntil = 0;
let rpcOverride = null;
let calls = 0;

async function rpc(ids) {
  calls += 1;
  if (rpcOverride) return rpcOverride(ids);
  const { data, error } = await require("../../db/supabase").rpc("premium_active_for", { p_user_ids: ids });
  if (error) throw Object.assign(new Error(error.message || "rpc failed"), { code: error.code });
  return data;
}

function remember(id, plan, at) {
  cache.delete(id);
  cache.set(id, { plan, at });
  if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value);
}

async function loadBatch(ids) {
  const now = Date.now();
  try {
    const rows = await rpc(ids);
    const byId = new Map((Array.isArray(rows) ? rows : []).map((r) => [String(r.user_id), PLANS.has(r.plan) ? r.plan : null]));
    for (const id of ids) remember(id, byId.get(id) ?? null, now);
  } catch (err) {
    if (/PGRST202|42883|Could not find the function|does not exist/i.test(`${err?.code || ""} ${err?.message || ""}`)) {
      pausedUntil = Date.now() + PAUSE_MS;
    }
    // Leave the ids unknown: the payloads simply carry no badge this time.
  }
}

/** id -> plan (null = no active membership) for every valid id; unknown ids load in batches. */
async function plansFor(userIds) {
  const ids = [...new Set((userIds || []).map((x) => String(x ?? "")).filter((x) => UUID.test(x)))];
  const now = Date.now();
  if (now >= pausedUntil) {
    const waits = new Set();
    const missing = [];
    for (const id of ids) {
      const hit = cache.get(id);
      if (hit && now - hit.at < FRESH_MS) continue;
      if (inflight.has(id)) waits.add(inflight.get(id));
      else missing.push(id);
    }
    for (let i = 0; i < missing.length; i += BATCH) {
      const chunk = missing.slice(i, i + BATCH);
      const p = loadBatch(chunk).finally(() => {
        for (const id of chunk) if (inflight.get(id) === p) inflight.delete(id);
      });
      for (const id of chunk) inflight.set(id, p);
      waits.add(p);
    }
    await Promise.all(waits);
  }
  const out = new Map();
  for (const id of ids) {
    const hit = cache.get(id);
    out.set(id, hit && Date.now() - hit.at < STALE_MS ? hit.plan : null);
  }
  return out;
}

async function planOf(userId) {
  return (await plansFor([userId])).get(String(userId)) ?? null;
}

/**
 * Synchronous read for the payload builders (enrichFriendEntry, toPublicUser): the cached plan,
 * null for a known non-member, undefined when unknown (the key is then left out of the JSON, so the
 * client keeps what it had instead of hiding a badge it cannot confirm).
 */
function cachedPlan(userId) {
  const hit = cache.get(String(userId ?? ""));
  if (!hit || Date.now() - hit.at >= STALE_MS) return undefined;
  return hit.plan;
}

/** Sets `key` (premium_plan) on each item, from one batched lookup. Returns the list. */
async function attachPlans(list, getId = (u) => u?.id, key = "premium_plan") {
  const items = Array.isArray(list) ? list : [];
  const plans = await plansFor(items.map(getId));
  for (const item of items) {
    if (item && typeof item === "object") item[key] = plans.get(String(getId(item) ?? "")) ?? null;
  }
  return items;
}

function invalidate(userId) {
  cache.delete(String(userId ?? ""));
}

function __resetForTests({ rpc: fn = null } = {}) {
  cache.clear();
  inflight.clear();
  pausedUntil = 0;
  calls = 0;
  rpcOverride = fn;
}

module.exports = {
  plansFor,
  planOf,
  cachedPlan,
  attachPlans,
  invalidate,
  FRESH_MS,
  STALE_MS,
  BATCH,
  __resetForTests,
  __calls: () => calls,
};
