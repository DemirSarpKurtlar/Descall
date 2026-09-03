const STORAGE_KEY = "descall:dima-thread-cache:v1";
const MAX_THREADS = 6;
const MAX_BYTES = 1_200_000;

const memory = new Map();

function cacheKey(userId, convId) {
  return `${userId}:${convId}`;
}

function convIdFromKey(userId, key) {
  const prefix = `${userId}:`;
  return key.startsWith(prefix) ? key.slice(prefix.length) : "";
}

function hydrateFromSession(userId) {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (userId && parsed.userId && String(parsed.userId) !== String(userId)) return;
    const uid = parsed.userId || userId;
    if (!uid) return;
    for (const [id, pack] of Object.entries(parsed.threads || {})) {
      if (!pack?.messages?.length) continue;
      const k = cacheKey(uid, id);
      if (!memory.has(k)) memory.set(k, pack);
    }
  } catch {
    /* ignore quota / private mode */
  }
}

function persistSession(userId) {
  if (!userId) return;
  try {
    const rows = [];
    for (const [k, pack] of memory) {
      const id = convIdFromKey(userId, k);
      if (!id || !pack?.messages?.length) continue;
      rows.push([id, pack]);
    }
    rows.sort((a, b) => (b[1].savedAt || 0) - (a[1].savedAt || 0));
    const threads = {};
    for (const [id, pack] of rows.slice(0, MAX_THREADS)) threads[id] = pack;
    const payload = JSON.stringify({ userId, threads });
    if (payload.length > MAX_BYTES) return;
    sessionStorage.setItem(STORAGE_KEY, payload);
  } catch {
    /* ignore quota / private mode */
  }
}

export function readThreadCache(userId, convId) {
  if (!userId || !convId) return null;
  const hit = memory.get(cacheKey(userId, convId));
  if (hit?.messages?.length) return hit;
  hydrateFromSession(userId);
  const next = memory.get(cacheKey(userId, convId));
  return next?.messages?.length ? next : null;
}

export function peekThreadCache(convId) {
  if (!convId) return null;
  for (const pack of memory.values()) {
    if (pack?.conversation?.id === convId && pack?.messages?.length) return pack;
  }
  hydrateFromSession(null);
  const suffix = `:${convId}`;
  for (const [k, pack] of memory) {
    if (k.endsWith(suffix) && pack?.messages?.length) return pack;
  }
  return null;
}

export function writeThreadCache(userId, convId, pack) {
  if (!userId || !convId || !pack?.messages?.length) return;
  memory.set(cacheKey(userId, convId), {
    messages: pack.messages,
    conversation: pack.conversation || null,
    savedAt: Date.now(),
  });
  persistSession(userId);
}

export function dropThreadCache(userId, convId) {
  if (!userId || !convId) return;
  memory.delete(cacheKey(userId, convId));
  persistSession(userId);
}

export function clearThreadCache() {
  memory.clear();
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
