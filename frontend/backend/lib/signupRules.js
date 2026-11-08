"use strict";

/**
 * Sign-up field rules with a stable code per failing rule (2026-11 sign-up form work).
 *
 * The codes are what Kayıt İstatistikleri stores in signup_attempts.reason_detail, so
 * the admin can see which field stops people. src/lib/signupRules.js mirrors these rules
 * for the as-you-type checks in the register forms (src/lib/signupRules.selftest.mjs
 * compares both on the same inputs). Messages stay the existing English API phrases.
 */

const { isReservedUsername } = require("./usernamePolicy");
const { MIN_PASSWORD_LENGTH } = require("./passwordPolicy");

const USERNAME_MIN = 2;
const USERNAME_MAX = 24;
const USERNAME_CHARS_RE = /^[a-zA-Z0-9_.-]+$/;
const PASSWORD_MAX = 72;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX = 254;

const USERNAME_MESSAGES = {
  username_short: "Username must be at least 2 characters.",
  username_long: "Username must be at most 24 characters.",
  username_chars: "Username may only contain letters, numbers, underscores, hyphens, and dots.",
  username_reserved: "That username is reserved. Please pick another one.",
};

/** { code, message } for the first username rule that fails, or null. */
function usernameIssue(username) {
  // Not a string: only a broken client sends that; it reads like an empty field.
  if (typeof username !== "string") return { code: "username_type", message: USERNAME_MESSAGES.username_short };
  const v = username.trim();
  let code = null;
  if (v.length < USERNAME_MIN) code = "username_short";
  else if (v.length > USERNAME_MAX) code = "username_long";
  else if (!USERNAME_CHARS_RE.test(v)) code = "username_chars";
  else if (isReservedUsername(v)) code = "username_reserved";
  return code ? { code, message: USERNAME_MESSAGES[code] } : null;
}

/** Length / type rule code of a new password (the breach check is separate), or null. */
function passwordLengthCode(password) {
  if (typeof password !== "string") return "password_type";
  if (password.length < MIN_PASSWORD_LENGTH) return "password_short";
  if (password.length > PASSWORD_MAX) return "password_long";
  return null;
}

/** "email_missing" | "email_invalid" | null for an already trimmed, lower-cased value. */
function emailIssueCode(email) {
  const v = String(email ?? "").trim();
  if (!v) return "email_missing";
  if (v.length > EMAIL_MAX || !EMAIL_RE.test(v)) return "email_invalid";
  return null;
}

/** Every reason_detail value the register route can write (signup_attempts). */
const SIGNUP_FAIL_DETAILS = [
  "registration_closed",
  "access_banned",
  "terms_missing",
  "birth_date_invalid",
  "under_age",
  "username_type",
  "username_short",
  "username_long",
  "username_chars",
  "username_reserved",
  "username_taken",
  "password_type",
  "password_short",
  "password_long",
  "password_breached",
  "email_missing",
  "email_invalid",
  "email_taken",
];

/** Field a failure code belongs to (the register forms mark that input). */
function fieldOf(code) {
  const c = String(code || "");
  if (c.startsWith("username_")) return "username";
  if (c.startsWith("password_")) return "password";
  if (c.startsWith("email_")) return "email";
  if (c === "birth_date_invalid" || c === "under_age") return "birthDate";
  if (c === "terms_missing") return "terms";
  return null;
}

module.exports = {
  USERNAME_MIN,
  USERNAME_MAX,
  USERNAME_CHARS_RE,
  PASSWORD_MAX,
  EMAIL_RE,
  USERNAME_MESSAGES,
  SIGNUP_FAIL_DETAILS,
  usernameIssue,
  passwordLengthCode,
  emailIssueCode,
  fieldOf,
};
