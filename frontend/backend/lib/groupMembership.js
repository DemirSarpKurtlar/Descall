"use strict";

/**
 * Helpers for adding a member to a group chat (POST /groups/:id/members).
 *
 * Friendship rows can exist in both directions (A→B and B→A, both
 * "accepted"): the unique index is only (user_id, friend_id). Asking
 * PostgREST for `.maybeSingle()` over the two-direction OR then fails with
 * PGRST116 ("multiple rows") and returns data = null, which the route read as
 * "not friends" → 403 for real friends. Always read a bounded list instead.
 */

function defaultDb() {
  return require("../db/supabase");
}

// Ids go into a PostgREST `or=` filter: never let `,()` or spaces through.
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function isSafeId(value) {
  return typeof value === "string" && ID_RE.test(value);
}

async function areAcceptedFriends(a, b, db = defaultDb()) {
  if (!isSafeId(a) || !isSafeId(b) || a === b) return false;
  const { data, error } = await db
    .from("friendships")
    .select("id")
    .or(`and(user_id.eq.${a},friend_id.eq.${b}),and(user_id.eq.${b},friend_id.eq.${a})`)
    .eq("status", "accepted")
    .limit(1);
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

/** Postgres unique violation (row already there, e.g. a double tap). */
function isUniqueViolation(error) {
  return Boolean(error) && (error.code === "23505" || /duplicate key/i.test(String(error.message || "")));
}

/** The member shape the client list uses (`members[]` in GET /groups/my). */
function publicMember(user) {
  if (!user?.id) return null;
  return {
    id: user.id,
    username: user.username || null,
    avatar_url: user.avatar_url || null,
    status: user.status || null,
    is_admin: Boolean(user.is_admin),
  };
}

module.exports = { areAcceptedFriends, isUniqueViolation, publicMember, isSafeId };
