/**
 * Edge realtime choice (scale plan S2, 2.11.6).
 *
 * Render tells every socket where to connect next time (`edge:advice`):
 * the Cloudflare Hub (wss://rt.descall.com) or Render (null). We remember the
 * advice and use it for the next connection. Two failed edge connections in a
 * row park the edge for 30 minutes and the app reconnects to Render at once.
 * A null advice while on the edge (admin kill switch) moves us back at once.
 */
export const RT_HOSTS = ["rt.descall.com", "rt-staging.descall.com"];
const KEY = "descall:edge-rt";
const PARK_KEY = "descall:edge-rt-park";
export const PARK_MS = 30 * 60 * 1000;
export const MAX_EDGE_FAILURES = 2;

function storage() {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function normalizeRealtimeUrl(raw) {
  const s = String(raw || "").trim().replace(/\/+$/, "");
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "wss:" || !RT_HOSTS.includes(u.hostname) || u.pathname !== "/" || u.search) return null;
    return `wss://${u.hostname}`;
  } catch {
    return null;
  }
}

/** Save the server's advice. Returns the stored URL (or null). */
export function rememberRealtimeAdvice(advice, store = storage()) {
  const url = normalizeRealtimeUrl(advice?.realtime);
  try {
    if (url) store?.setItem(KEY, url);
    else store?.removeItem(KEY);
  } catch {
    /* private mode */
  }
  return url;
}

export function parkEdgeRealtime(store = storage(), now = Date.now()) {
  try {
    store?.setItem(PARK_KEY, String(now));
  } catch {
    /* ignore */
  }
}

/** Edge URL to use for the next connection, or null for Render. */
export function chooseRealtimeUrl({ store = storage(), now = Date.now(), disabled = false } = {}) {
  if (disabled || !store) return null;
  try {
    const parked = Number(store.getItem(PARK_KEY) || 0);
    if (parked && now - parked < PARK_MS) return null;
    return normalizeRealtimeUrl(store.getItem(KEY));
  } catch {
    return null;
  }
}

/** Counts consecutive edge connect failures for one socket generation. */
export function createEdgeFailureCounter(max = MAX_EDGE_FAILURES) {
  let n = 0;
  return {
    fail() {
      n += 1;
      return n >= max;
    },
    reset() {
      n = 0;
    },
    get count() {
      return n;
    },
  };
}
