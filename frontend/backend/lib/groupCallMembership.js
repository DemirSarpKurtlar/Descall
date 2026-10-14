"use strict";

/**
 * Group-call signaling is members-only. SDP and ICE are relayed only when
 * both users are already in the live call. A database error fails closed.
 */

const CACHE_MS = 30_000;
const cache = new Map();

function cacheKey(groupId, userId) {
  return `${groupId}::${userId}`;
}

async function assertGroupMember(supabase, groupId, userId) {
  if (!groupId || !userId || !supabase) return false;
  const key = cacheKey(groupId, userId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.ok;
  try {
    const { data, error } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.warn("[GroupCall] membership check failed:", error.message || error);
      return false;
    }
    const ok = Boolean(data);
    cache.set(key, { ok, at: Date.now() });
    return ok;
  } catch (err) {
    console.warn("[GroupCall] membership check failed:", err?.message || err);
    return false;
  }
}

function bothInGroupCall(activeGroupCalls, groupId, userA, userB) {
  if (!groupId || !userA || !userB || userA === userB) return false;
  const call = activeGroupCalls?.get?.(groupId);
  if (!call?.participants) return false;
  return call.participants.has(userA) && call.participants.has(userB);
}

function resetGroupMemberCache() {
  cache.clear();
}

module.exports = {
  assertGroupMember,
  bothInGroupCall,
  resetGroupMemberCache,
};
