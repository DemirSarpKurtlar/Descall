/**
 * Bad-word masking for the native iOS app (App Review). Web and desktop show
 * text unchanged. Display-only: stored / sent / edited text is never touched.
 *
 * Word list = built-in list (backend/config/profanityWords.json, shared with the
 * APNs alert masking in backend/lib/profanity.js) + admin-managed words from
 * GET /api/features/profanity. A trailing * means prefix match.
 */
import builtInList from "../../backend/config/profanityWords.json";

const MASK = "***";
const TOKEN_RE = /[\p{L}\p{N}]+/gu;

function normalizeWord(value) {
  return String(value || "")
    .replace(/İ/g, "i")
    .toLowerCase()
    .normalize("NFC")
    .trim();
}

export function compileWordList(words) {
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

export function maskWithList(text, compiled) {
  if (typeof text !== "string" || !text) return text;
  return text.replace(TOKEN_RE, (token) => (isBadToken(token, compiled) ? MASK : token));
}

const BUILT_IN_WORDS = Array.isArray(builtInList?.words) ? builtInList.words : [];
let compiled = compileWordList(BUILT_IN_WORDS);

/** Merge admin-managed extra words (from /api/features/profanity). */
export function setExtraProfanityWords(words) {
  const extra = Array.isArray(words) ? words.filter((w) => typeof w === "string") : [];
  compiled = compileWordList([...BUILT_IN_WORDS, ...extra]);
}

function isNativeIosShell() {
  try {
    const cap = typeof window !== "undefined" ? window.Capacitor : null;
    return Boolean(cap?.isNativePlatform?.() && cap.getPlatform?.() === "ios");
  } catch {
    return false;
  }
}

/** Mask bad words with *** regardless of platform. */
export function maskProfanity(text) {
  return maskWithList(text, compiled);
}

/** Text as it should be displayed: masked in the native iOS app, unchanged elsewhere. */
export function displayText(text) {
  if (!isNativeIosShell()) return text;
  return maskWithList(text, compiled);
}

export function profanityMaskingActive() {
  return isNativeIosShell();
}
