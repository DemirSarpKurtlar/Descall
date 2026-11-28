"use strict";

const supabase = require("../db/supabase");
const { friends, pendingRequests } = require("../runtime/sharedState");
const { apiError } = require("./apiError");

/** userId -> Set of blocked user ids, hydrated from users.blocked_users on demand. */
const blockedSetCache = new Map();

function sanitizeArray(arr) {
  return Array.isArray(arr) ? arr.filter((v) => typeof v === "string" && v) : [];
}

async function loadBlockedSet(userId) {
  if (blockedSetCache.has(userId)) return blockedSetCache.get(userId);
  const { data } = await supabase
    .from("users")
    .select("blocked_users")
    .eq("id", userId)
    .maybeSingle();
  const set = new Set(sanitizeArray(data?.blocked_users));
  blockedSetCache.set(userId, set);
  return set;
}

function invalidateLocal(userId) {
  blockedSetCache.delete(userId);
}
// Hybrid server: clearing this cache also clears it on the other nodes (no-op on a single node).
const invalidate = require("./cluster").linkInvalidate("blocks", invalidateLocal);

/** True if either user has blocked the other. */
async function isBlockedEitherWay(userA, userB) {
  if (!userA || !userB || userA === userB) return false;
  const [aSet, bSet] = await Promise.all([loadBlockedSet(userA), loadBlockedSet(userB)]);
  return aSet.has(userB) || bSet.has(userA);
}

async function getBlockedList(userId) {
  const set = await loadBlockedSet(userId);
  return [...set];
}

// Block list rules (polish world-social-12): only real user ids, a sane cap, and the
// cache changes only after the database accepted the new list.
const BLOCK_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_BLOCKED = 1000;

async function saveBlockedList(userId, next) {
  try {
    const { error } = await supabase.from("users").update({ blocked_users: next }).eq("id", userId);
    return !error;
  } catch {
    return false;
  }
}

async function blockUser(userId, targetId) {
  if (!userId || !targetId || userId === targetId || !BLOCK_ID_RE.test(String(targetId))) {
    return { ok: false, error: "Invalid target." };
  }
  const { data: target } = await supabase.from("users").select("id").eq("id", targetId).maybeSingle();
  if (!target) return { ok: false, ...apiError("User not found."), status: 404 };
  const current = await loadBlockedSet(userId);
  if (!current.has(targetId) && current.size >= MAX_BLOCKED) {
    return { ok: false, ...apiError("Your block list is full.") };
  }
  const set = new Set(current);
  set.add(targetId);
  const next = [...set];
  if (!(await saveBlockedList(userId, next))) {
    return { ok: false, ...apiError("Could not update your block list."), status: 500 };
  }
  blockedSetCache.set(userId, set);

  // Blocking severs any existing friendship and pending requests immediately.
  friends.get(userId)?.delete(targetId);
  friends.get(targetId)?.delete(userId);
  try {
    require("../runtime/presenceFanoutInstance").refreshPresenceFor(userId, targetId);
  } catch {
    /* presence refresh is best-effort */
  }
  pendingRequests.get(userId)?.delete(targetId);
  pendingRequests.get(targetId)?.delete(userId);
  // Both ids go into a PostgREST or() filter on a DELETE: plain ids only (no PostgREST syntax) (security scan
  // 17 Nov 2026, P0: a crafted id matched every friendship row).
  const SAFE_ID = BLOCK_ID_RE;
  if (SAFE_ID.test(String(userId)) && SAFE_ID.test(String(targetId))) try {
    await supabase
      .from("friendships")
      .delete()
      .or(
        `and(user_id.eq.${userId},friend_id.eq.${targetId}),and(user_id.eq.${targetId},friend_id.eq.${userId})`
      );
  } catch {
    /* best-effort cleanup */
  }
  // Pending message requests go too, both ways: accepting one used to restore the
  // friendship the block had just removed (security audit 28 Nov 2026).
  try {
    const { deleteMessageRequest } = require("./messageRequestStore");
    await deleteMessageRequest(supabase, userId, targetId);
    await deleteMessageRequest(supabase, targetId, userId);
  } catch {
    /* best-effort cleanup; the accept paths also check the block */
  }

  return { ok: true, blockedUsers: next };
}

async function unblockUser(userId, targetId) {
  if (!userId || !targetId) return { ok: false, error: "Invalid target." };
  const set = new Set(await loadBlockedSet(userId));
  set.delete(targetId);
  const next = [...set];
  if (!(await saveBlockedList(userId, next))) {
    return { ok: false, ...apiError("Could not update your block list."), status: 500 };
  }
  blockedSetCache.set(userId, set);
  return { ok: true, blockedUsers: next };
}

module.exports = {
  isBlockedEitherWay,
  getBlockedList,
  blockUser,
  unblockUser,
  invalidate,
};
