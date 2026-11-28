"use strict";

/**
 * Growth 3B server-side copy (pushes, desktop cards, weekly digest, day-7 / day-14
 * e-mails, default campaign templates) in the 7 app languages. Same keys and
 * placeholders in every language (copy.selftest via rules.selftest.cjs). No emoji.
 * Turkish variables ending in "Dat" carry the dative form (lib/trSuffix.trDative).
 *
 *   rt("tr", "push.voiceOne", { a: "Ece" })
 */

const { formatMessage } = require("../messageFormat");
const { pickLang } = require("../i18n");
const { trDative } = require("../trSuffix");

const { COPY, TEMPLATES } = require("../../i18n/reengage3");

const LANGS = Object.freeze(["tr", "en", "de", "es", "fr", "pt-BR", "ru"]);

function langOf(lang) {
  return pickLang([lang], "tr");
}

function lookup(path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), COPY);
}

/** Render a copy key in `lang` (Turkish when the language has no entry). */
function rt(lang, key, vars = {}) {
  const l = langOf(lang);
  const entry = lookup(key);
  if (!entry) return key;
  const text = entry[l] ?? entry.tr ?? "";
  const tag = l === "pt-BR" ? "pt-BR" : l;
  const full = { ...vars };
  // Turkish dative forms for every name variable ("Ece" -> "Ece'ye").
  for (const [k, v] of Object.entries(vars)) {
    if (typeof v === "string" && !(`${k}Dat` in full)) full[`${k}Dat`] = l === "tr" ? trDative(v) || v : v;
  }
  return formatMessage(text, full, tag);
}

/** Default template of a campaign in `lang` (empty strings when none). */
function defaultTemplate(campaign, lang) {
  const t = TEMPLATES[campaign];
  const l = langOf(lang);
  if (!t) return { pushTitle: "", pushBody: "", emailSubject: "", emailBody: "" };
  const pick = (f) => (t[f] ? t[f][l] ?? t[f].tr ?? "" : "");
  return { pushTitle: pick("pushTitle"), pushBody: pick("pushBody"), emailSubject: pick("emailSubject"), emailBody: pick("emailBody") };
}

/** "Ece seste", "Ece ve Kaan seste", "Ece, Kaan ve Zeynep seste", "Ece, Kaan ve 3 kişi daha seste". */
function voiceTitle(lang, names = [], total = null) {
  const n = names.filter(Boolean);
  const count = Math.max(n.length, Number(total) || 0);
  if (count <= 1) return rt(lang, "push.voiceOne", { a: n[0] || "" });
  if (count === 2 && n.length >= 2) return rt(lang, "push.voiceTwo", { a: n[0], b: n[1] });
  if (count === 3 && n.length >= 3) return rt(lang, "push.voiceThree", { a: n[0], b: n[1], c: n[2] });
  if (n.length < 2) return rt(lang, "push.voiceOne", { a: n[0] || "" });
  return rt(lang, "push.voiceMore", { a: n[0], b: n[1], n: count - 2 });
}

module.exports = { COPY, TEMPLATES, LANGS, rt, defaultTemplate, voiceTitle, langOf };
