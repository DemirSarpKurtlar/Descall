/**
 * Discord-style list order for chats, groups and friends:
 * pinned first (newest pin first), then most recent activity, newest first.
 *
 * "Activity" is the latest of: last message, when the friendship started,
 * when the group was created, when I joined it. So a brand-new friend or
 * group goes to the top, just below the pinned rows.
 */

const TZ_RE = /(Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Milliseconds for an ISO string, Date or number; 0 when unknown.
 * Postgres `timestamp` (no zone) comes back without an offset and is UTC;
 * Date.parse would read it as local time, so treat it as UTC.
 */
export function toMs(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v instanceof Date) return v.getTime() || 0;
  let s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s) && !TZ_RE.test(s)) s = `${s.replace(" ", "T")}Z`;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}

/** Latest known activity time of a chat, group or friend row. */
export function recencyMs(item) {
  if (!item) return 0;
  return Math.max(
    toMs(item.lastActivity),
    toMs(item.friendsSince),
    toMs(item.joinedAt ?? item.joined_at),
    toMs(item.createdAt ?? item.created_at),
  );
}

const label = (x) => String(x?.displayName || x?.name || x?.username || "");

/**
 * Comparator. `pinnedAt(item)` returns the pin time (or null) for pinned
 * rows; `item.pinned` marks them.
 */
export function compareListItems(a, b, pinnedAt = (x) => x?.pinnedAt) {
  const pa = a?.pinned ? 1 : 0;
  const pb = b?.pinned ? 1 : 0;
  if (pb !== pa) return pb - pa;
  if (pa && pb) {
    const d = toMs(pinnedAt(b)) - toMs(pinnedAt(a));
    if (d) return d;
  }
  const d = recencyMs(b) - recencyMs(a);
  if (d) return d;
  const u = (b?.unreadCount || 0) - (a?.unreadCount || 0);
  if (u) return u;
  return label(a).localeCompare(label(b));
}

export function sortListItems(list, pinnedAt) {
  return [...(Array.isArray(list) ? list : [])].sort((a, b) => compareListItems(a, b, pinnedAt));
}

/** Friends tab: same order as the chats (pins from DM prefs, then recency). */
export function orderFriends(friends, prefsByPeer = {}, lastActivityById = {}) {
  const rows = (Array.isArray(friends) ? friends : []).map((f) => {
    const pref = f?.id != null ? prefsByPeer?.[f.id] : null;
    return {
      f,
      key: {
        ...f,
        pinned: Boolean(pref?.pinned),
        pinnedAt: pref?.pinnedAt || null,
        lastActivity: lastActivityById?.[f?.id] || f?.lastActivity || null,
      },
    };
  });
  rows.sort((a, b) => compareListItems(a.key, b.key));
  return rows.map((r) => r.f);
}

/** Friend / message requests: newest first. */
export function newestRequestsFirst(list) {
  return [...(Array.isArray(list) ? list : [])].sort((a, b) => {
    const d = toMs(b?.requestedAt ?? b?.createdAt ?? b?.created_at) - toMs(a?.requestedAt ?? a?.createdAt ?? a?.created_at);
    return d || label(a).localeCompare(label(b));
  });
}

/**
 * A row that just arrived live (request, invite, new group) without a
 * server time: stamp it "now" so it sorts to the top instead of the bottom.
 */
export function stampArrival(item, field, now = Date.now()) {
  if (!item || item[field]) return item;
  return { ...item, [field]: new Date(now).toISOString() };
}
