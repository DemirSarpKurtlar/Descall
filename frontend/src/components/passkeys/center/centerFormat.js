/**
 * Formatting for the passkey control center: relative "Bugun 09:14", dates, places, the tile
 * of a passkey kind. Plain functions taking `t` and `locale` (selftest: center.selftest.mjs).
 */
import { passkeyKind } from "../../../lib/passkeys/visual.js";

const DAY = 86400000;

function startOfDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function timeText(iso, locale) {
  try {
    return new Intl.DateTimeFormat(locale || undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  } catch {
    return String(iso || "").slice(11, 16);
  }
}

/** "Bugun 09:14" | "Dun 22:40" | "9 gun once" | "Hic kullanilmadi". */
export function relativeUse(iso, t, locale, now = Date.now()) {
  const ms = Date.parse(iso || "");
  if (!Number.isFinite(ms)) return t("passkey.time.never");
  const days = Math.round((startOfDay(now) - startOfDay(ms)) / DAY);
  if (days <= 0) return t("passkey.time.today", { time: timeText(iso, locale) });
  if (days === 1) return t("passkey.time.yesterday", { time: timeText(iso, locale) });
  return t("passkey.time.daysAgo", { count: days });
}

/** Short relative for the activity strip: "09:14" today, "Dun", "3 Kas". */
export function shortWhen(iso, t, locale, now = Date.now()) {
  const ms = Date.parse(iso || "");
  if (!Number.isFinite(ms)) return "";
  const days = Math.round((startOfDay(now) - startOfDay(ms)) / DAY);
  if (days <= 0) return timeText(iso, locale);
  if (days === 1) return t("passkey.time.yesterdayShort");
  return dayMonth(iso, locale);
}

export function dayMonth(iso, locale) {
  try {
    return new Intl.DateTimeFormat(locale || undefined, { day: "numeric", month: "short" }).format(new Date(iso));
  } catch {
    return String(iso || "").slice(5, 10);
  }
}

export function fullDate(iso, locale) {
  try {
    return new Intl.DateTimeFormat(locale || undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
  } catch {
    return String(iso || "").slice(0, 10);
  }
}

export function yearOf(iso) {
  const d = new Date(iso || "");
  return Number.isFinite(d.getTime()) ? String(d.getFullYear()) : "";
}

export function countryName(code, locale) {
  if (!code) return "";
  try {
    return new Intl.DisplayNames([locale || "en", "en"], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
}

/** City when known, else the country name, else "". */
export function placeName(city, country, locale) {
  return city || countryName(country, locale) || "";
}

/** Sync line of the drawer ("Yalnizca bu cihaz", "iPhone, iPad ve Mac ile esitlenir", ...). */
export function syncText(p, t) {
  const kind = passkeyKind(p);
  if (kind === "key") return t("passkey.center.sync.key");
  if (!p.synced && !p.backupEligible) return t("passkey.center.sync.local");
  if (kind === "ios" || kind === "mac") return t("passkey.center.sync.icloud");
  if (kind === "android") return t("passkey.center.sync.google");
  if (p.provider) return t("passkey.center.sync.manager", { provider: p.provider });
  return t("passkey.center.sync.synced");
}

/** Provider line under a name: the provider, else a word for the kind. */
export function providerText(p, t) {
  if (p.provider) return p.provider;
  return t(`passkey.center.kind.${passkeyKind(p)}`);
}

/** Last-use client and place: "Masaustu · Istanbul". */
export function whereText(p, t, locale) {
  const client = p.lastUsedPlatform ? t(`passkey.center.client.${p.lastUsedPlatform}`) : p.platform ? t(`passkey.center.client.${p.platform}`) : "";
  const place = placeName(p.lastCity, p.lastCountry, locale) || placeName(p.createdCity, p.createdCountry, locale);
  return [client, place].filter(Boolean).join(" · ");
}

/** Where it was made: "Masaustu uygulamasi", "Web". */
export function viaText(p, t) {
  return t(`passkey.center.via.${p.platform || "other"}`);
}

/** The colored tile of a kind (draft colors). */
export const KIND_TILE = Object.freeze({ windows: "t-win", ios: "t-ios", mac: "t-mac", android: "t-and", key: "t-key", web: "t-web" });
