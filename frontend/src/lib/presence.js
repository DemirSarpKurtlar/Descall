// id -> first entry, per onlineUsers array. Every row of the chat and friends
// lists asks for its peer's presence (300 friends x 3 lookups per render was
// ~900 linear scans of a 300-entry list, about 3 ms unthrottled and ~12 ms at
// 4x CPU on each list render). The state is replaced, never mutated in place
// (App.jsx setOnlineUsers / patchUserInList), so the array identity is the
// cache key and a new list gets a new index. Short lists keep the plain scan.
const INDEX_MIN = 16;
const indexByList = new WeakMap();

function findOnline(onlineUsers, userId) {
  if (onlineUsers.length < INDEX_MIN) return onlineUsers.find((u) => u && u.id === userId);
  let index = indexByList.get(onlineUsers);
  if (!index) {
    index = new Map();
    for (const u of onlineUsers) if (u && !index.has(u.id)) index.set(u.id, u);
    indexByList.set(onlineUsers, index);
  }
  return index.get(userId);
}

/** Resolve Discord-style presence for a user id from the onlineUsers list. */
export function getPresenceStatus(onlineUsers, userId) {
  if (!userId || !Array.isArray(onlineUsers)) return "offline";
  const hit = findOnline(onlineUsers, userId);
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
