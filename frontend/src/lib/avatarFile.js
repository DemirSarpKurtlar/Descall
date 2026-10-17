// Shared rules for profile photos, group photos and server icons.
// Same limits as the profile avatar endpoint (/api/media/avatar): JPG, PNG,
// WebP or GIF, 8 MB max. Animated GIFs skip the crop editor so they keep their
// animation (exactly like profile avatars); still images open the crop/zoom editor.

export const AVATAR_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const AVATAR_ACCEPT = AVATAR_MIME_TYPES.join(",");
export const AVATAR_MAX_BYTES = 8 * 1024 * 1024;

/** @returns {null | "type" | "size" | "missing"} */
export function validateAvatarFile(file) {
  if (!file) return "missing";
  if (!AVATAR_MIME_TYPES.includes(file.type)) return "type";
  if (Number(file.size) > AVATAR_MAX_BYTES) return "size";
  return null;
}

/** Still images go through the crop editor; GIFs upload as-is to stay animated. */
export function needsCrop(file) {
  return Boolean(file) && file.type !== "image/gif";
}

/** Group photo URL regardless of payload shape (REST, socket, legacy `icon`). */
export function groupAvatarUrl(group) {
  if (!group) return null;
  return group.avatarUrl || group.avatar_url || group.icon || null;
}

/** Apply a group photo change to a list of groups (immutable). */
export function applyGroupAvatar(groups, groupId, avatarUrl) {
  if (!Array.isArray(groups)) return groups;
  return groups.map((g) =>
    g && g.id === groupId ? { ...g, avatarUrl: avatarUrl || null, avatar_url: avatarUrl || null, icon: avatarUrl || null } : g,
  );
}
