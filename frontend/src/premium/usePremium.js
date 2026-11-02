/**
 * Premium membership store (docs/premium/CONTRACT.md, "Client").
 * Reads GET /api/premium/me, refreshes on the socket event "premium:updated",
 * and tells the Electron main process the entitlement list ("premium:entitlements").
 * hasPremiumFeature() is a UX gate only: the server and the main process check again.
 */
import { useSyncExternalStore } from "react";
import { API_BASE_URL } from "../config/api";
import { getToken } from "../lib/storage";
import { FEATURE_MAP, featuresForPlan, tierAllows } from "./features.js";

const EMPTY = Object.freeze({
  plan: null,
  status: null,
  endsAt: null,
  unlimited: false,
  nextCoinAt: null,
  features: [],
  loading: true,
});

let state = EMPTY;
const listeners = new Set();
let inflight = null;
let boundSocket = null;

function emit() {
  for (const fn of listeners) {
    try { fn(); } catch { /* a listener must never break the store */ }
  }
}

function setState(next) {
  state = Object.freeze({ ...state, ...next });
  pushToElectron();
  emit();
}

function pushToElectron() {
  try {
    const bridge = typeof window !== "undefined" ? window.descallPremium : null;
    if (!bridge?.invoke) return;
    bridge.invoke("premium:entitlements", { plan: state.plan, status: state.status, features: state.features }).catch(() => {});
  } catch {
    /* not Electron */
  }
}

function normalize(body) {
  const plan = body && (body.plan === "plus" || body.plan === "ultra") && body.status !== "expired" && body.status !== "cancelled" ? body.plan : null;
  const features = Array.isArray(body?.features) && body.features.length ? body.features.filter((k) => FEATURE_MAP[k]) : featuresForPlan(plan);
  return {
    plan,
    status: body?.status || null,
    endsAt: body?.ends_at || null,
    unlimited: Boolean(body?.unlimited),
    nextCoinAt: body?.next_coin_at || null,
    features: plan ? features : [],
    loading: false,
  };
}

/** Re-read /api/premium/me. Resolves with the new snapshot. */
export function refresh() {
  const token = getToken();
  if (!token) {
    setState({ ...EMPTY, loading: false });
    return Promise.resolve(state);
  }
  if (inflight) return inflight;
  inflight = fetch(`${API_BASE_URL}/api/premium/me`, { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => (r.ok ? r.json() : null))
    .then((body) => setState(normalize(body)))
    .catch(() => setState({ loading: false }))
    .finally(() => {
      inflight = null;
    });
  return inflight.then(() => state);
}

/** Bind the app socket once so "premium:updated" refreshes the store. */
export function bindPremiumSocket(socket) {
  if (!socket || boundSocket === socket) return;
  try { boundSocket?.off?.("premium:updated", refresh); } catch { /* ignore */ }
  boundSocket = socket;
  socket.on?.("premium:updated", refresh);
}

function subscribe(fn) {
  listeners.add(fn);
  if (state === EMPTY && !inflight) refresh();
  return () => listeners.delete(fn);
}

const snapshot = () => state;

/** Synchronous feature check against the current snapshot (UX gate only). */
export function hasPremiumFeature(key) {
  const f = FEATURE_MAP[key];
  if (!f || !state.plan) return false;
  if (state.features.length) return state.features.includes(key);
  return tierAllows(state.plan, f.tier);
}

export function premiumSnapshot() {
  return state;
}

export function subscribePremium(fn) {
  return subscribe(fn);
}

export function usePremium() {
  const s = useSyncExternalStore(subscribe, snapshot, snapshot);
  return {
    plan: s.plan,
    status: s.status,
    endsAt: s.endsAt,
    unlimited: s.unlimited,
    nextCoinAt: s.nextCoinAt,
    loading: s.loading,
    has: hasPremiumFeature,
    refresh,
  };
}

export default usePremium;
