// Local copy of per-DM prefs (pin / mute / hide / mark-unread) so the chat
// list paints with pinned chats already on top, before /api/dm/prefs answers.
// Keyed per user; synchronous localStorage so it is ready on the first render.

const PREFIX = "descall:dmPrefs:v1:";

function storage(store) {
  if (store) return store;
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/** Only the fields that affect list order/visibility are persisted. */
function slim(map) {
  const out = {};
  for (const [peerId, p] of Object.entries(map || {})) {
    if (!peerId || !p) continue;
    if (!p.pinned && !p.muted && !p.hidden && !p.markedUnread) continue;
    out[peerId] = {
      peerId,
      pinned: Boolean(p.pinned),
      muted: Boolean(p.muted),
      hidden: Boolean(p.hidden),
      markedUnread: Boolean(p.markedUnread),
      pinnedAt: p.pinnedAt || null,
    };
  }
  return out;
}

export function readCachedDmPrefs(userId, store) {
  const s = storage(store);
  if (!s || !userId) return {};
  try {
    const raw = s.getItem(PREFIX + String(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== 1 || typeof parsed.prefs !== "object") return {};
    return slim(parsed.prefs);
  } catch {
    return {};
  }
}

export function writeCachedDmPrefs(userId, map, store) {
  const s = storage(store);
  if (!s || !userId) return;
  try {
    s.setItem(PREFIX + String(userId), JSON.stringify({ v: 1, prefs: slim(map) }));
  } catch {
    /* quota / private mode */
  }
}

/** True when two pref maps produce the same list (same pins, order, hidden, unread, mute). */
export function sameDmListPrefs(a, b) {
  const sa = slim(a);
  const sb = slim(b);
  const ka = Object.keys(sa).sort();
  const kb = Object.keys(sb).sort();
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return false;
    const x = sa[ka[i]];
    const y = sb[kb[i]];
    if (x.pinned !== y.pinned || x.muted !== y.muted || x.hidden !== y.hidden || x.markedUnread !== y.markedUnread) return false;
    if (x.pinned && (Date.parse(x.pinnedAt || "") || 0) !== (Date.parse(y.pinnedAt || "") || 0)) return false;
  }
  return true;
}

/** Server answer → next state; keeps the current object when nothing visible changed (no re-sort). */
export function reconcileDmPrefs(current, server) {
  return sameDmListPrefs(current, server) ? current : server;
}
