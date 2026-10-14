"use strict";

/**
 * App Review: the native iOS app must not start casino games or move casino
 * credits. The official client already hides the UI. This gate is the server
 * check, so a modified client that still speaks the game socket cannot deal,
 * spin, flip, or transfer credits.
 *
 * A socket is blocked when its handshake auth.platform is "ios".
 * While that iOS socket is still connected (mid-session), every other socket
 * for the same account is blocked too. Closing the iOS socket clears the
 * mark. Nothing here is written to the database, so a web or desktop session
 * that is not sharing the process with a live iOS socket is unchanged.
 */

const IOS_DENY_TEXT = "Casino games are not available in the iOS app.";

/** userId -> Set of socket ids whose handshake platform is ios */
const iosSocketsByUser = new Map();

function authPlatform(socket) {
  return String(socket?.handshake?.auth?.platform || "").trim().toLowerCase();
}

function isIosAuthSocket(socket) {
  return authPlatform(socket) === "ios";
}

function noteSocketPlatform(socket) {
  const userId = socket?.user?.id;
  const socketId = socket?.id;
  if (!userId || !socketId || !isIosAuthSocket(socket)) return;
  let set = iosSocketsByUser.get(userId);
  if (!set) {
    set = new Set();
    iosSocketsByUser.set(userId, set);
  }
  set.add(socketId);
}

function forgetSocketPlatform(socket) {
  const userId = socket?.user?.id;
  const socketId = socket?.id;
  if (!userId || !socketId) return;
  const set = iosSocketsByUser.get(userId);
  if (!set) return;
  set.delete(socketId);
  if (set.size === 0) iosSocketsByUser.delete(userId);
}

function iosSessionActive(userId) {
  const set = userId ? iosSocketsByUser.get(userId) : null;
  return Boolean(set && set.size > 0);
}

/**
 * @returns {null|"ios_socket"|"ios_session"}
 *   ios_socket  — this handshake is the iOS app
 *   ios_session — another live socket for this account is the iOS app
 */
function casinoBlockReason(socket) {
  if (isIosAuthSocket(socket)) return "ios_socket";
  const userId = socket?.user?.id;
  if (iosSessionActive(userId)) return "ios_session";
  return null;
}

function resetCasinoPlatformState() {
  iosSocketsByUser.clear();
}

module.exports = {
  IOS_DENY_TEXT,
  isIosAuthSocket,
  noteSocketPlatform,
  forgetSocketPlatform,
  iosSessionActive,
  casinoBlockReason,
  resetCasinoPlatformState,
};
