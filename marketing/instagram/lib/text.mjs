/**
 * Text helpers shared by the validator, the caption builder and the renderer.
 * No dependencies.
 */

// Pictographic emoji, flag halves, keycap combiner, variation selector 16 and the
// zero-width joiner. Digits and "#" carry the Emoji property but are not pictographic,
// so plain text and hashtags pass.
const EMOJI_RE = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u{FE0F}\u{20E3}\u{200D}]/u;

export function hasEmoji(text) {
  return EMOJI_RE.test(String(text ?? ""));
}

/** Words of one on-screen line (whitespace separated, punctuation-only tokens ignored). */
export function wordCount(line) {
  return String(line ?? "")
    .trim()
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Strip the *accent* markers used in on-screen lines. */
export function plainLine(line) {
  return String(line ?? "").replace(/\*/g, "");
}

/** Both lowercase forms: Turkish (I -> ı, İ -> i) and plain (I -> i). */
export function lowerForms(text) {
  const s = String(text ?? "");
  return [s.toLocaleLowerCase("tr-TR"), s.toLowerCase()];
}

/** Normalise for duplicate checks: lowercase, no accents markers, single spaces, no punctuation. */
export function normalizeForCompare(text) {
  return String(text ?? "")
    .toLocaleLowerCase("tr-TR")
    .replace(/\*/g, "")
    .replace(/[^\p{L}\p{N}#\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compile a policy phrase. "kötü*" matches at a word start with any suffix; "dns" only
 * as a whole word. Boundaries are Unicode letters/digits, so Turkish suffixes work.
 */
export function compilePhrase(phrase) {
  const raw = String(phrase).toLocaleLowerCase("tr-TR");
  const prefix = raw.endsWith("*");
  const body = escapeRe(prefix ? raw.slice(0, -1) : raw).replace(/\s+/g, "\\s+");
  const startsWord = /^[\p{L}\p{N}]/u.test(raw);
  const endsWord = /[\p{L}\p{N}]$/u.test(prefix ? raw.slice(0, -1) : raw);
  const start = startsWord ? "(?<![\\p{L}\\p{N}])" : "";
  const end = prefix || !endsWord ? "" : "(?![\\p{L}\\p{N}])";
  return new RegExp(start + body + end, "u");
}

/** First phrase of `phrases` found in `text`, or null. */
export function findPhrase(text, phrases) {
  const forms = lowerForms(text);
  for (const phrase of phrases) {
    const re = compilePhrase(phrase);
    if (forms.some((f) => re.test(f))) return phrase;
  }
  return null;
}

/** Hashtags in a text (#word, Unicode letters, digits and underscore). */
export function extractHashtags(text) {
  return [...String(text ?? "").matchAll(/#[\p{L}\p{N}_]+/gu)].map((m) => m[0]);
}

export function isValidHashtag(tag) {
  return /^#[\p{L}\p{N}_]{2,40}$/u.test(String(tag ?? ""));
}
