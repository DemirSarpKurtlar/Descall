"use strict";

/** Table-peek routes stay off unless this is explicitly set. NODE_ENV is not enough. */
function debugRoutesEnabled(env = process.env) {
  return String(env.ENABLE_DEBUG_ROUTES || "").trim().toLowerCase() === "true";
}

module.exports = { debugRoutesEnabled };
