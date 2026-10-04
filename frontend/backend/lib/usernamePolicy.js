"use strict";

/**
 * Username rules shared by sign-up, Google sign-up and the in-app rename flow.
 *
 * Admin powers are still partly tied to the literal username "admin" (JWT checks,
 * admin sockets), so that name and look-alike staff names are reserved: nobody may
 * register or rename into them, and the "admin" account itself cannot be renamed.
 */
const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "admins",
  "root",
  "system",
  "descall",
  "descallteam",
  "descall-team",
  "descall_team",
  "official",
  "support",
  "staff",
  "moderator",
  "mod",
  "security",
  "help",
  "dimaai",
  "null",
  "undefined",
  "everyone",
  "here",
]);

const PROTECTED_ACCOUNT_USERNAMES = new Set(["admin"]);

function normalizeUsername(raw) {
  return String(raw || "").trim().toLowerCase();
}

function isReservedUsername(raw) {
  return RESERVED_USERNAMES.has(normalizeUsername(raw));
}

function isProtectedAccountUsername(raw) {
  return PROTECTED_ACCOUNT_USERNAMES.has(normalizeUsername(raw));
}

/** Escape LIKE/ILIKE wildcards so "a_b" only matches "a_b" (case-insensitively). */
function escapeLike(value) {
  return String(value || "").replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

module.exports = {
  RESERVED_USERNAMES,
  isReservedUsername,
  isProtectedAccountUsername,
  normalizeUsername,
  escapeLike,
};
