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
    fetchAll("dm_messages", "id, from_user_id, to_user_id, created_at", { order: "created_at" }),
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

// DM inceleme (3.7.1): the list never carries message text, only who talked,
// how much and when. Text is read one conversation at a time with a reason
// (routes/admin.js POST /dm/:key/view).
const DM_META_COLS = "id, from_user_id, to_user_id, created_at";

async function listDmConversations({ presenceIds = [] } = {}) {
  const dmRows = await fetchAll("dm_messages", DM_META_COLS, { order: "created_at" });
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
    }).map(({ last, ...c }) => ({ ...c, lastFromUserId: last?.fromUserId || null })),
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

async function deleteDmMessage(key, msgId) {
  const parsed = parseUuidConvKey(key);
  if (!parsed) {
    const err = new Error("Invalid conversation key.");
    err.status = 400;
    throw err;
  }
  // Only a message of this conversation: the id alone could name any DM.
  const { error, count } = await supabase
    .from("dm_messages")
    .delete({ count: "exact" })
    .eq("id", msgId)
    .or(
      `and(from_user_id.eq.${parsed.a},to_user_id.eq.${parsed.b}),and(from_user_id.eq.${parsed.b},to_user_id.eq.${parsed.a})`
    );
  if (error) throw error;
  if (!count) {
    const err = new Error("Message not found.");
    err.status = 404;
    throw err;
  }
  return { ok: true };
}

/* ---------- Gruplar (3.7.3): same rule as DMs, metadata list + one group by reason ---------- */

const UUID_ONLY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function badGroup() {
  const err = new Error("Invalid group id.");
  err.status = 400;
  return err;
}

async function listGroupConversations() {
  const [groups, members, msgs] = await Promise.all([
    fetchAll("groups", "id, name, avatar_url, created_by, created_at"),
    fetchAll("group_members", "group_id, user_id"),
    fetchAll("group_messages", "id, group_id, created_at", { order: "created_at" }),
  ]);
  const memberIds = new Map();
  for (const m of members) {
    const k = String(m.group_id);
    if (!memberIds.has(k)) memberIds.set(k, []);
    memberIds.get(k).push(String(m.user_id));
  }
  const stats = new Map();
  for (const m of msgs) {
    const k = String(m.group_id);
    const st = stats.get(k) || { count: 0, lastAt: null };
    st.count += 1;
    if (!st.lastAt || String(m.created_at) > String(st.lastAt)) st.lastAt = m.created_at;
    stats.set(k, st);
  }
  const preview = new Set();
  for (const ids of memberIds.values()) ids.slice(0, 4).forEach((id) => preview.add(id));
  const users = await usersByIds([...preview]);
  const byId = new Map(users.map((u) => [String(u.id), u]));
  const conversations = groups
    .map((g) => {
      const ids = memberIds.get(String(g.id)) || [];
      const st = stats.get(String(g.id)) || { count: 0, lastAt: null };
      return {
        key: String(g.id),
        name: g.name || "Grup",
        avatarUrl: g.avatar_url || null,
        memberCount: ids.length,
        memberIds: ids,
        messageCount: st.count,
        lastAt: st.lastAt || g.created_at || null,
        users: ids.slice(0, 4).map((id) => {
          const u = byId.get(id);
          return { id, username: u?.username || id.slice(0, 8), displayName: u?.display_name || u?.username || id.slice(0, 8), avatar_url: u?.avatar_url || null };
        }),
      };
    })
    .sort((a, b) => String(b.lastAt || "").localeCompare(String(a.lastAt || "")));
  return { generatedAt: new Date().toISOString(), conversations };
}

async function listGroupThread(groupId, { limit = 200 } = {}) {
  if (!UUID_ONLY.test(String(groupId || ""))) throw badGroup();
  const { data: group, error: gErr } = await supabase.from("groups").select("id, name, avatar_url, created_by").eq("id", groupId).maybeSingle();
  if (gErr) throw gErr;
  if (!group) {
    const err = new Error("Group not found.");
    err.status = 404;
    throw err;
  }
  const [{ data: members, error: mErr }, { data, error }] = await Promise.all([
    supabase.from("group_members").select("user_id, role").eq("group_id", groupId),
    supabase
      .from("group_messages")
      .select("id, sender_id, content, media_url, media_type, message_type, original_name, created_at, edited_at")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
      .limit(Math.min(400, Math.max(1, Number(limit) || 200))),
  ]);
  if (mErr) throw mErr;
  if (error) throw error;
  const rows = (data || []).slice().reverse();
  const users = await usersByIds([...(members || []).map((m) => m.user_id), ...rows.map((r) => r.sender_id)]);
  const byId = new Map(users.map((u) => [String(u.id), u]));
  const name = (id) => byId.get(String(id))?.username || String(id || "").slice(0, 8);
  return {
    key: String(group.id),
    name: group.name || "Grup",
    users: (members || []).map((m) => {
      const u = byId.get(String(m.user_id));
      return { id: m.user_id, username: name(m.user_id), displayName: u?.display_name || name(m.user_id), avatar_url: u?.avatar_url || null, role: m.role || null };
    }),
    messages: rows.map((r) => {
      const raw = String(r.content || "").trim();
      const media = String(r.media_type || "").toLowerCase();
      const isVoice = raw.startsWith("__voice__:") || media === "voice" || media === "audio";
      return {
        id: r.id,
        fromUserId: r.sender_id,
        fromUsername: name(r.sender_id),
        fromDisplayName: byId.get(String(r.sender_id))?.display_name || name(r.sender_id),
        text: isVoice ? "" : raw,
        mediaUrl: r.media_url || null,
        mediaType: r.media_type || null,
        isVoice,
        system: Boolean(r.message_type && r.message_type !== "text" && r.message_type !== "user"),
        timestamp: r.created_at,
        editedAt: r.edited_at || null,
      };
    }),
  };
}

async function deleteGroupMessage(groupId, msgId) {
  if (!UUID_ONLY.test(String(groupId || ""))) throw badGroup();
  const { error, count } = await supabase.from("group_messages").delete({ count: "exact" }).eq("id", msgId).eq("group_id", groupId);
  if (error) throw error;
  if (!count) {
    const err = new Error("Message not found.");
    err.status = 404;
    throw err;
  }
  return { ok: true };
}

module.exports = {
  listGroupConversations,
  listGroupThread,
  deleteGroupMessage,
  getLeaderboard,
  listDmConversations,
  listDmThread,
  deleteDmThread,
  deleteDmMessage,
};
