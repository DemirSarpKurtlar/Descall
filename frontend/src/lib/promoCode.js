/**
 * Promo code helpers shared by the redeem sheet, gift popup, settings tab and
 * admin tab. Pure functions only (unit-tested in promoCode.selftest.mjs).
 */
import { formatTrtShort, TRT_TIME_ZONE } from "./maintenance.js";
import { formatDate, formatNumber } from "../i18n/format.js";
import { getLocale } from "../i18n/runtime.js";

export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 16;
const TRT_OFFSET_MS = 3 * 3600 * 1000;
const TZ = { timeZone: TRT_TIME_ZONE };
const HM = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
const pad = (n) => String(n).padStart(2, "0");

/** Upper-case, drop everything but A–Z/0–9, cap at 16. */
export function normalizeCode(raw) {
  return String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH);
}

/** "K7QM2XRD9PLAV4TE" → ["K7QM","2XRD","9PLA","V4TE"] (always four entries). */
export function codeGroups(raw) {
  const v = normalizeCode(raw);
  return [0, 1, 2, 3].map((i) => v.slice(i * 4, i * 4 + 4));
}

/** Display form with en dashes, as drawn: "K7QM–2XRD–9PLA–V4TE". */
export function displayCode(raw, sep = "–") {
  return codeGroups(raw).filter(Boolean).join(sep);
}

/** Random 16-char code from the look-alike-free alphabet. */
export function generateCode(randomValues = defaultRandom) {
  const bytes = randomValues(CODE_LENGTH * 2);
  let out = "";
  for (let i = 0; out.length < CODE_LENGTH && i < bytes.length; i += 1) {
    const b = bytes[i];
    if (b < 256 - (256 % CODE_ALPHABET.length)) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  }
  return out.length === CODE_LENGTH ? out : generateCode(randomValues);
}
function defaultRandom(n) {
  const a = new Uint8Array(n);
  globalThis.crypto.getRandomValues(a);
  return a;
}

/** 582 → "09:42" */
export function mmss(totalSeconds) {
  const s = Math.max(0, Math.ceil(Number(totalSeconds) || 0));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

function trt(value) {
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms + TRT_OFFSET_MS);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() };
}

/** Turkish dative suffix for a spoken number ("23:59" → "a", "23:50" → "ye"). */
const UNIT_SFX = ["", "e", "ye", "e", "e", "e", "ya", "ye", "e", "a"];
const TEN_SFX = ["a", "a", "ye", "a", "a", "ye"];
export function dativeSuffixForNumber(n) {
  const v = Math.abs(Math.floor(Number(n) || 0));
  if (v % 10) return UNIT_SFX[v % 10];
  if (v === 0) return "a"; // sıfır
  if (v % 100) return TEN_SFX[(v % 100) / 10];
  return "e"; // yüz, bin
}

/**
 * Popup expiry in the UI language, TRT clock: "31 Ekim 23:59’a" (Turkish keeps its
 * dative suffix), "31 October at 23:59" (en).
 */
export function popupUntil(value, locale = getLocale()) {
  const p = trt(value);
  if (!p) return "";
  const text = formatDate(value, locale, { ...TZ, day: "numeric", month: "long", ...HM });
  if (locale !== "tr") return text;
  return `${text}’${dativeSuffixForNumber(p.mi === 0 ? p.h : p.mi)}`;
}

/** Admin table end date, as drawn: "31 Eki 23:59". */
export function shortWhen(value, locale = getLocale()) {
  return value ? formatTrtShort(value, locale) : "—";
}

/** Long date for the age error: "2 Kasım 2026" / "2 November 2026". */
export function longDate(value, locale = getLocale()) {
  if (!trt(value)) return "";
  return formatDate(value, locale, { ...TZ, day: "numeric", month: "long", year: "numeric" });
}

/** History row: { today: "14:02" } for today (TRT), otherwise "29 Eki 2025". */
export function historyWhen(value, now = Date.now(), locale = getLocale()) {
  const p = trt(value);
  const n = trt(now);
  if (!p || !n) return { date: "" };
  if (p.y === n.y && p.mo === n.mo && p.d === n.d) return { today: formatDate(value, locale, { ...TZ, ...HM }) };
  return { date: formatDate(value, locale, { ...TZ, day: "numeric", month: "short", year: "numeric" }) };
}

/** "1.240" in Turkish, "1,240" in English. */
export function fmtNum(n, locale = getLocale()) {
  return formatNumber(n, locale);
}

/** Status the admin table shows, from the overview row. */
export function codeStatus(row) {
  if (!row) return "active";
  return row.status || "active";
}

/** Seconds left on a rate-limit lock that ends at `until` (ms epoch). */
export function lockLeft(until, now = Date.now()) {
  return Math.max(0, Math.ceil((Number(until) - now) / 1000));
}
