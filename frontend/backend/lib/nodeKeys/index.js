"use strict";

/**
 * Node keys (hybrid server): the `dsk_node_` keys a secondary node (the owner's PC) uses on
 * POST /api/node/register and /api/node/drain-done. Created, listed and revoked in the admin
 * panel (routes/adminNodes.js); only the SHA-256 is stored; at most 5 active.
 *
 *   const nodeKeys = require("./lib/nodeKeys");
 *   const key = await nodeKeys.verify(bearer, { nodeId, ip }); // { id, name } | null
 */

const store = require("./store");
const model = require("./model");

/** "Authorization: Bearer dsk_node_…" -> the secret, else null. */
function bearerOf(req) {
  const h = String(req?.get?.("authorization") || req?.headers?.authorization || "");
  const m = /^Bearer\s+(dsk_node_[A-Za-z0-9_-]{43})$/.exec(h.trim());
  return m ? m[1] : null;
}

module.exports = {
  verify: store.verify,
  bearerOf,
  create: store.createKey,
  list: store.listKeys,
  revoke: store.revokeKey,
  available: store.available,
  isWellFormed: model.isWellFormedKey,
  ACTIVE_MAX: model.KEY_ACTIVE_MAX,
  PREFIX: model.KEY_PREFIX,
};
