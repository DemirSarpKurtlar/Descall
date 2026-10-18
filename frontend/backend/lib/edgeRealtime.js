"use strict";

/**
 * Edge realtime rollout (scale plan S2, 2.11.6).
 *
 * Render env:
 *   EDGE_BRIDGE_URL      wss://rt.descall.com/bridge   (bridge only starts when set)
 *   EDGE_BRIDGE_SECRET   shared with the Worker secret of the same name
 *   EDGE_REALTIME_URL    wss://rt.descall.com          (what clients are told to use)
 * Admin (System tab, persisted in system_settings):
 *   featureFlags.edgeRealtime   master switch, opt-in (missing = off). Off = every
 *                               edge client is told to go back to Render at once.
 *   edgeRealtimePercent         0–100, stable per-user bucket
 *   edgeRealtimePlatforms       e.g. ["web"] → later ["web","electron"] → all
 *   edgeRealtimeAllowUserIds    team accounts (shadow / canary), any platform
 *
 * Shadow = bridge up, switch on, percent 0, no allow list: Render ↔ Hub runs and
 * is measured without a single client on it.
 */

const crypto = require("crypto");

const RT_HOSTS = new Set(["rt.descall.com", "rt-staging.descall.com"]);
const PLATFORMS = ["web", "electron", "ios", "android"];

function normalizeRealtimeUrl(raw) {
  const s = String(raw || "").trim().replace(/\/+$/, "");
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "wss:" || !RT_HOSTS.has(u.hostname) || u.pathname !== "/" || u.search) return null;
    return `wss://${u.hostname}`;
  } catch {
    return null;
  }
}

/** Stable 0–99 bucket per user (same user → same answer on every device). */
function userBucket(uid) {
  const h = crypto.createHash("sha256").update(`edge-rt:${uid}`).digest();
  return h.readUInt32BE(0) % 100;
}

function clientPlatform(socket) {
  const auth = socket?.handshake?.auth || {};
  const app = String(auth.app || "").toLowerCase();
  if (PLATFORMS.includes(app)) return app;
  if (String(auth.platform || "").toLowerCase() === "ios") return "ios";
  return "web";
}

function pickEdgeRealtimeConfig(input = {}) {
  const out = {};
  if (input.edgeRealtimePercent !== undefined) {
    const n = Math.floor(Number(input.edgeRealtimePercent));
    out.edgeRealtimePercent = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
  }
  if (input.edgeRealtimePlatforms !== undefined) {
    const list = Array.isArray(input.edgeRealtimePlatforms) ? input.edgeRealtimePlatforms : [];
    out.edgeRealtimePlatforms = [...new Set(list.map((p) => String(p).toLowerCase()).filter((p) => PLATFORMS.includes(p)))];
  }
  if (input.edgeRealtimeAllowUserIds !== undefined) {
    const list = Array.isArray(input.edgeRealtimeAllowUserIds) ? input.edgeRealtimeAllowUserIds : String(input.edgeRealtimeAllowUserIds || "").split(/[\s,]+/);
    out.edgeRealtimeAllowUserIds = [...new Set(list.map((x) => String(x).trim()).filter((x) => /^[0-9a-f-]{8,64}$/i.test(x)))].slice(0, 50);
  }
  return out;
}

/**
 * @returns {{ realtime: string | null, reason: string }}
 */
function edgeRealtimeAdvice({ uid, platform, config = {}, env = process.env, bridgeOpen = false }) {
  const url = normalizeRealtimeUrl(env.EDGE_REALTIME_URL);
  if (!url) return { realtime: null, reason: "no-url" };
  if (config.featureFlags?.edgeRealtime !== true) return { realtime: null, reason: "off" };
  if (!bridgeOpen) return { realtime: null, reason: "bridge-down" };
  const allow = Array.isArray(config.edgeRealtimeAllowUserIds) ? config.edgeRealtimeAllowUserIds : [];
  if (uid && allow.includes(String(uid))) return { realtime: url, reason: "allow" };
  const platforms = Array.isArray(config.edgeRealtimePlatforms) && config.edgeRealtimePlatforms.length ? config.edgeRealtimePlatforms : ["web"];
  if (!platforms.includes(platform)) return { realtime: null, reason: "platform" };
  const pct = Number(config.edgeRealtimePercent) || 0;
  if (pct <= 0 || !uid) return { realtime: null, reason: "percent" };
  return userBucket(uid) < pct ? { realtime: url, reason: "bucket" } : { realtime: null, reason: "percent" };
}

module.exports = {
  RT_HOSTS,
  PLATFORMS,
  normalizeRealtimeUrl,
  userBucket,
  clientPlatform,
  pickEdgeRealtimeConfig,
  edgeRealtimeAdvice,
};
