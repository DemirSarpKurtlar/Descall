/**
 * Shared renderer state for the Descall+ desktop windows (mini mode, call window, sidebar).
 *
 * - call:  the active voice surface, published by hooks/useElectronOverlay.js
 *          ({ active, title, muted, deafened, pending, kind, since, avatarUrl }),
 *          plus the action handler that runs mute / deafen / leave.
 * - app:   counts and lists from App.jsx (usePremiumAppSnapshot): unread total, friends,
 *          recent DMs, my status, navigate().
 * - aux:   which portal windows are open, and open / close requests.
 * No React import: plain subscribe / get pairs for useSyncExternalStore.
 */

function makeSlot(initial) {
  let value = initial;
  const subs = new Set();
  return {
    get: () => value,
    set(next) {
      value = next;
      for (const fn of [...subs]) {
        try { fn(value); } catch { /* ignore */ }
      }
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

const IDLE_CALL = Object.freeze({ active: false, title: "", muted: false, deafened: false, pending: false, kind: "", since: 0, avatarUrl: "" });

export const callSlot = makeSlot(IDLE_CALL);
export const appSlot = makeSlot(Object.freeze({ unread: 0, friends: [], dms: [], status: "online", meId: null }));
export const auxSlot = makeSlot(Object.freeze({ open: Object.freeze([]) }));

let callAction = null;
let appActions = {};

function sameCall(a, b) {
  return a.active === b.active && a.title === b.title && a.muted === b.muted && a.deafened === b.deafened &&
    a.pending === b.pending && a.kind === b.kind && a.since === b.since && a.avatarUrl === b.avatarUrl;
}

export function publishCallState(next) {
  const v = next && next.active ? { ...IDLE_CALL, ...next, active: true } : IDLE_CALL;
  if (sameCall(v, callSlot.get())) return;
  callSlot.set(Object.freeze(v));
}

/** fn(action) with action "mute" | "deafen" | "leave" (useElectronOverlay's handler). */
export function setCallActionHandler(fn) {
  callAction = typeof fn === "function" ? fn : null;
}

export function runCallAction(action) {
  if (!["mute", "deafen", "leave"].includes(action)) return false;
  if (!callAction || !callSlot.get().active) return false;
  callAction(action);
  return true;
}

export function publishAppState(next) {
  appSlot.set(Object.freeze({ ...appSlot.get(), ...next }));
}

/** { navigate(path), setStatus(status), focusMain() } from App.jsx. */
export function setAppActions(actions) {
  appActions = actions || {};
}

export function appAction(name, ...args) {
  const fn = appActions[name];
  if (typeof fn === "function") return fn(...args);
  return undefined;
}

// ---- portal windows ----------------------------------------------------------------------

export const AUX_KINDS = Object.freeze(["call", "sidebar"]);
const openRequests = new Set();

export function isAuxOpen(kind) {
  return auxSlot.get().open.includes(kind);
}

export function setAuxOpen(kind, open) {
  const cur = auxSlot.get().open;
  const has = cur.includes(kind);
  if (open === has) return;
  auxSlot.set(Object.freeze({ open: Object.freeze(open ? [...cur, kind] : cur.filter((k) => k !== kind)) }));
}

/** Ask the host to open (true) / close (false) / toggle (undefined) a portal window. */
export function requestAux(kind, open) {
  if (!AUX_KINDS.includes(kind)) return;
  for (const fn of [...openRequests]) {
    try { fn(kind, open); } catch { /* ignore */ }
  }
}

export function onAuxRequest(fn) {
  openRequests.add(fn);
  return () => openRequests.delete(fn);
}

/** True when a Descall+ window already shows the call, so the classic overlay card stays hidden. */
export function auxCoversOverlay() {
  return isAuxOpen("call");
}
