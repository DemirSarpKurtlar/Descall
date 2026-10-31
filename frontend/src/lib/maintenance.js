/**
 * Maintenance windows on the client: TRT (Europe/Istanbul, UTC+3, no DST)
 * formatting, countdown parts, which platform this build is, and whether the
 * full-screen block or the pre-announcement banner applies. Pure, no React.
 * Server side: backend/lib/maintenance.js.
 */

import { formatDate, formatNumber } from "../i18n/format.js";
import { getLocale, t } from "../i18n/runtime.js";

export const TRT_OFFSET_MS = 3 * 3600_000;
export const TRT_TIME_ZONE = "Europe/Istanbul";
export const PLATFORMS = ["web", "electron", "ios", "android"];

const pad = (n) => String(n).padStart(2, "0");

function trtParts(value) {
  const t = typeof value === "number" ? value : new Date(value).getTime();
  if (!Number.isFinite(t)) return null;
  const d = new Date(t + TRT_OFFSET_MS);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() };
}

const TZ = { timeZone: TRT_TIME_ZONE };

/** "22 Eki 02:00" (tr), "22 Oct, 02:00" (en): TRT clock, UI language. */
export function formatTrtShort(value, locale = getLocale()) {
  if (!trtParts(value)) return "";
  return formatDate(value, locale, { ...TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}
/** "02:00" */
export function formatTrtTime(value) {
  const p = trtParts(value);
  return p ? `${pad(p.h)}:${pad(p.mi)}` : "";
}
/** "22 Ekim 2026" (tr), "22 October 2026" (en). */
export function formatTrtLongDate(value, locale = getLocale()) {
  if (!trtParts(value)) return "";
  return formatDate(value, locale, { ...TZ, day: "numeric", month: "long", year: "numeric" });
}
export function isSameTrtDay(a, b) {
  const x = trtParts(a);
  const y = trtParts(b);
  return Boolean(x && y && x.y === y.y && x.mo === y.mo && x.d === y.d);
}

/** ISO → { date: "2026-10-22", time: "02:00" } in TRT, for <input type=date/time>. */
export function toTrtInputs(value) {
  const p = trtParts(value);
  if (!p) return { date: "", time: "" };
  return { date: `${p.y}-${pad(p.mo + 1)}-${pad(p.d)}`, time: `${pad(p.h)}:${pad(p.mi)}` };
}
/** TRT date + time inputs → ISO (UTC). */
export function fromTrtInputs(date, time) {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ""));
  const tm = /^(\d{2}):(\d{2})/.exec(String(time || ""));
  if (!dm || !tm) return null;
  const t = Date.UTC(+dm[1], +dm[2] - 1, +dm[3], +tm[1], +tm[2]) - TRT_OFFSET_MS;
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
/** "22.10.2026" from the date input value. */
export function dottedDate(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ""));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}

/** { days, hours, minutes, seconds } until `target`, never negative. */
export function countdownParts(target, now = Date.now()) {
  const t = new Date(target).getTime();
  let s = Math.max(0, Math.floor((t - now) / 1000));
  const days = Math.floor(s / 86400);
  s -= days * 86400;
  const hours = Math.floor(s / 3600);
  s -= hours * 3600;
  const minutes = Math.floor(s / 60);
  return { days, hours, minutes, seconds: s - minutes * 60 };
}

/** "2 sa 30 dk" / "24 dk" / "2 h 30 min" (unit words come from the catalog). */
export function formatDuration(ms, locale = getLocale()) {
  const total = Math.max(0, Math.round(ms / 60000));
  const h = formatNumber(Math.floor(total / 60), locale);
  const m = formatNumber(total % 60, locale);
  if (total < 60) return t("core.dur.m", { m });
  return total % 60 ? t("core.dur.hm", { h, m }) : t("core.dur.h", { h });
}
/** "~2,5 saat" for the banner/preview hint. */
export function approxHours(ms, locale = getLocale()) {
  const h = Math.round((ms / 3600000) * 2) / 2;
  if (h < 1) return t("core.dur.approxM", { n: formatNumber(Math.max(1, Math.round(ms / 60000)), locale) });
  return t("core.dur.approxH", { n: formatNumber(h, locale, { maximumFractionDigits: 1 }) });
}

/** 0..1 progress of an active window. */
export function progress(startsAt, endsAt, now = Date.now()) {
  const a = new Date(startsAt).getTime();
  const b = new Date(endsAt).getTime();
  if (!(b > a)) return 0;
  return Math.min(1, Math.max(0, (now - a) / (b - a)));
}

export function detectPlatform(env = typeof window !== "undefined" ? window : {}) {
  try {
    if (env.electronAPI || /Electron\//.test(env.navigator?.userAgent || "")) return "electron";
    const cap = env.Capacitor;
    if (cap?.isNativePlatform?.()) {
      const p = cap.getPlatform?.();
      if (p === "ios" || p === "android") return p;
    }
  } catch {
    /* fall through */
  }
  return "web";
}

/**
 * Client view of the public state with the local clock. Status is recomputed
 * from the timestamps so a window starts / ends on time even between pushes.
 */
export function localStatus(m, now = Date.now()) {
  if (!m) return null;
  const start = new Date(m.startsAt).getTime();
  const end = m.endsAt ? new Date(m.endsAt).getTime() : NaN;
  if (Number.isFinite(end) && now >= end) return "completed";
  if (now >= start) return m.announced === false ? "pending" : "active";
  return "scheduled";
}

export function appliesToPlatform(m, platform) {
  return Boolean(m && (!Array.isArray(m.platforms) || m.platforms.includes(platform)));
}

/** Full-screen block: active, this platform, and not an admin who may bypass. */
export function shouldBlock(m, { platform, isAdmin = false, now = Date.now() } = {}) {
  if (!m || m.announced === false) return false;
  if (localStatus(m, now) !== "active") return false;
  if (!appliesToPlatform(m, platform)) return false;
  if (isAdmin && m.adminsBypass) return false;
  return true;
}

/** Pre-announcement banner: announced, not started, this platform, not dismissed. */
export function shouldShowBanner(m, { platform, now = Date.now(), dismissedId = null } = {}) {
  if (!m || m.announced === false || !m.announceAt) return false;
  if (localStatus(m, now) !== "scheduled") return false;
  if (now < new Date(m.announceAt).getTime()) return false;
  if (!appliesToPlatform(m, platform)) return false;
  return dismissedId !== m.id;
}
