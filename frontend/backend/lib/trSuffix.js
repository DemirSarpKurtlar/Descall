"use strict";
/**
 * Turkish case suffixes for names written with an apostrophe:
 * "Zeynep'e", "Ali'ye", "Alpha Topluluğu'nun", "Oyun Gecesi'nin".
 * Vowel harmony follows the last vowel; a name ending in a vowel takes the
 * buffer letter (y for dative, n for genitive). A trailing digit is read
 * aloud ("Sunucu 3'ün"). A name with no vowel at all (an acronym such as
 * "XYZ") falls back to the front-vowel form. Mirror of src/lib/trSuffix.js
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
function trDative(name) {
  const { printed, sound } = soundOf(name);
  if (!printed) return "";
  const v = lastVowel(sound);
  const a = v && BACK.includes(v) ? "a" : "e";
  const endsVowel = VOWELS.includes(sound.slice(-1));
  return `${printed}'${endsVowel ? "y" : ""}${a}`;
}

/** "Alpha Topluluğu" → "Alpha Topluluğu'nun", "Zeynep" → "Zeynep'in". */
function trGenitive(name) {
  const { printed, sound } = soundOf(name);
  if (!printed) return "";
  const v = lastVowel(sound);
  const i = v === "a" || v === "ı" ? "ı" : v === "o" || v === "u" ? "u" : v === "ö" || v === "ü" ? "ü" : "i";
  const endsVowel = VOWELS.includes(sound.slice(-1));
  return `${printed}'${endsVowel ? "n" : ""}${i}n`;
}

module.exports = { trDative, trGenitive };
