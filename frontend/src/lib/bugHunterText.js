/*
 * Bug Hunter (#11) tooltip text, pure (bugHunterText.selftest.mjs):
 *   "Bug Hunter II"
 *   "12 gerçek bug buldu · Kasım 2026'dan beri"
 *   "2 kritik · 4 yüksek · 6 orta · +1 o da buldu"
 * Numbers come with the badge payload (backend lib/specialBadges.js -> bugHunter levelsFor).
 */
import { formatDate, formatNumber, lower } from "../i18n/format.js";
import { APP_TIMEZONE } from "./datetime.js";

export const ROMAN = { 1: "I", 2: "II", 3: "III" };
const SEV_KEYS = [["critical", "bhunt.sevCritical"], ["high", "bhunt.sevHigh"], ["medium", "bhunt.sevMedium"], ["low", "bhunt.sevLow"]];

/** Turkish ablative suffix for a year as it is read aloud: 2025'ten, 2026'dan, 2020'den. */
const ONES = { 1: "den", 2: "den", 3: "ten", 4: "ten", 5: "ten", 6: "dan", 7: "den", 8: "den", 9: "dan" };
const TENS = { 1: "dan", 2: "den", 3: "dan", 4: "tan", 5: "den", 6: "tan", 7: "ten", 8: "den", 9: "dan" };
export function yearAblative(y) {
  const n = Math.abs(Math.trunc(y));
  if (n % 10) return ONES[n % 10];
  if (n % 100) return TENS[(n % 100) / 10];
  return "den";
}

/** "Kasım 2026'dan beri" / "since November 2026", or null without a date. */
export function sinceText(iso, t, locale) {
  if (!iso || !Number.isFinite(Date.parse(iso))) return null;
  const date = formatDate(iso, locale, { month: "long", year: "numeric", timeZone: APP_TIMEZONE });
  if (!date) return null;
  const year = Number(formatDate(iso, "en", { year: "numeric", timeZone: APP_TIMEZONE }));
  return t("bhunt.tipSince", { date, dateAbl: locale === "tr" ? `${date}'${yearAblative(year)}` : date });
}

/** "2 kritik · 4 yüksek" (first credits by severity, only the ones there are). */
export function severityText(sev, t, locale) {
  if (!sev) return "";
  return SEV_KEYS.filter(([k]) => Number(sev[k]) > 0)
    .map(([k, key]) => `${formatNumber(Number(sev[k]), locale)} ${lower(t(key), locale)}`)
    .join(" · ");
}

/** The three tooltip lines; `name` is the badge's localized name. */
export function tipLines(stats, { t, locale, name }) {
  if (!stats) return { title: name, line: null, mix: null };
  const level = ROMAN[stats.level] || "I";
  const parts = [];
  if (stats.bugs > 0) parts.push(t("bhunt.tipBugs", { count: stats.bugs }));
  const since = sinceText(stats.since, t, locale);
  if (since) parts.push(since);
  const mix = [severityText(stats.severity, t, locale), stats.also > 0 ? t("bhunt.tipAlso", { count: formatNumber(stats.also, locale) }) : ""].filter(Boolean).join(" · ");
  return { title: `${name} ${level}`, line: parts.join(" · ") || null, mix: mix || null };
}
