"use strict";

/** The Socket.IO server for growth 3B senders (set by server.js and by the routes). */
let ioRef = null;

function setIo(io) {
  if (io && typeof io.to === "function") ioRef = io;
}

function getIo() {
  return ioRef;
}

/** Emit to one account's sockets; never throws. */
function emitToUser(userId, event, payload) {
  try {
    ioRef?.to?.(`user:${userId}`)?.emit?.(event, payload);
    return Boolean(ioRef);
  } catch {
    return false;
  }
}

module.exports = { setIo, getIo, emitToUser };
