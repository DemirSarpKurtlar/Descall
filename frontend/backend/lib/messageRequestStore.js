"use strict";

/**
 * Pending message requests from people who are not friends yet.
 * The in-memory map is the source of truth for this process. Postgres is
 * written when the table exists; a missing relation must not turn the send
 * back into a delivered DM.
 */

const memory = new Map();

function pairKey(fromUserId, toUserId) {
  return `${fromUserId}::${toUserId}`;
}

function isMissingRelation(error) {
  if (!error) return false;
  const code = String(error.code || "");
  const msg = `${error.message || ""} ${error.details || ""}`;
  return code === "42P01" || code === "PGRST205" || /does not exist|schema cache/i.test(msg);
}

function messageRequestPreview({ text, mediaType, mediaUrl } = {}) {
  if (mediaType === "voice" || mediaType === "audio") return "Voice message";
  if (mediaUrl) return "Attachment";
  const body = String(text || "").replace(/^__voice__:\d+$/, "").trim();
  return body.slice(0, 140);
}

function publicRequest(row) {
  if (!row) return null;
  return {
    id: row.fromUserId,
    requestId: row.id || null,
    username: row.username || "Someone",
    avatarUrl: row.avatarUrl || null,
    avatar_url: row.avatarUrl || null,
    preview: row.preview || "",
    createdAt: row.createdAt || null,
  };
}

function remember(row) {
  memory.set(pairKey(row.fromUserId, row.toUserId), row);
  return row;
}

async function upsertMessageRequest(supabase, { fromUserId, toUserId, username, avatarUrl, preview } = {}) {
  if (!fromUserId || !toUserId || fromUserId === toUserId) return null;
  const now = new Date().toISOString();
  const existing = memory.get(pairKey(fromUserId, toUserId));
  const row = remember({
    id: existing?.id || null,
    fromUserId,
    toUserId,
    username: username || existing?.username || "Someone",
    avatarUrl: avatarUrl || existing?.avatarUrl || null,
    preview: String(preview || "").slice(0, 140),
    createdAt: existing?.createdAt || now,
  });
  try {
    const { data, error } = await supabase
      .from("dm_message_requests")
      .upsert(
        {
          from_user_id: fromUserId,
          to_user_id: toUserId,
          preview: row.preview,
          from_username: row.username,
          from_avatar_url: row.avatarUrl,
          updated_at: now,
        },
        { onConflict: "from_user_id,to_user_id" },
      )
      .select("id, created_at")
      .maybeSingle();
    if (error) {
      if (!isMissingRelation(error)) {
        console.warn("[DM request] upsert failed:", error.message || error);
      }
    } else if (data) {
      row.id = data.id || row.id;
      row.createdAt = data.created_at || row.createdAt;
      remember(row);
    }
  } catch (err) {
    console.warn("[DM request] upsert failed:", err?.message || err);
  }
  return publicRequest(row);
}

async function listMessageRequests(supabase, userId) {
  const merged = new Map();
  for (const row of memory.values()) {
    if (row.toUserId === userId) merged.set(row.fromUserId, publicRequest(row));
  }
  if (!supabase || !userId) return [...merged.values()];
  try {
    const { data, error } = await supabase
      .from("dm_message_requests")
      .select("id, from_user_id, to_user_id, preview, from_username, from_avatar_url, created_at")
      .eq("to_user_id", userId);
    if (error) {
      if (!isMissingRelation(error)) {
        console.warn("[DM request] list failed:", error.message || error);
      }
      return [...merged.values()];
    }
    for (const record of data || []) {
      const row = remember({
        id: record.id,
        fromUserId: record.from_user_id,
        toUserId: record.to_user_id,
        username: record.from_username,
        avatarUrl: record.from_avatar_url,
        preview: record.preview || "",
        createdAt: record.created_at,
      });
      merged.set(row.fromUserId, publicRequest(row));
    }
  } catch (err) {
    console.warn("[DM request] list failed:", err?.message || err);
  }
  return [...merged.values()];
}

async function deleteMessageRequest(supabase, fromUserId, toUserId) {
  const prev = memory.get(pairKey(fromUserId, toUserId)) || null;
  memory.delete(pairKey(fromUserId, toUserId));
  if (supabase && fromUserId && toUserId) {
    try {
      const { error } = await supabase
        .from("dm_message_requests")
        .delete()
        .eq("from_user_id", fromUserId)
        .eq("to_user_id", toUserId);
      if (error && !isMissingRelation(error)) {
        console.warn("[DM request] delete failed:", error.message || error);
      }
    } catch (err) {
      console.warn("[DM request] delete failed:", err?.message || err);
    }
  }
  return publicRequest(prev);
}

function resetMessageRequests() {
  memory.clear();
}

module.exports = {
  messageRequestPreview,
  upsertMessageRequest,
  listMessageRequests,
  deleteMessageRequest,
  resetMessageRequests,
  isMissingRelation,
};
