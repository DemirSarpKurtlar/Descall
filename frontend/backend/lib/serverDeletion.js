"use strict";

/**
 * Deleting a server (owner delete or owner leave). Audit 2026-10-19 #3: the old path
 * only removed the servers row, so
 *  - members got no event and kept the server in their list, sockets stayed in its rooms,
 *  - voice calls (and LiveKit rooms) kept running,
 *  - reactions (keyed by channel id, no FK) were orphaned,
 *  - private attachments (media-private) of its messages stayed in storage (KVKK),
 *  - the SERVER_DELETE audit row was cascaded away with the server.
 */
const supabase = require("../db/supabase");
const privateMedia = require("./privateMedia");
const { serverRoomNames, evictFromServerRooms } = require("./serverRooms");

const PAGE = 1000;
const MAX_MEDIA_ROWS = 20000;

function isMissingTable(error) {
  const code = String(error?.code || "");
  return code === "42P01" || code === "PGRST205" || /does not exist|could not find the table/i.test(error?.message || "");
}

async function snapshotServer(serverId) {
  const [{ rooms, channelIds }, membersRes] = await Promise.all([
    serverRoomNames(serverId),
    supabase.from("server_members").select("user_id").eq("server_id", serverId),
  ]);
  if (membersRes.error) throw membersRes.error;
  const memberIds = [...new Set((membersRes.data || []).map((m) => String(m.user_id)))];

  const mediaPaths = new Set();
  let messageCount = 0;
  for (let from = 0; from < MAX_MEDIA_ROWS; from += PAGE) {
    const { data, error } = await supabase
      .from("server_messages")
      .select("id, media_url")
      .eq("server_id", serverId)
      .like("media_url", `${privateMedia.REF_PREFIX}%`)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const row of data || []) {
      messageCount += 1;
      const parsed = privateMedia.parseMediaUrl(row.media_url);
      if (parsed?.path) mediaPaths.add(parsed.path);
    }
    if (!data || data.length < PAGE) break;
  }
  return { rooms, channelIds, memberIds, mediaPaths: [...mediaPaths], mediaMessageCount: messageCount };
}

async function writeDeletionLog(row) {
  const { error } = await supabase.from("server_deletion_log").insert(row);
  if (error && !isMissingTable(error)) console.warn("[serverDeletion] deletion log insert failed:", error.message);
  return !error;
}

/** Private objects that no other DM / group / server message still points at. */
async function unreferencedPaths(paths, deletedServerId = null) {
  const out = [];
  for (const path of paths) {
    const ref = privateMedia.refForPath(path);
    let used = false;
    for (const table of ["server_messages", "dm_messages", "group_messages"]) {
      let q = supabase.from(table).select("id").eq("media_url", ref);
      // rows of the deleted server itself do not count (cascade may still be running)
      if (table === "server_messages" && deletedServerId) q = q.neq("server_id", deletedServerId);
      const { data, error } = await q.limit(1);
      if (error || (data && data.length)) {
        used = true; // on error keep the file rather than delete something still in use
        break;
      }
    }
    if (!used) out.push(path);
  }
  return out;
}

async function removePrivateObjects(paths) {
  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    const { error } = await supabase.storage.from(privateMedia.PRIVATE_BUCKET).remove(chunk);
    if (error) console.warn("[serverDeletion] private media remove failed:", error.message);
    else removed += chunk.length;
  }
  return removed;
}

async function deleteReactions(channelIds) {
  for (let i = 0; i < channelIds.length; i += 100) {
    const chunk = channelIds.slice(i, i + 100).map(String);
    const { error } = await supabase
      .from("reactions")
      .delete()
      .eq("conversation_type", "server")
      .in("conversation_id", chunk);
    if (error) console.warn("[serverDeletion] reaction cleanup failed:", error.message);
  }
}

/**
 * Delete `server` (a servers row) and clean up everything around it.
 * io may be null (tests / scripts). Returns a summary.
 */
async function deleteServerFully(io, server, { actorId = null, via = "delete" } = {}) {
  const serverId = server.id;
  const snap = await snapshotServer(serverId);

  const { error } = await supabase.from("servers").delete().eq("id", serverId);
  if (error) throw error;

  // Live clients first: the server is gone for everyone right away.
  if (io) {
    const payload = { serverId, serverName: server.name || null, via };
    try {
      io.to(`server:${serverId}`).emit("server:deleted", payload);
      for (const uid of snap.memberIds) io.to(`user:${uid}`).emit("server:deleted", payload);
    } catch (err) {
      console.warn("[serverDeletion] emit failed:", err?.message || err);
    }
    try {
      require("../socket/serverVoiceHandlers").endAllServerVoice(io, serverId, "server_deleted");
    } catch (err) {
      console.warn("[serverDeletion] voice end failed:", err?.message || err);
    }
    try {
      await evictFromServerRooms(io, serverId, { rooms: snap.rooms });
    } catch (err) {
      console.warn("[serverDeletion] room eviction failed:", err?.message || err);
    }
  }

  await deleteReactions(snap.channelIds);
  let removed = 0;
  try {
    removed = await removePrivateObjects(await unreferencedPaths(snap.mediaPaths, serverId));
  } catch (err) {
    console.warn("[serverDeletion] private media cleanup failed:", err?.message || err);
  }

  await writeDeletionLog({
    server_id: serverId,
    server_name: server.name || null,
    owner_id: server.owner_id || null,
    actor_id: actorId,
    via,
    member_count: snap.memberIds.length,
    channel_count: snap.channelIds.length,
    message_count: snap.mediaMessageCount,
    private_media_removed: removed,
  });

  return {
    memberCount: snap.memberIds.length,
    channelCount: snap.channelIds.length,
    privateMediaRemoved: removed,
  };
}

module.exports = { deleteServerFully, snapshotServer, unreferencedPaths, isMissingTable };
