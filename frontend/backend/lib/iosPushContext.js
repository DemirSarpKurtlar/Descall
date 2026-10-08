"use strict";

/**
 * What each open iOS app is showing right now, so an alert push is not shown
 * for the chat the user is already looking at.
 *
 * The iOS app reports { token, foreground, chat } over its socket
 * ("push:ios-context") when it opens, changes chat, goes to the background,
 * and every ~15 s while visible. In-memory only: after a restart nothing is
 * suppressed until the app reports again (pushes are simply sent).
 *
 * Keyed by APNs alert token and bound to the reporting user, so a client can
 * only ever silence pushes for a token registered to its own account.
 */

const FRESH_MS = 35_000;
const MAX_ENTRIES = 20_000;

const byToken = new Map(); // token -> { userId, socketId, foreground, chat, at }

function normToken(token) {
  const t = String(token || "").trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(t) ? t : "";
}

/** "dm:<peerId>" | "group:<id>" | "channel:<id>" | "" */
function normChat(chat) {
  if (!chat || typeof chat !== "object") return "";
  const kind = String(chat.kind || "");
  const id = String(chat.id || "").slice(0, 64);
  if (!id || !["dm", "group", "channel"].includes(kind)) return "";
  return `${kind}:${id}`;
}

function report({ userId, socketId, token, foreground, chat, now = Date.now() } = {}) {
  const key = normToken(token);
  if (!userId || !key) return false;
  if (byToken.size >= MAX_ENTRIES && !byToken.has(key)) prune(now);
  byToken.set(key, {
    userId: String(userId),
    socketId: socketId || null,
    foreground: foreground === true,
    chat: normChat(chat),
    at: now,
  });
  return true;
}

/** Socket closed: that app can no longer be in the foreground. */
function clearSocket(socketId) {
  if (!socketId) return;
  for (const [key, entry] of byToken) {
    if (entry.socketId === socketId) byToken.delete(key);
  }
}

function liveEntry(token, userId, now) {
  const entry = byToken.get(normToken(token));
  if (!entry) return null;
  if (userId && entry.userId !== String(userId)) return null;
  if (!entry.foreground || now - entry.at > FRESH_MS) return null;
  return entry;
}

/** The app holding `token` is open and showing `chatKey` (e.g. "dm:<id>"). */
function isViewing(token, userId, chatKey, now = Date.now()) {
  if (!chatKey) return false;
  const entry = liveEntry(token, userId, now);
  return Boolean(entry && entry.chat === chatKey);
}

/** The app holding `token` is open in the foreground (any screen). */
function isForeground(token, userId, now = Date.now()) {
  return Boolean(liveEntry(token, userId, now));
}

function prune(now = Date.now()) {
  for (const [key, entry] of byToken) {
    if (now - entry.at > FRESH_MS) byToken.delete(key);
  }
}

function _reset() {
  byToken.clear();
}

setInterval(() => prune(), 60_000).unref?.();

module.exports = { report, clearSocket, isViewing, isForeground, normChat, prune, FRESH_MS, _reset };
