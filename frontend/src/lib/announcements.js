import { Bell, Megaphone, ShoppingBag, Users } from "lucide-react";

/**
 * Stored `emoji` is the per-item icon. Known glyphs draw as the same
 * Lucide marks as the glass mockup; anything else stays the glyph.
 */
const ANNOUNCEMENT_EMOJI_ICONS = new Map([
  ["🔔", Bell],
  ["🛍", ShoppingBag],
  ["🛍️", ShoppingBag],
  ["🛒", ShoppingBag],
  ["👥", Users],
  ["📢", Megaphone],
  ["📣", Megaphone],
]);

export function announcementIcon(emoji) {
  const raw = String(emoji || "").trim();
  if (!raw) return Megaphone;
  return ANNOUNCEMENT_EMOJI_ICONS.get(raw)
    || ANNOUNCEMENT_EMOJI_ICONS.get(raw.replace(/\uFE0F/g, ""))
    || null;
}

/**
 * GET /api/announcements returns Postgres columns (created_at).
 * The sheet reads createdAt. Accept both so dates and the list survive.
 */
export function normalizeAnnouncement(row) {
  if (!row || typeof row !== "object") return null;
  const createdAt = row.createdAt || row.created_at || null;
  return { ...row, createdAt };
}

export function normalizeAnnouncements(payload) {
  const list = Array.isArray(payload?.announcements) ? payload.announcements : [];
  return list.map(normalizeAnnouncement).filter(Boolean);
}

export async function loadAnnouncements(apiBase, token) {
  const res = await fetch(`${apiBase}/api/announcements`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error || "Failed to load announcements");
    err.status = res.status;
    throw err;
  }
  return normalizeAnnouncements(data);
}

/** Existing unread counter. Null when the response has no count. */
export async function loadUnreadAnnouncementCount(apiBase, token) {
  const res = await fetch(`${apiBase}/api/announcements/unread/count`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  const count = Number(data?.count);
  return Number.isFinite(count) ? count : null;
}

export function markAnnouncementRead(apiBase, token, id) {
  if (!id) return;
  fetch(`${apiBase}/api/announcements/${encodeURIComponent(id)}/read`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }).catch(() => {});
}
