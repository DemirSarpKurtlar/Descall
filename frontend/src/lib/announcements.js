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
