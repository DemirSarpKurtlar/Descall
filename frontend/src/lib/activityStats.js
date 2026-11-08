/**
 * Activity page ("Pano", approved draft A, 2026-11-08): everything the page derives from
 * the grouped history rows (GET /api/activity/history) and the live activity. Pure, so it
 * is covered by activityStats.selftest.mjs and safe to call on every render.
 *
 * A history row: { id, app_name, app_type, display_name, started_at, ended_at, duration_sec,
 * is_manual }. Times are ISO strings; days are local calendar days.
 */

/** Sessions shorter than this are scanner noise ("0m" rows); the page hides them. */
export const MIN_VISIBLE_SEC = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Playing Rocket League" -> { verb: "playing", name: "Rocket League" }. */
const VERBS = [
  ["playing", /^Playing\s+(.+)$/],
  ["listening", /^Listening to\s+(.+)$/],
  ["browsing", /^Browsing with\s+(.+)$/],
  ["coding", /^Coding in\s+(.+)$/],
  ["creating", /^Creating in\s+(.+)$/],
  ["watching", /^Watching with\s+(.+)$/],
  ["using", /^Using\s+(.+)$/],
  ["in", /^In\s+(.+)$/],
];

export function parseActivityLabel(label) {
  const text = String(label || "").trim();
  for (const [verb, re] of VERBS) {
    const m = re.exec(text);
    if (m) return { verb, name: m[1].trim() };
  }
  return { verb: null, name: text };
}

/** The app or game name of a row or of the live activity. */
export function activityName(entry) {
  if (!entry) return "";
  const label = entry.display_name ?? entry.displayName;
  const parsed = parseActivityLabel(label);
  if (parsed.verb) return parsed.name;
  const app = entry.app_name ?? entry.appName;
  if (app && app !== "manual") return String(app);
  return parsed.name;
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A stable colour per app or game name, so the same game keeps one colour everywhere. */
export function gameHue(name) {
  return hashString(String(name || "").trim().toLowerCase()) % 360;
}

/** Clearly different colours, handed out to the user's games by play time (most played
 *  first), so the games on one screen never share a colour. */
export const GAME_PALETTE = [
  "#3b8cff", "#f59e0b", "#a970ff", "#3fbf5f", "#ef5b7a", "#14b8c4",
  "#f97316", "#8b9cf7", "#d4c12a", "#e879f9", "#22c55e", "#fb7185",
];

/** Name -> colour for this history: palette by total time, a hash for anything later. */
export function buildGameColors(rows) {
  const totals = new Map();
  for (const r of rows || []) {
    const name = activityName(r);
    if (!name) continue;
    const key = name.trim().toLowerCase();
    totals.set(key, (totals.get(key) || 0) + rowSeconds(r));
  }
  const map = new Map();
  [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .forEach(([key], i) => { if (i < GAME_PALETTE.length) map.set(key, GAME_PALETTE[i]); });
  return (name) => map.get(String(name || "").trim().toLowerCase()) || gameColor(name);
}

export function gameColor(name) {
  return `hsl(${gameHue(name)} 72% 56%)`;
}

/** Two-letter tile text: initials of the first two words, or the first two letters. */
export function gameMonogram(name) {
  const words = String(name || "").replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function ms(value) {
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? n : NaN;
}

/** Duration of a row in seconds (ended - started when duration_sec is missing). */
export function rowSeconds(row) {
  const d = Number(row?.duration_sec);
  if (Number.isFinite(d) && d > 0) return d;
  const a = ms(row?.started_at);
  const b = ms(row?.ended_at);
  return Number.isFinite(a) && Number.isFinite(b) && b > a ? Math.round((b - a) / 1000) : 0;
}

/** Visible sessions, newest first: no sub-minute noise, no rows without a start. */
export function cleanHistory(history) {
  return (history || [])
    .filter((r) => r && Number.isFinite(ms(r.started_at)) && rowSeconds(r) >= MIN_VISIBLE_SEC)
    .sort((a, b) => ms(b.started_at) - ms(a.started_at));
}

export function startOfDay(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Calendar days between two day starts (DST safe). */
function dayDiff(aStart, bStart) {
  return Math.round((aStart - bStart) / DAY_MS);
}

/** The live activity as a session row (it is not in the history until it ends). */
export function liveRow(current, now = Date.now()) {
  if (!current?.startedAt) return null;
  const start = ms(current.startedAt);
  if (!Number.isFinite(start) || start > now) return null;
  return {
    id: "live",
    live: true,
    app_name: current.appName,
    app_type: current.appType,
    display_name: current.displayName,
    started_at: new Date(start).toISOString(),
    ended_at: null,
    duration_sec: Math.max(0, Math.round((now - start) / 1000)),
  };
}

/**
 * Sessions grouped by local day, newest day first: [{ dayStart, offset, items, totalSec }].
 * offset is 0 for today, 1 for yesterday, and so on.
 */
export function groupByDay(rows, now = Date.now()) {
  const today = startOfDay(now);
  const map = new Map();
  for (const r of rows) {
    const day = startOfDay(ms(r.started_at));
    if (!map.has(day)) map.set(day, { dayStart: day, offset: dayDiff(today, day), items: [], totalSec: 0 });
    const g = map.get(day);
    g.items.push(r);
    g.totalSec += rowSeconds(r);
  }
  return [...map.values()].sort((a, b) => b.dayStart - a.dayStart);
}

/** Seconds per game over the last `days` days (today included), most played first. */
export function topGames(rows, days, now = Date.now()) {
  const from = startOfDay(now) - (days - 1) * DAY_MS;
  const totals = new Map();
  for (const r of rows) {
    if (ms(r.started_at) < from) continue;
    const name = activityName(r);
    if (!name) continue;
    const cur = totals.get(name) || { name, type: r.app_type, seconds: 0, sessions: 0 };
    cur.seconds += rowSeconds(r);
    cur.sessions += 1;
    totals.set(name, cur);
  }
  return [...totals.values()].sort((a, b) => b.seconds - a.seconds);
}

/**
 * The last seven days, oldest first, for the bar chart:
 * [{ dayStart, offset, totalSec, parts: [{ name, seconds }] }].
 */
export function lastSevenDays(rows, now = Date.now()) {
  const today = startOfDay(now);
  const days = [];
  for (let i = 6; i >= 0; i--) days.push({ dayStart: today - i * DAY_MS, offset: i, totalSec: 0, byName: new Map() });
  for (const r of rows) {
    const d = startOfDay(ms(r.started_at));
    const slot = days.find((x) => startOfDay(x.dayStart) === d);
    if (!slot) continue;
    const s = rowSeconds(r);
    const name = activityName(r);
    slot.totalSec += s;
    slot.byName.set(name, (slot.byName.get(name) || 0) + s);
  }
  return days.map(({ byName, ...d }) => ({
    ...d,
    parts: [...byName.entries()].map(([name, seconds]) => ({ name, seconds })).sort((a, b) => b.seconds - a.seconds),
  }));
}

/** Consecutive active days ending today (or yesterday, when today has nothing yet). */
export function streakDays(rows, now = Date.now()) {
  const active = new Set(rows.map((r) => startOfDay(ms(r.started_at))));
  let day = startOfDay(now);
  if (!active.has(day)) day -= DAY_MS;
  let n = 0;
  while (active.has(startOfDay(day))) {
    n += 1;
    day -= DAY_MS;
  }
  return n;
}

/**
 * Summary tiles: this week's (last 7 days) total, the 7 days before it, the change in
 * percent (null when there is nothing to compare with), session count and average.
 */
export function weekSummary(rows, now = Date.now()) {
  const today = startOfDay(now);
  const weekFrom = today - 6 * DAY_MS;
  const prevFrom = weekFrom - 7 * DAY_MS;
  let week = 0;
  let prev = 0;
  let sessions = 0;
  for (const r of rows) {
    const t = ms(r.started_at);
    const s = rowSeconds(r);
    if (t >= weekFrom) {
      week += s;
      sessions += 1;
    } else if (t >= prevFrom) prev += s;
  }
  const change = prev > 0 ? Math.round(((week - prev) / prev) * 100) : null;
  return { weekSec: week, prevSec: prev, change, sessions, avgSec: sessions ? Math.round(week / sessions) : 0 };
}

/** Where a session sits in its day, as percentages of 24 hours (for the day line). */
export function dayPosition(row) {
  const start = ms(row.started_at);
  const day = startOfDay(start);
  const left = ((start - day) / DAY_MS) * 100;
  const width = Math.min(100 - left, (rowSeconds(row) * 1000 / DAY_MS) * 100);
  return { left: Math.max(0, left), width: Math.max(0, width) };
}

/** "1 sa 5 dk"-style parts: { h, m } rounded down to minutes. */
export function splitDuration(seconds) {
  const total = Math.max(0, Math.floor((Number(seconds) || 0) / 60));
  return { h: Math.floor(total / 60), m: total % 60 };
}
