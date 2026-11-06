"use strict";

/**
 * Forwarded messages (messaging phase 4).
 *
 * A forward is an ordinary send (dm:send / group:message /
 * server:channel:message) with `forwarded: true`. The mark is stored in the
 * message's reply_to JSONB as `{ forwarded: true }` (the same carrier poll-end
 * lines use, lib/polls.js), so DM and server channel history keep it without
 * a schema change. A forward never quotes: any replyTo sent with it is
 * dropped, and the original author is not stored (like other messengers,
 * only "Iletildi" is shown).
 *
 * group_messages only gained reply_to with
 * supabase/migrations/20261108_group_messages_reply_to.sql; until that runs,
 * inserts retry without the column (isMissingColumn) and history skips it.
 */

const FORWARDED_META = Object.freeze({ forwarded: true });

function isForwardRequest(value) {
  return value === true;
}

/** reply_to value for a forward, or null when this is not one. */
function forwardedReplyMeta(forwarded) {
  return isForwardRequest(forwarded) ? { ...FORWARDED_META } : null;
}

function isForwardedMeta(meta) {
  return Boolean(meta && typeof meta === "object" && meta.forwarded === true && !meta.id);
}

/** PostgREST / Postgres "column does not exist" for `column`. */
function isMissingColumn(error, column) {
  if (!error) return false;
  const code = String(error.code || "");
  const text = `${error.message || ""} ${error.details || ""} ${error.hint || ""}`;
  return (code === "42703" || code === "PGRST204" || /column/i.test(text)) && text.includes(column);
}

module.exports = { FORWARDED_META, isForwardRequest, forwardedReplyMeta, isForwardedMeta, isMissingColumn };
