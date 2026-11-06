/**
 * Pure helpers for merging a live socket message into the in-memory chat list.
 * Used by App.jsx (and covered by liveMessageMerge.selftest.mjs) so that a
 * same-user message from another device (iOS → Electron) is never dropped just
 * because it has no matching optimistic tempId, and so client/platform tags
 * from any device are accepted.
 */

/**
 * Merge an incoming DM `dm:message` payload into the current conversation rows.
 * @param {Array} cur existing messages for this peer (may be empty)
 * @param {object} msg normalized incoming message (must have id; may have tempId)
 * @param {string|null} myId current user id
 * @returns {Array} next rows
 */
export function mergeIncomingDmMessage(cur, msg, myId) {
  const list = Array.isArray(cur) ? cur : [];
  if (!msg || !msg.id) return list;

  const isSelf = Boolean(myId && msg.from?.id && String(msg.from.id) === String(myId));
  if (isSelf && msg.tempId) {
    const hasTemp = list.some((m) => m && m.id === msg.tempId);
    if (hasTemp) {
      return list.map((m) => (m.id === msg.tempId ? { ...msg, sending: false } : m));
    }
  }
  if (list.some((m) => m && m.id === msg.id)) return list;
  return [...list, msg];
}

/**
 * Merge an incoming group/channel message row.
 * @param {Array} cur
 * @param {object} normalized normalized message with id
 * @param {string|null|undefined} tempId optimistic id from the sending socket only
 */
export function mergeIncomingChatMessage(cur, normalized, tempId) {
  const list = Array.isArray(cur) ? cur : [];
  if (!normalized || !normalized.id) return list;
  if (tempId && list.some((m) => m && m.id === tempId)) {
    return list.map((m) => (m.id === tempId ? { ...normalized, sending: false } : m));
  }
  if (list.some((m) => m && m.id === normalized.id)) return list;
  return [...list, normalized];
}

/**
 * True when a live message payload should be kept (not filtered by client tag).
 * Desktop/web must accept ios / electron / web / missing / unknown.
 */
export function shouldAcceptLiveMessage(msg) {
  if (!msg || typeof msg !== "object") return false;
  if (!msg.id) return false;
  // No client/platform gate — any device may originate the message.
  return true;
}
