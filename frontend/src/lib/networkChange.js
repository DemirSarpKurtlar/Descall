/**
 * Decide whether a network snapshot change should restart a live call.
 * `type` is Network Information `connection.type` (wifi, cellular, …).
 * Downlink / effectiveType jitter is ignored so a healthy call is not
 * renegotiated on every radio fluctuation.
 */
export function networkChangeReason(prev, next) {
  if (!prev || !next) return null;
  if (!prev.online && next.online) return "online";
  if (prev.online && !next.online) return "offline";
  if (prev.online && next.online && prev.type && next.type && prev.type !== next.type) return "type";
  return null;
}

export function readNetworkSnapshot() {
  const conn = typeof navigator !== "undefined" ? navigator.connection : null;
  return {
    online: typeof navigator === "undefined" ? true : navigator.onLine !== false,
    type: conn?.type || "",
  };
}

/**
 * Fires when the browser comes back online or the transport type changes
 * (wifi ↔ cellular). The listener is not called for offline.
 */
export function subscribeNetworkChange(onChange) {
  if (typeof window === "undefined") return () => {};
  let prev = readNetworkSnapshot();
  const emit = () => {
    const next = readNetworkSnapshot();
    const reason = networkChangeReason(prev, next);
    prev = next;
    if (reason !== "online" && reason !== "type") return;
    try {
      onChange({ reason, ...next });
    } catch {
      /* a call restart must not throw out of the browser event */
    }
  };
  window.addEventListener("online", emit);
  const conn = navigator.connection;
  conn?.addEventListener?.("change", emit);
  return () => {
    window.removeEventListener("online", emit);
    conn?.removeEventListener?.("change", emit);
  };
}
