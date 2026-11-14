/** Date / number display for the user file (locale from useLocale, Europe/Istanbul like the rest of the admin). */
import { formatAppDateTime } from "../../../lib/datetime";
import { formatNumber, formatRelativeTime } from "../../../i18n/format.js";
import { intlTag } from "../../../i18n/registry.js";
import { compactNumber, voiceAmount } from "./dossierModel.js";

/** "14 Kas 20:01" */
export function shortWhen(value, locale) {
  if (!value) return "";
  return formatAppDateTime(value, locale, { day: "numeric", month: "short", year: undefined, second: undefined }) || "";
}

/** "18 Nis 2026" */
export function dayWhen(value, locale) {
  if (!value) return "";
  return formatAppDateTime(value, locale, { day: "numeric", month: "short", year: "numeric", hour: undefined, minute: undefined, second: undefined }) || "";
}

/** "2 saat önce" (relative, locale aware), falls back to the short date after a week. */
export function agoWhen(value, locale, now = Date.now()) {
  const t = Date.parse(value || "");
  if (!Number.isFinite(t)) return "";
  if (now - t > 7 * 86400000) return shortWhen(value, locale);
  return formatRelativeTime(value, locale, { now }) || shortWhen(value, locale);
}

export function num(value, locale) {
  return formatNumber(Number(value) || 0, locale);
}

export function compact(value, locale) {
  return compactNumber(value, intlTag(locale));
}

/** "14 sa" / "35 dk" / "—" for voice time. */
export function voiceText(seconds, t) {
  const v = voiceAmount(seconds);
  if (!v) return "—";
  return v.unit === "h" ? t("dossier.hoursShort", { n: v.n }) : t("dossier.minutesShort", { n: v.n });
}
