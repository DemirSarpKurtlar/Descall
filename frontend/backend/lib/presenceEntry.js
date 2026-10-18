"use strict";

/** One roster row for `users:update` / `presence:delta`. Null = not shown. */
const { presence } = require("../runtime/sharedState");

function buildPresenceEntry(id, { getCachedPublicUser, publicPresenceStatus }) {
  const p = presence.get(id);
  if (!p) return null;
  // Invisible users must not appear in the online roster at all.
  if (p.status === "invisible") return null;
  const cached = getCachedPublicUser(id);
  const username = cached?.username || p.username;
  const isAdmin = Boolean(cached?.is_admin || cached?.isAdmin) || username === "admin";
  return {
    id,
    username,
    displayName: cached?.displayName || null,
    display_name: cached?.displayName || null,
    status: publicPresenceStatus(p.status),
    avatarUrl: cached?.avatarUrl || p.avatar_url || null,
    avatar_url: cached?.avatarUrl || p.avatar_url || null,
    avatarVersion: cached?.avatarVersion || cached?.updated_at || null,
    updated_at: cached?.updated_at || null,
    is_admin: isAdmin,
    isAdmin,
  };
}

module.exports = { buildPresenceEntry };
