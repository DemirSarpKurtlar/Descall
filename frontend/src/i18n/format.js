/**
 * Locale-aware formatting for UI text. Always pass the UI locale id (useLocale().locale
 * or getLocale() from runtime.js), never a hard-coded "tr-TR" / "en-US": the Intl tag
 * comes from locales.json, so a new language formats correctly with no code change.
 */
import { intlTag } from "./registry.js";

const cache = new Map();
function cached(kind, tag, options, make) {
  const key = `${kind}|${tag}|${options ? JSON.stringify(options) : ""}`;
  let v = cache.get(key);
  if (!v) {
    try {
      v = make(tag);
    } catch {
      v = make("en");
    }
    if (cache.size > 300) cache.clear();
    cache.set(key, v);
  }
  return v;
}

function toDate(value) {
  if (value instanceof Date) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatNumber(value, locale, options) {
  const tag = intlTag(locale);
  return cached("n", tag, options, (t) => new Intl.NumberFormat(t, options)).format(Number(value) || 0);
}

export function formatDate(value, locale, options = { dateStyle: "medium" }) {
  const d = toDate(value);
  if (!d) return "";
  const tag = intlTag(locale);
  return cached("d", tag, options, (t) => new Intl.DateTimeFormat(t, options)).format(d);
}

export function formatTime(value, locale, options = { hour: "2-digit", minute: "2-digit" }) {
  return formatDate(value, locale, options);
}

/** "5 minutes ago", "in 2 days", "yesterday" (numeric: "auto"). */
export function formatRelativeTime(value, locale, { now = Date.now(), numeric = "auto", style = "long" } = {}) {
  const d = toDate(value);
  if (!d) return "";
  const diffSec = Math.round((d.getTime() - (now instanceof Date ? now.getTime() : now)) / 1000);
  const abs = Math.abs(diffSec);
  const tag = intlTag(locale);
  const rtf = cached("r", tag, { numeric, style }, (t) => new Intl.RelativeTimeFormat(t, { numeric, style }));
  if (abs < 45) return rtf.format(0, "second");
  if (abs < 45 * 60) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 22 * 3600) return rtf.format(Math.round(diffSec / 3600), "hour");
  if (abs < 6 * 86400) return rtf.format(Math.round(diffSec / 86400), "day");
  if (abs < 28 * 86400) return rtf.format(Math.round(diffSec / (7 * 86400)), "week");
  if (abs < 330 * 86400) return rtf.format(Math.round(diffSec / (30 * 86400)), "month");
  return rtf.format(Math.round(diffSec / (365 * 86400)), "year");
}

/** "A, B and C" in the locale's own list style. */
export function formatList(items, locale, options = { style: "long", type: "conjunction" }) {
  const tag = intlTag(locale);
  return cached("l", tag, options, (t) => new Intl.ListFormat(t, options)).format(
    (items || []).map((x) => String(x))
  );
}

/** Country / language names in the UI language ("DE" -> "Almanya" / "Germany"). */
export function displayName(code, locale, type = "region") {
  if (!code) return "";
  const tag = intlTag(locale);
  try {
    return cached("dn", tag, { type }, (t) => new Intl.DisplayNames([t], { type })).of(code) || String(code);
  } catch {
    return String(code);
  }
}

/** Case mapping that respects the language (Turkish dotted i, German sharp s). */
export function upper(text, locale) {
  return String(text ?? "").toLocaleUpperCase(intlTag(locale));
}
export function lower(text, locale) {
  return String(text ?? "").toLocaleLowerCase(intlTag(locale));
}
