"use strict";

/**
 * Davet ödülleri: text that reaches a person (stored on referral_notices and shown in their
 * Davet Merkezi / as a toast), in the recipient's language. The admin sees exactly this text
 * as "Bora'nın göreceği" before confirming. Also the ready-made "Dürt" messages.
 * Seven locales: tr, en, de, es, fr, pt-BR, ru. Turkish uses the "sen" form.
 */

const { REASONS, T, TR_NUMBER_WORDS, TR_VOWEL_RE, TR_ENDS_VOWEL_RE, TR_HARMONY } = require("../../i18n/referrals");

const LOCALES = ["tr", "en", "de", "es", "fr", "pt-BR", "ru"];

function langOf(raw) {
  const s = String(raw || "").trim();
  if (LOCALES.includes(s)) return s;
  const base = s.slice(0, 2).toLowerCase();
  if (base === "pt") return "pt-BR";
  return LOCALES.includes(base) ? base : "tr";
}

/**
 * Turkish possessive suffix after a number written with digits: 7'si, 3'ü, 10'u, 6'sı.
 * The vowel follows the last spoken word of the number (vowel harmony, buffer "s" after a vowel).
 */
function trPossessive(n) {
  const v = Math.abs(Math.floor(Number(n) || 0));
  const { UNITS, TENS, ZERO, HUNDRED, THOUSAND, MILLION } = TR_NUMBER_WORDS;
  let word;
  if (v === 0) word = ZERO;
  else if (v % 10) word = UNITS[v % 10];
  else if (v % 100) word = TENS[(v % 100) / 10];
  else if (v % 1000) word = HUNDRED;
  else if (v % 1000000) word = THOUSAND;
  else word = MILLION;
  const vowels = word.match(TR_VOWEL_RE) || ["e"];
  const last = vowels[vowels.length - 1];
  const harmony = TR_HARMONY[last];
  const endsVowel = TR_ENDS_VOWEL_RE.test(word);
  return `${v}'${endsVowel ? "s" : ""}${harmony}`;
}

const REASON_CODES = Object.keys(REASONS.tr);

function reasonText(code, lang) {
  const L = langOf(lang);
  return (REASONS[L] || REASONS.tr)[code] || (REASONS[L] || REASONS.tr).other;
}

/**
 * Notice text. kind: revokeInviter | revokeInvitee | holdInviter | releaseInviter |
 * pausedInviter | resumedInviter. An admin note (free text) replaces the reason phrase only
 * for reason "other".
 */
function noticeText(kind, { lang = "tr", count = 1, amount = 0, reasonCode = "other", note = "" } = {}) {
  const L = langOf(lang);
  const pack = T[L] || T.tr;
  const model = require("./model");
  let reason = reasonText(reasonCode, L);
  const cleanNote = String(note || "").replace(/\s+/g, " ").trim().slice(0, 140);
  if (reasonCode === "other" && cleanNote) reason = cleanNote;
  const args = { count, countPos: trPossessive(count), amount: model.formatAmount(amount, L), reason };
  if (kind === "revokeInviter" && !(Number(amount) > 0)) return pack.revokeInviterNoMoney(args);
  const fn = pack[kind];
  return typeof fn === "function" ? fn(args) : "";
}

/** One of the ready "Dürt" messages, picked by `variant` (0..2). */
function nudgeText({ lang = "tr", name = "", variant = 0 } = {}) {
  const pack = T[langOf(lang)] || T.tr;
  const list = pack.nudge;
  const fn = list[Math.abs(Math.floor(Number(variant) || 0)) % list.length];
  return fn({ name: String(name || "").slice(0, 40) });
}

module.exports = { LOCALES, REASON_CODES, langOf, trPossessive, reasonText, noticeText, nudgeText };
