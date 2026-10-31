/** Sign-up stats: pure formatting helpers (statsModel.selftest.mjs). Text: adminx.sst catalog keys, dates and numbers in the UI locale. */
import { displayName, formatDate, formatNumber } from "../../../i18n/format.js";
import { APP_TIMEZONE } from "../../../lib/datetime.js";
import { sinceVars } from "../feedback3/fbModel.js";

/** [id, label key] */
export const GRANULARITIES = [
  ["day", "adminx.sst.daily"],
  ["week", "adminx.sst.weekly"],
  ["month", "adminx.sst.monthly"],
];
/** [id, label key, days] */
export const PRESETS = [
  ["7", "adminx.sst.preset7", 7],
  ["30", "adminx.sst.preset30", 30],
  ["90", "adminx.sst.preset90", 90],
  ["365", "adminx.sst.preset365", 365],
  ["all", "adminx.sst.presetAll", null],
];

export const num = (n, locale) => formatNumber(Number(n) || 0, locale);
export const dec1 = (n, locale) => formatNumber(Math.round((Number(n) || 0) * 10) / 10, locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** "%14" in Turkish, "14%" in English. */
export const pct = (p, locale) => formatNumber((Number(p) || 0) / 100, locale, { style: "percent", maximumFractionDigits: 0 });

/** "2026-10-26" for today in Istanbul. */
export function istToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function addDays(day, n) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
}
/** A YYYY-MM-DD (already an Istanbul day) as "27 Sep" / "27 Eyl", optionally with the year. */
export function shortDay(day, locale, withYear = false) {
  const [y, m, d] = String(day).split("-").map(Number);
  return formatDate(Date.UTC(y, m - 1, d), locale, { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
}
/** "27 Eyl – 26 Eki 2026" (year on both ends only when they differ). */
export function rangeLabel(from, to, locale) {
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${shortDay(from, locale, !sameYear)} – ${shortDay(to, locale, true)}`;
}
/** "last 30 days" for a preset that ends today, otherwise the dates. */
export function rangeCaption(from, to, today, t, locale) {
  if (to === today) {
    const n = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1;
    if ([7, 30, 90].includes(n)) return t("adminx.sst.captionDays", { count: n });
    if (n === 365) return t("adminx.sst.captionYear");
  }
  return rangeLabel(from, to, locale);
}
/** { date, dateAbl } for a YYYY-MM-DD day ("18 Nis 2026", "18 Nis 2026'dan"). */
export function dayVars(day, locale) {
  return sinceVars(shortDay(day, locale, true), Number(String(day).slice(0, 4)), locale);
}
/** "since 18 Apr 2026" / "18 Nis 2026'dan beri" */
export function sinceText(day, t, locale) {
  if (!day) return "";
  return t("adminx.sst.since", dayVars(day, locale));
}

export function kpiDelta(kind, delta, t, locale) {
  const d = delta || { dir: "flat", value: 0 };
  if (kind === "today") {
    if (d.dir === "up") return { mark: `▲ ${num(d.value, locale)}`, cls: "", rest: ` ${t("adminx.sst.moreThanYesterday")}` };
    if (d.dir === "down") return { mark: `▼ ${num(d.value, locale)}`, cls: "down", rest: ` ${t("adminx.sst.lessThanYesterday")}` };
    return { mark: null, rest: t("adminx.sst.sameAsYesterday") };
  }
  const p = kind === "week" ? "Week" : "Month";
  if (d.value == null) return { mark: null, rest: t(`adminx.sst.none${p}`) };
  if (d.dir === "up") return { mark: `▲ ${pct(d.value, locale)}`, cls: "", rest: ` ${t(`adminx.sst.vs${p}`)}` };
  if (d.dir === "down") return { mark: `▼ ${pct(d.value, locale)}`, cls: "down", rest: ` ${t(`adminx.sst.vs${p}`)}` };
  return { mark: null, rest: t(`adminx.sst.same${p}`) };
}

/** Y axis top: 10, 20, 30, 50, 100, 200, 300, 500, … */
export function niceMax(v) {
  if (v <= 10) return 10;
  let base = 10;
  for (;;) {
    for (const m of [1, 2, 3, 5]) if (v <= base * m) return base * m;
    base *= 10;
  }
}

/** x-axis tick indexes: five evenly spaced (0, 7, 14, 21, 29 for 30 days). */
export function tickIndexes(n) {
  if (n <= 5) return [...Array(n).keys()];
  return [0, 1, 2, 3, 4].map((k) => Math.floor((k * (n - 1)) / 4));
}

export function axisLabel(point, granularity, locale) {
  if (granularity === "month") {
    const [y, m] = point.key.split("-").map(Number);
    return formatDate(Date.UTC(y, m - 1, 15), locale, { month: "short", ...(m === 1 ? { year: "numeric" } : {}), timeZone: "UTC" });
  }
  return shortDay(point.key, locale);
}

/** Tooltip title: "Mon, 26 Oct 2026" / "Week of 19 Oct 2026" / "October 2026". */
export function tipLabel(point, granularity, t, locale) {
  const [y, m, d] = point.key.split("-").map(Number);
  if (granularity === "month") return formatDate(Date.UTC(y, m - 1, 15), locale, { month: "long", year: "numeric", timeZone: "UTC" });
  if (granularity === "week") return t("adminx.sst.weekOf", { date: shortDay(point.key, locale, true) });
  return formatDate(Date.UTC(y, m - 1, d), locale, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Source rows come from the server with a Turkish label; known non-brand keys are translated here. */
const SOURCE_KEYS = { direct: "direct", google_organic: "googleOrganic", referral: "invite", invite: "invite", other: "other", unknown: "unknown" };
export function sourceLabel(row, t) {
  const k = SOURCE_KEYS[row.key];
  if (!k) return row.label;
  return k === "other" || k === "unknown" ? t(`adminx.sst.${k}`) : t(`adminx.sst.source.${k}`);
}

/** Index of the busiest bucket (first one on ties); the tooltip starts there. */
export function peakIndex(series) {
  let best = -1;
  let idx = Math.max(0, series.length - 1);
  series.forEach((s, i) => {
    if (s.count > best) {
      best = s.count;
      idx = i;
    }
  });
  return idx;
}

export function flag(code) {
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
export function countryRow(c, i, t, locale) {
  if (c.code === "other") return { label: t("adminx.sst.other"), color: "#9AA3B8", count: c.count };
  if (c.code === "unknown") return { label: t("adminx.sst.unknown"), muted: true, count: c.count };
  return { label: `${flag(c.code)} ${displayName(c.code, locale)}`, color: i === 0 ? null : "#8E8CF8", count: c.count };
}

/** [key, label key (null = brand name, shown as is), colour] */
export const AUTH_SEGMENTS = [
  ["email", "adminx.sst.email", "#587AF6"],
  ["google", null, "#30D158"],
  ["other", "adminx.sst.other", "#9AA3B8"],
  ["unknown", "adminx.sst.unknown", "rgba(255,255,255,.25)"],
];
export function authLabel([key, labelKey], t) {
  return labelKey ? t(labelKey) : key === "google" ? "Google" : key;
}

export function pctOf(v, tot) {
  return tot > 0 ? Math.round((v / tot) * 100) : 0;
}
