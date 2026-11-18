"use strict";

/**
 * Friend request limits (17 Nov polish scan, world-social-05).
 *
 * A sender could loop request -> remove (deletes the pending row) -> request and every
 * round pushed the target (web push, FCM, iOS alert, in-app, re-engagement e-mail).
 *   - per sender: at most SENDER_MAX requests in SENDER_WINDOW_MS;
 *   - per sender -> target pair: at most PAIR_MAX requests in PAIR_WINDOW_MS;
 *   - pushes: only the first request of a pair in PUSH_WINDOW_MS notifies the target's
 *     devices; later ones still appear in the pending list.
 * In memory, like lib/rateLimit.js (resets with the process).
 */

const { recordFailure } = require("./rateLimit");

const SENDER_WINDOW_MS = 10 * 60 * 1000;
const SENDER_MAX = 20;
const PAIR_WINDOW_MS = 24 * 60 * 60 * 1000;
const PAIR_MAX = 3;
const PUSH_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_PUSH_KEYS = 50000;

const TOO_MANY = "Too many friend requests. Try again later.";

const lastPush = new Map();

/** { ok } or { ok: false, error, retryAfterSec } for one more request from sender to target. */
function takeFriendRequest(senderId, targetId, now = Date.now()) {
  const s = String(senderId || "");
  const t = String(targetId || "");
  if (!s || !t) return { ok: true };
  const pair = recordFailure(`friendreq:pair:${s}:${t}`, { windowMs: PAIR_WINDOW_MS, max: PAIR_MAX, now });
  if (!pair.ok) return { ok: false, error: TOO_MANY, retryAfterSec: pair.retryAfterSec };
  const sender = recordFailure(`friendreq:sender:${s}`, { windowMs: SENDER_WINDOW_MS, max: SENDER_MAX, now });
  if (!sender.ok) return { ok: false, error: TOO_MANY, retryAfterSec: sender.retryAfterSec };
  return { ok: true };
}

/** True for the first request of this pair in PUSH_WINDOW_MS (then remembers it). */
function shouldPushFriendRequest(senderId, targetId, now = Date.now()) {
  const key = `${senderId}:${targetId}`;
  const at = lastPush.get(key);
  if (at && now - at < PUSH_WINDOW_MS) return false;
  if (lastPush.size >= MAX_PUSH_KEYS) {
    for (const [k, v] of lastPush) {
      if (now - v >= PUSH_WINDOW_MS) lastPush.delete(k);
    }
    if (lastPush.size >= MAX_PUSH_KEYS) lastPush.delete(lastPush.keys().next().value);
  }
  lastPush.set(key, now);
  return true;
}

function resetFriendRequestLimits() {
  lastPush.clear();
}

module.exports = {
  TOO_MANY,
  SENDER_MAX,
  PAIR_MAX,
  takeFriendRequest,
  shouldPushFriendRequest,
  resetFriendRequestLimits,
};
