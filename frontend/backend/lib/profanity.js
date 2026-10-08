"use strict";

/**
 * Bad-word masking for text shown in the native iOS app (APNs alert bodies).
 * Mirrors frontend/src/lib/profanity.js. Words come from the built-in list in
 * config/profanityWords.json plus the admin-managed list (state.profanityWords).
 * Stored message text is never changed.
 */

const DEFAULT_WORDS = require("../config/profanityWords.json").words;

const MASK = "***";
const TOKEN_RE = /[\p{L}\p{N}]+/gu;

function normalizeWord(value) {
  return String(value || "")
    .replace(/İ/g, "i")
    .toLowerCase()
    .normalize("NFC")
    .trim();
}

function compileWordList(words) {
  const exact = new Set();
  const prefixes = [];
  for (const raw of words || []) {
    const w = normalizeWord(raw);
    if (!w) continue;
    if (w.endsWith("*")) {
      const stem = w.slice(0, -1);
      if (stem.length >= 2) prefixes.push(stem);
    } else {
      exact.add(w);
    }
  }
  return { exact, prefixes };
}

function isBadToken(token, compiled) {
  const n = normalizeWord(token);
  if (compiled.exact.has(n)) return true;
  for (const stem of compiled.prefixes) {
    if (n.startsWith(stem)) return true;
  }
  return false;
}

function maskWithList(text, compiled) {
  if (typeof text !== "string" || !text) return text;
  return text.replace(TOKEN_RE, (token) => (isBadToken(token, compiled) ? MASK : token));
}

let cacheKey = null;
let cacheCompiled = null;

function compiledForState(state) {
  const extra = state?.profanityWords ? Array.from(state.profanityWords) : [];
  const key = extra.join("\u0000");
  if (key !== cacheKey || !cacheCompiled) {
    cacheCompiled = compileWordList([...DEFAULT_WORDS, ...extra]);
    cacheKey = key;
  }
  return cacheCompiled;
}

/** Mask bad words with *** using the built-in + admin list from shared state. */
function maskProfanity(text, state = require("../runtime/sharedState")) {
  return maskWithList(text, compiledForState(state));
}

module.exports = { maskProfanity, maskWithList, compileWordList, DEFAULT_WORDS, MASK };
