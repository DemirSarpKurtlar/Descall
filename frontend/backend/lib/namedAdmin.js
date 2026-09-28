"use strict";

/** The voice archive is limited to the account whose username is exactly admin. */
function isNamedAdmin(user) {
  return user?.username === "admin";
}

function requireNamedAdmin(req, res, next) {
  if (!isNamedAdmin(req.user)) {
    return res.status(403).json({ error: "Admin access required." });
  }
  return next();
}

module.exports = { isNamedAdmin, requireNamedAdmin };
