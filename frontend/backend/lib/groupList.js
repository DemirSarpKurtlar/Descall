"use strict";

/**
 * One round of queries for "my groups", instead of three queries per group.
 * Frankfurt → Seoul is a full HTTP round trip per Supabase call, and the
 * owner account is in 32 groups, so the old fan-out was ~100 round trips.
 */

const { createSingleflight } = require("./singleflight");

function defaultDb() {
  return require("../db/supabase");
}

const flight = createSingleflight();
const LAST_MESSAGE_LIMIT = 800;

function formatGroupListPreview(msg) {
  if (!msg) return null;
  const username = msg.sender?.username || msg.sender_username || null;
  const mediaType = msg.media_type || msg.mediaType || null;
  const messageType = msg.message_type || msg.type || null;
  let body = null;

  if (messageType === "call_summary") {
    body = "📞 Call";
  } else {
    const raw = String(msg.content || msg.text || "").trim();
    if (raw && !raw.startsWith("__voice__:") && !raw.startsWith("{")) {
      body = raw;
    } else if (mediaType === "image") {
      body = "📷 Photo";
    } else if (mediaType === "voice" || mediaType === "audio" || raw.startsWith("__voice__:")) {
      body = "🎤 Voice message";
    } else if (msg.media_url || msg.mediaUrl) {
      body = "📎 Attachment";
    } else if (raw) {
      body = raw.slice(0, 80);
    }
  }

  if (!body) return null;
  const preview = username ? `${username}: ${body}` : body;
  return preview.slice(0, 80);
}

function chunk(ids, size = 100) {
  const out = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

async function selectIn(db, table, column, ids, columns) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (!unique.length) return [];
  const parts = await Promise.all(
    chunk(unique).map(async (slice) => {
      const { data, error } = await db.from(table).select(columns).in(column, slice);
      if (error) throw error;
      return data || [];
    })
  );
  return parts.flat();
}

/** Pure assembly so tests can check the list shape without a database. */
function assembleGroupList({ memberships, groups, memberRows, users, lastRows }) {
  const membersByGroup = new Map();
  for (const row of memberRows || []) {
    if (!membersByGroup.has(row.group_id)) membersByGroup.set(row.group_id, []);
    membersByGroup.get(row.group_id).push(row);
  }
  const usersById = new Map((users || []).map((user) => [user.id, user]));
  const lastByGroup = new Map();
  for (const row of lastRows || []) {
    if (!row?.group_id || lastByGroup.has(row.group_id)) continue;
    lastByGroup.set(row.group_id, row);
  }
  const joinedAt = new Map((memberships || []).map((m) => [m.group_id, m.joined_at]));

  return (groups || []).map((group) => {
    const groupMembers = membersByGroup.get(group.id) || [];
    const memberIds = groupMembers.map((m) => m.user_id).filter(Boolean);
    const members = memberIds.map((id) => usersById.get(id)).filter(Boolean);
    const last = lastByGroup.get(group.id) || null;
    return {
      ...group,
      memberCount: groupMembers.length,
      memberIds,
      members,
      joinedAt: joinedAt.get(group.id),
      lastMessage: formatGroupListPreview(last),
      lastActivity: last?.created_at || group.created_at || null,
    };
  });
}

async function loadLastMessages(db, groupIds) {
  if (!groupIds.length) return [];
  const columns = `
    group_id,
    content,
    media_type,
    media_url,
    message_type,
    created_at,
    sender:sender_id (id, username)
  `;
  const { data, error } = await db
    .from("group_messages")
    .select(columns)
    .in("group_id", groupIds)
    .order("created_at", { ascending: false })
    .limit(LAST_MESSAGE_LIMIT);
  if (error) throw error;
  const rows = data || [];
  const seen = new Set(rows.map((row) => row.group_id));
  const missing = groupIds.filter((id) => !seen.has(id));
  // The newest window can be one busy group. One more batched read covers
  // the groups that did not appear in it — still not one query per group.
  if (missing.length && rows.length >= LAST_MESSAGE_LIMIT) {
    const extra = await selectIn(
      db,
      "group_messages",
      "group_id",
      missing,
      "group_id, content, media_type, media_url, message_type, created_at, sender:sender_id (id, username)"
    );
    extra.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    rows.push(...extra);
  }
  return rows;
}

async function loadUserGroups(userId, db = defaultDb()) {
  const { data: memberships, error: membershipError } = await db
    .from("group_members")
    .select("group_id, joined_at")
    .eq("user_id", userId);
  if (membershipError) {
    console.error("[Groups] Membership error:", membershipError);
    return [];
  }
  if (!memberships || memberships.length === 0) return [];

  const groupIds = memberships.map((m) => m.group_id).filter(Boolean);
  const [groups, memberRows] = await Promise.all([
    selectIn(db, "groups", "id", groupIds, "id, name, avatar_url, created_by, created_at"),
    selectIn(db, "group_members", "group_id", groupIds, "group_id, user_id, joined_at"),
  ]);

  const userIds = [...new Set(memberRows.map((row) => row.user_id).filter(Boolean))];
  const [users, lastRows] = await Promise.all([
    userIds.length
      ? selectIn(db, "users", "id", userIds, "id, username, avatar_url, status, is_admin")
      : Promise.resolve([]),
    loadLastMessages(db, groupIds),
  ]);

  return assembleGroupList({ memberships, groups, memberRows, users, lastRows });
}

function getUserGroups(userId, db = defaultDb()) {
  if (!userId) return Promise.resolve([]);
  return flight.run(`groups:${userId}`, () => loadUserGroups(userId, db));
}

module.exports = {
  formatGroupListPreview,
  assembleGroupList,
  loadUserGroups,
  getUserGroups,
  LAST_MESSAGE_LIMIT,
};
