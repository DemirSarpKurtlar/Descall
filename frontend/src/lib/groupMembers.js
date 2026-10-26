/**
 * Group membership updates for the client group list (`myGroups`) and the
 * open group (`activeGroup`). Shared by the add-member sheet (HTTP response)
 * and the `group:member:added` / `group:invited` socket listeners so every
 * screen (sidebar row, chat header "N üye", members panel, info sheet) sees
 * the new member at once, on every platform.
 */

import { stampArrival } from "./listOrder.js";

function memberId(m) {
  return m && typeof m === "object" ? m.id : m;
}

/**
 * Merge an added member into one group object. `fresh` (the server's group in
 * the GET /groups/my shape) wins when present; otherwise the member is
 * appended once. Returns the same object when nothing changed.
 */
export function mergeGroupMember(group, { user = null, group: fresh = null, memberCount = null } = {}) {
  if (!group) return group;
  if (fresh && fresh.id === group.id && Array.isArray(fresh.members)) {
    return {
      ...group,
      ...fresh,
      // Keep per-user fields the server's group payload does not carry.
      joinedAt: group.joinedAt ?? fresh.joinedAt,
      lastMessage: fresh.lastMessage ?? group.lastMessage,
      lastActivity: fresh.lastActivity ?? group.lastActivity,
      // A fresh member payload ends a local "you were removed" state (re-add).
      removed: fresh.removed || null,
    };
  }
  const uid = memberId(user);
  if (!uid) return group;
  const members = Array.isArray(group.members) ? group.members : [];
  const ids = Array.isArray(group.memberIds) ? group.memberIds : members.map(memberId).filter(Boolean);
  const hasMember = members.some((m) => memberId(m) === uid);
  const hasId = ids.includes(uid);
  const baseCount = Math.max(group.memberCount || 0, members.length, ids.length);
  const nextCount = Math.max(
    Number.isFinite(memberCount) ? memberCount : 0,
    hasMember || hasId ? baseCount : baseCount + 1,
  );
  if (hasMember && hasId && nextCount === group.memberCount) return group;
  return {
    ...group,
    members: hasMember ? members : [...members, typeof user === "object" ? user : { id: uid }],
    memberIds: hasId ? ids : [...ids, uid],
    memberCount: nextCount,
  };
}

/** Immutable update of a group list; returns the same array when nothing changed. */
export function applyGroupMemberAdded(list, groupId, payload = {}) {
  if (!Array.isArray(list) || !groupId) return list;
  let changed = false;
  const next = list.map((g) => {
    if (g?.id !== groupId) return g;
    const merged = mergeGroupMember(g, payload);
    if (merged !== g) changed = true;
    return merged;
  });
  return changed ? next : list;
}

/**
 * `group:invited` (you were added / a group was created with you): insert the
 * group, or refresh it when a stale copy is already in the list.
 */
export function upsertInvitedGroup(list, group) {
  const safe = Array.isArray(list) ? list : [];
  if (!group?.id) return list;
  const idx = safe.findIndex((g) => g?.id === group.id);
  // New to me: stamp the join so it sorts to the top of the groups list.
  if (idx === -1) return [...safe, stampArrival(group, "joinedAt")];
  if (!Array.isArray(group.members)) return list;
  const merged = mergeGroupMember(safe[idx], { group });
  if (merged === safe[idx]) return list;
  const next = safe.slice();
  next[idx] = merged;
  return next;
}

/* ── Member removal / leave / roles (Oct 2026) ────────────────────────────── */

/** Take one user out of a group object (members, memberIds, adminIds, count). */
export function withoutGroupMember(group, userId, { memberCount = null, ownerId = null } = {}) {
  if (!group || !userId) return group;
  const members = Array.isArray(group.members) ? group.members : [];
  const ids = Array.isArray(group.memberIds) ? group.memberIds : members.map(memberId).filter(Boolean);
  const admins = Array.isArray(group.adminIds) ? group.adminIds : [];
  const had = members.some((m) => memberId(m) === userId) || ids.includes(userId);
  const nextOwner = ownerId && ownerId !== group.created_by ? ownerId : null;
  if (!had && !nextOwner && !(Number.isFinite(memberCount) && memberCount !== group.memberCount)) return group;
  const baseCount = Math.max(group.memberCount || 0, members.length, ids.length);
  return {
    ...group,
    members: members.filter((m) => memberId(m) !== userId),
    memberIds: ids.filter((id) => id !== userId),
    adminIds: admins.filter((id) => id !== userId && id !== nextOwner),
    memberCount: Number.isFinite(memberCount) ? memberCount : Math.max(0, had ? baseCount - 1 : baseCount),
    ...(nextOwner ? { created_by: nextOwner } : {}),
  };
}

/** `group:member:removed` / `group:member:left` for someone else. */
export function applyGroupMemberGone(list, groupId, userId, opts = {}) {
  if (!Array.isArray(list) || !groupId || !userId) return list;
  let changed = false;
  const next = list.map((g) => {
    if (g?.id !== groupId) return g;
    const out = withoutGroupMember(g, userId, opts);
    if (out !== g) changed = true;
    return out;
  });
  return changed ? next : list;
}

/** `group:member:role`: owner made / unmade a group admin. */
export function applyGroupRole(group, userId, role) {
  if (!group || !userId) return group;
  const admins = Array.isArray(group.adminIds) ? group.adminIds : [];
  const isAdmin = admins.includes(userId);
  if ((role === "admin") === isAdmin) return group;
  return { ...group, adminIds: role === "admin" ? [...admins, userId] : admins.filter((id) => id !== userId) };
}

/** I was removed: keep the group read-only with the removal details. */
export function markGroupRemoved(group, info = {}) {
  if (!group) return group;
  return {
    ...group,
    removed: {
      by: info.by || null,
      byUsername: info.byUsername || null,
      byName: info.byName || null,
      reason: info.reason || null,
      removedAt: info.removedAt || new Date().toISOString(),
      readUntil: info.readUntil || info.removedAt || new Date().toISOString(),
    },
  };
}

/** Owner / group admin / member for one user of a group object. */
export function groupRoleOf(group, userId) {
  if (!group || !userId) return "member";
  if (group.created_by === userId) return "owner";
  return Array.isArray(group.adminIds) && group.adminIds.includes(userId) ? "admin" : "member";
}

/** Same rule as backend/lib/groupRoles.canRemoveMember (UI only). */
export function canRemoveGroupMember(group, actorId, targetId) {
  if (!group || !actorId || !targetId || actorId === targetId || group.removed) return false;
  const actor = groupRoleOf(group, actorId);
  const target = groupRoleOf(group, targetId);
  if (actor === "owner") return target !== "owner";
  if (actor === "admin") return target === "member";
  return false;
}

/** Parse a member_removed / member_left row's JSON content. */
export function parseMemberEvent(content) {
  try {
    const obj = typeof content === "string" ? JSON.parse(content) : content;
    if (!obj || typeof obj !== "object") return null;
    return {
      actorId: typeof obj.actorId === "string" ? obj.actorId : null,
      actorName: typeof obj.actorName === "string" ? obj.actorName : null,
      targetId: typeof obj.targetId === "string" ? obj.targetId : null,
      targetName: typeof obj.targetName === "string" ? obj.targetName : null,
    };
  } catch {
    return null;
  }
}

export const MEMBER_EVENT_TYPES = ["member_removed", "member_left"];
