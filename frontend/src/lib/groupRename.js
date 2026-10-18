/**
 * Group rename helpers shared by the rename sheet, the socket listener and
 * the API client. Mirrors backend/lib/groupRename.js (1–50 characters,
 * whitespace collapsed); any member may rename.
 */

export const GROUP_NAME_MAX = 50;

export function normalizeGroupNameInput(raw) {
  // eslint-disable-next-line no-control-regex
  return String(raw ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

export function groupNameLength(raw) {
  return [...String(raw ?? "")].length;
}

/**
 * @returns {{ ok: boolean, name: string, reason: "" | "empty" | "too-long" | "unchanged" }}
 */
export function validateGroupRename(raw, currentName = "") {
  const name = normalizeGroupNameInput(raw);
  if (!name) return { ok: false, name, reason: "empty" };
  if (groupNameLength(name) > GROUP_NAME_MAX) return { ok: false, name, reason: "too-long" };
  if (name === normalizeGroupNameInput(currentName)) return { ok: false, name, reason: "unchanged" };
  return { ok: true, name, reason: "" };
}

/** English source strings (run through t()) for server error codes. */
export function renameErrorKey(code) {
  switch (code) {
    case "NOT_MEMBER": return "You are no longer a member of this group.";
    case "NOT_FOUND": return "This group no longer exists.";
    case "NAME_REQUIRED": return "Enter a group name.";
    case "NAME_TOO_LONG": return "Group name must be 50 characters or fewer.";
    case "NETWORK": return "No connection. Check your internet and try again.";
    default: return "Could not rename the group. Try again.";
  }
}

/** Immutable rename in a group list; returns the same array when nothing changed. */
export function applyGroupRename(list, groupId, name) {
  if (!Array.isArray(list) || !groupId || !name) return list;
  let changed = false;
  const next = list.map((g) => {
    if (g?.id !== groupId || g.name === name) return g;
    changed = true;
    return { ...g, name };
  });
  return changed ? next : list;
}
