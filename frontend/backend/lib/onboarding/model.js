"use strict";

/**
 * "Başla panosu" (growth phase 2, draft 2A): pure rules, no database.
 *
 *  - WINDOW_DAYS: the dashboard, checklist and rewards exist for an account's first five
 *    days (day 1 = the sign-up day, Europe/Istanbul calendar). After day 5 or once every
 *    step is done the dashboard steps aside by itself.
 *  - STEPS: the 5-day checklist and its DesCoin (total 160). Rewards are paid by the server
 *    from facts it already tracks; the client never names an amount.
 *  - INTERESTS: the directory categories (lib/serverDirectory.js) a new account can pick.
 *  - Canlılık sırası: servers are ranked by the last hour's messages, the reply time a
 *    newcomer gets, voice and online people, never by member count, so a small live
 *    server beats a big quiet one.
 *
 * Tests: lib/onboarding/model.selftest.cjs.
 */

const DAY_MS = 86400000;
const TZ = "Europe/Istanbul";
const WINDOW_DAYS = 5;
/** First-message undo window: the reward waits this long (the client offers 10 s). */
const HELLO_UNDO_MS = 12_000;
/** Rehber is quiet at night (Europe/Istanbul): 00:00-08:00. */
const QUIET_FROM_HOUR = 0;
const QUIET_TO_HOUR = 8;

const STEPS = Object.freeze([
  { id: "interests", reward: 10 },
  { id: "join", reward: 20 },
  { id: "first_message", reward: 50 },
  { id: "voice", reward: 30 },
  { id: "friend", reward: 50 },
]);
const STEP_IDS = STEPS.map((s) => s.id);
const REWARD_TOTAL = STEPS.reduce((n, s) => n + s.reward, 0);
const BADGE_ID = "ilkselam";

const INTERESTS = Object.freeze([
  "study",
  "gaming-minecraft",
  "music",
  "gaming-cs2",
  "gaming-lol",
  "anime",
  "tech",
  "art",
  "gaming-fps",
  "sports",
  "chat-friends",
  "gaming-other",
]);
const MAX_INTERESTS = 8;

/** Name / description keywords for servers that never picked a directory category. */
const CATEGORY_WORDS = [
  ["gaming-minecraft", ["minecraft", "smp", "survival", "skyblock", "bedwars", "craft"]],
  ["gaming-cs2", ["cs2", "csgo", "cs:go", "counter strike", "counter-strike", "faceit"]],
  ["gaming-lol", ["league of legends", "lol tr", "lol ", "summoner", "aram"]],
  ["gaming-fps", ["fps", "pubg", "apex", "fortnite", "overwatch", "battlefield", "call of duty", "warzone"]],
  ["study", ["ders", "yks", "lgs", "kpss", "ales", "tyt", "ayt", "sinav", "sınav", "study", "pomodoro", "üniversite", "universite", "okul", "matematik"]],
  ["music", ["müzik", "muzik", "music", "lofi", "lo-fi", "rap", "rock", "playlist", "şarkı", "sarki"]],
  ["anime", ["anime", "manga", "otaku", "webtoon"]],
  ["tech", ["kod", "yazılım", "yazilim", "developer", "code", "coding", "tech", "teknoloji", "programlama", "linux", "react"]],
  ["art", ["çizim", "cizim", "sanat", "art", "drawing", "tasarım", "tasarim", "illüstrasyon"]],
  ["sports", ["spor", "futbol", "football", "basketbol", "basketball", "fitness", "gym", "efootball", "fifa"]],
  ["chat-friends", ["sohbet", "chat", "arkadaş", "arkadas", "muhabbet", "cafe", "kafe", "takılma"]],
  ["gaming-other", ["oyun", "game", "gaming", "roblox", "gta", "rp ", "roleplay", "metin2"]],
];

function clampInt(v, lo, hi, fallback = lo) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

/** "YYYY-MM-DD" of a moment in Europe/Istanbul. */
function localDay(ms) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

function localHour(ms) {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(new Date(ms));
  return Number(h) % 24;
}

/** Day 1..n of the account (1 on the sign-up day). */
function dayOfAccount(createdAt, now = Date.now()) {
  const start = Date.parse(createdAt || "");
  if (!Number.isFinite(start)) return null;
  const a = Date.parse(`${localDay(start)}T00:00:00Z`);
  const b = Date.parse(`${localDay(now)}T00:00:00Z`);
  return Math.max(1, Math.round((b - a) / DAY_MS) + 1);
}

/** Is the account inside its five onboarding days? */
function inWindow(createdAt, now = Date.now()) {
  const d = dayOfAccount(createdAt, now);
  return d != null && d <= WINDOW_DAYS;
}

function isQuietHour(now = Date.now()) {
  const h = localHour(now);
  return h >= QUIET_FROM_HOUR && h < QUIET_TO_HOUR;
}

/** Known interests only, deduped, at most MAX_INTERESTS, in catalog order. */
function sanitizeInterests(list) {
  if (!Array.isArray(list)) return [];
  const want = new Set(list.map((x) => String(x || "").trim()));
  return INTERESTS.filter((id) => want.has(id)).slice(0, MAX_INTERESTS);
}

/** Category of a server: its directory category, else a keyword guess, else null. */
function inferCategory({ category, name, description, tags } = {}) {
  if (category && INTERESTS.includes(category)) return category;
  const hay = ` ${[name, description, ...(Array.isArray(tags) ? tags : [])].filter(Boolean).join(" ")} `
    .toLocaleLowerCase("tr");
  if (!hay.trim()) return null;
  for (const [cat, words] of CATEGORY_WORDS) {
    if (words.some((w) => hay.includes(w))) return cat;
  }
  return null;
}

/**
 * Liveness score (higher = more alive right now). A missing reply time counts as a slow
 * 15 minutes; it is capped so one bad sample does not bury a busy server.
 */
function livenessScore({ lastHour = 0, last24h = 0, online = 0, inVoice = 0, replyMinutes = null } = {}) {
  const rep = replyMinutes == null ? 15 : Math.min(60, Math.max(0, Number(replyMinutes) || 0));
  return (Number(lastHour) || 0) + 0.25 * (Number(last24h) || 0) + 2 * (Number(inVoice) || 0) + (Number(online) || 0) - 0.5 * rep;
}

/** A server shows as "live" with any sign of life in the last day. */
function isLive(s) {
  return (s.lastHour || 0) > 0 || (s.inVoice || 0) > 0 || (s.online || 0) > 0 || (s.last24h || 0) > 0;
}

/**
 * Pick `n` suggestions. Servers in the chosen interests come first (by score), the rest fill
 * up the list (by score). Servers the user is in, and the community server, are left out.
 * @param {object[]} servers  { id, category, score, ... }
 */
function rankSuggestions(servers, { interests = [], exclude = [], n = 3 } = {}) {
  const skip = new Set((exclude || []).map(String));
  const pool = (servers || []).filter((s) => s && !skip.has(String(s.id)) && isLive(s));
  const byScore = (a, b) => (b.score - a.score) || ((b.online || 0) - (a.online || 0)) || String(a.id).localeCompare(String(b.id));
  const want = new Set(interests || []);
  const hit = pool.filter((s) => s.category && want.has(s.category)).sort(byScore);
  const rest = pool.filter((s) => !(s.category && want.has(s.category))).sort(byScore);
  return [...hit, ...rest].slice(0, n).map((s, i) => ({ ...s, matched: Boolean(s.category && want.has(s.category)), rank: i + 1 }));
}

/** Live servers and online people per interest (the chip counts). */
function interestCounts(servers) {
  const out = {};
  for (const id of INTERESTS) out[id] = { servers: 0, online: 0 };
  for (const s of servers || []) {
    if (!s.category || !out[s.category] || !isLive(s)) continue;
    out[s.category].servers += 1;
    out[s.category].online += s.online || 0;
  }
  return out;
}

const INTRO_RE = /(tan[ıi][sş]ma|introduc|intro\b|kendini[-_ ]?tan|merhaba|welcome|ho[sş][-_ ]?geld|selam)/i;
const GENERAL_RE = /(^|[-_ ])(genel|general|sohbet|chat|lobi|lobby|main)([-_ ]|$)/i;

/**
 * Where "Katıl ve gönder" posts: an introductions channel, else the welcome channel, else a
 * general chat, else the first channel. Only channels @everyone can see AND write in.
 * @param {{id,name,canSend}[]} channels  public text channels in display order
 */
function pickIntroChannel(channels, { welcomeChannelId = null } = {}) {
  const list = (channels || []).filter((c) => c && c.canSend !== false);
  if (!list.length) return null;
  return (
    list.find((c) => INTRO_RE.test(c.name || "")) ||
    (welcomeChannelId && list.find((c) => String(c.id) === String(welcomeChannelId))) ||
    list.find((c) => GENERAL_RE.test(c.name || "")) ||
    list[0]
  );
}

/**
 * Median minutes until a newcomer's first message got an answer from someone else in the
 * same channel (within two hours). `messages` sorted by time ascending.
 * @param {{channel_id,sender_id,created_at}[]} messages
 * @param {Map<string, number>} joinedAt  userId -> join time (ms) of recent members
 */
function medianReplyMinutes(messages, joinedAt, { windowMs = 14 * DAY_MS, now = Date.now() } = {}) {
  const seen = new Set();
  const samples = [];
  const list = messages || [];
  for (let i = 0; i < list.length; i += 1) {
    const m = list[i];
    const uid = String(m.sender_id);
    if (seen.has(uid)) continue;
    seen.add(uid);
    const j = joinedAt?.get?.(uid);
    if (j == null || now - j > windowMs) continue;
    const t0 = Date.parse(m.created_at);
    for (let k = i + 1; k < list.length; k += 1) {
      const r = list[k];
      const t1 = Date.parse(r.created_at);
      if (t1 - t0 > 2 * 3600000) break;
      if (r.channel_id === m.channel_id && String(r.sender_id) !== uid) {
        samples.push((t1 - t0) / 60000);
        break;
      }
    }
  }
  if (!samples.length) return null;
  samples.sort((a, b) => a - b);
  const mid = samples.length >> 1;
  const med = samples.length % 2 ? samples[mid] : (samples[mid - 1] + samples[mid]) / 2;
  return Math.max(1, Math.round(med));
}

/** 12 two-hour buckets (local time) of the last week's messages, 0-100, plus the peak flags. */
function crowdHours(timestamps) {
  const buckets = new Array(12).fill(0);
  for (const ts of timestamps || []) {
    const ms = typeof ts === "number" ? ts : Date.parse(ts);
    if (!Number.isFinite(ms)) continue;
    buckets[Math.floor(localHour(ms) / 2)] += 1;
  }
  const max = Math.max(...buckets);
  const pct = buckets.map((n) => (max ? Math.round((n / max) * 100) : 0));
  const sorted = [...pct].sort((a, b) => b - a);
  const cut = sorted[2] || 0;
  return pct.map((v) => ({ v, peak: v > 0 && v >= cut }));
}

/** Messages per hour over the last `hours` hours (oldest first): the card sparkline. */
function hourlySeries(timestamps, { hours = 18, now = Date.now() } = {}) {
  const out = new Array(hours).fill(0);
  for (const ts of timestamps || []) {
    const ms = typeof ts === "number" ? ts : Date.parse(ts);
    if (!Number.isFinite(ms)) continue;
    const ago = Math.floor((now - ms) / 3600000);
    if (ago >= 0 && ago < hours) out[hours - 1 - ago] += 1;
  }
  return out;
}

/**
 * The checklist as the client draws it.
 * @param {{ facts: Record<string, boolean>, claimed: Record<string, number> }} p
 */
function buildChecklist({ facts = {}, claimed = {} } = {}) {
  const items = STEPS.map((s) => ({
    id: s.id,
    reward: s.reward,
    done: Boolean(facts[s.id]),
    paid: claimed[s.id] != null,
    paidAmount: claimed[s.id] != null ? Number(claimed[s.id]) || 0 : 0,
  }));
  const doneCount = items.filter((i) => i.done).length;
  const next = items.find((i) => !i.done) || null;
  const earned = items.reduce((n, i) => n + i.paidAmount, 0);
  return { items, doneCount, total: items.length, next: next ? next.id : null, earned, rewardTotal: REWARD_TOTAL, complete: doneCount === items.length };
}

/** Should the dashboard show at all? */
function dashboardVisible({ inWindow: w, complete, hidden, enabled = true }) {
  return Boolean(enabled && w && !complete && !hidden);
}

/**
 * A message that earns "İlk Selam": real text (two letters or more, not a /command), to a
 * real person (a DM peer that is not you, or a server with another person in it).
 */
function isRealHelloText(text) {
  const s = String(text || "").trim();
  if (!s || s.startsWith("/")) return false;
  const letters = s.match(/\p{L}/gu);
  return Boolean(letters && letters.length >= 2);
}

/** Intro channel / interest id -> sentence parts are client side; this only bounds the text. */
function cleanIntroText(text, max = 300) {
  return String(text == null ? "" : text)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
}

const SLOTS = ["card", "panel", "community", "invite", "chip", "sidebar", "other"];
function cleanSlot(v) {
  const s = String(v || "");
  return SLOTS.includes(s) ? s : "other";
}

module.exports = {
  DAY_MS,
  TZ,
  WINDOW_DAYS,
  HELLO_UNDO_MS,
  STEPS,
  STEP_IDS,
  REWARD_TOTAL,
  BADGE_ID,
  INTERESTS,
  MAX_INTERESTS,
  SLOTS,
  clampInt,
  localDay,
  localHour,
  dayOfAccount,
  inWindow,
  isQuietHour,
  sanitizeInterests,
  inferCategory,
  livenessScore,
  isLive,
  rankSuggestions,
  interestCounts,
  pickIntroChannel,
  medianReplyMinutes,
  crowdHours,
  hourlySeries,
  buildChecklist,
  dashboardVisible,
  isRealHelloText,
  cleanIntroText,
  cleanSlot,
};
