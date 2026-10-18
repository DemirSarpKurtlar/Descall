/**
 * WebRTC ICE server configuration (STUN + optional TURN).
 * Preload on app start; hooks read synchronously via getIceServers().
 *
 * 2.11.2: TURN is only returned to a signed-in caller. The request carries the session
 * token (Authorization: Bearer), credentials are per user and short-lived (1-4 h,
 * `ttlSeconds` / `expiresAt` in the response). The cache is tied to the token it was
 * fetched with, refreshed at half the lifetime, on socket reconnect, when the network
 * comes back, and live peer connections get the fresh list via setConfiguration so the
 * next ICE restart uses valid credentials.
 */
import { getToken } from "./storage.js";

const DEFAULT_ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

let cachedServers = null;
let cachedAt = 0;
let cachedExpiresAt = 0;
let cachedRefreshMs = 0;
let cachedToken = null;
let cachedAuthenticated = false;
let preloadPromise = null;
/** Upper bound between refreshes even if the server sends a longer lifetime. */
const MAX_REFRESH_MS = 90 * 60 * 1000;
const RETRY_MS = 60 * 1000;
const livePeers = new Set();

function parseEnvIceServers() {
  const raw = import.meta.env?.VITE_ICE_SERVERS;
  if (!raw || typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    console.warn("[iceConfig] Invalid VITE_ICE_SERVERS JSON");
    return null;
  }
}

export function normalizeIceServers(list) {
  if (!Array.isArray(list) || list.length === 0) return DEFAULT_ICE_SERVERS;
  return list.map((entry) => {
    if (!entry || typeof entry !== "object") return entry;
    const urls = entry.urls;
    if (!urls) return entry;
    const out = { urls };
    if (entry.username) out.username = entry.username;
    if (entry.credential) out.credential = entry.credential;
    return out;
  });
}

function currentToken() {
  try {
    return getToken() || null;
  } catch {
    return null;
  }
}

/** Pure: how long until the next refresh for a response with this lifetime. */
export function refreshDelayMs(ttlSeconds) {
  const ttl = Number(ttlSeconds);
  if (!Number.isFinite(ttl) || ttl <= 0) return MAX_REFRESH_MS;
  return Math.max(RETRY_MS, Math.min(MAX_REFRESH_MS, (ttl * 1000) / 2));
}

/** Pure decision used by getIceServers / preload (exported for the selftest). */
export function decideStale({ cached, cachedAt: at, refreshMs, expiresAt, cachedToken: tok, cachedAuthenticated: authed, token, now }) {
  if (!cached) return true;
  if ((token || null) !== (tok || null)) return true; // signed in / out / switched account
  if (expiresAt && now >= expiresAt - 5 * 60 * 1000) return true;
  if (token && !authed) return now - at > RETRY_MS; // got STUN-only although signed in
  return now - at > (refreshMs || RETRY_MS);
}

function isStale(now = Date.now()) {
  return decideStale({
    cached: cachedServers,
    cachedAt,
    refreshMs: cachedRefreshMs,
    expiresAt: cachedExpiresAt,
    cachedToken,
    cachedAuthenticated,
    token: currentToken(),
    now,
  });
}

export function getIceServers() {
  // A long-lived window (Electron in the tray for days) must not dial with
  // expired TURN credentials: refresh in the background, use what we have now.
  if (isStale()) preloadIceServers().catch(() => {});
  if (cachedExpiresAt && Date.now() >= cachedExpiresAt) return DEFAULT_ICE_SERVERS;
  return cachedServers || DEFAULT_ICE_SERVERS;
}

export function iceServersHaveTurn(list = cachedServers) {
  return (Array.isArray(list) ? list : []).some((entry) => {
    const urls = Array.isArray(entry?.urls) ? entry.urls : [entry?.urls];
    return urls.some((u) => /^turns?:/i.test(String(u || "")));
  });
}

/** Peer connections that should receive refreshed credentials (setConfiguration). */
export function trackPeerConnection(pc) {
  if (!pc || typeof pc.setConfiguration !== "function") return pc;
  livePeers.add(pc);
  const drop = () => {
    if (pc.connectionState === "closed" || pc.signalingState === "closed") livePeers.delete(pc);
  };
  try {
    pc.addEventListener?.("connectionstatechange", drop);
    pc.addEventListener?.("signalingstatechange", drop);
  } catch {
    /* ignore */
  }
  return pc;
}

function pushToLivePeers(servers) {
  for (const pc of [...livePeers]) {
    if (pc.signalingState === "closed" || pc.connectionState === "closed") {
      livePeers.delete(pc);
      continue;
    }
    try {
      pc.setConfiguration({ ...pc.getConfiguration(), iceServers: servers });
    } catch {
      /* some fields (bundlePolicy, certificates) cannot change; keep the old list */
    }
  }
}

export async function preloadIceServers() {
  if (cachedServers && !isStale()) return cachedServers;
  if (preloadPromise) return preloadPromise;

  preloadPromise = (async () => {
    const fromEnv = parseEnvIceServers();
    if (fromEnv) {
      cachedServers = normalizeIceServers(fromEnv);
      cachedAt = Date.now();
      cachedRefreshMs = 365 * 24 * 3600 * 1000; // build-time config never expires
      cachedExpiresAt = 0;
      cachedToken = currentToken();
      cachedAuthenticated = true;
      return cachedServers;
    }

    const base =
      (import.meta.env?.VITE_API_BASE_URL || "").replace(/\/$/, "") ||
      (typeof window !== "undefined" ? window.location.origin : "");
    const token = currentToken();

    try {
      const headers = { Accept: "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${base}/api/webrtc/ice-config`, {
        credentials: "omit",
        cache: "no-store",
        headers,
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.iceServers) && data.iceServers.length > 0) {
          const next = normalizeIceServers(data.iceServers);
          const now = Date.now();
          cachedServers = next;
          cachedAt = now;
          cachedToken = token;
          cachedAuthenticated = Boolean(data.authenticated);
          cachedRefreshMs = data.authenticated ? refreshDelayMs(data.ttlSeconds) : RETRY_MS;
          const exp = Date.parse(data.expiresAt || "");
          cachedExpiresAt = Number.isFinite(exp) ? exp : 0;
          if (iceServersHaveTurn(next)) pushToLivePeers(next);
          return cachedServers;
        }
      }
    } catch {
      /* use defaults */
    }

    // Keep a previously fetched list (with TURN) over the bare STUN default,
    // unless it belongs to another session or has expired.
    const now = Date.now();
    if (!cachedServers || cachedToken !== token || (cachedExpiresAt && now >= cachedExpiresAt)) {
      cachedServers = DEFAULT_ICE_SERVERS;
      cachedExpiresAt = 0;
      cachedAuthenticated = false;
      cachedToken = token;
    }
    cachedAt = now;
    cachedRefreshMs = RETRY_MS;
    return cachedServers;
  })().finally(() => {
    preloadPromise = null;
  });

  return preloadPromise;
}

/** Re-fetch now (or only when stale). Used on socket reconnect and sign-in. */
export function refreshIceServers({ ifStale = false } = {}) {
  if (ifStale && cachedServers && !isStale()) return Promise.resolve(cachedServers);
  cachedAt = 0;
  cachedRefreshMs = 0;
  return preloadIceServers();
}

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("online", () => { refreshIceServers({ ifStale: true }).catch(() => {}); });
  if (typeof document !== "undefined") {
    document.addEventListener?.("visibilitychange", () => {
      if (document.visibilityState === "visible") refreshIceServers({ ifStale: true }).catch(() => {});
    });
  }
}

export function _resetIceConfigForTests() {
  cachedServers = null;
  cachedAt = 0;
  cachedExpiresAt = 0;
  cachedRefreshMs = 0;
  cachedToken = null;
  cachedAuthenticated = false;
  preloadPromise = null;
  livePeers.clear();
}
