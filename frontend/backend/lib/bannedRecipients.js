"use strict";

/**
 * Push senders (web push, FCM, APNs alert, VoIP) skip banned accounts: a
 * banned user must not keep receiving message, call or friend pushes. Reads
 * the in-memory ban set (lib/moderation.js keeps it in sync), no database call.
 */

const { bannedUserIds, banDetailsByUser } = require("../runtime/sharedState");

function isBannedNow(userId, now = Date.now()) {
  const id = String(userId);
  if (!bannedUserIds.has(id)) return false;
  const expiresAt = banDetailsByUser.get(id)?.expiresAt;
  return !(expiresAt && new Date(expiresAt).getTime() <= now);
}

/** `userIds` without banned accounts (order kept). */
function withoutBanned(userIds) {
  return (userIds || []).filter((id) => id && !isBannedNow(id));
}

module.exports = { isBannedNow, withoutBanned };
