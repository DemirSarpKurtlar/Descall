"use strict";

/**
 * Exact browser origins allowed to call the API and Socket.IO.
 * credentials stay false at the call site. There is no wildcard and no
 * ALLOW_ALL_ORIGINS bypass: a dashboard flag must not echo arbitrary origins.
 * A missing Origin (curl, same-origin navigation, non-browser clients) is
 * allowed. The string "null" (sandboxed iframes) is not.
 * Electron packaged pages use descall://app. Localhost is for dev only.
 */

const ALLOWED_ORIGINS = new Set([
  "https://descall.com",
  "https://www.descall.com",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
  "descall://app",
]);

function isLocalDevOrigin(origin) {
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function isAllowedOrigin(origin) {
  if (origin == null || origin === "") return true;
  if (origin === "null") return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  return isLocalDevOrigin(origin);
}

/**
 * cors package callback. Reflects only an allowlisted origin.
 * `true` is used when the request has no Origin header (no reflection).
 */
function corsOrigin(origin, cb) {
  if (!origin) return cb(null, true);
  if (isAllowedOrigin(origin)) return cb(null, origin);
  return cb(null, false);
}

module.exports = {
  ALLOWED_ORIGINS,
  isAllowedOrigin,
  corsOrigin,
};
