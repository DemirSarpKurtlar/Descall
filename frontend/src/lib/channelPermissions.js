/**
 * Per-channel permissions of the signed-in member (server audit P2 / DF-4).
 *
 * The composer, voice join, slowmode bypass and message moderation used to read the
 * server-wide flags only, so channel overwrites were ignored both ways: a read-only
 * #rules showed a working composer, a channel that granted SEND to a role hid it.
 * The backend answers `server:channels:permissions` with this member's effective bits
 * for every channel it can see (same math as the send / join checks, including the
 * read-only announcement rule and timeouts). This module caches that per server and
 * refreshes it when roles, overwrites or channels change.
 *
 * Until the answer arrives (or with an old backend) the helpers fall back to the
 * server-wide flags, which is the previous behaviour.
 */
import { useEffect, useSyncExternalStore } from "react";
import { PERM_BITS, serverHasPermission } from "./serverPermissions";

const EXTRA_BITS = { SEND_VOICE_MESSAGES: 1n << 46n };
const store = new Map(); // serverId -> { channels: { [id]: { bits, send } }, timedOut, isOwner, at }
const inflight = new Map(); // serverId -> token
const timers = new Map(); // serverId -> debounce timer
const listeners = new Set();

function notify() {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function key(serverId) {
  return serverId == null ? "" : String(serverId);
}

/** Ask the server for this member's channel bits of `serverId` (one in flight per server). */
export function requestChannelPerms(socket, serverId, { force = false } = {}) {
  const id = key(serverId);
  if (!socket || !id || typeof socket.emit !== "function") return;
  if (inflight.has(id) && !force) return;
  const token = {};
  inflight.set(id, token);
  const done = () => {
    if (inflight.get(id) === token) inflight.delete(id);
  };
  const timer = setTimeout(done, 8000);
  try {
    socket.emit("server:channels:permissions", { serverId: id }, (res) => {
      clearTimeout(timer);
      if (inflight.get(id) !== token) return;
      done();
      if (!res || res.ok !== true) {
        if (res?.code === "NOT_MEMBER" && store.delete(id)) notify();
        return;
      }
      store.set(id, {
        channels: res.channels && typeof res.channels === "object" ? res.channels : {},
        timedOut: res.timedOut || null,
        isOwner: Boolean(res.isOwner),
        at: Date.now(),
      });
      notify();
    });
  } catch {
    clearTimeout(timer);
    done();
  }
}

/** Refresh soon (debounced): several role / overwrite events usually arrive together. */
export function invalidateChannelPerms(socket, serverId) {
  const ids = serverId ? [key(serverId)] : [...store.keys()];
  for (const id of ids) {
    if (!id) continue;
    clearTimeout(timers.get(id));
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id);
        requestChannelPerms(socket, id, { force: true });
      }, 250)
    );
  }
}

export function getChannelPerms(serverId) {
  return store.get(key(serverId)) || null;
}

export function forgetChannelPerms(serverId) {
  if (store.delete(key(serverId))) notify();
}

/** React: the cached entry for `serverId`, loaded on first use. */
export function useChannelPerms(socket, serverId) {
  const id = key(serverId);
  const read = () => (id ? store.get(id) || null : null);
  const snap = useSyncExternalStore(subscribe, read, read);
  useEffect(() => {
    if (!socket || !id) return undefined;
    if (!store.has(id)) requestChannelPerms(socket, id);
    const onConnect = () => requestChannelPerms(socket, id, { force: true });
    socket.on?.("connect", onConnect);
    return () => socket.off?.("connect", onConnect);
  }, [socket, id]);
  return snap;
}

function bitOf(name) {
  return PERM_BITS[name] ?? EXTRA_BITS[name] ?? null;
}

/** True once this member's bits for that channel are known. */
export function channelPermsKnown(perms, channelId) {
  return Boolean(perms?.channels && channelId != null && perms.channels[String(channelId)]);
}

/**
 * May the member use `permName` in that channel? Channel bits when known, else the
 * server-wide flags. SEND_MESSAGES also honours read-only announcement channels and
 * timeouts (the server computes `send`).
 */
export function channelHasPermission(server, channelId, permName, perms = getChannelPerms(server?.id)) {
  if (!server) return false;
  const entry = channelId != null ? perms?.channels?.[String(channelId)] : null;
  if (entry) {
    if (permName === "SEND_MESSAGES") return Boolean(entry.send);
    // A timed-out member keeps only viewing and reading history.
    if (perms.timedOut && permName !== "VIEW_CHANNEL" && permName !== "READ_MESSAGE_HISTORY") return false;
    const bit = bitOf(permName);
    if (bit == null) return false;
    let bits = 0n;
    try {
      bits = BigInt(entry.bits || "0");
    } catch {
      bits = 0n;
    }
    if ((bits & PERM_BITS.ADMINISTRATOR) === PERM_BITS.ADMINISTRATOR) return true;
    return (bits & bit) === bit;
  }
  if (permName === "SEND_VOICE_MESSAGES") return serverHasPermission(server, "SEND_MESSAGES");
  return serverHasPermission(server, permName);
}

/** Text-like server channels: text and announcement (server audit DF-5 / SK-8). */
export function isTextLikeChannel(channel) {
  return channel?.type === "text" || channel?.type === "announcement";
}

/** Test hook. */
export function __resetChannelPerms() {
  store.clear();
  inflight.clear();
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
}
