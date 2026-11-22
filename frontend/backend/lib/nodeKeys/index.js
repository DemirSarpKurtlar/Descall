"use strict";

/**
 * placeholder: agent 3 owns this file.
 *
 * Node key store interface used by routes/node.js:
 *   verify(secret) -> { ok, keyId }   (may also return a Promise of that)
 * Keys look like `dsk_node_` + 43 base64url chars; only their SHA-256 is kept, like admin
 * tokens. This placeholder keeps the hashes in memory (empty at start, so every bearer is
 * refused); agent 3's version reads them from the node_keys table.
 */

const crypto = require("crypto");

const KEY_RE = /^dsk_node_[A-Za-z0-9_-]{43}$/;
const byHash = new Map(); // sha256 hex -> { id, revoked }

function sha256(secret) {
  return crypto.createHash("sha256").update(String(secret), "utf8").digest("hex");
}

function verify(secret) {
  const s = String(secret || "");
  if (!KEY_RE.test(s)) return { ok: false, keyId: null };
  const row = byHash.get(sha256(s));
  if (!row || row.revoked) return { ok: false, keyId: null };
  return { ok: true, keyId: row.id };
}

/** Tests only: register a key, returns its id. */
function __addForTests(secret, id = `nk_${byHash.size + 1}`) {
  byHash.set(sha256(secret), { id, revoked: false });
  return id;
}

/** Tests only: revoke by id. */
function __revokeForTests(id) {
  for (const row of byHash.values()) if (row.id === id) row.revoked = true;
}

module.exports = { verify, KEY_RE, __addForTests, __revokeForTests };
