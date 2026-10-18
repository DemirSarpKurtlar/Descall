/**
 * Cloudflare edge for public, cacheable GETs (scale plan S1, 2.11.5).
 *
 * The server advertises `edgeApiBase` in GET /api/features once the proxied
 * host is live. We remember it and use it for public reads only (features,
 * announcements, latest release, shop catalog). Signed-in traffic and the
 * socket stay on the origin. Any network error or 5xx from the edge falls
 * back to the origin at once and parks the edge for 30 minutes.
 */
import { API_BASE_URL } from "../config/api.js";

export const EDGE_API_HOSTS = ["api.descall.com", "api-staging.descall.com"];
const KEY = "descall:edge-api";
const FAIL_KEY = "descall:edge-api-fail";
const PARK_MS = 30 * 60 * 1000;

function storage() {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function normalizeEdgeBase(raw) {
  const s = String(raw || "").trim().replace(/\/+$/, "");
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" || !EDGE_API_HOSTS.includes(u.hostname)) return null;
    if (u.pathname !== "/" || u.search) return null;
    return `https://${u.hostname}`;
  } catch {
    return null;
  }
}

/** Store (or clear, when the server stops advertising it) the edge base. */
export function rememberEdgeApiBase(raw, store = storage()) {
  if (!store) return null;
  const base = normalizeEdgeBase(raw);
  try {
    if (base) store.setItem(KEY, base);
    else store.removeItem(KEY);
  } catch {
    /* private mode */
  }
  return base;
}

export function edgeApiBase({ store = storage(), now = Date.now() } = {}) {
  if (!store) return null;
  try {
    const failedAt = Number(store.getItem(FAIL_KEY) || 0);
    if (failedAt && now - failedAt < PARK_MS) return null;
    return normalizeEdgeBase(store.getItem(KEY));
  } catch {
    return null;
  }
}

function parkEdge(store = storage(), now = Date.now()) {
  try {
    store?.setItem(FAIL_KEY, String(now));
  } catch {
    /* ignore */
  }
}

/**
 * GET a public path through the edge when available, else the origin.
 * Never sends credentials or an Authorization header through the edge.
 */
export async function fetchPublic(path, init = {}, deps = {}) {
  const doFetch = deps.fetch || ((...a) => fetch(...a));
  const store = deps.store === undefined ? storage() : deps.store;
  const origin = (deps.origin || API_BASE_URL || "").replace(/\/$/, "");
  const edge = edgeApiBase({ store, now: deps.now || Date.now() });
  if (edge && edge !== origin) {
    const { headers, ...rest } = init;
    const clean = {};
    for (const [k, v] of Object.entries(headers || {})) {
      if (k.toLowerCase() !== "authorization") clean[k] = v;
    }
    try {
      const res = await doFetch(`${edge}${path}`, { ...rest, headers: clean, credentials: "omit" });
      if (res && res.status < 500) return res;
    } catch {
      /* fall through to the origin */
    }
    parkEdge(store, deps.now || Date.now());
  }
  return doFetch(`${origin}${path}`, init);
}
