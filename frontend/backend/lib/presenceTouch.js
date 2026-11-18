"use strict";

const supabase = require("../db/supabase");
const { userLastLoginAt, lastSeenByUserId } = require("../runtime/sharedState");

/** Avoid hammering Postgres on rapid reconnects / multi-tab sockets. */
// 2.11.4: 60 s → 5 min. Memory is always current; disconnect forces a write.
const MIN_INTERVAL_MS = 5 * 60_000;
// performance-11: the per-user UPDATE users SET last_seen was the most expensive statement
// in the database (12.7k calls, mean 19 ms, max 2.6 s: users is wide and last_seen is
// indexed, so no update is HOT). Throttled touches now queue and go out as ONE
// `update ... in (ids)` per flush. Forced writes (disconnect, signup) stay immediate.
const FLUSH_MS = 30_000;
const MAX_BATCH = 500;
const lastDbWriteAt = new Map();
const pending = new Set();
let flushTimer = null;

async function writeLastSeen(ids, iso) {
  if (!ids.length) return;
  try {
    const q = supabase.from("users").update({ last_seen: iso });
    const { error } = ids.length === 1 ? await q.eq("id", ids[0]) : await q.in("id", ids);
    if (error) console.warn("[presence] last_seen update failed:", error.message);
  } catch (err) {
    console.warn("[presence] last_seen update failed:", err?.message || err);
  }
}

/** Write every queued user now (one statement per MAX_BATCH ids). */
async function flushLastSeen() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!pending.size) return 0;
  const ids = [...pending];
  pending.clear();
  const iso = new Date().toISOString();
  for (let i = 0; i < ids.length; i += MAX_BATCH) {
    await writeLastSeen(ids.slice(i, i + MAX_BATCH), iso);
  }
  return ids.length;
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushLastSeen().catch(() => {});
  }, FLUSH_MS);
  flushTimer.unref?.();
}

/**
 * Record that a user was active now.
 * Updates in-memory maps always; persists to users.last_seen (throttled and batched
 * unless force).
 */
async function touchLastSeen(userId, { force = false } = {}) {
  if (!userId) return null;
  const nowIso = new Date().toISOString();
  userLastLoginAt.set(userId, nowIso);
  lastSeenByUserId.set(userId, nowIso);

  const prev = lastDbWriteAt.get(userId) || 0;
  if (!force && Date.now() - prev < MIN_INTERVAL_MS) {
    return nowIso;
  }
  lastDbWriteAt.set(userId, Date.now());

  if (force) {
    pending.delete(userId);
    await writeLastSeen([userId], nowIso);
    return nowIso;
  }
  pending.add(userId);
  scheduleFlush();
  return nowIso;
}

module.exports = { touchLastSeen, flushLastSeen, _pendingLastSeen: pending };
