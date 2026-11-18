"use strict";

/**
 * DM unread counts survive a restart (polish messaging-09). The live counts live in
 * memory (runtime/sharedState dmUnreadByUser); after a deploy that map is empty
 * while dm_messages.read_at is still null, and the client replaced its own badges
 * with the empty map. The first sync after a start fills the map from the database:
 * unread rows sent to me, per sender, friends only, capped at 99. A live count that
 * is already higher (messages since the start) wins.
 */

const MAX_COUNT = 99;
const ROW_LIMIT = 5000;
const hydrated = new Set();

function countBySender(rows, allow) {
  const out = new Map();
  for (const r of rows || []) {
    const from = r?.from_user_id ? String(r.from_user_id) : "";
    if (!from || (allow && !allow.has(from))) continue;
    out.set(from, Math.min(MAX_COUNT, (out.get(from) || 0) + 1));
  }
  return out;
}

async function hydrateDmUnread({ db, userId, unreadMap, friendIds = null }) {
  if (!db || !userId || !unreadMap || hydrated.has(userId)) return false;
  hydrated.add(userId);
  try {
    const { data, error } = await db
      .from("dm_messages")
      .select("from_user_id")
      .eq("to_user_id", userId)
      .is("read_at", null)
      .limit(ROW_LIMIT);
    if (error) throw error;
    const allow = friendIds ? new Set([...friendIds].map(String)) : null;
    for (const [from, n] of countBySender(data, allow)) {
      if ((unreadMap.get(from) || 0) < n) unreadMap.set(from, n);
    }
    return true;
  } catch (err) {
    hydrated.delete(userId); // try again on the next sync
    console.warn("[dmUnread] hydrate failed:", err?.message || err);
    return false;
  }
}

function resetForTests() { hydrated.clear(); }

module.exports = { hydrateDmUnread, countBySender, resetForTests, MAX_COUNT };
