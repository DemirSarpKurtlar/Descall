"use strict";

const supabase = require("../db/supabase");
const { revokedSessionIds } = require("../runtime/sharedState");

/**
 * Tokens minted before this instant may omit `sid` and stay valid until their
 * own 7-day expiry. Tokens minted after it must carry a session id that is
 * still in users.active_sessions. Login already stores `sid`; this cutoff
 * only rejects session-less tokens issued after the release.
 */
const SESSION_LESS_ACCEPT_BEFORE_MS = Date.parse("2026-10-11T12:00:00.000Z");
const CACHE_MS = 20 * 1000;
const cache = new Map();

function decideSession(decoded, { cutoffMs = SESSION_LESS_ACCEPT_BEFORE_MS, activeIds = null } = {}) {
  if (!decoded || decoded.pending2fa) return { ok: false, code: "SESSION_REQUIRED" };
  if (!decoded.sid) {
    const iatMs = Number(decoded.iat || 0) * 1000;
    if (iatMs > 0 && iatMs < cutoffMs) return { ok: true, legacy: true };
    return { ok: false, code: "SESSION_REQUIRED" };
  }
  if (activeIds == null) return { ok: true, needsLookup: true };
  const set = activeIds instanceof Set ? activeIds : new Set(activeIds);
  if (!set.has(decoded.sid)) return { ok: false, code: "SESSION_REVOKED" };
  return { ok: true };
}

function invalidateSessionCache(userId) {
  if (userId) cache.delete(userId);
}

function noteDroppedSessions(userId, ids) {
  invalidateSessionCache(userId);
  for (const id of ids || []) {
    if (id) revokedSessionIds.add(id);
  }
}

async function loadActiveIds(userId, now = Date.now()) {
  const hit = cache.get(userId);
  if (hit && now - hit.at < CACHE_MS) return hit.ids;
  const { data, error } = await supabase
    .from("users")
    .select("active_sessions")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  const ids = new Set(
    (Array.isArray(data?.active_sessions) ? data.active_sessions : [])
      .map((s) => s && s.id)
      .filter(Boolean)
  );
  cache.set(userId, { ids, at: now });
  return ids;
}

async function sessionAllowed(decoded) {
  if (decoded?.sid && revokedSessionIds.has(decoded.sid)) {
    return { ok: false, code: "SESSION_REVOKED" };
  }
  const preliminary = decideSession(decoded);
  if (!preliminary.needsLookup) return preliminary;
  try {
    const ids = await loadActiveIds(decoded.sub);
    return decideSession(decoded, { activeIds: ids });
  } catch (err) {
    console.error("[session] active session lookup failed:", err?.message || err);
    return { ok: true, degraded: true };
  }
}

module.exports = {
  SESSION_LESS_ACCEPT_BEFORE_MS,
  decideSession,
  sessionAllowed,
  invalidateSessionCache,
  noteDroppedSessions,
  loadActiveIds,
};
