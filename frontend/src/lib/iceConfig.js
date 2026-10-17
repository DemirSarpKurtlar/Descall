/**
 * WebRTC ICE server configuration (STUN + optional TURN).
 * Preload on app start; hooks read synchronously via getIceServers().
 */

const DEFAULT_ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

let cachedServers = null;
let cachedAt = 0;
let preloadPromise = null;
/** TURN credentials from the backend are short-lived (24 h); refresh well before. */
const REFRESH_MS = 6 * 60 * 60 * 1000;
const RETRY_MS = 60 * 1000;

function parseEnvIceServers() {
  const raw = import.meta.env.VITE_ICE_SERVERS;
  if (!raw || typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    console.warn("[iceConfig] Invalid VITE_ICE_SERVERS JSON");
    return null;
  }
}

function normalizeIceServers(list) {
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

function isStale(now = Date.now()) {
  if (!cachedServers) return true;
  const fromBackend = cachedServers !== DEFAULT_ICE_SERVERS;
  return now - cachedAt > (fromBackend ? REFRESH_MS : RETRY_MS);
}

export function getIceServers() {
  // A long-lived window (Electron in the tray for days) must not dial with
  // expired TURN credentials: refresh in the background, use what we have now.
  if (isStale()) preloadIceServers().catch(() => {});
  return cachedServers || DEFAULT_ICE_SERVERS;
}

export function iceServersHaveTurn(list = cachedServers) {
  return (Array.isArray(list) ? list : []).some((entry) => {
    const urls = Array.isArray(entry?.urls) ? entry.urls : [entry?.urls];
    return urls.some((u) => /^turns?:/i.test(String(u || "")));
  });
}

export async function preloadIceServers() {
  if (cachedServers && !isStale()) return cachedServers;
  if (preloadPromise) return preloadPromise;

  preloadPromise = (async () => {
    const fromEnv = parseEnvIceServers();
    if (fromEnv) {
      cachedServers = normalizeIceServers(fromEnv);
      cachedAt = Date.now() + 365 * 24 * 3600 * 1000; // build-time config never expires
      return cachedServers;
    }

    const base =
      (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "") ||
      (typeof window !== "undefined" ? window.location.origin : "");

    try {
      const res = await fetch(`${base}/api/webrtc/ice-config`, {
        credentials: "omit",
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.iceServers) && data.iceServers.length > 0) {
          cachedServers = normalizeIceServers(data.iceServers);
          cachedAt = Date.now();
          return cachedServers;
        }
      }
    } catch {
      /* use defaults */
    }

    // Keep a previously fetched list (with TURN) over the bare STUN default.
    if (!cachedServers) cachedServers = DEFAULT_ICE_SERVERS;
    cachedAt = Date.now();
    return cachedServers;
  })().finally(() => {
    preloadPromise = null;
  });

  return preloadPromise;
}
