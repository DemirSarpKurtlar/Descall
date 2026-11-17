"use strict";

/**
 * Message text checks shared by the DM and group socket handlers (polish scan
 * messaging-04 / 06 / 22). Server channels have their own copy in
 * socket/serverChannelHandlers.js (maxMessageLength).
 *
 *  - maxMessageLength(config): Sistem › maxMessageLength (default 2000).
 *  - checkText(value, { max, optional }): { ok, text } with the text as sent,
 *    or { ok: false, code, message } for a non-string or a too-long text.
 *    `optional` lets null / undefined through as "".
 */

const DEFAULT_MAX = 2000;

function maxMessageLength(config) {
  const n = Math.floor(Number(config?.maxMessageLength));
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX;
}

function checkText(value, { max = DEFAULT_MAX, optional = true } = {}) {
  if (value === null || value === undefined) {
    return optional ? { ok: true, text: "" } : { ok: false, code: "BAD_TEXT", message: "Message cannot be empty." };
  }
  if (typeof value !== "string") return { ok: false, code: "BAD_TEXT", message: "Invalid message." };
  if (value.trim().length > max) return { ok: false, code: "TOO_LONG", message: "Message is too long." };
  return { ok: true, text: value };
}

/** Optional string id / URL field: null when absent, false when it has the wrong type. */
function optionalString(value, maxLen = 4096) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > maxLen) return false;
  return value;
}

module.exports = { DEFAULT_MAX, maxMessageLength, checkText, optionalString };
