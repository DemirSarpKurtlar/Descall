"use strict";

/**
 * Text the server stores or sends once and every viewer then reads in their own
 * language (bot replies, polls, casino, feedback / report timeline entries, in-app
 * notifications).
 *
 * The readable fallback is written in ENGLISH (old clients show it as is) and the
 * object gets a structured `i18n` field next to it:
 *
 *   { title: "Commands", i18n: { title: { key: "bot.slash.help.title" } } }
 *   { content: "ayse was timed out", i18n: { content: { key: "bot.slash.timeout.done", vars: { name: "ayse" } } } }
 *
 * - `i18n` maps a property name of the same object to { key, vars? }.
 * - `key` is a full path in the app catalog (src/i18n/locales/bot.<locale>.js wired as
 *   nested `bot:`); the backend English fallback is backend/i18n/bot.en.js (same text,
 *   checked by backend/i18n/backendI18n.selftest.cjs).
 * - A var value may itself be { key, vars? }: translate it first (labels such as a
 *   permission name or "Unknown").
 * - Numeric vars are raw numbers (format them for the locale); the English fallback
 *   prints them en-US ("1,000").
 * - A var value { date: "<ISO>" } / { dateTime: "<ISO>" } is a date to format in the
 *   viewer's locale; the English fallback uses en-GB, Europe/Istanbul.
 */

const { bt, raw } = require("./i18n");

function ref(key, vars) {
  const clean = {};
  let any = false;
  for (const [k, v] of Object.entries(vars || {})) {
    if (v === undefined) continue;
    clean[k] = v;
    any = true;
  }
  return any ? { key, vars: clean } : { key };
}

function fmtDate(iso, withTime) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return withTime
    ? d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" })
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Istanbul" });
}

function englishVars(key, vars) {
  const template = String(raw("en", key) || "");
  const out = {};
  for (const [k, v] of Object.entries(vars || {})) {
    if (v && typeof v === "object" && !Array.isArray(v) && typeof v.date === "string") out[k] = fmtDate(v.date, false);
    else if (v && typeof v === "object" && !Array.isArray(v) && typeof v.dateTime === "string") out[k] = fmtDate(v.dateTime, true);
    // Plain numeric values read "1,000" in the fallback (plural / select arguments stay numbers).
    else if (typeof v === "number" && Number.isFinite(v) && !new RegExp(`\\{\\s*${k}\\s*,`).test(template)) out[k] = v.toLocaleString("en-US");
    else out[k] = v;
  }
  return out;
}

/** English fallback text of a catalog message. */
function en(key, vars) {
  return bt("en", key, englishVars(key, vars));
}

/**
 * Sets obj[prop] to the English text and obj.i18n[prop] to the reference.
 * Returns obj (so it can be used inline).
 */
function put(obj, prop, key, vars) {
  const target = obj || {};
  target[prop] = en(key, vars);
  target.i18n = { ...(target.i18n || {}), [prop]: ref(key, vars) };
  return target;
}

/** { text, i18n: { text: ref } } for a standalone piece of text. */
function text(key, vars) {
  return put({}, "text", key, vars);
}

module.exports = { ref, en, put, text, fmtDate };
