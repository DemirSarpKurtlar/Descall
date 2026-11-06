"use strict";

/**
 * Reply quotes for DMs and group DMs, built from the database (never from
 * what the client sent), like resolveServerReplyMeta for server channels.
 * The quoted message must be in the same conversation; otherwise the quote
 * is dropped. A forward mark ({ forwarded: true }) is never produced here:
 * only forwardedReplyMeta(forwarded) on the send path sets it.
 */

const REPLY_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REPLY_TEXT_MAX = 500;
const REPLY_JSON_MAX = 2048;

function replyTargetId(replyTo) {
  const id = replyTo && typeof replyTo === "object" ? String(replyTo.id || "") : "";
  return REPLY_ID_RE.test(id) ? id : "";
}

/** Keeps the stored JSON small: drops the avatar first, then the whole quote. */
function capReplyMeta(meta) {
  if (!meta) return null;
  if (JSON.stringify(meta).length <= REPLY_JSON_MAX) return meta;
  const slim = meta.from ? { ...meta, from: { id: meta.from.id, username: meta.from.username || null, avatar: null } } : meta;
  return JSON.stringify(slim).length <= REPLY_JSON_MAX ? slim : null;
}

async function buildMeta(db, target, senderId) {
  let from = null;
  if (senderId) {
    const { data: u } = await db.from("users").select("id, username, avatar_url").eq("id", senderId).maybeSingle();
    from = { id: senderId, username: u?.username || null, avatar: u?.avatar_url || null };
  }
  const content = String(target.content || "");
  return capReplyMeta({
    id: target.id,
    // Voice notes keep their duration in content ("__voice__:N"); the quote shows the media label.
    text: content.startsWith("__voice__:") ? "" : content.slice(0, REPLY_TEXT_MAX),
    mediaType: target.media_type || null,
    from,
  });
}

/** Quote for a group message reply; null when the target is not in this group. */
async function resolveGroupReplyMeta(db, replyTo, groupId) {
  const id = replyTargetId(replyTo);
  if (!id || !groupId) return null;
  const { data: target, error } = await db
    .from("group_messages")
    .select("id, group_id, sender_id, content, media_type")
    .eq("id", id)
    .eq("group_id", groupId)
    .maybeSingle();
  if (error || !target || target.group_id !== groupId) return null;
  return buildMeta(db, target, target.sender_id);
}

/** Quote for a DM reply; null when the target is not between these two users. */
async function resolveDmReplyMeta(db, replyTo, myId, peerId) {
  const id = replyTargetId(replyTo);
  if (!id || !myId || !peerId) return null;
  const { data: target, error } = await db
    .from("dm_messages")
    .select("id, from_user_id, to_user_id, content, media_type")
    .eq("id", id)
    .maybeSingle();
  if (error || !target) return null;
  const samePair =
    (target.from_user_id === myId && target.to_user_id === peerId) ||
    (target.from_user_id === peerId && target.to_user_id === myId);
  if (!samePair) return null;
  return buildMeta(db, target, target.from_user_id);
}

module.exports = { resolveGroupReplyMeta, resolveDmReplyMeta, capReplyMeta, REPLY_TEXT_MAX, REPLY_JSON_MAX };
