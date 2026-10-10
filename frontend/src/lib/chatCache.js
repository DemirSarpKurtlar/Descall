/**
 * Persistent chat snapshot (IndexedDB) plus the pure merge rules for
 * stale-while-revalidate. Display masking stays in the renderer — stored
 * text is the same string the server sent.
 */

const DB_NAME = "descall-chat-v1";
const STORE = "kv";
const MAX_PER_CONV = 60;
const MAX_CONVS = 12;
const memory = new Map();
const persistTimers = new Map();

function messageTime(message) {
  const raw = message?.timestamp || message?.created_at || message?.createdAt || 0;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : 0;
}

function sortMessages(messages) {
  return [...messages].sort((a, b) => messageTime(a) - messageTime(b));
}

function isOptimistic(message) {
  if (!message) return false;
  if (message.sending || message.failed || message.isGameMessage) return true;
  const id = String(message.id || "");
  return id.startsWith("temp-") || id.startsWith("casino-") || id.startsWith("active-call");
}

/**
 * Merge a server page into messages already on screen.
 * incremental: only upsert (new messages and edits). A full page also drops
 * rows inside that page's time window that the server no longer returns,
 * while keeping older history and optimistic rows.
 */
export function reconcileHistoryWindow(existing, incoming, { incremental = false } = {}) {
  const prev = Array.isArray(existing) ? existing : [];
  const next = (Array.isArray(incoming) ? incoming : []).filter((message) => message && message.id);
  const nextById = new Map(next.map((message) => [message.id, message]));

  if (incremental || next.length === 0 && incremental) {
    const byId = new Map(prev.filter((message) => message?.id).map((message) => [message.id, message]));
    for (const message of next) {
      const prior = byId.get(message.id);
      byId.set(message.id, prior ? { ...prior, ...message, sending: prior.sending, failed: prior.failed } : message);
    }
    return sortMessages([...byId.values()]);
  }

  if (next.length === 0) {
    return sortMessages(prev.filter((message) => isOptimistic(message)));
  }

  const oldest = next.reduce((min, message) => Math.min(min, messageTime(message)), Infinity);
  const byId = new Map();
  for (const message of prev) {
    if (!message?.id) continue;
    if (isOptimistic(message)) {
      byId.set(message.id, message);
      continue;
    }
    if (messageTime(message) < oldest && !nextById.has(message.id)) {
      byId.set(message.id, message);
    }
  }
  for (const message of next) {
    const prior = byId.get(message.id);
    if (prior?.sending || prior?.failed) {
      byId.set(message.id, { ...message, ...prior });
    } else if (prior) {
      const reactions = message.reactions?.length ? message.reactions : prior.reactions;
      byId.set(message.id, { ...prior, ...message, reactions: reactions || [] });
    } else {
      byId.set(message.id, message);
    }
  }
  return sortMessages([...byId.values()]).slice(-MAX_PER_CONV * 2);
}

export function newestCursor(messages) {
  let cursor = null;
  let time = 0;
  for (const message of messages || []) {
    if (isOptimistic(message)) continue;
    const at = messageTime(message);
    if (at >= time) {
      time = at;
      cursor = message.timestamp || message.created_at || null;
    }
  }
  return cursor;
}

function trimConversationMap(map, activity = {}) {
  const entries = Object.entries(map || {}).filter(([, messages]) => Array.isArray(messages) && messages.length);
  entries.sort((a, b) => {
    const tb = new Date(activity[b[0]] || newestCursor(b[1]) || 0).getTime() || 0;
    const ta = new Date(activity[a[0]] || newestCursor(a[1]) || 0).getTime() || 0;
    return tb - ta;
  });
  const out = {};
  for (const [id, messages] of entries.slice(0, MAX_CONVS)) {
    out[id] = sortMessages(messages).slice(-MAX_PER_CONV).map(slimMessage);
  }
  return out;
}

function slimMessage(message) {
  if (!message || typeof message !== "object") return message;
  const mediaUrl = typeof message.mediaUrl === "string" && message.mediaUrl.length > 100000
    ? null
    : message.mediaUrl;
  const media_url = typeof message.media_url === "string" && message.media_url.length > 100000
    ? null
    : message.media_url;
  return { ...message, mediaUrl, media_url };
}

export function buildChatSnapshot(userId, state) {
  if (!userId || !state) return null;
  const dmActivity = state.dmLastActivity || {};
  const groupActivity = state.groupLastActivity || {};
  return {
    v: 1,
    userId: String(userId),
    savedAt: Date.now(),
    servers: Array.isArray(state.servers) ? state.servers : [],
    ownedCount: state.ownedCount || 0,
    maxOwned: state.maxOwned || 10,
    groups: Array.isArray(state.groups) ? state.groups : [],
    friends: Array.isArray(state.friends) ? state.friends : [],
    friendRequests: Array.isArray(state.friendRequests) ? state.friendRequests : [],
    dmPreviews: state.dmPreviews || {},
    dmLastActivity: dmActivity,
    groupPreviews: state.groupPreviews || {},
    groupLastActivity: groupActivity,
    dmUnread: state.dmUnread || {},
    groupUnread: state.groupUnread || {},
    channelUnread: state.channelUnread || {},
    messages: {
      dm: trimConversationMap(state.dmByUserId, dmActivity),
      group: trimConversationMap(state.groupMessagesById, groupActivity),
      channel: trimConversationMap(state.channelMessagesById, {}),
    },
  };
}

export function peekChatCache(userId) {
  if (!userId) return null;
  return memory.get(String(userId)) || null;
}

function openDb() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function idbGet(db, key) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function idbSet(db, key, value) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function hydrateChatCache(userId) {
  if (!userId) return null;
  const key = String(userId);
  const cached = memory.get(key);
  if (cached) return cached;
  const db = await openDb();
  if (!db) return null;
  const snap = await idbGet(db, key);
  try { db.close(); } catch { /* ignore */ }
  if (!snap || snap.userId !== key || snap.v !== 1) return null;
  memory.set(key, snap);
  return snap;
}

export function rememberChatCache(userId, snapshot) {
  if (!userId || !snapshot) return;
  memory.set(String(userId), snapshot);
}

export function schedulePersistChatCache(userId, state, delayMs = 250) {
  if (!userId) return;
  const key = String(userId);
  const prev = persistTimers.get(key);
  if (prev) clearTimeout(prev);
  const timer = setTimeout(() => {
    persistTimers.delete(key);
    const snapshot = buildChatSnapshot(key, state);
    if (!snapshot) return;
    memory.set(key, snapshot);
    openDb().then((db) => {
      if (!db) return;
      idbSet(db, key, snapshot).finally(() => {
        try { db.close(); } catch { /* ignore */ }
      });
    });
  }, delayMs);
  persistTimers.set(key, timer);
}

/** Test hook — drop the in-memory mirror between cases. */
export function resetChatCacheMemory() {
  memory.clear();
  for (const timer of persistTimers.values()) clearTimeout(timer);
  persistTimers.clear();
}

export const CHAT_CACHE_LIMITS = { MAX_PER_CONV, MAX_CONVS };
