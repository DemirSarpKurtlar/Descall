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
