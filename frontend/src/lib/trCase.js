/**
 * Turkish case suffixes after a name, with the apostrophe Turkish uses for proper names:
 * genitive (Ece'nin, Bora'nın, Kaan'ın, Göktürk'ün), dative (Ece'ye, Bora'ya, Mert'e) and
 * the 3rd-person possessive after a number (7'si, 3'ü). Vowel harmony follows the last
 * spoken vowel; a name ending in digits is read as the number ("nisa_2207" -> "yedi").
 * Tested by trCase.selftest.mjs.
 */

const VOWELS = "aeıioöuüAEIİOÖUÜ";
const BACK = new Set(["a", "ı", "o", "u"]);
const ROUND = new Set(["o", "ö", "u", "ü"]);

function numberWord(n) {
  const v = Math.abs(Math.floor(Number(n) || 0));
  const UNITS = ["", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"];
  const TENS = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"];
  if (v === 0) return "sıfır";
  if (v % 10) return UNITS[v % 10];
  if (v % 100) return TENS[(v % 100) / 10];
  if (v % 1000) return "yüz";
  if (v % 1000000) return "bin";
  return "milyon";
}

/** The word whose sound decides the suffix (last word, digits spoken as a number). */
function spoken(name) {
  const s = String(name || "").trim();
  const digits = /(\d+)\s*$/.exec(s);
  if (digits) return numberWord(digits[1]);
  const words = s.split(/[\s_.-]+/).filter(Boolean);
  const last = (words[words.length - 1] || "e").toLocaleLowerCase("tr");
  // Acronyms and names without a vowel: read with "e" (GK -> ge ka is rare; keep it simple).
  return /[aeıioöuü]/.test(last) ? last : `${last}e`;
}

function lastVowel(word) {
  for (let i = word.length - 1; i >= 0; i -= 1) {
    const c = word[i];
    if (VOWELS.includes(c)) return c.toLocaleLowerCase("tr");
  }
  return "e";
}

function endsVowel(word) {
  return VOWELS.includes(word[word.length - 1] || "");
}

function four(v) {
  if (BACK.has(v)) return ROUND.has(v) ? "u" : "ı";
  return ROUND.has(v) ? "ü" : "i";
}

/** Ece -> Ece'nin, Bora -> Bora'nın, Kaan -> Kaan'ın */
export function trGenitive(name) {
  const base = String(name || "").trim();
  if (!base) return base;
  const w = spoken(base);
  const v = four(lastVowel(w));
  return `${base}'${endsVowel(w) ? "n" : ""}${v}n`;
}

/** Ece -> Ece'ye, Bora -> Bora'ya, Mert -> Mert'e */
export function trDative(name) {
  const base = String(name || "").trim();
  if (!base) return base;
  const w = spoken(base);
  const a = BACK.has(lastVowel(w)) ? "a" : "e";
  return `${base}'${endsVowel(w) ? "y" : ""}${a}`;
}

/** 7 -> 7'si, 3 -> 3'ü, 6 -> 6'sı */
export function trPossessiveNumber(n) {
  const w = numberWord(n);
  return `${Math.abs(Math.floor(Number(n) || 0))}'${endsVowel(w) ? "s" : ""}${four(lastVowel(w))}`;
}

/** Variables for a translated sentence: { name, nameGen, nameDat } (Turkish forms only in tr). */
export function nameVars(name, locale = "tr", key = "name") {
  const tr = String(locale || "").startsWith("tr");
  return {
    [key]: name,
    [`${key}Gen`]: tr ? trGenitive(name) : name,
    [`${key}Dat`]: tr ? trDative(name) : name,
  };
}
