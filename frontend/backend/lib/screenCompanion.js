"use strict";

/**
 * iOS whole-screen sharing (ReplayKit broadcast, docs/ios-screen-share.md).
 *
 * The iPhone / iPad app publishes the broadcast through a second LiveKit
 * participant, the user's "screen companion": identity `<userId>:screen`,
 * allowed to publish screen share only and never to subscribe. Clients render
 * that participant as the owner's screen share (src/lib/screenCompanion.js),
 * never as an extra member.
 *
 * Issued companions are remembered per channel so leaving voice (or being
 * kicked / moved / timed out) also removes the companion from the LiveKit
 * room, even when the app could not stop it itself.
 */

const SCREEN_COMPANION_SUFFIX = ":screen";
const SCREEN_COMPANION_TTL = "10m";

/** channelId -> Set<userId> with a companion token minted for the current seat. */
const issued = new Map();

function screenCompanionIdentity(userId) {
  const uid = String(userId == null ? "" : userId).trim();
  if (!uid || uid.includes(":")) return null;
  return `${uid}${SCREEN_COMPANION_SUFFIX}`;
}

/** `<userId>:screen` -> userId; anything else -> null. */
function companionOwner(identity) {
  const value = String(identity == null ? "" : identity);
  if (!value.endsWith(SCREEN_COMPANION_SUFFIX)) return null;
  const owner = value.slice(0, -SCREEN_COMPANION_SUFFIX.length);
  return owner && !owner.includes(":") ? owner : null;
}

function markCompanionIssued(channelId, userId) {
  const cid = String(channelId || "");
  const uid = String(userId || "");
  if (!cid || !uid) return;
  let set = issued.get(cid);
  if (!set) {
    set = new Set();
    issued.set(cid, set);
  }
  set.add(uid);
}

/** True (and forgotten) when a companion was issued for this seat. */
function takeCompanionIssued(channelId, userId) {
  const cid = String(channelId || "");
  const set = issued.get(cid);
  if (!set) return false;
  const had = set.delete(String(userId || ""));
  if (!set.size) issued.delete(cid);
  return had;
}

function resetCompanionsForTest() {
  issued.clear();
}

module.exports = {
  SCREEN_COMPANION_SUFFIX,
  SCREEN_COMPANION_TTL,
  screenCompanionIdentity,
  companionOwner,
  markCompanionIssued,
  takeCompanionIssued,
  resetCompanionsForTest,
};
