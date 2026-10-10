"use strict";

const crypto = require("crypto");

const MIN_PASSWORD_LENGTH = 10;
const MAX_PASSWORD_LENGTH = 72;
const HIBP_TIMEOUT_MS = 2000;

function passwordLengthError(password) {
  if (typeof password !== "string") return "Şifre metin olmalı.";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return "Şifre en az 10 karakter olmalı.";
  }
  if (password.length > MAX_PASSWORD_LENGTH) return "Şifre en fazla 72 karakter olabilir.";
  return null;
}

/**
 * Have I Been Pwned k-anonymity range lookup. Fail open when the API is
 * down or slower than 2 seconds — a breach list outage must not block signup.
 */
async function isPwnedPassword(password, fetchImpl = fetch) {
  const hash = crypto.createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HIBP_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`https://api.pwnedpasswords.com/range/${prefix}`, {
      signal: ctrl.signal,
      headers: { "Add-Padding": "true" },
    });
    if (!res.ok) return false;
    const text = await res.text();
    return text.split(/\r?\n/).some((line) => line.split(":")[0].trim().toUpperCase() === suffix);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function checkNewPassword(password, { fetchImpl = fetch, env = process.env } = {}) {
  const lengthError = passwordLengthError(password);
  if (lengthError) return { error: lengthError, code: "weak_password" };
  if (String(env.PASSWORD_HIBP || "1") === "0") return { error: null, code: null };
  const pwned = await isPwnedPassword(password, fetchImpl);
  if (pwned) {
    return {
      error: "Bu şifre veri ihlallerinde görünmüş. Başka bir şifre seç.",
      code: "pwned",
    };
  }
  return { error: null, code: null };
}

module.exports = {
  MIN_PASSWORD_LENGTH,
  passwordLengthError,
  isPwnedPassword,
  checkNewPassword,
};
