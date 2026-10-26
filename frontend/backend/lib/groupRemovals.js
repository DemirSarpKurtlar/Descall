"use strict";

/**
 * Storage for group member removals and group admin roles.
 *
 * Every read degrades gracefully while migration 20261026_group_member_removal
 * is not applied yet (Render deploys the code a moment before the additive
 * migration runs): a missing `role` column reads as "member", a missing
 * `group_member_removals` table reads as "no removals". A removal still works
 * then, it only cannot leave the history behind.
 */

const { ROLES, READD_COOLDOWN_MS, readdCooldownLeft } = require("./groupRoles");

function defaultDb() {
  return require("../db/supabase");
}

const REMOVALS = "group_member_removals";

function isMissingSchema(error) {
  if (!error) return false;
  const code = String(error.code || "");
  if (["42P01", "42703", "PGRST204", "PGRST205"].includes(code)) return true;
  return /does not exist|schema cache|Could not find/i.test(String(error.message || ""));
}

// Re-add cooldown also kept in memory so it holds without the table.
const recentRemovals = new Map();

function rememberRemoval(groupId, userId, at = Date.now()) {
  recentRemovals.set(`${groupId}:${userId}`, at);
  if (recentRemovals.size > 5000) {
    const cutoff = Date.now() - READD_COOLDOWN_MS;
    for (const [key, value] of recentRemovals) if (value < cutoff) recentRemovals.delete(key);
  }
}

/** { userId, role } of a member, or null when not a member. */
async function getMemberRole(groupId, userId, db = defaultDb()) {
  if (!groupId || !userId) return null;
  const first = await db
    .from("group_members")
    .select("user_id, role")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  if (first.error && isMissingSchema(first.error)) {
    const fallback = await db
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .maybeSingle();
    if (fallback.error) throw fallback.error;
    return fallback.data ? { userId, role: ROLES.MEMBER } : null;
  }
  if (first.error) throw first.error;
  if (!first.data) return null;
  return { userId, role: first.data.role === ROLES.ADMIN ? ROLES.ADMIN : ROLES.MEMBER };
}

/** The open removal (not dismissed, not re-added) of a user from a group. */
async function getActiveRemoval(groupId, userId, db = defaultDb()) {
  if (!groupId || !userId) return null;
  const { data, error } = await db
    .from(REMOVALS)
    .select("id, group_id, user_id, removed_by, reason, removed_at, read_until")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .is("readded_at", null)
    .is("dismissed_at", null)
    .order("removed_at", { ascending: false })
    .limit(1);
  if (error) {
    if (isMissingSchema(error)) return null;
    throw error;
  }
  return (data || [])[0] || null;
}

/** Every open removal of a user (for GET /groups/my), newest first. */
async function listActiveRemovals(userId, db = defaultDb()) {
  if (!userId) return [];
  const { data, error } = await db
    .from(REMOVALS)
    .select("id, group_id, user_id, removed_by, reason, removed_at, read_until")
    .eq("user_id", userId)
    .is("readded_at", null)
    .is("dismissed_at", null)
    .order("removed_at", { ascending: false })
    .limit(50);
  if (error) {
    if (isMissingSchema(error)) return [];
    throw error;
  }
  const seen = new Set();
  return (data || []).filter((row) => {
    if (!row?.group_id || seen.has(row.group_id)) return false;
    seen.add(row.group_id);
    return true;
  });
}

/** ms left in the 5 s re-add cooldown for this user in this group (0 = ok). */
async function readdWaitMs(groupId, userId, db = defaultDb(), now = Date.now()) {
  let wait = readdCooldownLeft(recentRemovals.get(`${groupId}:${userId}`), now);
  if (wait > 0) return wait;
  const { data, error } = await db
    .from(REMOVALS)
    .select("removed_at")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .order("removed_at", { ascending: false })
    .limit(1);
  if (error) {
    if (isMissingSchema(error)) return 0;
    throw error;
  }
  wait = readdCooldownLeft((data || [])[0]?.removed_at, now);
  return wait;
}

async function recordRemoval({ groupId, userId, removedBy, reason, removedAt, readUntil }, db = defaultDb()) {
  rememberRemoval(groupId, userId, new Date(removedAt).getTime() || Date.now());
  const { data, error } = await db
    .from(REMOVALS)
    .insert({
      group_id: groupId,
      user_id: userId,
      removed_by: removedBy,
      reason: reason || null,
      removed_at: removedAt,
      read_until: readUntil || removedAt,
    })
    .select("id")
    .single();
  if (error) {
    if (isMissingSchema(error)) return null;
    throw error;
  }
  return data || null;
}

async function markReadded(groupId, userId, db = defaultDb()) {
  const { error } = await db
    .from(REMOVALS)
    .update({ readded_at: new Date().toISOString() })
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .is("readded_at", null);
  if (error && !isMissingSchema(error)) throw error;
}

async function dismissRemoval(groupId, userId, db = defaultDb()) {
  const { error } = await db
    .from(REMOVALS)
    .update({ dismissed_at: new Date().toISOString() })
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .is("dismissed_at", null);
  if (error && !isMissingSchema(error)) throw error;
}

/** Map of user id → role for a group's member rows (role column optional). */
async function loadRoles(groupIds, db = defaultDb()) {
  const roles = new Map();
  if (!groupIds?.length) return roles;
  const { data, error } = await db
    .from("group_members")
    .select("group_id, user_id, role")
    .in("group_id", groupIds);
  if (error) {
    if (isMissingSchema(error)) return roles;
    throw error;
  }
  for (const row of data || []) {
    if (row.role === ROLES.ADMIN) roles.set(`${row.group_id}:${row.user_id}`, ROLES.ADMIN);
  }
  return roles;
}

module.exports = {
  isMissingSchema,
  getMemberRole,
  getActiveRemoval,
  listActiveRemovals,
  readdWaitMs,
  recordRemoval,
  markReadded,
  dismissRemoval,
  loadRoles,
  rememberRemoval,
  __test: { recentRemovals },
};
