/**
 * Phone / narrow layout: which conversation the main pane shows, and whether
 * the list drawer must close because a conversation just opened.
 *
 * A chat can open from outside the list (push tap, deep link, universal link,
 * reload on /direct/<user>, invite landing). The list's own click handlers
 * close the drawer; this covers every other path, so the opened chat is never
 * hidden under the list. Pure (selftest: mobileDrawer.selftest.mjs).
 */

function idOf(value) {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return value.id != null ? String(value.id) : "";
}

/** "" when no conversation is open, else a stable key for it. */
export function conversationKey({ dm = null, group = null, channel = null } = {}) {
  const dmId = idOf(dm);
  if (dmId) return `dm:${dmId}`;
  const groupId = idOf(group);
  if (groupId) return `group:${groupId}`;
  const channelId = idOf(channel);
  if (channelId && channel?.type !== "category") return `channel:${channelId}`;
  return "";
}

/**
 * True when the drawer must close: a conversation opened or switched.
 * Closing the conversation (key back to "") and re-renders with the same key
 * never close it, so opening the drawer by hand inside a chat still works.
 */
export function shouldCloseDrawerForConversation(prevKey, nextKey) {
  return Boolean(nextKey) && nextKey !== (prevKey || "");
}
