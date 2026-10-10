/** Hover / visible rows ask the open session to warm a conversation. */
let handler = null;

export function setChatPrefetchHandler(fn) {
  handler = typeof fn === "function" ? fn : null;
  return () => {
    if (handler === fn) handler = null;
  };
}

export function requestChatPrefetch(kind, id) {
  if (!kind || !id || !handler) return;
  handler(kind, id);
}

/**
 * The lists passed in are already in sidebar order. Warm the rows a person
 * actually sees first, plus the first text channel of the first servers.
 */
export function planStartupPrefetch({
  dms = [],
  groups = [],
  servers = [],
  dmLimit = 4,
  groupLimit = 4,
  channelLimit = 2,
} = {}) {
  const dmIds = [];
  for (const dm of dms) {
    if (dmIds.length >= dmLimit) break;
    if (dm?.id) dmIds.push(dm.id);
  }
  const groupIds = [];
  for (const group of groups) {
    if (groupIds.length >= groupLimit) break;
    if (group?.id) groupIds.push(group.id);
  }
  const channels = [];
  for (const server of servers) {
    if (channels.length >= channelLimit) break;
    const text = (server?.channels || []).find((channel) => channel?.type === "text" && channel.id);
    if (text && server?.id) channels.push({ serverId: server.id, channelId: text.id });
  }
  return { dmIds, groupIds, channels };
}

/** At most `limit` conversation fetches at once. Repeated keys are ignored. */
export function createPrefetchQueue(limit = 2) {
  const seen = new Set();
  const pending = [];
  let active = 0;
  let maxActive = 0;
  const pump = () => {
    while (active < limit && pending.length) {
      const job = pending.shift();
      active += 1;
      maxActive = Math.max(maxActive, active);
      Promise.resolve()
        .then(job)
        .catch(() => {})
        .finally(() => {
          active -= 1;
          pump();
        });
    }
  };
  return {
    enqueue(key, job) {
      if (!key || seen.has(key) || typeof job !== "function") return false;
      seen.add(key);
      pending.push(job);
      pump();
      return true;
    },
    get maxActive() {
      return maxActive;
    },
  };
}
