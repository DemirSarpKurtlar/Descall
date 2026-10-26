"use strict";
/**
 * Extra facts for the 3.0.0 join sheet (mockup 02): how many members are visibly online
 * and who created the invite. Invisible users are never counted (privacy), and both
 * facts are best effort: a failure returns nulls instead of breaking the preview.
 */
const { getPresenceEntry, isVisibleStatus, isPresenceSocketLive } = require("./presenceRoster");

const MAX_SCAN = 5000;

function countVisibleOnline(userIds, presence, io) {
  let n = 0;
  for (const id of userIds || []) {
    const entry = getPresenceEntry(presence, id);
    if (!entry) continue;
    if (!isVisibleStatus(entry.status)) continue;
    if (io && !isPresenceSocketLive(io, id, entry)) continue;
    n += 1;
  }
  return n;
}

async function invitePreviewExtras(supabase, { serverId, creatorId = null, presence, io = null }) {
  const out = { onlineCount: null, inviter: null };
  try {
    const { data: rows } = await supabase
      .from("server_members")
      .select("user_id")
      .eq("server_id", serverId)
      .limit(MAX_SCAN);
    if (Array.isArray(rows)) out.onlineCount = countVisibleOnline(rows.map((r) => r.user_id), presence, io);
  } catch {
    /* keep null */
  }
  if (creatorId) {
    try {
      const { data: u } = await supabase
        .from("users")
        .select("id, username, display_name, avatar_url")
        .eq("id", creatorId)
        .maybeSingle();
      if (u) out.inviter = { id: u.id, username: u.username || null, displayName: u.display_name || null, avatarUrl: u.avatar_url || null };
    } catch {
      /* keep null */
    }
  }
  return out;
}

module.exports = { invitePreviewExtras, countVisibleOnline };
