"use strict";

/**
 * When a friendship / friend request started, for list ordering
 * (newest first, Discord style). The database row's created_at is the
 * request time; an accept seen by this process is remembered as "now" so a
 * fresh friendship sorts to the top right away. Memory only: after a restart
 * the request time is used, which is still close.
 */
const friendSince = new Map(); // "a|b" (sorted) -> ISO
const requestSince = new Map(); // "from>to" -> ISO

const pairKey = (a, b) => (String(a) < String(b) ? `${a}|${b}` : `${b}|${a}`);
const reqKey = (from, to) => `${from}>${to}`;
const iso = (v) => {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

/** From a DB row; never overrides a value this process already knows. */
function rememberFriendSince(a, b, at) {
  const v = iso(at);
  if (!a || !b || !v) return;
  const k = pairKey(a, b);
  if (!friendSince.has(k)) friendSince.set(k, v);
}

/** A friendship was just accepted. */
function markFriendsNow(a, b, now = Date.now()) {
  if (!a || !b) return;
  friendSince.set(pairKey(a, b), new Date(now).toISOString());
  requestSince.delete(reqKey(a, b));
  requestSince.delete(reqKey(b, a));
}

function friendSinceFor(a, b) {
  return friendSince.get(pairKey(a, b)) || null;
}

function forgetFriendship(a, b) {
  friendSince.delete(pairKey(a, b));
  requestSince.delete(reqKey(a, b));
  requestSince.delete(reqKey(b, a));
}

function rememberRequest(from, to, at) {
  const v = iso(at);
  if (!from || !to || !v) return;
  const k = reqKey(from, to);
  if (!requestSince.has(k)) requestSince.set(k, v);
}

function markRequestNow(from, to, now = Date.now()) {
  if (!from || !to) return;
  requestSince.set(reqKey(from, to), new Date(now).toISOString());
}

function requestSinceFor(from, to) {
  return requestSince.get(reqKey(from, to)) || null;
}

/** Newest first; unknown times last, then by name for a stable order. */
function newestFirst(list, key) {
  return [...list].sort((a, b) => {
    const ta = Date.parse(a?.[key] || "") || 0;
    const tb = Date.parse(b?.[key] || "") || 0;
    if (tb !== ta) return tb - ta;
    return String(a?.username || "").localeCompare(String(b?.username || ""));
  });
}

function _reset() {
  friendSince.clear();
  requestSince.clear();
}

module.exports = {
  rememberFriendSince,
  markFriendsNow,
  friendSinceFor,
  forgetFriendship,
  rememberRequest,
  markRequestNow,
  requestSinceFor,
  newestFirst,
  _reset,
};
