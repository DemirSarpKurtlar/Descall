/**
 * Turkish case suffixes for names written with an apostrophe:
 * "Zeynep'e", "Ali'ye", "Alpha Topluluğu'nun", "Oyun Gecesi'nin".
 * Vowel harmony follows the last vowel; a name ending in a vowel takes the
 * buffer letter (y for dative, n for genitive). A trailing digit is read
 * aloud ("Sunucu 3'ün"). A name with no vowel at all (an acronym such as
 * "XYZ") falls back to the front-vowel form. Mirror: backend/lib/trSuffix.js
 * (same rules, checked by trSuffix.selftest.mjs).
 */
const BACK = "aıou";
const FRONT = "eiöü";
const VOWELS = "aeıioöuü";
const DIGIT_WORDS = ["sıfır", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"];

function lowerTr(s) {
  return String(s || "").replace(/I/g, "ı").replace(/İ/g, "i").toLowerCase();
}

/** The word whose sound decides the suffix, plus the name to print. */
function soundOf(name) {
  const printed = String(name || "").trim();
  // Trailing emoji / punctuation do not change pronunciation.
  const m = printed.match(/[\p{L}\p{N}](?=[^\p{L}\p{N}]*$)/u);
  if (!m) return { printed, sound: "" };
  const core = printed.slice(0, m.index + 1);
  let sound = lowerTr(core);
  const last = sound.slice(-1);
  if (/[0-9]/.test(last)) sound = DIGIT_WORDS[Number(last)];
  return { printed, sound };
}

function lastVowel(sound) {
  for (let i = sound.length - 1; i >= 0; i -= 1) {
    if (VOWELS.includes(sound[i])) return sound[i];
  }
  return "";
}

/** "Zeynep" → "Zeynep'e", "Ali" → "Ali'ye", "Doğa" → "Doğa'ya". */
export function trDative(name) {
  const { printed, sound } = soundOf(name);
  if (!printed) return "";
  const v = lastVowel(sound);
  const a = v && BACK.includes(v) ? "a" : "e";
  const endsVowel = VOWELS.includes(sound.slice(-1));
  return `${printed}'${endsVowel ? "y" : ""}${a}`;
}

/** "Alpha Topluluğu" → "Alpha Topluluğu'nun", "Zeynep" → "Zeynep'in". */
export function trGenitive(name) {
  const { printed, sound } = soundOf(name);
  if (!printed) return "";
  const v = lastVowel(sound);
  const i = v === "a" || v === "ı" ? "ı" : v === "o" || v === "u" ? "u" : v === "ö" || v === "ü" ? "ü" : "i";
  const endsVowel = VOWELS.includes(sound.slice(-1));
  return `${printed}'${endsVowel ? "n" : ""}${i}n`;
}

/** "Can" → "Can'ı", "Ali" → "Ali'yi", "Doğa" → "Doğa'yı", "Gönül" → "Gönül'ü". */
export function trAccusative(name) {
  const { printed, sound } = soundOf(name);
  if (!printed) return "";
  const v = lastVowel(sound);
  const i = v === "a" || v === "ı" ? "ı" : v === "o" || v === "u" ? "u" : v === "ö" || v === "ü" ? "ü" : "i";
  const endsVowel = VOWELS.includes(sound.slice(-1));
  return `${printed}'${endsVowel ? "y" : ""}${i}`;
}

const UNIT_WORDS = ["", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"];
const TEN_WORDS = ["", "on", "yirmi", "otuz", "kırk", "elli"];
const HARD = "fstkçşhp";

/** The spoken last word of a clock time: 21:58 → "sekiz", 21:40 → "kırk", 21:00 → "bir". */
function lastSpokenWord(time) {
  const m = String(time || "").match(/(\d{1,2})[:.](\d{2})/);
  if (!m) return "";
  const h = Number(m[1]);
  const min = Number(m[2]);
  const pick = (n) => (n % 10 ? UNIT_WORDS[n % 10] : n ? TEN_WORDS[Math.floor(n / 10)] : "");
  return pick(min) || pick(h) || "sıfır";
}

/** "21:58" → "21:58'de", "21:40" → "21:40'ta", "09:30" → "09:30'da", "12:03" → "12:03'te". */
export function trLocativeTime(time) {
  const printed = String(time || "").trim();
  const word = lastSpokenWord(printed);
  if (!word) return printed;
  const v = lastVowel(word);
  const a = v && BACK.includes(v) ? "a" : "e";
  const d = HARD.includes(word.slice(-1)) ? "t" : "d";
  return `${printed}'${d}${a}`;
}

export const __test = { soundOf, lastVowel, FRONT };
