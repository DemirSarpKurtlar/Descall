/**
 * Turkish sound data for lib/trCase.js (case suffixes after names and numbers): vowels,
 * vowel harmony and the number words. Grammar data, not UI text.
 */
export const TR_CASE = Object.freeze({
  VOWELS: "aeıioöuüAEIİOÖUÜ",
  BACK_VOWELS: ["a", "ı", "o", "u"],
  ROUND_VOWELS: ["o", "ö", "u", "ü"],
  UNITS: ["", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"],
  TENS: ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"],
  ZERO: "sıfır",
  HUNDRED: "yüz",
  THOUSAND: "bin",
  MILLION: "milyon",
  HAS_VOWEL_RE: /[aeıioöuü]/,
  FOUR: { back: "ı", backRound: "u", front: "i", frontRound: "ü" },
  TWO: { back: "a", front: "e" },
});
