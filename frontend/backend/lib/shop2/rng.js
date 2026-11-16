"use strict";

/**
 * Deterministic randomness for Market 2.0. A storefront, a night market deck or a simulated
 * user is a pure function of its seed, so the admin "why" view can re-create exactly what a
 * person saw (same seed + same rule version + same pool = same cards).
 */

const crypto = require("crypto");

/** Hex seed from any parts ("user|2026-11-15|v3|r0"). */
function seedOf(...parts) {
  return crypto.createHash("sha256").update(parts.map((p) => String(p ?? "")).join("|")).digest("hex");
}

/** mulberry32 over the first 32 bits of a hex seed: () => [0, 1). */
function rngFrom(seedHex) {
  let a = parseInt(String(seedHex).slice(0, 8), 16) >>> 0;
  if (!a) a = 0x9e3779b9;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable [0, 1) for a set of parts (A/B arms, per-card draws). */
function hash01(...parts) {
  return parseInt(seedOf(...parts).slice(0, 13), 16) / 2 ** 52;
}

/**
 * Index picked with probability weight / total, or -1 when every weight is 0.
 * `weights` is an array of non-negative numbers.
 */
function weightedIndex(rng, weights) {
  let total = 0;
  for (const w of weights) total += w > 0 ? w : 0;
  if (total <= 0) return -1;
  let r = rng() * total;
  for (let i = 0; i < weights.length; i += 1) {
    const w = weights[i] > 0 ? weights[i] : 0;
    if (r < w) return i;
    r -= w;
  }
  for (let i = weights.length - 1; i >= 0; i -= 1) if (weights[i] > 0) return i;
  return -1;
}

module.exports = { seedOf, rngFrom, hash01, weightedIndex };
