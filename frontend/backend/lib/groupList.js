"use strict";

/**
 * One round of queries for "my groups", instead of three queries per group.
 * Frankfurt → Seoul is a full HTTP round trip per Supabase call, and the
 * owner account is in 32 groups, so the old fan-out was ~100 round trips.
 */

const { createSingleflight } = require("./singleflight");
const { isMemberEventType, parseMemberEvent } = require("./groupRoles");

function defaultDb() {
  return require("../db/supabase");
}

const flight = createSingleflight();
const LAST_MESSAGE_LIMIT = 800;

/**
 * Member-event rows (member_removed / member_left) as an English sentence the
 * client localizes (lib/listPreview.js): "demir removed can",
 * "demir removed you", "can left the group". Never the reason.
 */
function formatMemberEventPreview(msg, viewerId) {
  const type = msg.message_type || msg.type;
  const ev = parseMemberEvent(msg.content) || {};
  const raw = (() => {
    try {
      return JSON.parse(msg.content);
    } catch {
      return {};
    }
  })();
  const actor = raw?.actorName || msg.sender?.username || null;
  const target = raw?.targetName || null;
  if (type === "member_left") return actor ? `${actor} left the group` : null;
  if (!actor) return null;
  if (viewerId && ev.targetId === viewerId) return `${actor} removed you`;
  return target ? `${actor} removed ${target}` : null;
}

function formatGroupListPreview(msg, viewerId = null) {
  if (!msg) return null;
  const username = msg.sender?.username || msg.sender_username || null;
  const mediaType = msg.media_type || msg.mediaType || null;
  const messageType = msg.message_type || msg.type || null;
  let body = null;

  if (isMemberEventType(messageType)) {
    const sentence = formatMemberEventPreview(msg, viewerId);
    return sentence ? sentence.slice(0, 80) : null;
  }
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

const MEMBER_COLUMNS = "group_id, user_id, joined_at, role";
const MEMBER_COLUMNS_LEGACY = "group_id, user_id, joined_at";

/** group_members rows incl. role; without role while the migration is pending. */
async function selectMemberRows(db, groupIds) {
  try {
    return await selectIn(db, "group_members", "group_id", groupIds, MEMBER_COLUMNS);
  } catch (err) {
    const { isMissingSchema } = require("./groupRemovals");
    if (!isMissingSchema(err)) throw err;
    return selectIn(db, "group_members", "group_id", groupIds, MEMBER_COLUMNS_LEGACY);
  }
}

/** Pure assembly so tests can check the list shape without a database. */
function assembleGroupList({ memberships, groups, memberRows, users, lastRows, viewerId = null }) {
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
    const adminIds = groupMembers
      .filter((m) => m.role === "admin" && m.user_id && m.user_id !== group.created_by)
      .map((m) => m.user_id);
    const members = memberIds.map((id) => usersById.get(id)).filter(Boolean);
    const last = lastByGroup.get(group.id) || null;
    return {
      ...group,
      avatarUrl: group.avatar_url || null,
      memberCount: groupMembers.length,
      memberIds,
      adminIds,
      members,
      joinedAt: joinedAt.get(group.id),
      lastMessage: formatGroupListPreview(last, viewerId),
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
    selectMemberRows(db, groupIds),
  ]);

  const userIds = [...new Set(memberRows.map((row) => row.user_id).filter(Boolean))];
  const [users, lastRows] = await Promise.all([
    userIds.length
      ? selectIn(db, "users", "id", userIds, "id, username, avatar_url, status, is_admin")
      : Promise.resolve([]),
    loadLastMessages(db, groupIds),
  ]);

  return assembleGroupList({ memberships, groups, memberRows, users, lastRows, viewerId: userId });
}

/**
 * Groups the user was removed from and still keeps in the list (owner
 * decision: removed members keep reading old messages). Same shape as
 * GET /groups/my plus `removed`; the preview stops at read_until so nothing
 * written after the removal leaks.
 */
async function loadRemovedGroups(userId, removals, db = defaultDb()) {
  const open = (removals || []).filter((r) => r?.group_id);
  if (!open.length) return [];
  const groupIds = open.map((r) => r.group_id);
  const actorIds = open.map((r) => r.removed_by).filter(Boolean);
  const [groups, memberRows] = await Promise.all([
    selectIn(db, "groups", "id", groupIds, "id, name, avatar_url, created_by, created_at"),
    selectMemberRows(db, groupIds),
  ]);
  const userIds = [...new Set([...memberRows.map((row) => row.user_id), ...actorIds].filter(Boolean))];
  const users = userIds.length
    ? await selectIn(db, "users", "id", userIds, "id, username, avatar_url, status, is_admin")
    : [];
  const lastRows = (
    await Promise.all(
      open.map(async (removal) => {
        const { data, error } = await db
          .from("group_messages")
          .select("group_id, content, media_type, media_url, message_type, created_at, sender:sender_id (id, username)")
          .eq("group_id", removal.group_id)
          .lte("created_at", removal.read_until || removal.removed_at)
          .order("created_at", { ascending: false })
          .limit(1);
        if (error) throw error;
        return (data || [])[0] || null;
      })
    )
  ).filter(Boolean);
  const usersById = new Map(users.map((u) => [u.id, u]));
  const byGroup = new Map(open.map((r) => [r.group_id, r]));
  return assembleGroupList({ memberships: [], groups, memberRows, users, lastRows, viewerId: userId }).map((group) => {
    const removal = byGroup.get(group.id);
    delete group.joinedAt;
    return {
      ...group,
      removed: {
        by: removal.removed_by || null,
        byUsername: usersById.get(removal.removed_by)?.username || null,
        byName: usersById.get(removal.removed_by)?.display_name || null,
        reason: removal.reason || null,
        removedAt: removal.removed_at,
        readUntil: removal.read_until || removal.removed_at,
      },
      lastActivity: group.lastActivity && removal.read_until && group.lastActivity > removal.read_until
        ? removal.read_until
        : group.lastActivity,
    };
  });
}

/**
 * One group in the GET /groups/my shape (members[], memberIds, memberCount,
 * lastMessage). Used after a membership change so clients get the fresh list
 * without reloading every group of the user.
 */
async function loadGroupById(groupId, db = defaultDb()) {
  if (!groupId) return null;
  const [groups, memberRows] = await Promise.all([
    selectIn(db, "groups", "id", [groupId], "id, name, avatar_url, created_by, created_at"),
    selectMemberRows(db, [groupId]),
  ]);
  if (!groups.length) return null;
  const userIds = [...new Set(memberRows.map((row) => row.user_id).filter(Boolean))];
  const [users, lastRows] = await Promise.all([
    userIds.length
      ? selectIn(db, "users", "id", userIds, "id, username, avatar_url, status, is_admin")
      : Promise.resolve([]),
    loadLastMessages(db, [groupId]),
  ]);
  const [group] = assembleGroupList({ memberships: [], groups, memberRows, users, lastRows });
  if (group) delete group.joinedAt;
  return group || null;
}

function getUserGroups(userId, db = defaultDb()) {
  if (!userId) return Promise.resolve([]);
  return flight.run(`groups:${userId}`, () => loadUserGroups(userId, db));
}

module.exports = {
  formatGroupListPreview,
  formatMemberEventPreview,
  loadRemovedGroups,
  assembleGroupList,
  loadUserGroups,
  loadGroupById,
  getUserGroups,
  LAST_MESSAGE_LIMIT,
};
