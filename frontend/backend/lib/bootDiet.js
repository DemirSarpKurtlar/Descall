"use strict";

/**
 * Boot diet (2.11.7, scale plan S3). A reconnecting client (Render restart, edge
 * bridge restart, network flap) sends the hash of the friend list it already
 * shows; if the server's list is identical it gets a 30-byte "same" instead of
 * the whole list again. Kill switch: featureFlags.bootDiet.
 */
const crypto = require("crypto");

function listHash(list) {
  return crypto.createHash("sha1").update(JSON.stringify(list ?? [])).digest("base64url").slice(0, 22);
}

/** Emits friend:list or friend:list:same, then boot:hash. */
function emitBootFriendList(socket, list, { enabled = true } = {}) {
  if (!enabled) {
    socket.emit("friend:list", list);
    return "full";
  }
  const h = listHash(list);
  const theirs = socket?.handshake?.auth?.bootFriends;
  const same = typeof theirs === "string" && theirs === h;
  if (same) socket.emit("friend:list:same", { h });
  else socket.emit("friend:list", list);
  socket.emit("boot:hash", { friends: h });
  return same ? "same" : "full";
}

module.exports = { listHash, emitBootFriendList };
