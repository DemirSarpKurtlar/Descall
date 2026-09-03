"use strict";

const supabase = require("../db/supabase");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

function toPublicPref(row, peerId) {
  if (!row) {
    return {
      peerId,
      pinned: false,
      muted: false,
      hidden: false,
      markedUnread: false,
      pinnedAt: null,
    };
  }
  return {
    peerId: row.peer_id || peerId,
    pinned: Boolean(row.pinned),
    muted: Boolean(row.muted),
    hidden: Boolean(row.hidden),
    markedUnread: Boolean(row.marked_unread),
    pinnedAt: row.pinned_at || null,
  };
}

/** Pure merge used by upsert and unit tests. */
function mergePrefPatch(current, patch = {}) {
  const now = patch.now || new Date().toISOString();
  const next = {
    pinned: current?.pinned ?? false,
    muted: current?.muted ?? false,
    hidden: current?.hidden ?? false,
    marked_unread: current?.marked_unread ?? false,
    pinned_at: current?.pinned_at || null,
  };
  if (patch.pinned !== undefined) next.pinned = Boolean(patch.pinned);
  if (patch.muted !== undefined) next.muted = Boolean(patch.muted);
  if (patch.hidden !== undefined) next.hidden = Boolean(patch.hidden);
  if (patch.markedUnread !== undefined) next.marked_unread = Boolean(patch.markedUnread);
  if (patch.marked_unread !== undefined) next.marked_unread = Boolean(patch.marked_unread);

  if (patch.hidden === true) {
    next.pinned = false;
    next.pinned_at = null;
  }
  if (patch.pinned === true) next.hidden = false;

  if (next.pinned) {
    if (patch.pinned === true || !next.pinned_at) next.pinned_at = next.pinned_at || now;
  } else {
    next.pinned_at = null;
  }

  if (next.hidden) {
    next.pinned = false;
    next.pinned_at = null;
  }
  if (next.pinned) next.hidden = false;

  next.updated_at = now;
  return next;
}

async function listPrefs(userId) {
  if (!isUuid(userId)) return [];
  const { data, error } = await supabase
    .from("dm_conversation_prefs")
    .select("peer_id, pinned, muted, hidden, marked_unread, pinned_at")
    .eq("user_id", userId);
  if (error) {
    console.error("[DM prefs] list failed:", error.message);
    return [];
  }
  return (data || []).map((row) => toPublicPref(row));
}

async function getPrefRow(userId, peerId) {
  const { data, error } = await supabase
    .from("dm_conversation_prefs")
    .select("peer_id, pinned, muted, hidden, marked_unread, pinned_at")
    .eq("user_id", userId)
    .eq("peer_id", peerId)
    .maybeSingle();
  if (error) {
    console.error("[DM prefs] get failed:", error.message);
    return null;
  }
  return data || null;
}

async function upsertPref(userId, peerId, patch) {
  if (!isUuid(userId) || !isUuid(peerId) || userId === peerId) {
    return { ok: false, error: "Invalid conversation." };
  }
  const current = await getPrefRow(userId, peerId);
  const merged = mergePrefPatch(current, patch);
  const row = {
    user_id: userId,
    peer_id: peerId,
    ...merged,
  };
  const { data, error } = await supabase
    .from("dm_conversation_prefs")
    .upsert(row, { onConflict: "user_id,peer_id" })
    .select("peer_id, pinned, muted, hidden, marked_unread, pinned_at")
    .single();
  if (error) {
    console.error("[DM prefs] upsert failed:", error.message);
    return { ok: false, error: error.message || "Failed to update chat." };
  }
  return { ok: true, pref: toPublicPref(data, peerId) };
}

async function isMuted(userId, peerId) {
  if (!isUuid(userId) || !isUuid(peerId)) return false;
  const { data } = await supabase
    .from("dm_conversation_prefs")
    .select("muted")
    .eq("user_id", userId)
    .eq("peer_id", peerId)
    .maybeSingle();
  return Boolean(data?.muted);
}

/** Incoming (or outgoing) traffic brings a closed chat back onto the list. */
async function revealOnMessage(userId, peerId) {
  if (!isUuid(userId) || !isUuid(peerId) || userId === peerId) return;
  const { error } = await supabase
    .from("dm_conversation_prefs")
    .update({ hidden: false, marked_unread: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("peer_id", peerId);
  if (error) console.warn("[DM prefs] reveal failed:", error.message);
}

async function clearMarkedUnread(userId, peerId) {
  if (!isUuid(userId) || !isUuid(peerId)) return;
  const { error } = await supabase
    .from("dm_conversation_prefs")
    .update({ marked_unread: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("peer_id", peerId)
    .eq("marked_unread", true);
  if (error) console.warn("[DM prefs] clear unread flag failed:", error.message);
}

module.exports = {
  isUuid,
  toPublicPref,
  mergePrefPatch,
  listPrefs,
  getPrefRow,
  upsertPref,
  isMuted,
  revealOnMessage,
  clearMarkedUnread,
};
