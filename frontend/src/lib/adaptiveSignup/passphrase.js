/**
 * Suggested password of the sign-up card (growth 1B "Akılda kalan şifre önerisi"):
 * "Vapur-Simit-Kanat-Lodos-47". Four capitalised words of the person's language picked with
 * crypto.getRandomValues (unbiased, rejection sampling) plus a 2-digit number. Every list has
 * at least 512 words, so a suggestion carries more than 42 bits; it is checked against the
 * breach list before it is shown (never one that is in it) and again by the server on submit.
 * Nothing is stored: a suggestion lives in the card's state only.
 */

export const PASSPHRASE_WORDS = 4;
export const NUMBER_MIN = 10;
export const NUMBER_MAX = 99;
export const SEPARATOR = "-";

/** The word list key for a UI locale (pt-BR has its own list, the rest by language). */
export function wordlistLocale(locale) {
  const v = String(locale || "").trim();
  if (/^pt/i.test(v)) return "pt-BR";
  const lang = v.slice(0, 2).toLowerCase();
  return ["tr", "en", "de", "es", "fr", "ru"].includes(lang) ? lang : "en";
}

let listsPromise = null;
/** The lists (separate chunk, loaded on first use). */
export function loadWordlists() {
  if (!listsPromise) listsPromise = import("./wordlists.js").then((m) => m.WORDLISTS);
  return listsPromise;
}

function defaultRandom() {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : null;
  if (!c || typeof c.getRandomValues !== "function") throw new Error("secure random not available");
  return (n) => c.getRandomValues(new Uint32Array(n));
}

/**
 * Uniform integer in [0, max) from 32-bit secure random values (rejection sampling, so
 * every value is equally likely). `rand(n)` returns n uint32 values.
 */
export function secureIndex(max, rand = defaultRandom()) {
  const n = Math.floor(Number(max));
  if (!(n > 0) || n > 0x100000000) throw new Error("bad range");
  const limit = Math.floor(0x100000000 / n) * n;
  for (let i = 0; i < 64; i += 1) {
    const v = rand(1)[0] >>> 0;
    if (v < limit) return v % n;
  }
  throw new Error("random source looks broken");
}

/** Entropy in bits of `words` picks from `listSize` plus a number in [min, max]. */
export function passphraseEntropy(listSize, words = PASSPHRASE_WORDS, min = NUMBER_MIN, max = NUMBER_MAX) {
  const size = Math.max(1, Number(listSize) || 1);
  return words * Math.log2(size) + Math.log2(max - min + 1);
}

const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);

/**
 * One suggestion from `list` (array of lowercase words). The same word is not used twice in
 * one suggestion (re-drawn), which lowers the entropy by a fraction of a bit only.
 * Returns { value, words, number, bits }.
 */
export function makePassphrase(list, { words = PASSPHRASE_WORDS, rand } = {}) {
  const pool = Array.isArray(list) ? list.filter(Boolean) : [];
  if (pool.length < 2 * words) throw new Error("word list too small");
  const r = rand || defaultRandom();
  const picked = [];
  while (picked.length < words) {
    const w = pool[secureIndex(pool.length, r)];
    if (!picked.includes(w)) picked.push(w);
  }
  const number = NUMBER_MIN + secureIndex(NUMBER_MAX - NUMBER_MIN + 1, r);
  return {
    value: [...picked.map(cap), String(number)].join(SEPARATOR),
    words: picked.map(cap),
    number,
    bits: Math.floor(passphraseEntropy(pool.length, words)),
  };
}

/**
 * A suggestion that is not in the breach list. `isBreached(value)` -> Promise<boolean | null>
 * (null: could not check, the suggestion is still used since its entropy is what protects
 * it; the server checks again on submit). Up to `tries` draws.
 */
export async function suggestPassphrase({ locale, isBreached, rand, tries = 4, lists } = {}) {
  const all = lists || (await loadWordlists());
  const list = all[wordlistLocale(locale)] || all.en;
  let last = null;
  for (let i = 0; i < tries; i += 1) {
    last = makePassphrase(list, { rand });
    let hit = null;
    try {
      hit = isBreached ? await isBreached(last.value) : null;
    } catch {
      hit = null;
    }
    if (hit !== true) return { ...last, checked: hit === false };
  }
  // Every draw was in the breach list (practically impossible): offer none rather than one.
  return null;
}
