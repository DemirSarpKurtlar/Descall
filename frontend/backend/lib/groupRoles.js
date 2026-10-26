"use strict";

/**
 * Group chat roles (Oct 2026). The owner is `groups.created_by`; besides the
 * owner a member can be a group admin (`group_members.role = 'admin'`).
 *
 *   owner  removes anyone but themself, makes / unmakes admins
 *   admin  removes plain members (never the owner or another admin)
 *   member removes nobody
 *
 * Pure so the route, the client copy and the tests share one rule.
 */

const ROLES = Object.freeze({ OWNER: "owner", ADMIN: "admin", MEMBER: "member" });
const REASON_MAX = 140;
/** Re-adding someone right after a removal waits this long (owner decision: 5 s). */
const READD_COOLDOWN_MS = 5_000;
/** Removals per actor per rolling minute. */
const REMOVE_RATE_MAX = 10;
const REMOVE_RATE_WINDOW_MS = 60_000;

function roleOf({ userId, ownerId, role }) {
  if (userId && ownerId && userId === ownerId) return ROLES.OWNER;
  return role === ROLES.ADMIN ? ROLES.ADMIN : ROLES.MEMBER;
}

/**
 * @returns {{ ok: true } | { ok: false, status: number, code: string }}
 */
function canRemoveMember({ actorId, targetId, ownerId, actorRole, targetRole, actorIsMember = true, targetIsMember = true }) {
  if (!actorIsMember) return { ok: false, status: 403, code: "NOT_MEMBER" };
  if (actorId && targetId && actorId === targetId) return { ok: false, status: 400, code: "CANNOT_REMOVE_SELF" };
  const actor = roleOf({ userId: actorId, ownerId, role: actorRole });
  if (actor === ROLES.MEMBER) return { ok: false, status: 403, code: "NOT_ALLOWED" };
  if (!targetIsMember) return { ok: false, status: 404, code: "NOT_FOUND" };
  const target = roleOf({ userId: targetId, ownerId, role: targetRole });
  if (target === ROLES.OWNER) return { ok: false, status: 403, code: "CANNOT_REMOVE_OWNER" };
  if (actor === ROLES.ADMIN && target === ROLES.ADMIN) return { ok: false, status: 403, code: "NOT_ALLOWED" };
  return { ok: true };
}

/** Only the owner sets roles, never on themself. */
function canSetRole({ actorId, targetId, ownerId, role, targetIsMember = true }) {
  if (role !== ROLES.ADMIN && role !== ROLES.MEMBER) return { ok: false, status: 400, code: "BAD_ROLE" };
  if (!ownerId || actorId !== ownerId) return { ok: false, status: 403, code: "NOT_ALLOWED" };
  if (targetId === ownerId) return { ok: false, status: 400, code: "CANNOT_CHANGE_OWNER" };
  if (!targetIsMember) return { ok: false, status: 404, code: "NOT_FOUND" };
  return { ok: true };
}

/** Trimmed single-line reason, at most 140 characters, or null. */
function normalizeReason(raw) {
  if (raw == null) return { ok: true, reason: null };
  if (typeof raw !== "string") return { ok: false, code: "BAD_REASON" };
  const reason = raw.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (!reason) return { ok: true, reason: null };
  if ([...reason].length > REASON_MAX) return { ok: false, code: "REASON_TOO_LONG" };
  return { ok: true, reason };
}

/** ms left before a removed person can be added back; 0 when allowed. */
function readdCooldownLeft(removedAt, now = Date.now()) {
  const at = removedAt ? new Date(removedAt).getTime() : NaN;
  if (!Number.isFinite(at)) return 0;
  return Math.max(0, at + READD_COOLDOWN_MS - now);
}

/** Sliding-window limiter; returns ms to wait (0 = allowed and counted). */
function createRateLimiter({ max = REMOVE_RATE_MAX, windowMs = REMOVE_RATE_WINDOW_MS, now = () => Date.now() } = {}) {
  const hits = new Map();
  return function take(key) {
    const t = now();
    const list = (hits.get(key) || []).filter((at) => t - at < windowMs);
    if (list.length >= max) {
      hits.set(key, list);
      return list[0] + windowMs - t;
    }
    list.push(t);
    hits.set(key, list);
    return 0;
  };
}

/** Member-event rows stored in group_messages (content = JSON). */
const MEMBER_EVENT_TYPES = Object.freeze(["member_removed", "member_left"]);

function isMemberEventType(type) {
  return MEMBER_EVENT_TYPES.includes(type);
}

/** content JSON → { actorId, targetId } (never the reason). */
function parseMemberEvent(content) {
  try {
    const obj = typeof content === "string" ? JSON.parse(content) : content;
    if (!obj || typeof obj !== "object") return null;
    return {
      actorId: typeof obj.actorId === "string" ? obj.actorId : null,
      targetId: typeof obj.targetId === "string" ? obj.targetId : null,
    };
  } catch {
    return null;
  }
}

module.exports = {
  ROLES,
  REASON_MAX,
  READD_COOLDOWN_MS,
  REMOVE_RATE_MAX,
  REMOVE_RATE_WINDOW_MS,
  MEMBER_EVENT_TYPES,
  roleOf,
  canRemoveMember,
  canSetRole,
  normalizeReason,
  readdCooldownLeft,
  createRateLimiter,
  isMemberEventType,
  parseMemberEvent,
};
