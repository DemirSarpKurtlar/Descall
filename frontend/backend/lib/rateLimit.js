"use strict";

/**
 * In-memory attempt limiter. Render's free instance has no Redis; this is the
 * first layer and resets if the process restarts. Limits are counted on
 * failures (or on every call when the route asks), with a growing lockout.
 *
 * IP keys must come from Express req.ip (trust proxy = 1 on Render), never
 * the raw first X-Forwarded-For hop.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_BACKOFF_SEC = 15 * 60;

const buckets = new Map();

function demoUsernames(env = process.env) {
  return new Set(
    String(env.REVIEW_DEMO_USERNAMES || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

function isReviewDemo(account, env = process.env) {
  if (!account) return false;
  return demoUsernames(env).has(String(account).trim().toLowerCase());
}

function stateFor(key, now, windowMs) {
  let row = buckets.get(key);
  if (!row) {
    row = { stamps: [], blockedUntil: 0, overflows: 0 };
    buckets.set(key, row);
  }
  row.stamps = row.stamps.filter((t) => now - t < windowMs);
  return row;
}

function lock(row, now) {
  row.overflows += 1;
  const backoff = Math.min(MAX_BACKOFF_SEC, 30 * 2 ** (row.overflows - 1));
  row.blockedUntil = now + backoff * 1000;
  return { ok: false, retryAfterSec: backoff };
}

/**
 * Record one failure. The `max`-th failure in the window is still allowed;
 * the next one is locked out, and each further overflow doubles the wait
 * (30s, 60s, …) up to 15 minutes.
 */
function recordFailure(key, { windowMs = WINDOW_MS, max = 30, now = Date.now() } = {}) {
  if (!key) return { ok: true };
  const row = stateFor(key, now, windowMs);
  if (row.blockedUntil > now) {
    return { ok: false, retryAfterSec: Math.ceil((row.blockedUntil - now) / 1000) };
  }
  if (row.stamps.length >= max) return lock(row, now);
  row.stamps.push(now);
  return { ok: true };
}

/** True when this key is already locked. Does not record a new failure. */
function peek(key, { windowMs = WINDOW_MS, max = 30, now = Date.now() } = {}) {
  if (!key) return { ok: true };
  const row = stateFor(key, now, windowMs);
  if (row.blockedUntil > now) {
    return { ok: false, retryAfterSec: Math.ceil((row.blockedUntil - now) / 1000) };
  }
  if (row.stamps.length >= max) return lock(row, now);
  return { ok: true };
}

function resetLimits() {
  buckets.clear();
}

const TOO_MANY_TR = "Çok fazla deneme. Lütfen biraz sonra tekrar dene.";

function rejectIfLimited(res, results) {
  const blocked = (results || []).find((r) => r && r.ok === false);
  if (!blocked) return false;
  res.set("Retry-After", String(Math.max(1, blocked.retryAfterSec || 1)));
  res.status(429).json({ error: TOO_MANY_TR });
  return true;
}

module.exports = {
  WINDOW_MS,
  recordFailure,
  peek,
  resetLimits,
  isReviewDemo,
  rejectIfLimited,
  TOO_MANY_TR,
};
