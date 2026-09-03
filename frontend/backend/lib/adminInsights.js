"use strict";

const { toUtcIso } = require("./datetime");

const WINDOWS = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  all: 0,
};

function convKey(a, b) {
  return [String(a || ""), String(b || "")].filter(Boolean).sort().join("::");
}

function parseConvKey(key) {
  const parts = String(key || "").split("::").filter(Boolean);
  if (parts.length !== 2 || parts[0] === parts[1]) return null;
  return { a: parts[0], b: parts[1] };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseUuidConvKey(key) {
  const parsed = parseConvKey(key);
  if (!parsed) return null;
  if (!UUID_RE.test(parsed.a) || !UUID_RE.test(parsed.b)) return null;
  return parsed;
}

function msOf(value) {
  const iso = toUtcIso(value);
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function maxMs(...values) {
  let best = 0;
  for (const v of values) {
    const n = typeof v === "number" ? v : msOf(v);
    if (n > best) best = n;
  }
  return best;
}

function inWindow(ts, nowMs, windowMs) {
  if (!windowMs) return true;
  const t = msOf(ts);
  return t > 0 && nowMs - t <= windowMs;
}

function previewFromDmRow(row) {
  if (!row) return "";
  const raw = String(row.content || row.text || "").trim();
  if (raw && !raw.startsWith("__voice__:")) {
    return raw.length > 160 ? `${raw.slice(0, 157)}…` : raw;
  }
  const media = String(row.media_type || row.mediaType || "").toLowerCase();
  if (media === "image") return "📷 Photo";
  if (media === "voice" || media === "audio" || raw.startsWith("__voice__:")) return "🎤 Voice message";
  if (row.media_url || row.mediaUrl) return "📎 Attachment";
  return "";
}

function emptyStat(userId) {
  return {
    userId,
    dmCount: 0,
    groupCount: 0,
    serverCount: 0,
    messageCount: 0,
    lastMessageAt: null,
    lastMessageMs: 0,
  };
}

function bump(stat, kind, at) {
  const ms = msOf(at);
  if (kind === "dm") stat.dmCount += 1;
  else if (kind === "group") stat.groupCount += 1;
  else if (kind === "server") stat.serverCount += 1;
  stat.messageCount += 1;
  if (ms >= stat.lastMessageMs) {
    stat.lastMessageMs = ms;
    stat.lastMessageAt = toUtcIso(at);
  }
}

function accumulateSends(stats, userId, kind, at, nowMs, windowMs) {
  if (!userId) return;
  if (!inWindow(at, nowMs, windowMs)) return;
  const id = String(userId);
  const stat = stats.get(id) || emptyStat(id);
  bump(stat, kind, at);
  stats.set(id, stat);
}

function buildUserStats({ dmRows = [], serverRows = [], groupRows = [], nowMs, windowMs }) {
  const stats = new Map();
  for (const row of dmRows) {
    accumulateSends(stats, row.from_user_id, "dm", row.created_at, nowMs, windowMs);
  }
  for (const row of serverRows) {
    accumulateSends(stats, row.sender_id, "server", row.created_at, nowMs, windowMs);
  }
  for (const row of groupRows) {
    accumulateSends(stats, row.sender_id, "group", row.created_at, nowMs, windowMs);
  }
  return stats;
}

function rankUsers({
  stats,
  users = [],
  presenceIds = [],
  lastSeenById = {},
  nowMs,
  windowMs = 0,
  sort = "messages",
  limit = 50,
}) {
  const online = new Set((presenceIds || []).map(String));
  const byId = new Map((users || []).map((u) => [String(u.id), u]));
  const ids = new Set([...stats.keys(), ...byId.keys()]);

  const rows = [];
  for (const id of ids) {
    const stat = stats.get(id) || emptyStat(id);
    const user = byId.get(id) || { id };
    const lastSeen = lastSeenById[id] || user.last_seen || null;
    const lastSeenMs = msOf(lastSeen);
    const isOnline = online.has(id);
    const lastActiveMs = maxMs(stat.lastMessageMs, lastSeenMs);
    if (sort === "messages" && stat.messageCount <= 0) continue;
    if (sort === "activity" && !isOnline && lastActiveMs <= 0) continue;
    if (
      sort === "activity" &&
      windowMs &&
      !isOnline &&
      lastActiveMs > 0 &&
      nowMs - lastActiveMs > windowMs &&
      stat.messageCount <= 0
    ) {
      continue;
    }
    rows.push({
      id,
      username: user.username || id.slice(0, 8),
      displayName: user.display_name || user.displayName || user.username || id.slice(0, 8),
      avatar_url: user.avatar_url || null,
      is_admin: Boolean(user.is_admin),
      isOnline,
      dmCount: stat.dmCount,
      groupCount: stat.groupCount,
      serverCount: stat.serverCount,
      messageCount: stat.messageCount,
      lastMessageAt: stat.lastMessageAt,
      lastSeen: lastSeen ? toUtcIso(lastSeen) : null,
      lastActiveAt: lastActiveMs ? new Date(lastActiveMs).toISOString() : isOnline ? new Date(nowMs).toISOString() : null,
      lastActiveMs,
    });
  }

  rows.sort((a, b) => {
    if (sort === "activity") {
      if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
      if (b.lastActiveMs !== a.lastActiveMs) return b.lastActiveMs - a.lastActiveMs;
      return b.messageCount - a.messageCount;
    }
    if (b.messageCount !== a.messageCount) return b.messageCount - a.messageCount;
    return b.lastActiveMs - a.lastActiveMs;
  });

  return rows.slice(0, Math.min(100, Math.max(1, Number(limit) || 50))).map((row, index) => ({
    ...row,
    rank: index + 1,
  }));
}

function summarizeLeaderboard(ranked, { stats, dmRows = [], nowMs, windowMs, presenceCount = 0 }) {
  let messagesInWindow = 0;
  let sendersInWindow = 0;
  if (stats && typeof stats.values === "function") {
    for (const stat of stats.values()) {
      messagesInWindow += stat.messageCount || 0;
      if ((stat.messageCount || 0) > 0) sendersInWindow += 1;
    }
  } else {
    for (const row of ranked || []) messagesInWindow += row.messageCount || 0;
    sendersInWindow = (ranked || []).filter((r) => r.messageCount > 0).length;
  }
  const threads = new Set();
  for (const row of dmRows) {
    if (!inWindow(row.created_at, nowMs, windowMs)) continue;
    threads.add(convKey(row.from_user_id, row.to_user_id));
  }
  return {
    messagesInWindow,
    sendersInWindow,
    onlineNow: presenceCount,
    dmThreads: threads.size,
  };
}

function buildConversations({ dmRows = [], users = [], presenceIds = [], nowMs }) {
  const byId = new Map((users || []).map((u) => [String(u.id), u]));
  const online = new Set((presenceIds || []).map(String));
  const threads = new Map();

  for (const row of dmRows) {
    const key = convKey(row.from_user_id, row.to_user_id);
    if (!key.includes("::")) continue;
    const parsed = parseConvKey(key);
    if (!parsed) continue;
    const ms = msOf(row.created_at);
    const current = threads.get(key) || {
      key,
      userIds: [parsed.a, parsed.b],
      messageCount: 0,
      lastAtMs: 0,
      last: null,
    };
    current.messageCount += 1;
    if (ms >= current.lastAtMs) {
      current.lastAtMs = ms;
      current.last = {
        id: row.id,
        fromUserId: row.from_user_id,
        toUserId: row.to_user_id,
        preview: previewFromDmRow(row),
        createdAt: toUtcIso(row.created_at),
      };
    }
    threads.set(key, current);
  }

  const publicUser = (id) => {
    const u = byId.get(String(id));
    return {
      id,
      username: u?.username || String(id).slice(0, 8),
      displayName: u?.display_name || u?.displayName || u?.username || String(id).slice(0, 8),
      avatar_url: u?.avatar_url || null,
      isOnline: online.has(String(id)),
      is_admin: Boolean(u?.is_admin),
    };
  };

  return [...threads.values()]
    .sort((a, b) => b.lastAtMs - a.lastAtMs)
    .map((thread) => ({
      key: thread.key,
      messageCount: thread.messageCount,
      lastAt: thread.last?.createdAt || null,
      last: thread.last,
      users: thread.userIds.map(publicUser),
    }));
}

function mapAdminDmMessage(row, usersById = new Map()) {
  const from = usersById.get(String(row.from_user_id));
  const to = usersById.get(String(row.to_user_id));
  const preview = previewFromDmRow(row);
  const raw = String(row.content || row.text || "").trim();
  const isVoice = raw.startsWith("__voice__:") || String(row.media_type || "").toLowerCase() === "voice";
  return {
    id: row.id,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    fromUsername: from?.username || String(row.from_user_id).slice(0, 8),
    fromDisplayName: from?.display_name || from?.displayName || from?.username || String(row.from_user_id).slice(0, 8),
    toUsername: to?.username || String(row.to_user_id).slice(0, 8),
    text: isVoice ? preview : raw,
    preview,
    mediaUrl: row.media_url || null,
    mediaType: row.media_type || null,
    timestamp: toUtcIso(row.created_at),
    editedAt: row.edited_at ? toUtcIso(row.edited_at) : null,
    readAt: row.read_at ? toUtcIso(row.read_at) : null,
  };
}

module.exports = {
  WINDOWS,
  convKey,
  parseConvKey,
  parseUuidConvKey,
  msOf,
  inWindow,
  previewFromDmRow,
  emptyStat,
  accumulateSends,
  buildUserStats,
  rankUsers,
  summarizeLeaderboard,
  buildConversations,
  mapAdminDmMessage,
};
