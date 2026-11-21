/**
 * Typing indicators for the open chat, outside React state.
 *
 * App's socket handler writes here; only the chat header / composer area
 * (ChatPanel) subscribes with useSyncExternalStore. A peer starting or
 * stopping typing therefore re-renders ChatPanel alone instead of App, the
 * whole layout, the sidebars and the message list (Android perf: typing
 * events used to re-render the full tree twice per burst).
 *
 * Shape: { dm: user | null, group: { [groupId]: Map }, channel: { [channelId]: Map } }
 * Every change yields a new snapshot object; an update that changes nothing
 * keeps the old one, so subscribers do not re-render.
 */

const EMPTY = Object.freeze({ dm: null, group: Object.freeze({}), channel: Object.freeze({}) });

let snapshot = EMPTY;
const listeners = new Set();

function publish(next) {
  if (next === snapshot) return;
  snapshot = next;
  for (const fn of Array.from(listeners)) {
    try {
      fn();
    } catch {
      /* a broken subscriber must not stop the others */
    }
  }
}

export function getTypingSnapshot() {
  return snapshot;
}

export function subscribeTyping(fn) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function resolve(value, current) {
  return typeof value === "function" ? value(current) : value;
}

/** setState-style: a value or an updater (current DM typer -> next). */
export function setTypingDm(value) {
  const next = resolve(value, snapshot.dm) ?? null;
  if (next === snapshot.dm) return;
  publish({ ...snapshot, dm: next });
}

/** Replace the per-group typing maps object (same identity = no change). */
export function setTypingGroups(value) {
  const next = resolve(value, snapshot.group) || EMPTY.group;
  if (next === snapshot.group) return;
  publish({ ...snapshot, group: next });
}

/** Replace the per-channel typing maps object (same identity = no change). */
export function setTypingChannels(value) {
  const next = resolve(value, snapshot.channel) || EMPTY.channel;
  if (next === snapshot.channel) return;
  publish({ ...snapshot, channel: next });
}

export function resetTyping() {
  publish(EMPTY);
}
