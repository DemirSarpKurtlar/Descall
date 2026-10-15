import { intlLocaleTag, parseAppDate } from "./datetime.js";

const STORAGE_KEY = "descall_call_history_v2";
const MAX = 80;

export function loadCachedCalls(userId) {
  if (!userId || typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${userId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCachedCalls(userId, calls) {
  if (!userId || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(`${STORAGE_KEY}:${userId}`, JSON.stringify((calls || []).slice(0, MAX)));
  } catch {
    /* ignore quota */
  }
}

export function upsertCachedCall(userId, call) {
  if (!userId || !call?.id) return loadCachedCalls(userId);
  const prev = loadCachedCalls(userId).filter((c) => c.id !== call.id);
  const next = [call, ...prev].slice(0, MAX);
  saveCachedCalls(userId, next);
  return next;
}

export function formatCallDuration(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  if (s <= 0) return "";
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r}s`;
  return `${m}m ${r.toString().padStart(2, "0")}s`;
}

function part(parts, type) {
  return parts.find((p) => p.type === type)?.value || "";
}

/** HH:mm in the device time zone. No timeZone option, so Intl uses the device. */
function localClock(date, locale) {
  const parts = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    hour12: false,
  }).formatToParts(date);
  let hour = part(parts, "hour");
  if (hour === "24") hour = "00";
  const minute = part(parts, "minute");
  if (!hour || !minute) return "";
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

/** Calendar day in the device time zone, YYYY-MM-DD. */
function localDayKey(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = part(parts, "year");
  const month = part(parts, "month");
  const day = part(parts, "day");
  if (!year || !month || !day) return "";
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/**
 * Call history clock in the viewer's device time zone, 24-hour.
 * Today "Bugün 16:05", yesterday "Dün 09:12", older "12 Eki 16:05".
 */
export function formatCallWhen(iso, options = {}) {
  if (!iso) return "";
  const locale = intlLocaleTag(options.locale);
  const todayLabel = options.todayLabel || "Today";
  const yesterdayLabel = options.yesterdayLabel || "Yesterday";
  try {
    const d = parseAppDate(iso);
    if (!d) return "";
    const time = localClock(d, locale);
    if (!time) return "";
    const now = options.now instanceof Date ? options.now : new Date();
    const callDay = localDayKey(d);
    const today = localDayKey(now);
    if (callDay && callDay === today) return `${todayLabel} ${time}`;
    const yesterday = new Date(now.getTime());
    yesterday.setDate(yesterday.getDate() - 1);
    if (callDay && callDay === localDayKey(yesterday)) return `${yesterdayLabel} ${time}`;
    const day = part(
      new Intl.DateTimeFormat(locale, { day: "2-digit" }).formatToParts(d),
      "day"
    ).padStart(2, "0");
    const month = part(
      new Intl.DateTimeFormat(locale, { month: "short" }).formatToParts(d),
      "month"
    ).replace(/\.$/, "");
    if (!day || !month) return time;
    return `${day} ${month} ${time}`;
  } catch {
    return "";
  }
}
