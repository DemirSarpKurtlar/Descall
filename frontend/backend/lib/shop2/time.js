"use strict";

/**
 * Market 2.0 clock. Everything that resets daily (storefront, refresh, gift caps) uses the
 * Europe/Istanbul calendar day. Istanbul is UTC+3 all year (no DST since 2016), so a fixed
 * offset is exact and keeps the pure algorithms free of Intl.
 */

const TZ_OFFSET_MIN = 180;
const OFF = TZ_OFFSET_MIN * 60_000;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MIN_MS = 60_000;

function ms(value) {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

/** "YYYY-MM-DD" of the Istanbul day that contains `t`. */
function dayKey(t = Date.now()) {
  return new Date(ms(t) + OFF).toISOString().slice(0, 10);
}

/** UTC ms of 00:00 Istanbul on day `key`. */
function dayStartMs(key) {
  return Date.parse(`${key}T00:00:00Z`) - OFF;
}

function addDays(key, n) {
  return dayKey(dayStartMs(key) + n * DAY_MS + HOUR_MS);
}

/** Whole days between two day keys (b - a). */
function daysBetween(a, b) {
  return Math.round((dayStartMs(b) - dayStartMs(a)) / DAY_MS);
}

/** Next 00:00 Istanbul strictly after `t`. */
function nextMidnightMs(t = Date.now()) {
  return dayStartMs(dayKey(t)) + DAY_MS;
}

/** Istanbul hour (0-23) and weekday (0 = Sunday) of `t`. */
function localParts(t = Date.now()) {
  const d = new Date(ms(t) + OFF);
  return { hour: d.getUTCHours(), minute: d.getUTCMinutes(), weekday: d.getUTCDay(), day: d.toISOString().slice(0, 10) };
}

/** UTC ms of `hour`:00 Istanbul on day `key`. */
function atLocalHour(key, hour, minute = 0) {
  return dayStartMs(key) + hour * HOUR_MS + minute * MIN_MS;
}

function iso(t) {
  return new Date(ms(t)).toISOString();
}

/** Day keys from `fromKey`, `n` days, oldest first. */
function dayRange(fromKey, n) {
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(addDays(fromKey, i));
  return out;
}

module.exports = { TZ_OFFSET_MIN, DAY_MS, HOUR_MS, MIN_MS, ms, dayKey, dayStartMs, addDays, daysBetween, nextMidnightMs, localParts, atLocalHour, iso, dayRange };
