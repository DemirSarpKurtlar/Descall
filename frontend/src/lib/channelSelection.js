/**
 * Monotonic selection token.
 * Only the latest bump() may commit channel-specific UI state.
 */
export function createEpochCounter() {
  let value = 0;
  return {
    bump() {
      value += 1;
      return value;
    },
    value() {
      return value;
    },
    isCurrent(token) {
      return token === value;
    },
  };
}

/**
 * A server-detail response may update the open server/channel only when it
 * belongs to the selection that is still on screen.
 */
export function canCommitServerDetail({ token, epoch, expected, live } = {}) {
  if (token == null || epoch == null || token !== epoch) return false;
  if (!expected?.serverId || !live?.serverId) return false;
  if (String(live.view || "servers") !== "servers") return false;
  if (String(expected.serverId) !== String(live.serverId)) return false;
  return String(expected.channelId || "") === String(live.channelId || "");
}

/**
 * History, errors, and loading flags commit only for the channel the user
 * is still looking at.
 */
export function canCommitChannelPayload({ token, epoch, requestedChannelId, activeChannelId } = {}) {
  if (token == null || epoch == null || token !== epoch) return false;
  if (!requestedChannelId || !activeChannelId) return false;
  return String(requestedChannelId) === String(activeChannelId);
}
