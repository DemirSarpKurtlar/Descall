/**
 * notification_history (Descall+): missed notifications kept on this device.
 * Capped (newest first), clearable, nothing leaves the device.
 *
 * Entry: { id, at, category, title, body, from, data:{ type, conversationId,
 *          fromId, groupId, serverId, channelId, channelName, serverName,
 *          groupName }, read, reason }
 * Only routing ids and the visible preview are stored (no tokens, no avatars).
 */

export const HISTORY_KEY = "descall:premium:notificationHistory";
export const HISTORY_CAP = 200;
const BODY_MAX = 200;

const ROUTING_FIELDS = ["type", "conversationId", "fromId", "from", "groupId", "groupName", "serverId", "serverName", "channelId", "channelName", "dmConversationId", "feedbackId", "announcementId"];

function pickData(data = {}) {
  const out = {};
  for (const k of ROUTING_FIELDS) {
    const v = data?.[k];
    if (v == null) continue;
    if (typeof v === "string" || typeof v === "number") out[k] = String(v).slice(0, 120);
  }
  return out;
}

/**
 * Store over any Storage-like object ({ getItem, setItem, removeItem }).
 * createHistoryStore({ storage, cap, now }) -> { list, add, markRead, markAllRead, remove, clear, unreadCount, subscribe }
 */
export function createHistoryStore({ storage = null, cap = HISTORY_CAP, now = () => Date.now(), key = HISTORY_KEY } = {}) {
  let items = null;
  const listeners = new Set();

  function load() {
    if (items) return items;
    items = [];
    try {
      const raw = storage?.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) items = parsed.filter((x) => x && typeof x.id === "string").slice(0, cap);
    } catch {
      items = [];
    }
    return items;
  }

  function save() {
    try { storage?.setItem(key, JSON.stringify(items)); } catch { /* quota: keep in memory */ }
    for (const fn of [...listeners]) {
      try { fn(items.slice()); } catch { /* ignore */ }
    }
  }

  let seq = 0;
  function add(entry = {}) {
    load();
    const at = Number(entry.at) || now();
    seq = (seq + 1) % 1e6;
    const item = {
      id: `${at.toString(36)}-${seq.toString(36)}`,
      at,
      category: String(entry.category || "system").slice(0, 16),
      title: String(entry.title || "").slice(0, 120),
      body: String(entry.body || "").slice(0, BODY_MAX),
      from: String(entry.from || entry.data?.from || "").slice(0, 80),
      data: pickData(entry.data),
      read: false,
      reason: String(entry.reason || "").slice(0, 32),
    };
    // Collapse a burst from the same chat: replace the newest unread entry of the same tag.
    const tag = entry.tag ? String(entry.tag).slice(0, 120) : "";
    if (tag) {
      item.tag = tag;
      const idx = items.findIndex((x) => x.tag === tag && !x.read);
      if (idx === 0) {
        item.count = (items[0].count || 1) + 1;
        items.splice(0, 1);
      }
    }
    items.unshift(item);
    if (items.length > cap) items.length = cap;
    save();
    return item;
  }

  function list() {
    return load().slice();
  }

  function markRead(id) {
    load();
    let changed = false;
    for (const it of items) if (it.id === id && !it.read) { it.read = true; changed = true; }
    if (changed) save();
  }

  function markAllRead() {
    load();
    let changed = false;
    for (const it of items) if (!it.read) { it.read = true; changed = true; }
    if (changed) save();
  }

  function remove(id) {
    load();
    const before = items.length;
    items = items.filter((x) => x.id !== id);
    if (items.length !== before) save();
  }

  function clear() {
    items = [];
    try { storage?.removeItem(key); } catch { /* ignore */ }
    save();
  }

  function unreadCount() {
    return load().filter((x) => !x.read).length;
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  return { list, add, markRead, markAllRead, remove, clear, unreadCount, subscribe };
}

function browserStorage() {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

let shared = null;
export function notificationHistory() {
  if (!shared) shared = createHistoryStore({ storage: browserStorage() });
  return shared;
}
