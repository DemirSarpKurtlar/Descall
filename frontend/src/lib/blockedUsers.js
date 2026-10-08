/**
 * Users I have blocked (users.blocked_users, from /auth/me). Shared store so the
 * profile popout, DM header, context menus and message list stay in sync.
 * The backend enforces the block (no DMs, friend requests or calls either way);
 * the client hides / collapses messages from people I blocked.
 */
import { useSyncExternalStore } from "react";
import { blockUser, unblockUser } from "../api/friends";

let blocked = new Set();
const listeners = new Set();

function emit() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

export function setBlockedUserIds(ids) {
  const next = new Set(Array.isArray(ids) ? ids.filter((v) => typeof v === "string" && v) : []);
  if (next.size === blocked.size && [...next].every((id) => blocked.has(id))) return;
  blocked = next;
  emit();
}

export function getBlockedUserIds() {
  return blocked;
}

export function isBlockedByMe(userId) {
  return Boolean(userId) && blocked.has(String(userId));
}

export function subscribeBlockedUsers(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useBlockedUserIds() {
  return useSyncExternalStore(subscribeBlockedUsers, getBlockedUserIds, getBlockedUserIds);
}

export function useIsBlocked(userId) {
  const ids = useBlockedUserIds();
  return Boolean(userId) && ids.has(String(userId));
}

/** Block or unblock `userId`; updates the store from the server's answer. */
export async function setUserBlocked(userId, shouldBlock) {
  if (!userId) return getBlockedUserIds();
  const res = shouldBlock ? await blockUser(userId) : await unblockUser(userId);
  if (Array.isArray(res?.blockedUsers)) {
    setBlockedUserIds(res.blockedUsers);
  } else {
    const next = new Set(blocked);
    if (shouldBlock) next.add(String(userId));
    else next.delete(String(userId));
    setBlockedUserIds([...next]);
  }
  return getBlockedUserIds();
}

/**
 * Ask for confirmation, then block / unblock. Returns the new blocked state
 * (true / false) or null when the user cancelled. Throws on API errors.
 */
export async function confirmToggleBlock({ userId, username, t = (k) => k }) {
  if (!userId) return null;
  const blockedNow = isBlockedByMe(userId);
  const name = username || t("this user");
  const message = blockedNow
    ? t("Unblock {username}?", { username: name })
    : t("Block {username}? They won't be able to message you, call you, or send you friend requests, and their messages will be hidden.", { username: name });
  try {
    if (typeof window !== "undefined" && typeof window.confirm === "function" && !window.confirm(message)) {
      return null;
    }
  } catch {
    /* no confirm available: continue */
  }
  await setUserBlocked(userId, !blockedNow);
  return !blockedNow;
}
