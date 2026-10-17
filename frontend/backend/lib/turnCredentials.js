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
 * Credentials are never logged.
 */

const crypto = require("crypto");
const { expandTurnUrls } = require("./turnUrls");

const EPHEMERAL_TTL_S = 24 * 60 * 60;
/** Re-mint well before expiry; clients refresh their copy every 6 h. */
const CACHE_MS = 8 * 60 * 60 * 1000;

let cfCache = null; // { at, iceServers }
let cfInflight = null;

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

function _resetTurnCacheForTests() {
  cfCache = null;
  cfInflight = null;
}

module.exports = {
  EPHEMERAL_TTL_S,
  turnMode,
  turnUrlsFromEnv,
  sharedSecretCredentials,
  turnIceServers,
  _resetTurnCacheForTests,
};
