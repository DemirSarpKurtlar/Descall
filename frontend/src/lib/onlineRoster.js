/** Visible presence. Invisible users are omitted from the roster entirely. */
export function isRosterOnlineStatus(status) {
  const st = status || "online";
  return st === "online" || st === "idle" || st === "dnd";
}

/**
 * Friends who entered the online roster since the previous snapshot.
 *
 * The first `users:update` after connect is everyone already online. That
 * snapshot only establishes a baseline — it must not toast or notify.
 */
export function friendsWhoJustCameOnline({
  previous,
  next,
  friendIds,
  myId,
  hasBaseline,
}) {
  const nextUsers = Array.isArray(next) ? next : [];
  if (!hasBaseline) {
    return { newcomers: [], hasBaseline: true };
  }
  const prevIds = new Set((previous || []).map((u) => u?.id).filter(Boolean));
  const friends = friendIds instanceof Set ? friendIds : new Set(friendIds || []);
  const newcomers = nextUsers.filter((u) => {
    if (!u?.id || prevIds.has(u.id) || !friends.has(u.id) || u.id === myId) return false;
    return isRosterOnlineStatus(u.status);
  });
  return { newcomers, hasBaseline: true };
}
