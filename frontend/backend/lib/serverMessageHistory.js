"use strict";

/**
 * Server channel message edits keep the previous text, like DMs
 * (dm_messages.edit_history, socket/handlers.js dm:message:edit): each edit
 * appends { text: <text before the edit>, editedAt } and the last 50 versions
 * are kept. Deleted messages are not kept (same as DMs).
 *
 * The column comes from supabase/migrations/20261114_server_review.sql. Until it
 * is applied the read answers "missing column" and the edit is saved exactly as
 * before (content + edited_at), so editing never breaks on an older database.
 * Only the admin channel view (routes/adminServerReview.js, gated + audited)
 * reads the history.
 */

const { isMissingSchemaError } = require("./serverDirectory");
const { appendEditHistory } = require("./serverReview");

/**
 * @param {object} db supabase client
 * @param {{messageId: string, channelId: string, senderId: string, previousText: string|null, newText: string, editedAt: string}} edit
 * @returns {Promise<{error: object|null, historySaved: boolean}>}
 */
async function updateServerMessageWithHistory(db, { messageId, channelId, senderId, previousText, newText, editedAt }) {
  const base = { content: newText, edited_at: editedAt, updated_at: editedAt };
  const scoped = (q) => q.eq("id", messageId).eq("channel_id", channelId).eq("sender_id", senderId);

  let history = null;
  const read = await scoped(db.from("server_messages").select("edit_history")).maybeSingle();
  if (!read.error && read.data && Object.prototype.hasOwnProperty.call(read.data, "edit_history")) {
    history = Array.isArray(read.data.edit_history) ? read.data.edit_history : [];
  } else if (read.error && !isMissingSchemaError(read.error)) {
    console.warn("[serverMessageHistory] history read failed:", read.error.message || read.error);
  }

  const changed = typeof previousText === "string" && previousText !== newText;
  if (history && changed) {
    const withHistory = { ...base, edit_history: appendEditHistory(history, previousText, editedAt) };
    const { error } = await scoped(db.from("server_messages").update(withHistory));
    if (!error) return { error: null, historySaved: true };
    if (!isMissingSchemaError(error)) return { error, historySaved: false };
  }
  const { error } = await scoped(db.from("server_messages").update(base));
  return { error: error || null, historySaved: false };
}

module.exports = { updateServerMessageWithHistory };
