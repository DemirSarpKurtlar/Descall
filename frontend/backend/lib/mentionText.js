"use strict";

/**
 * How a bot / system message names a person so the chat renders a real mention.
 * Bubbles turn "@username" into a mention chip (src/lib/messageMarkdown.js accepts
 * @[A-Za-z0-9_]{2,32}); a raw "<@uuid>" is not a mention there and shows as text.
 * A username outside that shape falls back to the plain display name.
 */
const MENTIONABLE = /^[A-Za-z0-9_]{2,32}$/;

function mentionText(user) {
  const username = String(user?.username || "").trim();
  if (MENTIONABLE.test(username)) return `@${username}`;
  const name = String(user?.display_name || user?.displayName || username || "").trim();
  return name || "@user";
}

module.exports = { mentionText, MENTIONABLE };
