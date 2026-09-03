"use strict";

const supabase = require("../db/supabase");
const {
  WINDOWS,
  parseUuidConvKey,
  buildUserStats,
  rankUsers,
  summarizeLeaderboard,
  buildConversations,
  mapAdminDmMessage,
} = require("./adminInsights");

const DM_COLS = "id, from_user_id, to_user_id, content, media_url, media_type, created_at, edited_at, read_at";
const SEND_COLS = "id, sender_id, created_at";

async function fetchAll(table, columns, { order, ascending = false } = {}) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    let query = supabase.from(table).select(columns).range(from, from + pageSize - 1);
    if (order) query = query.order(order, { ascending });
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
    if (from > 20000) break;
  }
  return rows;
}

async function usersByIds(ids) {
  const unique = [...new Set((ids || []).filter(Boolean).map(String))];
  if (!unique.length) return [];
  const out = [];
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const { data, error } = await supabase
      .from("users")
      .select("id, username, display_name, avatar_url, last_seen, is_admin")
      .in("id", chunk);
    if (error) throw error;
    out.push(...(data || []));
  }
  return out;
}

async function recentLastSeenUsers(limit = 80) {
  const { data, error } = await supabase
    .from("users")
    .select("id, username, display_name, avatar_url, last_seen, is_admin")
    .not("last_seen", "is", null)
    .order("last_seen", { ascending: false })
    .limit(Math.min(120, Math.max(1, limit)));
  if (error) throw error;
  return data || [];
}

async function loadMessageRows() {
  const [dmRows, serverRows, groupRows] = await Promise.all([
    fetchAll("dm_messages", DM_COLS, { order: "created_at" }),
    fetchAll("server_messages", SEND_COLS, { order: "created_at" }),
    fetchAll("group_messages", SEND_COLS, { order: "created_at" }),
  ]);
  return { dmRows, serverRows, groupRows };
}

function lastSeenMap(users, extras = {}) {
  const map = { ...extras };
  for (const u of users || []) {
    if (u?.id && u.last_seen && !map[u.id]) map[u.id] = u.last_seen;
  }
  return map;
}

async function getLeaderboard({
  sort = "messages",
  windowKey = "all",
  limit = 50,
  presenceIds = [],
  lastSeenExtras = {},
} = {}) {
  const nowMs = Date.now();
  const windowMs = WINDOWS[windowKey] ?? 0;
  const { dmRows, serverRows, groupRows } = await loadMessageRows();
  const stats = buildUserStats({ dmRows, serverRows, groupRows, nowMs, windowMs });

  const recent = sort === "activity" ? await recentLastSeenUsers(80) : [];
  const neededIds = [...stats.keys(), ...recent.map((u) => u.id), ...presenceIds];
  const users = await usersByIds(neededIds);
  const userMap = new Map(users.map((u) => [u.id, u]));
  for (const u of recent) if (!userMap.has(u.id)) userMap.set(u.id, u);

  const ranked = rankUsers({
    stats,
    users: [...userMap.values()],
    presenceIds,
    lastSeenById: lastSeenMap([...userMap.values()], lastSeenExtras),
    nowMs,
    windowMs,
    sort,
    limit,
  });

  return {
    window: WINDOWS[windowKey] != null ? windowKey : "all",
    sort: sort === "activity" ? "activity" : "messages",
    generatedAt: new Date(nowMs).toISOString(),
    summary: summarizeLeaderboard(ranked, {
      stats,
      dmRows,
      nowMs,
      windowMs,
      presenceCount: presenceIds.length,
    }),
    users: ranked,
  };
}

async function listDmConversations({ presenceIds = [] } = {}) {
  const dmRows = await fetchAll("dm_messages", DM_COLS, { order: "created_at" });
  const ids = [];
  for (const row of dmRows) {
    ids.push(row.from_user_id, row.to_user_id);
  }
  const users = await usersByIds(ids);
  return {
    generatedAt: new Date().toISOString(),
    conversations: buildConversations({
      dmRows,
      users,
      presenceIds,
      nowMs: Date.now(),
    }),
  };
}

async function listDmThread(key, { limit = 200 } = {}) {
  const parsed = parseUuidConvKey(key);
  if (!parsed) {
    const err = new Error("Invalid conversation key.");
    err.status = 400;
    throw err;
  }
  const pageSize = Math.min(400, Math.max(1, Number(limit) || 200));
  const { data, error } = await supabase
    .from("dm_messages")
    .select(DM_COLS)
    .or(
      `and(from_user_id.eq.${parsed.a},to_user_id.eq.${parsed.b}),and(from_user_id.eq.${parsed.b},to_user_id.eq.${parsed.a})`
    )
    .order("created_at", { ascending: false })
    .limit(pageSize);
  if (error) throw error;
  const rows = (data || []).slice().reverse();
  const users = await usersByIds([parsed.a, parsed.b, ...rows.map((r) => r.from_user_id)]);
  const usersById = new Map(users.map((u) => [String(u.id), u]));
  return {
    key: `${parsed.a}::${parsed.b}`,
    users: [parsed.a, parsed.b].map((id) => {
      const u = usersById.get(id);
      return {
        id,
        username: u?.username || id.slice(0, 8),
        displayName: u?.display_name || u?.username || id.slice(0, 8),
        avatar_url: u?.avatar_url || null,
        is_admin: Boolean(u?.is_admin),
      };
    }),
    messages: rows.map((row) => mapAdminDmMessage(row, usersById)),
  };
}

async function deleteDmThread(key) {
  const parsed = parseUuidConvKey(key);
  if (!parsed) {
    const err = new Error("Invalid conversation key.");
    err.status = 400;
    throw err;
  }
  const { error, count } = await supabase
    .from("dm_messages")
    .delete({ count: "exact" })
    .or(
      `and(from_user_id.eq.${parsed.a},to_user_id.eq.${parsed.b}),and(from_user_id.eq.${parsed.b},to_user_id.eq.${parsed.a})`
    );
  if (error) throw error;
  return { ok: true, removed: count || 0 };
}

async function deleteDmMessage(msgId) {
  const { error } = await supabase.from("dm_messages").delete().eq("id", msgId);
  if (error) throw error;
  return { ok: true };
}

async function exportDmJson({ presenceIds = [] } = {}) {
  const dmRows = await fetchAll("dm_messages", DM_COLS, { order: "created_at" });
  const ids = [];
  for (const row of dmRows) ids.push(row.from_user_id, row.to_user_id);
  const users = await usersByIds(ids);
  const usersById = new Map(users.map((u) => [String(u.id), u]));
  return {
    generatedAt: new Date().toISOString(),
    conversations: buildConversations({
      dmRows,
      users,
      presenceIds,
      nowMs: Date.now(),
    }),
    messages: dmRows.map((row) => mapAdminDmMessage(row, usersById)),
  };
}

module.exports = {
  getLeaderboard,
  listDmConversations,
  listDmThread,
  deleteDmThread,
  deleteDmMessage,
  exportDmJson,
};
