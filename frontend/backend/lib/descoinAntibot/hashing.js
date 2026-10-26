"use strict";

/**
 * Device / network data is never stored raw (plan §9, KVKK): keyed
 * HMAC-SHA256, IPv4 reduced to /24 and IPv6 to /64 *before* hashing, so the
 * stored value cannot be turned back into an address and is useless outside
 * this deployment. Raw IPs / fingerprints are never logged or persisted.
 *
 * Key: DESCOIN_ANTIBOT_HASH_SECRET, else a key derived (domain-separated) from
 * JWT_SECRET. With neither set, hashing is disabled (returns null) instead of
 * falling back to a guessable constant.
 */
const crypto = require("crypto");

let cachedKey = null;
let cachedFrom = null;

function key(env = process.env) {
  const base = env.DESCOIN_ANTIBOT_HASH_SECRET || env.JWT_SECRET || "";
  if (!base) return null;
  if (cachedFrom === base && cachedKey) return cachedKey;
  cachedFrom = base;
  cachedKey = crypto.createHash("sha256").update(`descall:antibot:v1:${base}`).digest();
  return cachedKey;
}

function hmac(value) {
  const k = key();
  if (!k) return null;
  return crypto.createHmac("sha256", k).update(String(value)).digest("hex").slice(0, 40);
}

function expandIpv6(s) {
  if (!/^[0-9a-f:]+$/i.test(s)) return null;
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - left.length - right.length : 0;
  if (fill < 0) return null;
  const full = [...left, ...new Array(fill).fill("0"), ...right];
  if (full.length !== 8 || full.some((p) => !/^[0-9a-f]{1,4}$/i.test(p))) return null;
  return full.map((p) => p.toLowerCase().replace(/^0+(?=.)/, ""));
}

/** "203.0.113.7" → "203.0.113.0/24"; IPv6 → first 4 hextets + "::/64". */
function ipSubnet(ip) {
  let s = String(ip || "").trim();
  if (!s || s === "unknown") return null;
  s = s.replace(/^::ffff:/i, "").replace(/%.*$/, "");
  const v4 = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const parts = v4.slice(1).map(Number);
    if (parts.some((n) => n > 255)) return null;
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }
  if (s.includes(":")) {
    const full = expandIpv6(s);
    return full ? `${full.slice(0, 4).join(":")}::/64` : null;
  }
  return null;
}

/** Loopback / private / link-local networks are never evidence of anything. */
function isPrivateSubnet(sub) {
  if (!sub) return true;
  return /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(sub) || /^(fe80|fc|fd|0:0:0:0)/i.test(sub);
}

function hashSubnet(ip) {
  const sub = ipSubnet(ip);
  if (!sub || isPrivateSubnet(sub)) return null;
  return hmac(`ip:${sub}`);
}

function hashFingerprint(fp) {
  const s = String(fp ?? "").trim();
  if (!s || s.length > 512) return null;
  return hmac(`fp:${s}`);
}

function hashConversation(convKey) {
  const s = String(convKey ?? "").trim();
  if (!s) return null;
  return hmac(`conv:${s}`);
}

/** 32-bit salt for message MinHash seeds so stored signatures are keyed too. */
function minhashSalt() {
  const k = key();
  return k ? k.readInt32BE(0) : 0;
}

module.exports = { ipSubnet, isPrivateSubnet, hashSubnet, hashFingerprint, hashConversation, minhashSalt };
