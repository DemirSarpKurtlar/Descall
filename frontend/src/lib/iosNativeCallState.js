/**
 * State of a DM call answered natively on iOS (2.10.108, ios/App/App/
 * DescallNativeCall.swift). Pure logic, no Capacitor import, so it can be
 * unit-tested in Node (iosNativeCall.selftest.mjs) and imported on every
 * platform at zero cost (nothing ever fills it outside native iOS).
 */

export const NATIVE_CALL_IDLE = Object.freeze({ active: false });

const PHASES = new Set(["preparing", "ready", "answering", "connecting", "connected", "reconnecting", "ended"]);

/** Normalise a "nativeCall" event payload from the plugin. */
export function normalizeNativeCall(raw) {
  if (!raw || typeof raw !== "object" || raw.active !== true) return NATIVE_CALL_IDLE;
  const phase = PHASES.has(raw.phase) ? raw.phase : "connecting";
  if (phase === "ended") return NATIVE_CALL_IDLE;
  const uuid = String(raw.uuid || "").toLowerCase();
  if (!uuid) return NATIVE_CALL_IDLE;
  const connectedAt = Number(raw.connectedAt);
  return Object.freeze({
    active: true,
    uuid,
    callerId: String(raw.callerId || ""),
    callerName: String(raw.callerName || "Descall").slice(0, 64),
    phase,
    muted: raw.muted === true,
    connectedAt: Number.isFinite(connectedAt) && connectedAt > 0 ? connectedAt : null,
    metrics: raw.metrics && typeof raw.metrics === "object" ? { ...raw.metrics } : {},
  });
}

/** Turkish status line for the in-app card. */
export function nativeCallStatusLabel(state, nowMs = Date.now()) {
  if (!state?.active) return "";
  if (state.phase === "reconnecting") return "Yeniden bağlanıyor…";
  if (state.phase !== "connected" || !state.connectedAt) return "Bağlanıyor…";
  return formatCallDuration(nowMs - state.connectedAt);
}

export function formatCallDuration(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * Should useCall ignore / refuse this offer because a native call is live?
 * "ignore" = it belongs to the native call (same caller), "decline" = a
 * different caller (busy), null = handle normally.
 */
export function nativeOfferVerdict(state, fromUserId) {
  if (!state?.active || !fromUserId) return null;
  return String(state.callerId) === String(fromUserId) ? "ignore" : "decline";
}

export function createNativeCallStore() {
  let state = NATIVE_CALL_IDLE;
  const listeners = new Set();
  return {
    get: () => state,
    set(raw) {
      const next = normalizeNativeCall(raw);
      if (next === state) return state;
      if (!next.active && !state.active) return state;
      state = next;
      listeners.forEach((fn) => {
        try {
          fn(state);
        } catch {
          /* ignore */
        }
      });
      return state;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
