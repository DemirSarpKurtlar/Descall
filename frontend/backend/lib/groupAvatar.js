"use strict";

/**
 * Group photo rules (mirrors the profile avatar pipeline).
 * The image itself is uploaded through /api/media/upload (same Supabase
 * "media" bucket as avatars); this only validates the resulting URL so a
 * group can't be pointed at an arbitrary third-party host.
 */

const MAX_GROUP_AVATAR_URL = 500;

function normalizeBase(base) {
  return String(base || "").trim().replace(/\/+$/, "");
}

/**
 * @returns {{ ok: true, url: string|null } | { ok: false, error: string }}
 * `null` / "" means "remove the group photo".
 */
function validateGroupAvatarUrl(raw, { supabaseUrl = process.env.SUPABASE_URL } = {}) {
  if (raw === null || raw === undefined || raw === "") return { ok: true, url: null };
  if (typeof raw !== "string") return { ok: false, error: "Invalid URL" };
  const url = raw.trim();
  if (url.length > MAX_GROUP_AVATAR_URL) return { ok: false, error: "URL too long" };
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "Invalid URL" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, error: "Invalid URL" };
  }
  const base = normalizeBase(supabaseUrl);
  if (base) {
    const prefix = `${base}/storage/v1/object/public/`;
    if (!url.startsWith(prefix)) return { ok: false, error: "Group photo must be uploaded to Descall" };
  }
  return { ok: true, url };
}

/** Any member of the group (the creator is always a member) may change the photo. */
function canEditGroupAvatar({ userId, createdBy, isMember }) {
  if (!userId) return false;
  return Boolean(isMember) || createdBy === userId;
}

module.exports = { validateGroupAvatarUrl, canEditGroupAvatar, MAX_GROUP_AVATAR_URL };
