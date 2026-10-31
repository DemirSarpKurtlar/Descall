/**
 * Text that comes from the server, shown in the viewer's language.
 *
 * API / socket errors (backend/lib/apiError.js):
 *   { error: "<English>", errorKey?: "<English template with {x}>", errorVars?: {...} }
 *   (same for message / text). The English sentence is a phrase key in the catalogs.
 *
 * Stored bot text (backend/lib/botText.js): an object carries an English fallback in
 * obj[prop] and `i18n: { [prop]: { key, vars? } }`. A var may be another { key, vars }
 * ref, { date } / { dateTime } (formatted for the viewer), or a raw number.
 */
import { t, getLocale } from "./runtime.js";
import { formatDate, formatNumber } from "./format.js";

function isRef(v) {
  return v && typeof v === "object" && !Array.isArray(v) && typeof v.key === "string";
}

function resolveVars(vars, locale) {
  if (!vars || typeof vars !== "object") return vars;
  const out = {};
  for (const [k, v] of Object.entries(vars)) {
    if (isRef(v)) out[k] = resolveRef(v, locale);
    else if (v && typeof v === "object" && typeof v.date === "string") {
      out[k] = formatDate(v.date, locale, { day: "numeric", month: "short", year: "numeric" });
    } else if (v && typeof v === "object" && typeof v.dateTime === "string") {
      out[k] = formatDate(v.dateTime, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    } else out[k] = v;
  }
  return out;
}

/**
 * Numbers stay numbers for plural / select arguments; elsewhere they are formatted
 * for the locale. translate() handles {n, plural, ...}; a plain {n} gets the
 * formatted string, so pre-format only numbers that are not plural selectors.
 */
function formatPlainNumbers(template, vars, locale) {
  if (!vars) return vars;
  const out = { ...vars };
  for (const [k, v] of Object.entries(out)) {
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const isSelector = new RegExp(`\\{\\s*${k}\\s*,`).test(String(template || ""));
    if (!isSelector) out[k] = formatNumber(v, locale);
  }
  return out;
}

/** Translate a { key, vars } ref from the server. */
export function resolveRef(ref, locale = getLocale()) {
  if (!isRef(ref)) return "";
  const vars = resolveVars(ref.vars, locale);
  const template = t(ref.key);
  return t(ref.key, formatPlainNumbers(template, vars, locale));
}

/** obj[prop] in the viewer's language when the server sent an i18n ref, else as stored. */
export function localizedField(obj, prop, locale = getLocale()) {
  if (!obj) return "";
  const ref = obj.i18n && obj.i18n[prop];
  if (isRef(ref)) {
    const text = resolveRef(ref, locale);
    if (text && text !== ref.key) return text;
  }
  return obj[prop];
}

/** API / socket message (`error` by default) in the viewer's language. */
export function serverMessage(body, field = "error") {
  if (!body || typeof body !== "object") return typeof body === "string" ? t(body) : "";
  const key = body[`${field}Key`];
  if (typeof key === "string" && key) {
    const vars = resolveVars(body[`${field}Vars`], getLocale());
    return t(key, vars);
  }
  const raw = body[field];
  return typeof raw === "string" && raw ? t(raw) : "";
}

/** Message `i18n` from the server, with the content ref exposed as `text` (the client field). */
export function textI18n(i18n) {
  if (!i18n || typeof i18n !== "object") return null;
  const text = i18n.text || i18n.content;
  return text ? { ...i18n, text } : i18n;
}

/**
 * Copy of a server object (embed, app card, ...) with every `i18n`-backed property
 * replaced by the viewer's language, at any depth (fields, footer, groups, badges).
 */
export function localizeDeep(value, locale = getLocale(), depth = 0) {
  if (depth > 6 || value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => localizeDeep(v, locale, depth + 1));
  if (value.$$typeof) return value; // React element
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = k === "i18n" ? v : localizeDeep(v, locale, depth + 1);
  }
  const map = value.i18n;
  if (map && typeof map === "object") {
    for (const [prop, ref] of Object.entries(map)) {
      if (!isRef(ref)) continue;
      const text = resolveRef(ref, locale);
      if (text && text !== ref.key) out[prop] = text;
    }
  }
  return out;
}
