// Pure helpers for the group info sheet (unit-tested).

/** Same actions, same ids as the sidebar swipe actions / row menu (useGroupActions.run). */
export const GROUP_INFO_ACTIONS = Object.freeze([
  { id: "invite", label: "Invite" },
  { id: "add", label: "Add" },
  { id: "rename", label: "Rename" },
  { id: "photo", label: "Change photo" },
  { id: "leave", label: "Leave Group", destructive: true },
]);

/** Drag-to-dismiss: far enough down, or a downward flick. */
export const SHEET_DISMISS_OFFSET = 88;
export const SHEET_DISMISS_VELOCITY = 750;
export function shouldDismissSheet(offsetY, velocityY) {
  return Number(offsetY) > SHEET_DISMISS_OFFSET || Number(velocityY) > SHEET_DISMISS_VELOCITY;
}

/** Owner first, then online, then by name. Adds _isOwner / _online. */
export function sortGroupMembers(members, { ownerId = null, isOnline = () => false, nameOf = (m) => m?.username || "" } = {}) {
  const list = Array.isArray(members) ? members.filter(Boolean) : [];
  return list
    .map((m) => ({ ...m, _isOwner: ownerId != null && m.id === ownerId, _online: Boolean(isOnline(m.id)) }))
    .sort((a, b) =>
      Number(b._isOwner) - Number(a._isOwner)
      || Number(b._online) - Number(a._online)
      || String(nameOf(a)).localeCompare(String(nameOf(b))));
}
