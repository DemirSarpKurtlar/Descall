/**
 * Descall+ / Ultra entitlements for the renderer.
 *
 *   const { plan, status, endsAt, unlimited, nextCoinAt, loading, has, refresh } = usePremium();
 *   hasPremiumFeature("mini_mode")   // synchronous, outside React
 *
 * Backed by premiumStore.js (one shared store). Reads GET /api/premium/me with the normal
 * authenticated helper, refreshes on the socket event "premium:updated" (attachPremiumSocket,
 * wired in App.jsx) and pushes the list to Electron main over "premium:entitlements".
 * A missing endpoint means free. UX gate only: the server and Electron main check again.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { authedRequest } from "../api/authedHttp.js";
import { getToken } from "../lib/storage.js";
import {
  configurePremiumFetch,
  getPremiumState,
  hasPremiumFeature,
  onPremiumEntitlements,
  refreshPremium,
  resetPremium,
  subscribePremium,
} from "./premiumStore.js";

export { hasPremiumFeature, getPremiumState, subscribePremium, refreshPremium, resetPremium } from "./premiumStore.js";
export { FEATURES, PLAN_COIN, tierAllows, featuresForPlan } from "./features.js";

configurePremiumFetch((path) => authedRequest(path));

/** The single Electron bridge (preload), or null on web / iOS / Android. */
export function premiumBridge() {
  if (typeof window === "undefined") return null;
  return window.descallPremium || null;
}

onPremiumEntitlements((keys, plan) => {
  const bridge = premiumBridge();
  if (!bridge) return;
  // The token lets main verify even when its own copy (auth-token.bin) cannot be read.
  bridge.invoke("premium:entitlements", { keys, plan, token: plan ? getToken() || "" : "" }).catch(() => {});
});

let started = false;
function ensureStarted() {
  if (started) return;
  started = true;
  refreshPremium({ signedIn: Boolean(getToken()) });
}

/** Re-read entitlements (after login, redeem, or a "premium:updated" push). */
export function reloadPremium() {
  return refreshPremium({ signedIn: Boolean(getToken()) });
}

/**
 * Subscribe a Socket.IO client to "premium:updated". Returns a detach function.
 * Also refreshes once, since a new socket usually means a new session.
 */
export function attachPremiumSocket(socket) {
  if (!socket || typeof socket.on !== "function") return () => {};
  started = true;
  const onUpdated = () => { reloadPremium(); };
  socket.on("premium:updated", onUpdated);
  reloadPremium();
  return () => {
    try { socket.off?.("premium:updated", onUpdated); } catch { /* ignore */ }
  };
}

/** POST /api/premium/redeem {code}. Resolves with the body, rejects with the server error. */
export async function redeemPremiumCode(code) {
  const body = await authedRequest("/api/premium/redeem", { method: "POST", body: { code: String(code || "").trim() } });
  await reloadPremium();
  return body;
}

/** Plans for the comparison table (GET /api/premium/plans). Missing endpoint -> []. */
export async function fetchPremiumPlans() {
  try {
    const body = await authedRequest("/api/premium/plans");
    return Array.isArray(body?.plans) ? body.plans : [];
  } catch {
    return [];
  }
}

export function usePremium() {
  useEffect(() => { ensureStarted(); }, []);
  const s = useSyncExternalStore(subscribePremium, getPremiumState, getPremiumState);
  const has = useCallback((key) => s.features.includes(key), [s]);
  const refresh = useCallback(() => reloadPremium(), []);
  return {
    plan: s.plan,
    status: s.status,
    endsAt: s.endsAt,
    unlimited: s.unlimited,
    nextCoinAt: s.nextCoinAt,
    monthlyDescoin: s.monthlyDescoin,
    features: s.features,
    loading: s.loading || !s.loaded,
    error: s.error,
    has,
    refresh,
  };
}

export { resetPremium as clearPremium };
export default usePremium;
