"use strict";

/**
 * TURN credentials for /api/webrtc/ice-config.
 *
 * Without TURN, two peers behind symmetric NAT / carrier-grade NAT (most
 * cellular networks, many corporate / campus Wi-Fi) cannot connect at all,
 * and an ICE restart after a Wi-Fi ↔ cellular switch has nothing to fall back
 * on — the call drops. Three ways to configure it, first match wins:
 *
 * 1. Cloudflare Realtime TURN (managed, anycast, UDP/TCP/TLS 443):
 *      CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_API_TOKEN
 *    Short-lived credentials are minted per process and cached.
 * 2. coturn / any TURN with the REST shared-secret scheme (use-auth-secret):
 *      TURN_URL (comma separated) + TURN_SHARED_SECRET
 *    username = "<expiry>:descall", credential = base64(HMAC-SHA1(secret, username)).
 * 3. Static long-term credentials (legacy): TURN_URL + TURN_USERNAME + TURN_CREDENTIAL.
 *
 * 2.11.1: TURN is only handed to signed-in users (routes/webrtc.js). Every user gets their
 * own short-lived credentials (USER_TTL_S, default 4 h, clamp 1-4 h via TURN_CREDENTIAL_TTL_S),
 * cached per user for half their lifetime so reconnects do not re-mint. Clients refresh
 * before expiry (response carries ttlSeconds / expiresAt).
 *
 * Credentials are never logged.
 */

const crypto = require("crypto");
const { expandTurnUrls } = require("./turnUrls");

const EPHEMERAL_TTL_S = 24 * 60 * 60;
/** Re-mint well before expiry; clients refresh their copy every 6 h. */
const CACHE_MS = 8 * 60 * 60 * 1000;

let cfCache = null; // { at, iceServers }
let cfInflight = null;

const USER_TTL_DEFAULT_S = 4 * 60 * 60;
const USER_CACHE_MAX = 5000;
const userCache = new Map(); // userId -> { at, expiresAt, servers }
const userInflight = new Map();

function userTtlSeconds(env = process.env) {
  const raw = Number(env.TURN_CREDENTIAL_TTL_S);
  if (!Number.isFinite(raw) || raw <= 0) return USER_TTL_DEFAULT_S;
  return Math.min(4 * 60 * 60, Math.max(60 * 60, Math.round(raw)));
}

function safeUserTag(userId) {
  return String(userId || "user").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || "user";
}

function splitUrls(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function turnUrlsFromEnv(env = process.env) {
  return splitUrls(env.TURN_URLS || env.TURN_URL || env.TURN_URI);
}

function sharedSecretCredentials(urls, secret, { now = Date.now(), ttlS = EPHEMERAL_TTL_S } = {}) {
  const expiry = Math.floor(now / 1000) + ttlS;
  const username = `${expiry}:descall`;
  const credential = crypto.createHmac("sha1", secret).update(username).digest("base64");
  return { urls: expandTurnUrls(urls), username, credential };
}

function turnMode(env = process.env) {
  if (env.CLOUDFLARE_TURN_KEY_ID && env.CLOUDFLARE_TURN_API_TOKEN) return "cloudflare";
  const urls = turnUrlsFromEnv(env);
  if (urls.length && (env.TURN_SHARED_SECRET || env.TURN_STATIC_AUTH_SECRET)) return "shared-secret";
  if (urls.length && env.TURN_USERNAME && (env.TURN_CREDENTIAL || env.TURN_PASSWORD)) return "static";
  return "none";
}

async function cloudflareIceServers(env = process.env, { fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  if (cfCache && now - cfCache.at < CACHE_MS) return cfCache.iceServers;
  if (cfInflight) return cfInflight;
  cfInflight = (async () => {
    try {
      const res = await fetchImpl(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.CLOUDFLARE_TURN_KEY_ID)}/credentials/generate-ice-servers`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.CLOUDFLARE_TURN_API_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ttl: EPHEMERAL_TTL_S }),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data?.iceServers) ? data.iceServers : data?.iceServers ? [data.iceServers] : [];
      // Cloudflare already returns stun + turn (udp/tcp 3478, turns 5349/443).
      const servers = list.filter((s) => s && s.urls);
      if (!servers.length) throw new Error("empty iceServers");
      cfCache = { at: now, iceServers: servers };
      return servers;
    } catch (err) {
      console.warn("[webrtc] Cloudflare TURN credentials failed:", err?.message || err);
      return cfCache?.iceServers || [];
    } finally {
      cfInflight = null;
    }
  })();
  return cfInflight;
}

/** TURN entries to append after STUN (possibly empty). */
async function turnIceServers(env = process.env, opts = {}) {
  const mode = turnMode(env);
  if (mode === "cloudflare") return cloudflareIceServers(env, opts);
  const urls = turnUrlsFromEnv(env);
  if (mode === "shared-secret") {
    return [sharedSecretCredentials(urls, env.TURN_SHARED_SECRET || env.TURN_STATIC_AUTH_SECRET, opts)];
  }
  if (mode === "static") {
    return [
      {
        urls: expandTurnUrls(urls),
        username: env.TURN_USERNAME,
        credential: env.TURN_CREDENTIAL || env.TURN_PASSWORD,
      },
    ];
  }
  return [];
}

async function mintCloudflareForUser(env, ttlS, fetchImpl) {
  const res = await fetchImpl(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.CLOUDFLARE_TURN_KEY_ID)}/credentials/generate-ice-servers`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.CLOUDFLARE_TURN_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl: ttlS }),
    }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const list = Array.isArray(data?.iceServers) ? data.iceServers : data?.iceServers ? [data.iceServers] : [];
  // Port 53 is blocked by browsers and only adds a timeout without trickle ICE.
  const servers = list
    .filter((s) => s && s.urls)
    .map((s) => ({ ...s, urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => !/:53(\?|$)/.test(String(u))) }))
    .filter((s) => s.urls.length);
  if (!servers.length) throw new Error("empty iceServers");
  return servers;
}

/**
 * Per-user, short-lived TURN entries for a signed-in user.
 * Returns { servers, ttlSeconds, expiresAt } (servers possibly empty when TURN is off).
 */
async function turnIceServersForUser(userId, env = process.env, { fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  const mode = turnMode(env);
  const ttlS = userTtlSeconds(env);
  if (mode === "none") return { servers: [], ttlSeconds: ttlS, expiresAt: null };
  if (mode === "static") {
    // Long-term credentials cannot expire; still only for signed-in users.
    return { servers: await turnIceServers(env), ttlSeconds: ttlS, expiresAt: null };
  }
  if (mode === "shared-secret") {
    const urls = turnUrlsFromEnv(env);
    const secret = env.TURN_SHARED_SECRET || env.TURN_STATIC_AUTH_SECRET;
    const expiry = Math.floor(now / 1000) + ttlS;
    const username = `${expiry}:${safeUserTag(userId)}`;
    const credential = crypto.createHmac("sha1", secret).update(username).digest("base64");
    return { servers: [{ urls: expandTurnUrls(urls), username, credential }], ttlSeconds: ttlS, expiresAt: new Date(expiry * 1000).toISOString() };
  }
  // Cloudflare: one credential per user, reused for half its lifetime.
  const key = String(userId);
  const hit = userCache.get(key);
  if (hit && now - hit.at < (ttlS * 1000) / 2) {
    return { servers: hit.servers, ttlSeconds: Math.max(60, Math.floor((hit.expiresAt - now) / 1000)), expiresAt: new Date(hit.expiresAt).toISOString() };
  }
  if (userInflight.has(key)) return userInflight.get(key);
  const p = (async () => {
    try {
      const servers = await mintCloudflareForUser(env, ttlS, fetchImpl);
      const expiresAt = now + ttlS * 1000;
      if (userCache.size >= USER_CACHE_MAX) {
        for (const [k, v] of userCache) if (now - v.at >= (ttlS * 1000) / 2) userCache.delete(k);
        if (userCache.size >= USER_CACHE_MAX) userCache.delete(userCache.keys().next().value);
      }
      userCache.set(key, { at: now, expiresAt, servers });
      return { servers, ttlSeconds: ttlS, expiresAt: new Date(expiresAt).toISOString() };
    } catch (err) {
      console.warn("[webrtc] Cloudflare TURN credentials failed:", err?.message || err);
      if (hit && hit.expiresAt - now > 10 * 60 * 1000) {
        return { servers: hit.servers, ttlSeconds: Math.floor((hit.expiresAt - now) / 1000), expiresAt: new Date(hit.expiresAt).toISOString() };
      }
      return { servers: [], ttlSeconds: 60, expiresAt: null };
    } finally {
      userInflight.delete(key);
    }
  })();
  userInflight.set(key, p);
  return p;
}

function _resetTurnCacheForTests() {
  cfCache = null;
  cfInflight = null;
  userCache.clear();
  userInflight.clear();
}

module.exports = {
  EPHEMERAL_TTL_S,
  turnMode,
  turnUrlsFromEnv,
  sharedSecretCredentials,
  turnIceServers,
  turnIceServersForUser,
  userTtlSeconds,
  _resetTurnCacheForTests,
};
