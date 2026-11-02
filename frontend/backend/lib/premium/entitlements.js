"use strict";

/**
 * Descall+ / Ultra entitlements on the server (docs/premium/CONTRACT.md, "Entitlements").
 *  - featuresFor(plan): the feature keys a plan unlocks (features.js, mirrored from the client list).
 *  - planFor(userId) / hasFeature(userId, key): reads premium_me through the service role, cached
 *    for CACHE_MS so socket handlers can ask on every event; invalidate(userId) after each change.
 *  - requireFeature(key): Express middleware (after requireAuth), 403 PREMIUM_REQUIRED otherwise.
 * Fails closed: an unknown key, a database error or a missing function means "no feature".
 * Premium-only server behaviour must check these, never only the UI.
 */

const { FEATURES, featuresFor, isFeatureKey } = require("./features");

const CACHE_MS = 30 * 1000;
const cache = new Map(); // userId -> { at, me }
let dbOverride = null;
const db = () => dbOverride || require("../../db/supabase");

const EMPTY_ME = Object.freeze({ plan: null, status: "none", ends_at: null, unlimited: false, monthly_descoin: null, next_coin_at: null });

/** premium_me for one user, cached. Never throws. */
async function loadMe(userId, { fresh = false, now = Date.now() } = {}) {
  const id = String(userId || "");
  if (!id) return EMPTY_ME;
  const hit = cache.get(id);
  if (!fresh && hit && now - hit.at < CACHE_MS) return hit.me;
  let me = EMPTY_ME;
  try {
    const { data, error } = await db().rpc("premium_me", { p_user: id });
    if (!error && data && typeof data === "object") me = data;
    else if (error) me = hit?.me || EMPTY_ME; // keep the last known answer on a transient error
  } catch {
    me = hit?.me || EMPTY_ME;
  }
  cache.set(id, { at: now, me });
  if (cache.size > 20000) cache.delete(cache.keys().next().value);
  return me;
}

async function planFor(userId, opts) {
  const me = await loadMe(userId, opts);
  return me && me.plan ? me.plan : null;
}

async function hasFeature(userId, feature, opts) {
  if (!isFeatureKey(feature)) return false;
  const plan = await planFor(userId, opts);
  return featuresFor(plan).includes(String(feature));
}

function invalidate(userId) {
  if (userId) cache.delete(String(userId));
  else cache.clear();
}

/** Express middleware: the signed-in account's plan must include `feature`. */
function requireFeature(feature) {
  if (!isFeatureKey(feature)) throw new Error(`Unknown premium feature: ${feature}`);
  return async (req, res, next) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "UNAUTHENTICATED", code: "UNAUTHENTICATED" });
    if (await hasFeature(userId, feature)) return next();
    return res.status(403).json({ error: "PREMIUM_REQUIRED", code: "PREMIUM_REQUIRED", feature });
  };
}

/** The shape GET /api/premium/me returns. */
function publicMe(me) {
  const m = me && typeof me === "object" ? me : EMPTY_ME;
  const plan = m.plan || null;
  return {
    plan,
    status: m.status || (plan ? "active" : "none"),
    ends_at: plan ? m.ends_at ?? null : null,
    unlimited: plan ? Boolean(m.unlimited) : false,
    features: featuresFor(plan),
    monthly_descoin: plan ? m.monthly_descoin ?? null : null,
    next_coin_at: plan ? m.next_coin_at ?? null : null,
    started_at: plan ? m.started_at ?? null : null,
  };
}

function __setDbForTests(client) {
  dbOverride = client;
  cache.clear();
}

module.exports = {
  FEATURES,
  CACHE_MS,
  featuresFor,
  isFeatureKey,
  loadMe,
  planFor,
  hasFeature,
  invalidate,
  requireFeature,
  publicMe,
  __setDbForTests,
};
