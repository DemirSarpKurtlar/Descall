"use strict";

/** Accept an ISO timestamp from ?since= and reject anything else. */
function parseSince(raw) {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (value.length < 10 || value.length > 40) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  return new Date(time).toISOString();
}

module.exports = { parseSince };
