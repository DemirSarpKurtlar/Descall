/**
 * As-you-type sign-up checks for the register forms (AuthView, MarketingAuthModal).
 * Mirrors backend/lib/signupRules.js + lib/passwordPolicy.js (same limits, same codes,
 * same English messages, which the catalogs already translate); signupRules.selftest.mjs
 * runs both on the same inputs. The server stays the source of truth and still runs
 * the breach check; COMMON_PASSWORDS only catches the obvious ones before submit.
 */
import { signupEmailError } from "./signupEmail.js";

export const USERNAME_MIN = 2;
export const USERNAME_MAX = 24;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;
const USERNAME_CHARS_RE = /^[a-zA-Z0-9_.-]+$/;

// Same list as backend/lib/usernamePolicy.js RESERVED_USERNAMES.
const RESERVED = new Set([
  "admin", "administrator", "admins", "root", "system", "descall", "descallteam", "descall-team", "descall_team",
  "official", "support", "staff", "moderator", "mod", "security", "help", "null", "undefined", "everyone", "here",
]);

export const SIGNUP_MESSAGES = {
  username_short: "Username must be at least 2 characters.",
  username_long: "Username must be at most 24 characters.",
  username_chars: "Username may only contain letters, numbers, underscores, hyphens, and dots.",
  username_reserved: "That username is reserved. Please pick another one.",
  username_taken: "Username is already taken.",
  password_short: "Password must be at least 8 characters.",
  password_breached: "This password has appeared in data breaches. Choose a different password.",
  email_missing: "Email is required.",
  email_invalid: "Enter a valid email address.",
  email_taken: "Email is already in use.",
};

/** Code of the first username rule that fails, or null. */
export function usernameIssue(raw) {
  const v = String(raw ?? "").trim();
  if (v.length < USERNAME_MIN) return "username_short";
  if (v.length > USERNAME_MAX) return "username_long";
  if (!USERNAME_CHARS_RE.test(v)) return "username_chars";
  if (RESERVED.has(v.toLowerCase())) return "username_reserved";
  return null;
}

// Passwords every breach list has; the server's breach check refuses them anyway.
const COMMON_PASSWORDS = new Set([
  "12345678", "123456789", "1234567890", "12345678910", "123123123", "987654321", "11111111", "00000000",
  "88888888", "12341234", "11223344", "12344321", "password", "password1", "password123", "passw0rd",
  "qwertyui", "qwerty123", "qwerty12", "qwertyuiop", "1q2w3e4r", "1qaz2wsx", "asdfghjk", "asdfghjkl",
  "zxcvbnm1", "abcd1234", "abc12345", "a1234567", "aa123456", "iloveyou", "sunshine", "princess",
  "football", "baseball", "superman", "trustno1", "letmein1", "welcome1", "dragon12", "monkey12",
  "galatasaray", "fenerbahce", "besiktas", "trabzonspor", "sifre123", "sifresifre", "parola123",
]);

/** Code of the first password rule that fails, or null. */
export function passwordIssue(raw) {
  const v = String(raw ?? "");
  if (v.length < PASSWORD_MIN) return "password_short";
  if (v.length > PASSWORD_MAX) return "password_long";
  const lower = v.toLowerCase();
  if (COMMON_PASSWORDS.has(lower) || /^(.)\1+$/.test(v)) return "password_breached";
  return null;
}

/** Code of the email rule that fails, or null (lib/signupEmail.js rule). */
export function emailIssue(raw) {
  const msg = signupEmailError(raw);
  if (!msg) return null;
  return String(raw ?? "").trim() ? "email_invalid" : "email_missing";
}

/** English message (a catalog key) for a code. */
export function signupMessage(code) {
  return SIGNUP_MESSAGES[code] || null;
}

const TR_ASCII = { ç: "c", ğ: "g", ı: "i", İ: "I", ö: "o", ş: "s", ü: "u", Ç: "C", Ğ: "G", Ö: "O", Ş: "S", Ü: "U" };

/**
 * A username the rules accept, made from what was typed ("Şükrü Kaya" -> "sukru_kaya"),
 * or "" when nothing usable is left. Offered as a one-tap fix, never applied silently.
 */
export function usernameSuggestion(raw) {
  const s = String(raw ?? "")
    .trim()
    .replace(/[çğıİöşüÇĞÖŞÜ]/g, (c) => TR_ASCII[c] || c)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_.-]/g, "")
    .replace(/_{2,}/g, "_")
    .replace(/^[_.-]+|[_.-]+$/g, "")
    .slice(0, USERNAME_MAX);
  return s && !usernameIssue(s) && s !== String(raw ?? "").trim() ? s : "";
}

/** Field of a server failure code (backend lib/signupRules.js fieldOf). */
export function fieldOfCode(code) {
  const c = String(code || "");
  if (c.startsWith("username_")) return "username";
  if (c.startsWith("password_") || c === "weak_password" || c === "pwned") return "password";
  if (c.startsWith("email_") || c === "EMAIL_REQUIRED" || c === "EMAIL_INVALID") return "email";
  return null;
}
