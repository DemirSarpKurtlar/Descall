// id -> first roster entry, built once per roster array. Lists call this per row
// (300 DMs x 300 online users was a linear scan per row on every App render).
// The roster is replaced, never mutated, on change; the length check also
// catches an in-place push.
const rosterIndex = new WeakMap();

/** First entry of `onlineUsers` whose id === userId (same result as Array#find). */
export function findOnlineUser(onlineUsers, userId) {
  if (userId == null || !Array.isArray(onlineUsers)) return undefined;
  let entry = rosterIndex.get(onlineUsers);
  if (!entry || entry.length !== onlineUsers.length) {
    const byId = new Map();
    for (const u of onlineUsers) {
      if (u && !byId.has(u.id)) byId.set(u.id, u);
    }
    entry = { length: onlineUsers.length, byId };
    rosterIndex.set(onlineUsers, entry);
  }
  return entry.byId.get(userId);
}

/** Resolve Discord-style presence for a user id from the onlineUsers list. */
export function getPresenceStatus(onlineUsers, userId) {
  if (!userId || !Array.isArray(onlineUsers)) return "offline";
  const hit = findOnlineUser(onlineUsers, userId);
  if (!hit) return "offline";
  const status = hit.status || "online";
  // Invisible users appear offline to everyone else
  if (status === "invisible") return "offline";
  // Remapped invisible→offline still means not visibly online
  if (status === "offline") return "offline";
  return status;
}

/** True only for statuses others should see as "here" (online / idle / dnd). */
export function isVisiblyOnline(onlineUsers, userId) {
  const status = getPresenceStatus(onlineUsers, userId);
  return status === "online" || status === "idle" || status === "dnd";
}

export const STATUS_META = {
  online: { label: "Online", color: "var(--success)" },
  idle: { label: "Idle", color: "var(--status-idle, #FF9F0A)" },
  dnd: { label: "Do Not Disturb", color: "var(--danger)" },
  invisible: { label: "Invisible", color: "var(--text-muted)" },
  offline: { label: "Offline", color: "var(--text-muted)" },
};
