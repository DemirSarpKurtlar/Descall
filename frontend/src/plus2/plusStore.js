/**
 * Shared Descall+ 2.0 state: the offer for this platform (prices, switches, limits) and the
 * hub snapshot. One fetch for everyone; refreshed on "plus:event" / "premium:updated" sockets.
 * Before /api/plus exists (old backend) or signed out: selling is off, nothing shows.
 */
import { useEffect, useSyncExternalStore } from "react";
import { getHub, getOffer } from "./plusApi.js";

const OFF = Object.freeze({ offer: null, moments: [], hub: null, loading: false, loaded: false, error: null });
let state = OFF;
const listeners = new Set();
let offerInflight = null;
let hubInflight = null;

function set(patch) {
  state = Object.freeze({ ...state, ...patch });
  for (const fn of [...listeners]) {
    try { fn(); } catch { /* ignore */ }
  }
}

export function getPlusState() {
  return state;
}

export function subscribePlus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function refreshOffer() {
  if (offerInflight) return offerInflight;
  offerInflight = getOffer()
    .then((d) => set({ offer: d?.offer || null, moments: d?.moments || [], loaded: true, error: null }))
    .catch((err) => set({ offer: null, loaded: true, error: err?.code || "error" }))
    .finally(() => { offerInflight = null; });
  return offerInflight;
}

export function refreshHub() {
  if (hubInflight) return hubInflight;
  set({ loading: true });
  hubInflight = getHub()
    .then((d) => set({ hub: d, offer: d?.offer || state.offer, loading: false, error: null }))
    .catch((err) => set({ loading: false, error: err?.code || "error" }))
    .finally(() => { hubInflight = null; });
  return hubInflight;
}

export function resetPlus() {
  state = OFF;
  for (const fn of [...listeners]) fn();
}

/** Harness / tests. */
export function seedPlus(patch) {
  set({ loaded: true, ...patch });
}

/** True when anything that sells may show on this platform. */
export function salesOn(s = state) {
  return Boolean(s.offer?.salesOn);
}

export function usePlus({ load = "offer" } = {}) {
  const snap = useSyncExternalStore(subscribePlus, getPlusState, getPlusState);
  useEffect(() => {
    if (load === "hub") refreshHub();
    else if (load === "offer" && !getPlusState().loaded) refreshOffer();
  }, [load]);
  return snap;
}

/** Wire the socket once (PlusHost). Returns a detach function. */
export function attachPlusSocket(socket) {
  if (!socket || typeof socket.on !== "function") return () => {};
  const onEvent = () => {
    if (getPlusState().hub) refreshHub();
  };
  socket.on("plus:event", onEvent);
  socket.on("premium:updated", onEvent);
  return () => {
    socket.off?.("plus:event", onEvent);
    socket.off?.("premium:updated", onEvent);
  };
}
