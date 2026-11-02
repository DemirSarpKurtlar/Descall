/**
 * Module store behind usePremium() and hasPremiumFeature() (no React, no network import,
 * so premiumStore.selftest.mjs can drive it with a fake fetcher).
 *
 * State mirrors GET /api/premium/me:
 *   { plan: null|'plus'|'ultra', status, endsAt, unlimited, nextCoinAt, monthlyDescoin,
 *     features: string[], loading, loaded, error }
 * A missing endpoint (404/405/501) or no session means "free": nothing breaks.
 * hasPremiumFeature() is a UX gate only; the server and Electron main check again.
 */
import { FEATURES, featuresForPlan, normalizePlan, tierAllows } from "./features.js";

const FREE = Object.freeze({
  plan: null,
  status: "none",
  endsAt: null,
  unlimited: false,
  nextCoinAt: null,
  monthlyDescoin: 0,
  features: Object.freeze([]),
  loading: false,
  loaded: false,
  error: null,
});

let state = FREE;
let featureSet = new Set();
const listeners = new Set();
let fetcher = null;
let inflight = null;
let generation = 0;
const pushers = new Set();

function emit() {
  for (const fn of [...listeners]) {
    try { fn(state); } catch { /* listener errors never break the store */ }
  }
}

function setState(next) {
  state = Object.freeze({ ...next, features: Object.freeze([...(next.features || [])]) });
  featureSet = new Set(state.features);
  emit();
}

/** Normalise a /api/premium/me body. Unknown keys are dropped; an absent list derives from the plan. */
export function parsePremiumMe(body) {
  const b = body && typeof body === "object" ? body : {};
  const status = String(b.status || (b.plan ? "active" : "none"));
  const active = status === "active";
  const plan = active ? normalizePlan(b.plan) : null;
  let features;
  if (Array.isArray(b.features)) {
    features = b.features.map(String).filter((k) => Object.prototype.hasOwnProperty.call(FEATURES, k) && tierAllows(plan, k));
  } else {
    features = featuresForPlan(plan);
  }
  return {
    plan,
    status: plan ? status : status === "active" ? "none" : status,
    endsAt: b.ends_at || b.endsAt || null,
    unlimited: Boolean(b.unlimited),
    nextCoinAt: b.next_coin_at || b.nextCoinAt || null,
    monthlyDescoin: Number(b.monthly_descoin ?? b.monthlyDescoin ?? 0) || 0,
    features: [...new Set(features)],
  };
}

/** The fetcher gets a path and resolves with the parsed body, or throws an Error with .status. */
export function configurePremiumFetch(fn) {
  fetcher = typeof fn === "function" ? fn : null;
}

/** Called with (features[], plan) after every change, e.g. the Electron entitlement push. */
export function onPremiumEntitlements(fn) {
  pushers.add(fn);
  return () => pushers.delete(fn);
}

function pushEntitlements() {
  for (const fn of [...pushers]) {
    try { fn([...state.features], state.plan); } catch { /* ignore */ }
  }
}

export function getPremiumState() {
  return state;
}

export function subscribePremium(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Synchronous UX gate. */
export function hasPremiumFeature(key) {
  return featureSet.has(key);
}

const MISSING = new Set([404, 405, 501]);

/** Re-read /api/premium/me. Concurrent calls share one request. */
export function refreshPremium({ signedIn = true } = {}) {
  if (!signedIn || !fetcher) {
    generation += 1;
    inflight = null;
    setState({ ...FREE, loaded: true });
    pushEntitlements();
    return Promise.resolve(state);
  }
  if (inflight) return inflight;
  const gen = ++generation;
  if (!state.loaded) setState({ ...state, loading: true });
  inflight = (async () => {
    try {
      const body = await fetcher("/api/premium/me");
      if (gen !== generation) return state;
      setState({ ...parsePremiumMe(body), loading: false, loaded: true, error: null });
    } catch (err) {
      if (gen !== generation) return state;
      const status = Number(err?.status) || 0;
      if (MISSING.has(status) || status === 401 || status === 403) {
        setState({ ...FREE, loaded: true });
      } else {
        // Network trouble: keep what we had (free on first load) and remember the error.
        setState({ ...state, loading: false, loaded: true, error: String(err?.message || err) });
      }
    } finally {
      if (gen === generation) inflight = null;
    }
    pushEntitlements();
    return state;
  })();
  return inflight;
}

/** Signed out: back to free without a request. */
export function resetPremium() {
  return refreshPremium({ signedIn: false });
}

/** Test helper: put the store back to its first-load state. */
export function __resetPremiumStoreForTests() {
  generation += 1;
  inflight = null;
  state = FREE;
  featureSet = new Set();
  listeners.clear();
  pushers.clear();
  fetcher = null;
}
