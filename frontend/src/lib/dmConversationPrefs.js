/** Sort/filter DM list rows from per-peer pin/mute/hide/unread prefs. */

export function emptyDmPref(peerId) {
  return {
    peerId: peerId || null,
    pinned: false,
    muted: false,
    hidden: false,
    markedUnread: false,
    pinnedAt: null,
  };
}

export function prefsMapFromList(list) {
  const map = {};
  for (const item of Array.isArray(list) ? list : []) {
    if (!item?.peerId) continue;
    map[item.peerId] = {
      ...emptyDmPref(item.peerId),
      ...item,
      pinned: Boolean(item.pinned),
      muted: Boolean(item.muted),
      hidden: Boolean(item.hidden),
      markedUnread: Boolean(item.markedUnread),
    };
  }
  return map;
}

export function applyLocalPrefPatch(current, patch = {}) {
  const peerId = patch.peerId || current?.peerId || null;
  const next = {
    ...emptyDmPref(peerId),
    ...current,
    ...patch,
    peerId,
  };
  if (patch.hidden === true) {
    next.pinned = false;
    next.pinnedAt = null;
  }
  if (patch.pinned === true) next.hidden = false;
  if (next.hidden) {
    next.pinned = false;
    next.pinnedAt = null;
  }
  if (next.pinned) next.hidden = false;
  if (patch.pinned === true && !next.pinnedAt) next.pinnedAt = new Date().toISOString();
  if (patch.pinned === false) next.pinnedAt = null;
  return next;
}

export function mergePrefIntoMap(map, pref) {
  if (!pref?.peerId) return map || {};
  return {
    ...(map || {}),
    [pref.peerId]: {
      ...emptyDmPref(pref.peerId),
      ...(map || {})[pref.peerId],
      ...pref,
      pinned: Boolean(pref.pinned),
      muted: Boolean(pref.muted),
      hidden: Boolean(pref.hidden),
      markedUnread: Boolean(pref.markedUnread),
    },
  };
}

/**
 * Hide closed chats, overlay mark-unread, pin to top (newest pin first),
 * then last activity.
 */
export function applyDmListPrefs(dms, prefsByPeer = {}) {
  const list = Array.isArray(dms) ? dms : [];
  return list
    .filter((dm) => dm?.id && !prefsByPeer[dm.id]?.hidden)
    .map((dm) => {
      const pref = prefsByPeer[dm.id];
      const unread = dm.unreadCount || 0;
      return {
        ...dm,
        pinned: Boolean(pref?.pinned),
        muted: Boolean(pref?.muted),
        unreadCount: unread > 0 ? unread : pref?.markedUnread ? 1 : 0,
      };
    })
    .sort((a, b) => {
      const pa = a.pinned ? 1 : 0;
      const pb = b.pinned ? 1 : 0;
      if (pb !== pa) return pb - pa;
      if (pa && pb) {
        const ta = Date.parse(prefsByPeer[a.id]?.pinnedAt || "") || 0;
        const tb = Date.parse(prefsByPeer[b.id]?.pinnedAt || "") || 0;
        if (tb !== ta) return tb - ta;
      }
      const ta = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
      const tb = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
      if (tb !== ta) return tb - ta;
      if ((b.unreadCount || 0) !== (a.unreadCount || 0)) return (b.unreadCount || 0) - (a.unreadCount || 0);
      return String(a.username || "").localeCompare(String(b.username || ""));
    });
}
