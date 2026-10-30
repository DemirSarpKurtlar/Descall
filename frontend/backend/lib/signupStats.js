"use strict";

/**
 * Yönetici Paneli › Kayıt İstatistikleri (Descall 3.0.0).
 *
 *  - computeSignupStats(): pure aggregation (unit tested), Istanbul calendar days.
 *  - recordActiveDay(): one user_active_days row per user per Istanbul day (D1 / D7).
 *  - trackSignupAttempt(): outcome of POST /auth/register into signup_attempts.
 *    Only an HMAC of (ip, user agent, day) is stored, never the address, e-mail or name.
 *  - pruneOldRows(): ~400 day retention for both tables.
 */

const crypto = require("crypto");
const supabase = require("../db/supabase");

const TZ = "Europe/Istanbul";
const RETENTION_DAYS = 400;
const DAY_MS = 86400000;
const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const WEEKDAYS = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "2026-10-26" for an instant, in Istanbul time. */
function istDay(when) {
  const d = when instanceof Date ? when : new Date(when);
  if (Number.isNaN(d.getTime())) return null;
  return dayFmt.format(d);
}
function istTime(when) {
  return timeFmt.format(when instanceof Date ? when : new Date(when));
}

const toUtc = (day) => Date.parse(`${day}T00:00:00Z`);
const fromUtc = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (day, n) => fromUtc(toUtc(day) + n * DAY_MS);
const diffDays = (a, b) => Math.round((toUtc(b) - toUtc(a)) / DAY_MS);
const isDay = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(toUtc(v)) && fromUtc(toUtc(v)) === v;

function dayLabel(day, { year = false, weekday = false } = {}) {
  const d = new Date(toUtc(day));
  let s = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  if (year) s += ` ${d.getUTCFullYear()}`;
  if (weekday) s += ` · ${WEEKDAYS[d.getUTCDay()]}`;
  return s;
}

/** ISO week start (Monday) of a day key. */
function weekStart(day) {
  const dow = (new Date(toUtc(day)).getUTCDay() + 6) % 7;
  return addDays(day, -dow);
}
const monthStart = (day) => `${day.slice(0, 7)}-01`;

function bucketKey(day, granularity) {
  if (granularity === "week") return weekStart(day);
  if (granularity === "month") return monthStart(day);
  return day;
}
function nextBucket(key, granularity) {
  if (granularity === "week") return addDays(key, 7);
  if (granularity === "month") {
    const [y, m] = key.split("-").map(Number);
    return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  }
  return addDays(key, 1);
}

/** Validated range: defaults to the last 30 days ending today (Istanbul). Max ~3 years. */
function resolveRange({ from, to, granularity } = {}, now = new Date()) {
  const today = istDay(now);
  const g = ["day", "week", "month"].includes(granularity) ? granularity : "day";
  let end = isDay(to) ? to : today;
  if (end > today) end = today;
  let start = isDay(from) ? from : addDays(end, -29);
  if (start > end) start = end;
  if (diffDays(start, end) > 1100) start = addDays(end, -1100);
  return { from: start, to: end, granularity: g, today };
}

const SOURCE_LABELS = {
  direct: "Doğrudan",
  google_organic: "Google (organik)",
  google_ads: "Google Ads",
  referral: "Arkadaş daveti",
  invite: "Arkadaş daveti",
  discord: "Discord",
  instagram: "Instagram",
  reddit: "Reddit",
  youtube: "YouTube",
  twitter: "X (Twitter)",
  tiktok: "TikTok",
  facebook: "Facebook",
  bing_organic: "Bing",
  bing_ads: "Bing Ads",
};
const SOURCE_COLORS = { referral: "#30D158", invite: "#30D158", discord: "#8E8CF8", instagram: "#FF5E8A", google_ads: "#F5A524", reddit: "#FF7A45", youtube: "#FF5C5C", twitter: "#9AA3B8", tiktok: "#14B8A6" };

function pct(a, b) {
  return b > 0 ? Math.round((a / b) * 100) : 0;
}

function delta(cur, prev, { percent }) {
  if (percent) {
    if (!prev) return { dir: cur > 0 ? "up" : "flat", value: null };
    const p = Math.round(((cur - prev) / prev) * 100);
    return { dir: p > 0 ? "up" : p < 0 ? "down" : "flat", value: Math.abs(p) };
  }
  const d = cur - prev;
  return { dir: d > 0 ? "up" : d < 0 ? "down" : "flat", value: Math.abs(d) };
}

/**
 * users:        [{ id, created_at, signup_at, auth_method, first_touch_source, signup_country, first_app_opened_at, deleted_at }]
 * startedDays:  ["2026-10-01", …] Istanbul day of each signup_started event (one per visitor)
 * attempts:     [{ created_at, status, attempt_key }]
 * activeDays:   [{ user_id, day }]
 */
function computeSignupStats({ users = [], startedDays = [], attempts = [], activeDays = [], range, now = new Date() }) {
  const { from, to, granularity, today } = range;
  const signupDay = new Map();
  const byDay = new Map();
  for (const u of users) {
    const d = istDay(u.signup_at || u.created_at);
    if (!d) continue;
    signupDay.set(String(u.id), d);
    byDay.set(d, (byDay.get(d) || 0) + 1);
  }
  const countBetween = (a, b) => {
    let n = 0;
    for (const [d, c] of byDay) if (d >= a && d <= b) n += c;
    return n;
  };

  // KPIs (rolling windows ending today).
  const kToday = countBetween(today, today);
  const kYesterday = countBetween(addDays(today, -1), addDays(today, -1));
  const k7 = countBetween(addDays(today, -6), today);
  const kPrev7 = countBetween(addDays(today, -13), addDays(today, -7));
  const k30 = countBetween(addDays(today, -29), today);
  const kPrev30 = countBetween(addDays(today, -59), addDays(today, -30));
  let firstDay = null;
  let deleted = 0;
  for (const u of users) {
    const d = signupDay.get(String(u.id));
    if (d && (!firstDay || d < firstDay)) firstDay = d;
    if (u.deleted_at) deleted += 1;
  }
  const kpis = {
    today: { value: kToday, delta: delta(kToday, kYesterday, { percent: false }) },
    week: { value: k7, delta: delta(k7, kPrev7, { percent: true }) },
    month: { value: k30, delta: delta(k30, kPrev30, { percent: true }) },
    total: { value: users.length, since: firstDay, sinceLabel: firstDay ? dayLabel(firstDay, { year: true }) : null, deleted },
  };

  // Trend: buckets inside [from, to]; trailing average uses the days before `from` too.
  const span = granularity === "week" ? 4 : granularity === "month" ? 3 : 7;
  const keys = [];
  for (let k = bucketKey(from, granularity); k <= to; k = nextBucket(k, granularity)) keys.push(k);
  const bucketCount = (k) => {
    const end = addDays(nextBucket(k, granularity), -1);
    return countBetween(k < from ? from : k, end > to ? to : end);
  };
  const fullCount = (k) => countBetween(k, addDays(nextBucket(k, granularity), -1));
  const series = keys.map((k) => {
    const back = [];
    let p = k;
    for (let i = 0; i < span; i += 1) {
      back.push(fullCount(p));
      p = granularity === "day" ? addDays(p, -1) : granularity === "week" ? addDays(p, -7) : monthStart(addDays(p, -1));
    }
    const avg = back.reduce((a, b) => a + b, 0) / span;
    return { key: k, label: dayLabel(k), tip: granularity === "month" ? `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}` : granularity === "week" ? `${dayLabel(k, { year: true })} haftası` : dayLabel(k, { year: true, weekday: true }), count: bucketCount(k), avg: Math.round(avg * 100) / 100 };
  });

  // Funnel (range).
  const inRange = (d) => d && d >= from && d <= to;
  const started = startedDays.filter(inRange).length;
  const rangeUsers = users.filter((u) => inRange(signupDay.get(String(u.id))));
  const completed = rangeUsers.length;
  const appOpened = rangeUsers.filter((u) => u.first_app_opened_at).length;
  const okKeys = new Set();
  const failKeys = new Set();
  for (const a of attempts) {
    if (!inRange(istDay(a.created_at))) continue;
    if (a.status === "completed") okKeys.add(a.attempt_key);
    else if (a.status === "failed") failKeys.add(a.attempt_key);
  }
  let failed = 0;
  for (const k of failKeys) if (!okKeys.has(k)) failed += 1;
  const startedTotal = Math.max(started, completed + failed);
  const funnel = { started: startedTotal, completed, appOpened, failed, abandoned: Math.max(0, startedTotal - completed - failed), completedPct: pct(completed, startedTotal) };

  // Sources (all time).
  const src = new Map();
  let unknownSource = 0;
  for (const u of users) {
    const k = String(u.first_touch_source || "").trim().toLowerCase();
    if (!k || k === "unknown") { unknownSource += 1; continue; }
    const key = k === "invite" ? "referral" : k;
    src.set(key, (src.get(key) || 0) + 1);
  }
  const known = [...src.entries()].filter(([k]) => SOURCE_LABELS[k]).sort((a, b) => b[1] - a[1]);
  const top = known.slice(0, 5);
  const other = [...src.entries()].reduce((n, [k, c]) => n + c, 0) - top.reduce((n, [, c]) => n + c, 0);
  const sources = top.map(([k, c]) => ({ key: k, label: SOURCE_LABELS[k], color: SOURCE_COLORS[k] || null, count: c }));
  if (other > 0) sources.push({ key: "other", label: "Diğer", color: "#9AA3B8", count: other });
  sources.push({ key: "unknown", label: "Bilinmiyor", color: null, muted: true, count: unknownSource });

  // Sign-in method (all time).
  const authMethods = { email: 0, google: 0, other: 0, unknown: 0 };
  for (const u of users) {
    const m = String(u.auth_method || "").toLowerCase();
    if (!m) authMethods.unknown += 1;
    else if (m === "email" || m === "google") authMethods[m] += 1;
    else authMethods.other += 1;
  }

  // D1 / D7 (signups in range, counted only once tracking existed and the day has passed).
  let trackingStart = null;
  const active = new Set();
  for (const r of activeDays) {
    if (!r?.day) continue;
    const d = String(r.day).slice(0, 10);
    active.add(`${r.user_id}|${d}`);
    if (!trackingStart || d < trackingStart) trackingStart = d;
  }
  const ret = { d1: { returned: 0, eligible: 0 }, d7: { returned: 0, eligible: 0 }, trackingStart };
  if (trackingStart) {
    for (const u of rangeUsers) {
      const d = signupDay.get(String(u.id));
      if (d < trackingStart) continue;
      for (const [key, n] of [["d1", 1], ["d7", 7]]) {
        const target = addDays(d, n);
        if (target >= today) continue; // that day is not over yet
        ret[key].eligible += 1;
        if (active.has(`${u.id}|${target}`)) ret[key].returned += 1;
      }
    }
  }

  // Countries (all time); rows from before country tracking are "Bilinmiyor".
  const cc = new Map();
  let unknownCountry = 0;
  let countrySince = null;
  for (const u of users) {
    const c = String(u.signup_country || "").toUpperCase();
    if (!/^[A-Z]{2}$/.test(c)) { unknownCountry += 1; continue; }
    cc.set(c, (cc.get(c) || 0) + 1);
    const d = signupDay.get(String(u.id));
    if (d && (!countrySince || d < countrySince)) countrySince = d;
  }
  const ctop = [...cc.entries()].sort((a, b) => b[1] - a[1]);
  const countries = ctop.slice(0, 3).map(([code, count]) => ({ code, count }));
  const cOther = ctop.slice(3).reduce((n, [, c]) => n + c, 0);
  if (cOther) countries.push({ code: "other", count: cOther });
  countries.push({ code: "unknown", count: unknownCountry });

  return {
    tz: TZ,
    range: { from, to, granularity, fromLabel: dayLabel(from), toLabel: dayLabel(to, { year: true }) },
    updatedAt: now.toISOString(),
    updatedLabel: istTime(now),
    kpis,
    series,
    avgSpan: span,
    funnel,
    sources,
    total: users.length,
    authMethods,
    retention: ret,
    countries,
    countrySince: countrySince ? dayLabel(countrySince, { year: true }) : null,
    countrySinceDay: countrySince,
  };
}

/** CSV of the trend buckets (UTF-8 BOM so Excel opens Turkish characters). */
function statsCsv(stats) {
  const rows = [["donem", "kayit", "ortalama"]];
  for (const s of stats.series) rows.push([s.key, String(s.count), String(s.avg).replace(".", ",")]);
  return "\uFEFF" + rows.map((r) => r.join(";")).join("\r\n") + "\r\n";
}

// ---- write paths -------------------------------------------------------------

function hashKey() {
  return process.env.SIGNUP_STATS_HASH_KEY || process.env.JWT_SECRET || "descall-signup-stats";
}

/** HMAC of (ip, ua, Istanbul day): groups one browser's retries, not reversible, rotates daily. */
function attemptKey(ip, ua, day) {
  return crypto.createHmac("sha256", hashKey()).update(`${ip || "-"}\n${ua || "-"}\n${day}`).digest("hex").slice(0, 32);
}

const recorded = new Map(); // userId -> last recorded Istanbul day (per process)
async function recordActiveDay(userId, now = new Date()) {
  if (!userId) return false;
  const day = istDay(now);
  if (recorded.get(userId) === day) return false;
  recorded.set(userId, day);
  if (recorded.size > 50000) recorded.clear();
  try {
    const { error } = await supabase.from("user_active_days").upsert({ user_id: userId, day }, { onConflict: "user_id,day", ignoreDuplicates: true });
    if (error) {
      recorded.delete(userId);
      if (!/does not exist|schema cache/i.test(String(error.message || ""))) console.warn("[signup-stats] active day write failed");
      return false;
    }
    return true;
  } catch {
    recorded.delete(userId);
    return false;
  }
}

function failureReason(status) {
  if (status === 429) return "rate_limited";
  if (status === 409) return "conflict";
  if (status >= 400 && status < 500) return "validation";
  return "error";
}

/** Express helper: call at the top of POST /auth/register; records the outcome when the response ends. */
function trackSignupAttempt(req, res, { method = "email", countryFromHeaders } = {}) {
  const day = istDay(new Date());
  const key = attemptKey(req.ip || "", String(req.headers?.["user-agent"] || "").slice(0, 300), day);
  let country = null;
  try {
    const c = countryFromHeaders ? countryFromHeaders(req.headers || {}) : "";
    country = /^[A-Z]{2}$/.test(c) ? c : null;
  } catch {
    country = null;
  }
  res.on("finish", () => {
    const ok = res.statusCode >= 200 && res.statusCode < 300;
    const row = { status: ok ? "completed" : "failed", reason: ok ? null : failureReason(res.statusCode), method, attempt_key: key, country };
    Promise.resolve(supabase.from("signup_attempts").insert(row))
      .then((r) => {
        if (r?.error && !/does not exist|schema cache/i.test(String(r.error.message || ""))) console.warn("[signup-stats] attempt write failed");
      })
      .catch(() => {});
  });
}

async function pruneOldRows(now = new Date()) {
  const cutoffDay = addDays(istDay(now), -RETENTION_DAYS);
  const cutoffIso = new Date(now.getTime() - RETENTION_DAYS * DAY_MS).toISOString();
  try {
    await supabase.from("user_active_days").delete().lt("day", cutoffDay);
    await supabase.from("signup_attempts").delete().lt("created_at", cutoffIso);
  } catch {
    /* best effort */
  }
}

let pruneTimer = null;
function startRetention() {
  if (pruneTimer || process.env.NODE_ENV === "test") return;
  setTimeout(() => pruneOldRows(), 60_000).unref?.();
  pruneTimer = setInterval(() => pruneOldRows(), DAY_MS);
  pruneTimer.unref?.();
}

module.exports = {
  TZ,
  RETENTION_DAYS,
  istDay,
  addDays,
  dayLabel,
  resolveRange,
  computeSignupStats,
  statsCsv,
  attemptKey,
  recordActiveDay,
  trackSignupAttempt,
  pruneOldRows,
  startRetention,
};
