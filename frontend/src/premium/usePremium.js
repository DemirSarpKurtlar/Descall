/**
 * Membership state for the client (docs/premium/CONTRACT.md, "Client").
 * One shared store reads GET /api/premium/me and refreshes on the socket event
 * `premium:updated`. has(key) is a UX gate only: the server and the Electron
 * main process check again.
 *
 * NOTE: minimal compatible version written by the hotkey/audio/notification
 * agent; the coordinator reconciles it with the shared copy on merge.
 */
import { useEffect, useState } from "react";
import { authedRequest } from "../api/authedHttp";
import { getToken } from "../lib/storage";
import { tierAllows } from "./features.js";

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
let attachedSocket = null;

function emit() {
  for (const fn of listeners) {
    try { fn(state); } catch { /* listener errors stay local */ }
  }
  try {
    window.dispatchEvent(new CustomEvent("descall:premium", { detail: state }));
  } catch { /* non-DOM test env */ }
  syncElectron();
}

/** Electron main refuses gated desktop features until it has this list. */
function syncElectron() {
  try {
    const bridge = typeof window !== "undefined" ? window.descallPremium : null;
    if (!bridge?.invoke) return;
    const keys = state.status === "active" ? state.features : [];
    bridge.invoke("premium:entitlements", { keys, plan: state.status === "active" ? state.plan : null }).catch(() => {});
  } catch { /* ignore */ }
}

function normalize(body) {
  const plan = body?.plan === "plus" || body?.plan === "ultra" ? body.plan : null;
  const status = typeof body?.status === "string" ? body.status : plan ? "active" : null;
  const features = Array.isArray(body?.features) ? body.features.filter((k) => typeof k === "string") : [];
  return {
    plan,
    status,
    endsAt: body?.ends_at || null,
    unlimited: Boolean(body?.unlimited),
    nextCoinAt: body?.next_coin_at || null,
    features,
    loading: false,
  };
}

export function setPremiumState(next) {
  state = { ...EMPTY, ...next, loading: false };
  emit();
}

export async function refreshPremium() {
  if (!getToken()) {
    setPremiumState({});
    return state;
  }
  if (!inflight) {
    inflight = authedRequest("/api/premium/me")
      .then((body) => setPremiumState(normalize(body)))
      .catch(() => setPremiumState({ ...state, loading: false }))
      .finally(() => { inflight = null; });
  }
  await inflight;
  return state;
}

/** Wire the live socket once so `premium:updated` refreshes the store. */
export function attachPremiumSocket(socket) {
  if (!socket || attachedSocket === socket) return;
  attachedSocket = socket;
  socket.on?.("premium:updated", () => { refreshPremium(); });
}

export function getPremiumState() {
  return state;
}

/** Feature check outside React. */
export function hasPremiumFeature(key) {
  if (state.status !== "active" || !state.plan) return false;
  if (state.features.length) return state.features.includes(key);
  return tierAllows(state.plan, key);
}

export function subscribePremium(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function usePremium() {
  const [snap, setSnap] = useState(state);
  useEffect(() => {
    const off = subscribePremium(setSnap);
    if (state.loading && !inflight) refreshPremium();
    else setSnap(state);
    return off;
  }, []);
  return {
    plan: snap.plan,
    status: snap.status,
    endsAt: snap.endsAt,
    unlimited: snap.unlimited,
    nextCoinAt: snap.nextCoinAt,
    loading: snap.loading,
    has: (key) => hasPremiumFeature(key),
    refresh: refreshPremium,
  };
}

export default usePremium;
