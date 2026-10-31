"use strict";

/**
 * Server-side message catalogs (backend/i18n/<locale>.js, CommonJS, one file per
 * locale with the same key tree as en.js). Used for text that leaves the server
 * already rendered in one language: transactional email, push, notifications,
 * default names written into the database, and the English fallback text of bot
 * messages.
 *
 *   bt(lang, "email.common.valid", { minutes: 10 })
 *
 * - {name} interpolation and ICU plural / select (lib/messageFormat.js).
 * - A variable whose value is { key, vars } is a catalog reference: it is
 *   rendered in the same language first (bot messages use this for labels).
 * - Missing key in the language -> English -> the key itself.
 * - availableLangs(): registry locales (src/i18n/locales.json) that have a
 *   catalog file. pickLang(candidates, fallback) = resolveLang over them, so a
 *   draft language is never used for real users.
 */

const fs = require("fs");
const path = require("path");
const { LOCALES, resolveLang, intlTag, normalizeLocale } = require("./locales");
const { formatMessage } = require("./messageFormat");

const DIR = path.join(__dirname, "..", "i18n");
const catalogs = new Map();

for (const l of LOCALES) {
  const file = path.join(DIR, `${l.id}.js`);
  if (fs.existsSync(file)) catalogs.set(l.id, require(file));
}
// bot.* (stored bot / system text) has an English fallback only: viewers translate it
// from the `i18n` field with the app catalog (src/i18n/locales/bot.<locale>.js).
catalogs.set("en", { ...catalogs.get("en"), bot: require(path.join(DIR, "bot.en.js")) });

const AVAILABLE = Object.freeze([...catalogs.keys()]);

function availableLangs() {
  return AVAILABLE;
}

function getPath(obj, key) {
  let cur = obj;
  for (const part of String(key).split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[part];
  }
  return cur;
}

function langId(lang) {
  const id = normalizeLocale(lang);
  return id && catalogs.has(id) ? id : "en";
}

/** Raw catalog value (string, array or subtree) in `lang`, English fallback. */
function raw(lang, key) {
  const id = langId(lang);
  const v = getPath(catalogs.get(id), key);
  if (v !== undefined) return v;
  return getPath(catalogs.get("en"), key);
}

function isRef(v) {
  return v && typeof v === "object" && !Array.isArray(v) && typeof v.key === "string";
}

function resolveVars(lang, vars, depth) {
  if (!vars) return {};
  const out = {};
  for (const [k, v] of Object.entries(vars)) {
    out[k] = isRef(v) && depth < 4 ? bt(lang, v.key, v.vars, depth + 1) : v;
  }
  return out;
}

/** Rendered text for `key` in `lang`. */
function bt(lang, key, vars, depth = 0) {
  const str = raw(lang, key);
  if (typeof str !== "string") return String(key);
  const id = langId(lang);
  return formatMessage(str, resolveVars(id, vars, depth), intlTag(id));
}

/** True when the English catalog has a string at `key`. */
function has(key) {
  return typeof getPath(catalogs.get("en"), key) === "string";
}

/** First live locale with a catalog among the candidates, else `fallback`. */
function pickLang(candidates, fallback = "en") {
  const list = Array.isArray(candidates) ? candidates : [candidates];
  return resolveLang(list, { available: AVAILABLE, fallback });
}

/**
 * Language of the person making a request: their saved account language (req.user.language
 * when the auth middleware loaded it), then Accept-Language, else `fallback`.
 */
function requestLang(req, fallback = "en") {
  const { parseAcceptLanguage } = require("./locales");
  return pickLang([req?.user?.language, parseAcceptLanguage(req?.headers?.["accept-language"])], fallback);
}

/** Catalog object of a locale (for selftests and tooling). */
function catalog(lang) {
  return catalogs.get(lang) || null;
}

module.exports = { bt, raw, has, pickLang, requestLang, availableLangs, catalog, isRef };
