/**
 * Parse app timestamps that may come from Postgres `timestamp` (no tz).
 * Those values are UTC wall-clock; without a Z/offset, JS would treat them
 * as local time and show ~3h early in Turkey (UTC+3).
 *
 * Admin/analytics display uses Europe/Istanbul. Chat clocks stay in the
 * viewer's local timezone after UTC parsing.
 */

const HAS_TZ_RE = /(?:[zZ]|[+-]\d{2}:?\d{2})$/;
const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

export const APP_TIMEZONE = "Europe/Istanbul";

export function intlLocaleTag(locale) {
  if (!locale) return "tr-TR";
  const id = String(locale).toLowerCase();
  if (id === "tr" || id.startsWith("tr-")) return "tr-TR";
  if (id === "en" || id.startsWith("en-")) return "en-GB";
  return locale;
}

export function parseAppDate(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  if (HAS_TZ_RE.test(raw)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (DATE_TIME_RE.test(raw)) {
    const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
    const d = new Date(`${normalized}Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function appDateMs(value) {
  const d = parseAppDate(value);
  return d ? d.getTime() : NaN;
}

export function formatMessageClock(value, locale) {
  const d = parseAppDate(value);
  if (!d) return "";
  return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

export function formatMessageDate(value, locale, options) {
  const d = parseAppDate(value);
  if (!d) return "";
  return d.toLocaleDateString(locale, options);
}

export function formatAppDateTime(value, locale, options = {}) {
  const d = parseAppDate(value);
  if (!d) return "";
  return new Intl.DateTimeFormat(intlLocaleTag(locale), {
    timeZone: APP_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    ...options,
  }).format(d);
}

export function formatAppDate(value, locale, options = {}) {
  const d = parseAppDate(value);
  if (!d) return "";
  return new Intl.DateTimeFormat(intlLocaleTag(locale), {
    timeZone: APP_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...options,
  }).format(d);
}

/** YYYY-MM-DD in Europe/Istanbul. */
export function istanbulDayKey(value) {
  const d = value == null || value === "" ? new Date() : parseAppDate(value);
  if (!d) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function istanbulHour(value) {
  const d = parseAppDate(value);
  if (!d) return null;
  const hourPart = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIMEZONE,
    hour: "2-digit",
    hour12: false,
  }).format(d);
  const hour = Number.parseInt(hourPart, 10);
  return Number.isFinite(hour) ? hour % 24 : null;
}

/** Format a YYYY-MM-DD key that is already an Istanbul calendar day. */
export function formatIstanbulDayLabel(dateKey, locale, options = {}) {
  if (!dateKey) return "";
  const d = new Date(`${dateKey}T12:00:00+03:00`);
  if (Number.isNaN(d.getTime())) return String(dateKey);
  return new Intl.DateTimeFormat(intlLocaleTag(locale), {
    timeZone: APP_TIMEZONE,
    ...options,
  }).format(d);
}

export function formatTimeAgo(value, t, now = new Date(), locale) {
  const date = parseAppDate(value);
  if (!date) return "";
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return t("Just now");
  if (diffMin < 60) return t("{count}m ago", { count: diffMin });
  if (diffHour < 24) return t("{count}h ago", { count: diffHour });
  if (diffDay < 7) return t("{count}d ago", { count: diffDay });
  return formatAppDate(date, locale);
}
