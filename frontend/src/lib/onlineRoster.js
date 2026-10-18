/** Visible presence. Invisible users are omitted from the roster entirely. */
export function isRosterOnlineStatus(status) {
  const st = status || "online";
  return st === "online" || st === "idle" || st === "dnd";
}

/**
 * Friends who entered the online roster since the previous snapshot.
 *
 * The first `users:update` after connect is everyone already online. That
 * snapshot only establishes a baseline, it must not toast or notify.
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

/**
 * Merge a scoped `presence:delta { up: [user], rm: [id] }` into the roster.
 * `normalize` maps raw server rows like the `users:update` handler does.
 * Returns the previous array when nothing changed.
 */
export function applyPresenceDelta(previous, delta, normalize = (u) => u) {
  const list = Array.isArray(previous) ? previous : [];
  const up = Array.isArray(delta?.up) ? delta.up.filter((u) => u && u.id) : [];
  const rm = new Set(Array.isArray(delta?.rm) ? delta.rm.map(String) : []);
  if (!up.length && !rm.size) return list;
  const byId = new Map();
  for (const u of up) byId.set(String(u.id), normalize(u));
  let changed = false;
  const out = [];
  for (const u of list) {
    const id = String(u?.id ?? "");
    if (rm.has(id) && !byId.has(id)) {
      changed = true;
      continue;
    }
    if (byId.has(id)) {
      out.push(byId.get(id));
      byId.delete(id);
      changed = true;
      continue;
    }
    out.push(u);
  }
  for (const u of byId.values()) {
    out.push(u);
    changed = true;
  }
  return changed ? out : list;
}
