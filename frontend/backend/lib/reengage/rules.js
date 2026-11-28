"use strict";

/**
 * Growth 3B "Önce insanlar": every rule as a pure function (no database, no network,
 * no clock of its own; callers pass `now`). Tested by rules.selftest.cjs.
 *
 *  - notification center settings (types, quiet hours, voice budget) and the per-person
 *    voice verdict: important people (max 8) skip the daily budget but keep one push per
 *    person per 6 h; everyone else shares the account's 6 h gap and 1..3 a day
 *  - "Kişiye göre en iyi saat": the most frequent active local hour of the last 30 days,
 *    outside quiet hours
 *  - win-back (day 7 friend call, day 14 e-mail): absence episodes, the closest friend,
 *    caller / target limits, abuse rules and the reward decision
 *  - shared streaks, daily tasks and nudges
 *  - console: campaign defaults, hold-out group, template placeholders, signed tracking tokens
 */

const crypto = require("crypto");
const P = require("../reengagePolicy");

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/* ---- notification center ------------------------------------------------- */

const IMPORTANT_MAX = 8;
const TYPE_KEYS = Object.freeze(["friendVoice", "mentions", "unread", "streak", "digest"]);
const VOICE_PREFS = Object.freeze(["always", "default", "off"]);
const MESSAGE_PREFS = Object.freeze(["always", "away", "never"]);
const PRIMARY_ACTIONS = Object.freeze(["join", "quiet_join"]);
const SERVER_LEVELS = Object.freeze(["all", "mentions", "muted"]);
const MUTE_CHOICES = Object.freeze({ "1h": HOUR_MS, "8h": 8 * HOUR_MS, "1w": 7 * DAY_MS });
const VOICE_GAP_MS = P.FRIEND_VOICE_GAP_MS; // 6 h
const VOICE_SYSTEM_MAX = P.FRIEND_VOICE_MAX_PER_DAY; // 3

const DEFAULT_SETTINGS = Object.freeze({
  types: Object.freeze({ friendVoice: true, mentions: true, unread: true, streak: true, digest: true }),
  quietStart: 23,
  quietEnd: 9,
  quietMessages: false,
  voiceDailyMax: 3,
  digestDay: 0,
  digestHour: 11,
});

function clampInt(v, lo, hi, dflt) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
}

/** DB row (or nothing) -> settings object with every field filled. */
function normalizeSettings(row) {
  const raw = row?.types && typeof row.types === "object" ? row.types : {};
  const types = {};
  for (const k of TYPE_KEYS) types[k] = raw[k] !== false;
  return {
    types,
    quietStart: clampInt(row?.quiet_start ?? row?.quietStart, 18, 23, 23),
    quietEnd: clampInt(row?.quiet_end ?? row?.quietEnd, 9, 12, 9),
    quietMessages: Boolean(row?.quiet_messages ?? row?.quietMessages ?? false),
    voiceDailyMax: clampInt(row?.voice_daily_max ?? row?.voiceDailyMax, 1, 3, 3),
    digestDay: clampInt(row?.digest_day ?? row?.digestDay, 0, 6, 0),
    digestHour: clampInt(row?.digest_hour ?? row?.digestHour, 9, 21, 11),
  };
}

/**
 * A PUT body -> { ok, row } (DB column names) or { ok: false, error }. Only the fields
 * present change; `current` is the normalized settings now.
 */
function validateSettingsPatch(body = {}, current = DEFAULT_SETTINGS) {
  const next = { ...current, types: { ...current.types } };
  if (body.types !== undefined) {
    if (!body.types || typeof body.types !== "object") return { ok: false, error: "bad_types" };
    for (const [k, v] of Object.entries(body.types)) {
      if (!TYPE_KEYS.includes(k) || typeof v !== "boolean") return { ok: false, error: "bad_types" };
      next.types[k] = v;
    }
  }
  const ints = [
    ["quietStart", 18, 23],
    ["quietEnd", 9, 12],
    ["voiceDailyMax", 1, 3],
    ["digestDay", 0, 6],
    ["digestHour", 9, 21],
  ];
  for (const [k, lo, hi] of ints) {
    if (body[k] === undefined) continue;
    const n = Number(body[k]);
    if (!Number.isInteger(n) || n < lo || n > hi) return { ok: false, error: `bad_${k}` };
    next[k] = n;
  }
  if (body.quietMessages !== undefined) {
    if (typeof body.quietMessages !== "boolean") return { ok: false, error: "bad_quietMessages" };
    next.quietMessages = body.quietMessages;
  }
  return {
    ok: true,
    settings: next,
    row: {
      types: next.types,
      quiet_start: next.quietStart,
      quiet_end: next.quietEnd,
      quiet_messages: next.quietMessages,
      voice_daily_max: next.voiceDailyMax,
      digest_day: next.digestDay,
      digest_hour: next.digestHour,
    },
  };
}

/** Local hour + minute at `now` in the account's zone (Istanbul when unknown). */
function localClock(tz, now = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: P.recipientTimeZone(tz),
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(new Date(now));
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { hour: Number(get("hour")) % 24, minute: Number(get("minute")) || 0, weekday: wd < 0 ? 0 : wd };
}

/** Is `hour` inside quiet hours [start, end) that wrap midnight? */
function hourInQuiet(hour, start = 23, end = 9) {
  return start > end ? hour >= start || hour < end : hour >= start && hour < end;
}

/** System rule 23:00-09:00 always; the account may only widen it. */
function isQuietFor(settings, tz, now = Date.now()) {
  const s = settings || DEFAULT_SETTINGS;
  const { hour } = localClock(tz, now);
  return hourInQuiet(hour, Math.min(23, s.quietStart ?? 23), Math.max(9, s.quietEnd ?? 9));
}

/** Milliseconds until quiet hours end (0 when not quiet). */
function msUntilQuietEnds(settings, tz, now = Date.now()) {
  if (!isQuietFor(settings, tz, now)) return 0;
  const end = Math.max(9, settings?.quietEnd ?? 9);
  const { hour, minute } = localClock(tz, now);
  let hours = end - hour;
  if (hours <= 0) hours += 24;
  return hours * HOUR_MS - minute * 60_000;
}

/** Person prefs row (or nothing) -> normalized prefs. */
function normalizePerson(row) {
  const until = row?.muted_until ? P.toMs(row.muted_until) : NaN;
  return {
    peerId: row?.peer_id ? String(row.peer_id) : null,
    important: Boolean(row?.important),
    importantAt: row?.important_at || null,
    voice: VOICE_PREFS.includes(row?.voice) ? row.voice : "default",
    messages: MESSAGE_PREFS.includes(row?.messages) ? row.messages : "always",
    breakQuiet: Boolean(row?.break_quiet),
    nudges: row?.nudges !== false,
    primaryAction: PRIMARY_ACTIONS.includes(row?.primary_action) ? row.primary_action : "join",
    mutedUntil: Number.isFinite(until) ? new Date(until).toISOString() : null,
  };
}

function isMuted(person, now = Date.now()) {
  const t = person?.mutedUntil ? P.toMs(person.mutedUntil) : NaN;
  return Number.isFinite(t) && t > now;
}

/**
 * A person PUT body -> { ok, row } or { ok:false, error }. `importantCount` = how many
 * important people the account has now, not counting this peer.
 */
function validatePersonPatch(body = {}, current, { importantCount = 0, now = Date.now() } = {}) {
  const next = { ...(current || normalizePerson(null)) };
  if (body.important !== undefined) {
    if (typeof body.important !== "boolean") return { ok: false, error: "bad_important" };
    if (body.important && !next.important && importantCount >= IMPORTANT_MAX) return { ok: false, error: "important_full" };
    if (body.important !== next.important) next.importantAt = body.important ? new Date(now).toISOString() : null;
    next.important = body.important;
  }
  if (body.voice !== undefined) {
    if (!VOICE_PREFS.includes(body.voice)) return { ok: false, error: "bad_voice" };
    next.voice = body.voice;
  }
  if (body.messages !== undefined) {
    if (!MESSAGE_PREFS.includes(body.messages)) return { ok: false, error: "bad_messages" };
    next.messages = body.messages;
  }
  for (const k of ["breakQuiet", "nudges"]) {
    if (body[k] === undefined) continue;
    if (typeof body[k] !== "boolean") return { ok: false, error: `bad_${k}` };
    next[k] = body[k];
  }
  if (body.primaryAction !== undefined) {
    if (!PRIMARY_ACTIONS.includes(body.primaryAction)) return { ok: false, error: "bad_primaryAction" };
    next.primaryAction = body.primaryAction;
  }
  if (body.mute !== undefined) {
    if (body.mute === null || body.mute === "off") next.mutedUntil = null;
    else if (MUTE_CHOICES[body.mute]) next.mutedUntil = new Date(now + MUTE_CHOICES[body.mute]).toISOString();
    else return { ok: false, error: "bad_mute" };
  }
  return {
    ok: true,
    person: next,
    row: {
      important: next.important,
      important_at: next.importantAt,
      voice: next.voice,
      messages: next.messages,
      break_quiet: next.breakQuiet,
      nudges: next.nudges,
      primary_action: next.primaryAction,
      muted_until: next.mutedUntil,
    },
  };
}

/** Label the list shows next to a person: "always" | "default" | "muted". */
function personBadge(person, now = Date.now()) {
  if (isMuted(person, now) || person?.voice === "off" || person?.messages === "never") return "muted";
  if (person?.important || person?.voice === "always") return "always";
  return "default";
}

/** Idempotency kinds in lifecycle_messages for a "friend in voice" push. */
function voiceKind(now, { vipPeer = null } = {}) {
  const slot = Math.floor(now / VOICE_GAP_MS);
  return vipPeer ? `friend_voice_vip:${vipPeer}:${slot}` : `friend_voice:${slot}`;
}

/**
 * Whether one more "<friend> is in voice" push may go out about `peer`.
 *   person: normalizePerson(...) of recipient -> joiner
 *   settings: normalizeSettings(...) of the recipient
 *   history: { normal: [sent_at], vip: [sent_at about this peer] }
 * Returns { ok, reason, vip }.
 */
function voiceVerdict({ person, settings, history = {}, tz = null }, now = Date.now()) {
  const s = settings || normalizeSettings(null);
  const p = person || normalizePerson(null);
  if (s.types.friendVoice === false && !p.important) return { ok: false, reason: "type_off", vip: false };
  if (p.voice === "off" || isMuted(p, now)) return { ok: false, reason: "person_off", vip: false };
  if (isQuietFor(s, tz, now)) return { ok: false, reason: "quiet_hours", vip: false };
  const vip = p.important || p.voice === "always";
  const times = (list) => (list || []).map(P.toMs).filter((t) => Number.isFinite(t) && t <= now + 60_000);
  if (vip) {
    // Important: never counted in the daily budget; one push about this person per 6 h.
    if (times(history.vip).some((t) => now - t < VOICE_GAP_MS)) return { ok: false, reason: "gap_6h", vip };
    return { ok: true, reason: null, vip };
  }
  const normal = times(history.normal);
  if (normal.some((t) => now - t < VOICE_GAP_MS)) return { ok: false, reason: "gap_6h", vip };
  const max = Math.min(VOICE_SYSTEM_MAX, s.voiceDailyMax || VOICE_SYSTEM_MAX);
  if (normal.filter((t) => now - t < DAY_MS).length >= max) return { ok: false, reason: "max_per_day", vip };
  return { ok: true, reason: null, vip };
}

/**
 * The drawer's live footnote: how many pushes about this person today and when the
 * next one may come. { todayCount, nextAt (ms) , nextQuiet }.
 */
function nextVoiceWindow({ person, settings, history = {}, tz = null }, now = Date.now()) {
  const p = person || normalizePerson(null);
  const vip = p.important || p.voice === "always";
  const mine = (vip ? history.vip : history.normal) || [];
  const times = mine.map(P.toMs).filter(Number.isFinite).sort((a, b) => b - a);
  const todayCount = times.filter((t) => now - t < DAY_MS).length;
  let nextAt = times.length && now - times[0] < VOICE_GAP_MS ? times[0] + VOICE_GAP_MS : now;
  const quietMs = msUntilQuietEnds(settings || normalizeSettings(null), tz, nextAt);
  const nextQuiet = quietMs > 0;
  const earliest = nextAt;
  if (nextQuiet) nextAt += quietMs;
  return { todayCount, earliestAt: earliest, nextAt, nextQuiet, vip };
}

/* ---- best send hour ------------------------------------------------------ */

/** rows: [{ hour }] of the last 30 days -> 24-slot histogram. */
function hourHistogram(rows = []) {
  const h = new Array(24).fill(0);
  for (const r of rows) {
    const n = Number(r?.hour);
    if (Number.isInteger(n) && n >= 0 && n < 24) h[n] += 1;
  }
  return h;
}

/**
 * Best local hour to reach someone: the most frequent active hour outside quiet hours;
 * ties go to the later evening hour (most people are free then). Default 20.
 */
function bestHour(hist, settings = DEFAULT_SETTINGS, fallback = 20) {
  const s = settings || DEFAULT_SETTINGS;
  let best = -1;
  let bestN = 0;
  for (let hr = 0; hr < 24; hr += 1) {
    if (hourInQuiet(hr, Math.min(23, s.quietStart), Math.max(9, s.quietEnd))) continue;
    const n = Number(hist?.[hr]) || 0;
    if (n > bestN || (n === bestN && n > 0 && hr > best)) {
      best = hr;
      bestN = n;
    }
  }
  return best >= 0 ? best : fallback;
}

/** Is `now` within the account's best hour (the hour itself, local time)? */
function atBestHour(best, tz, now = Date.now()) {
  return localClock(tz, now).hour === best;
}

/* ---- win-back ------------------------------------------------------------ */

const WINBACK = Object.freeze({
  minAbsentDays: 7,
  maxAbsentDays: 13,
  priorActiveDays: 3,
  callerMinAccountDays: 30,
  callerPerWeek: 1,
  targetPerMonth: 2,
  returnWindowMs: 72 * HOUR_MS,
  measureWindowMs: 48 * HOUR_MS,
  minActiveSeconds: 10 * 60,
  systemFallbackAfterMs: 24 * HOUR_MS,
  suggestionTtlMs: 72 * HOUR_MS,
  gift14Days: 14,
  gift14WindowMs: 72 * HOUR_MS,
  defaultReward: 50,
  defaultGift: 150,
});

function dayNum(day) {
  const t = Date.parse(`${String(day).slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(t) ? Math.round(t / DAY_MS) : NaN;
}
function dayStr(n) {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Absence from user_active_days. activeDays: ["YYYY-MM-DD"], today: Istanbul day.
 * { lastDay, absentDays, firstAbsentDay, priorActive (days active in the 30 before) }.
 */
function absence(activeDays = [], today) {
  const t = dayNum(today);
  const days = [...new Set((activeDays || []).map((d) => String(d).slice(0, 10)))].map(dayNum).filter((n) => Number.isFinite(n) && n <= t);
  if (!days.length) return { lastDay: null, absentDays: null, firstAbsentDay: null, priorActive: 0 };
  const last = Math.max(...days);
  const priorActive = days.filter((n) => n <= last && n > last - 30).length;
  return { lastDay: dayStr(last), absentDays: t - last, firstAbsentDay: dayStr(last + 1), priorActive };
}

/** Day-7 cohort: 7..13 days away and active on at least 3 days before that. */
function winbackTarget(abs) {
  if (!abs || abs.absentDays == null) return { ok: false, reason: "never_active" };
  if (abs.absentDays < WINBACK.minAbsentDays) return { ok: false, reason: "too_soon" };
  if (abs.absentDays > WINBACK.maxAbsentDays) return { ok: false, reason: "too_late" };
  if (abs.priorActive < WINBACK.priorActiveDays) return { ok: false, reason: "not_enough_history" };
  return { ok: true, reason: null };
}

/** One suggestion per absence: "<target>:<first absent day>". */
function episodeKey(targetId, abs) {
  return `${targetId}:${abs?.firstAbsentDay || "x"}`;
}

/**
 * Closest friend: most voice minutes together (x2) plus DM messages, last 30 days.
 * candidates: [{ id, voiceMinutes, dmMessages, ...eligibility }]. Ineligible callers
 * are skipped. Returns the winner or null.
 */
function closestFriend(candidates = []) {
  const scored = candidates
    .filter((c) => c && c.eligible !== false)
    .map((c) => ({ ...c, score: (Number(c.voiceMinutes) || 0) * 2 + (Number(c.dmMessages) || 0) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || (Number(b.voiceMinutes) || 0) - (Number(a.voiceMinutes) || 0) || String(a.id).localeCompare(String(b.id)));
  return scored[0] || null;
}

/**
 * Can `caller` call someone back now?
 *   caller: { created_at, is_banned, deleted_at, suspicious_signup }
 *   callsThisWeek: number of calls the caller made in the last 7 days
 */
function callerAllowed(caller, { callsThisWeek = 0 } = {}, now = Date.now()) {
  if (!caller || caller.is_banned || caller.deleted_at || caller.deletion_requested_at) return { ok: false, reason: "account" };
  if (caller.suspicious_signup) return { ok: false, reason: "suspicious" };
  const created = P.toMs(caller.created_at);
  if (!Number.isFinite(created) || now - created < WINBACK.callerMinAccountDays * DAY_MS) return { ok: false, reason: "new_account" };
  if (callsThisWeek >= WINBACK.callerPerWeek) return { ok: false, reason: "caller_week" };
  return { ok: true, reason: null };
}

/** Can `target` receive another friend call? callsThisMonth = received in 30 days. */
function targetAllowed(target, { callsThisMonth = 0, blocked = false } = {}) {
  if (!target || target.is_banned || target.deleted_at || target.deletion_requested_at) return { ok: false, reason: "account" };
  if (blocked) return { ok: false, reason: "blocked" };
  if (callsThisMonth >= WINBACK.targetPerMonth) return { ok: false, reason: "target_month" };
  return { ok: true, reason: null };
}

/** Two accounts on the same device or IP (active_sessions / signup visitor key). */
function sameDeviceOrIp(a = {}, b = {}) {
  const sess = (u) => (Array.isArray(u?.active_sessions) ? u.active_sessions : []);
  const pick = (u, k) => new Set(sess(u).map((s) => s?.[k]).filter((v) => v && v !== "unknown").map(String));
  const share = (x, y) => [...x].some((v) => y.has(v));
  if (share(pick(a, "deviceHash"), pick(b, "deviceHash"))) return "device";
  if (share(pick(a, "ip"), pick(b, "ip"))) return "ip";
  if (a.signup_visitor_key && a.signup_visitor_key === b.signup_visitor_key) return "device";
  return null;
}

/**
 * Reward decision once the target is back. call: { called_at, returned_at, active_seconds }.
 * Returns { pay, reason }.
 */
function rewardDecision(call, { caller, target, rewardAmount = WINBACK.defaultReward } = {}, now = Date.now()) {
  if (!call?.called_at) return { pay: false, reason: "not_called" };
  if (call.rewarded_at) return { pay: false, reason: "already" };
  const calledAt = P.toMs(call.called_at);
  const back = P.toMs(call.returned_at);
  if (!Number.isFinite(back)) return { pay: false, reason: "not_returned" };
  if (back - calledAt > WINBACK.returnWindowMs || back < calledAt) return { pay: false, reason: "late" };
  if ((Number(call.active_seconds) || 0) < WINBACK.minActiveSeconds) return { pay: false, reason: "not_active_enough" };
  if (!(rewardAmount > 0)) return { pay: false, reason: "reward_off" };
  const same = sameDeviceOrIp(caller, target);
  if (same) return { pay: false, reason: `same_${same}` };
  if (caller?.suspicious_signup || target?.suspicious_signup) return { pay: false, reason: "suspicious" };
  return { pay: true, reason: null };
}

/* ---- shared streaks and tasks -------------------------------------------- */

function pairKey(a, b) {
  const [x, y] = [String(a), String(b)].sort();
  return { user_a: x, user_b: y };
}

/**
 * One side did the streak action (wrote to the other) on `day`. Returns the new row
 * fields { count, best, last_day, a_day, b_day, completedToday, bonus }.
 * The day counts when both wrote; a missed day resets the count to 0 first.
 */
function streakAdvance(row = {}, who, day) {
  const today = dayNum(day);
  const side = who === "a" ? "a_day" : "b_day";
  const next = {
    count: Number(row.count) || 0,
    best: Number(row.best) || 0,
    last_day: row.last_day || null,
    a_day: row.a_day || null,
    b_day: row.b_day || null,
  };
  const last = next.last_day ? dayNum(next.last_day) : NaN;
  if (Number.isFinite(last) && today - last > 1) next.count = 0; // the chain broke
  const already = next[side] && dayNum(next[side]) === today;
  next[side] = dayStr(today);
  const bothToday = next.a_day && next.b_day && dayNum(next.a_day) === today && dayNum(next.b_day) === today;
  let completedToday = false;
  if (bothToday && !(Number.isFinite(last) && last === today)) {
    next.count += 1;
    next.best = Math.max(next.best, next.count);
    next.last_day = dayStr(today);
    completedToday = true;
  }
  return { ...next, completedToday, repeat: Boolean(already) };
}

/** Effective count shown today: a chain whose last full day is older than yesterday is 0. */
function streakView(row = {}, day) {
  const today = dayNum(day);
  const last = row.last_day ? dayNum(row.last_day) : NaN;
  const alive = Number.isFinite(last) && today - last <= 1;
  return {
    count: alive ? Number(row.count) || 0 : 0,
    best: Number(row.best) || 0,
    doneToday: Number.isFinite(last) && last === today,
    aToday: Boolean(row.a_day && dayNum(row.a_day) === today),
    bToday: Boolean(row.b_day && dayNum(row.b_day) === today),
    atRisk: alive && !(Number.isFinite(last) && last === today),
  };
}

/** May `who` nudge the other side today? (once a day, the other must not have written yet) */
function nudgeAllowed(row = {}, who, day, { otherAllowsNudges = true } = {}) {
  const today = dayNum(day);
  if (!otherAllowsNudges) return { ok: false, reason: "nudges_off" };
  const mine = who === "a" ? row.a_nudged_day : row.b_nudged_day;
  if (mine && dayNum(mine) === today) return { ok: false, reason: "already_today" };
  const otherDay = who === "a" ? row.b_day : row.a_day;
  if (otherDay && dayNum(otherDay) === today) return { ok: false, reason: "already_wrote" };
  return { ok: true, reason: null };
}

const TASK_REWARDS = Object.freeze({ message: 15, save_streak: 25, voice: 25 });
const SHARED_BONUS = 10;
const VOICE_TASK_MINUTES = 10;

/**
 * Three tasks for today, each about one person:
 *   1. message <closest friend not written to today>
 *   2. save_streak <a shared streak at risk> (else another message task)
 *   3. voice: 10 minutes in voice with any friend (target = a friend in voice now, if any)
 * people: [{ id, score }] best first; atRisk: [peerId]; inVoice: [peerId]. Deterministic.
 */
function planTasks({ people = [], atRisk = [], inVoice = [] } = {}) {
  const ranked = people.filter((p) => p && p.id).map((p) => String(p.id));
  const tasks = [];
  const risk = atRisk.map(String).find(Boolean) || null;
  const first = ranked.find((id) => id !== risk) || ranked[0] || null;
  tasks.push({ slot: 1, kind: "message", target_id: first, reward: TASK_REWARDS.message, goal: 1 });
  if (risk) tasks.push({ slot: 2, kind: "save_streak", target_id: risk, reward: TASK_REWARDS.save_streak, goal: 1 });
  else {
    const second = ranked.find((id) => id !== first) || null;
    tasks.push({ slot: 2, kind: "message", target_id: second, reward: TASK_REWARDS.message, goal: 1 });
  }
  tasks.push({ slot: 3, kind: "voice", target_id: inVoice.map(String)[0] || null, reward: TASK_REWARDS.voice, goal: VOICE_TASK_MINUTES });
  return tasks.filter((t) => t.kind === "voice" || t.target_id);
}

/** A counted fact moves a task. fact: { type: "dm", to } | { type: "voice", minutes, with: [ids] }. */
function taskProgress(task, fact) {
  if (!task || task.done_at) return null;
  if (fact?.type === "dm" && (task.kind === "message" || task.kind === "save_streak")) {
    if (String(task.target_id) !== String(fact.to)) return null;
    return { progress: 1, done: true };
  }
  if (fact?.type === "voice" && task.kind === "voice") {
    const withFriend = (fact.with || []).length > 0;
    if (!withFriend) return null;
    const progress = Math.min(task.goal, (Number(task.progress) || 0) + Math.max(0, Number(fact.minutes) || 0));
    return { progress, done: progress >= task.goal };
  }
  return null;
}

/* ---- console ------------------------------------------------------------- */

const LANGS = Object.freeze(["tr", "pt-BR", "en", "de", "es", "fr", "ru"]);
const PLACEHOLDERS = Object.freeze(["arkadas_1", "arkadas_2", "sunucu", "sayi", "bahsetme"]);
const CAMPAIGN_STATUSES = Object.freeze(["live", "paused", "draft", "auto"]);
const RECALL_REASONS = Object.freeze(["content", "audience", "timing", "other"]);
const UNDO_MS = 30 * 1000;

/** Built-in campaigns (the DB row overrides status, templates, config). */
const DEFAULT_CAMPAIGNS = Object.freeze([
  { id: "new_quiet", kind: "new_quiet", status: "live", channels: ["push", "email"], icon: "user", order: 1 },
  { id: "inactive7", kind: "inactive7", status: "live", channels: ["push", "email"], icon: "clock", order: 2 },
  { id: "friend_call", kind: "friend_call", status: "auto", channels: ["push"], icon: "bell", order: 3 },
  { id: "inactive14", kind: "inactive14", status: "draft", channels: ["email"], icon: "moon", order: 4 },
  { id: "weekly_digest", kind: "weekly_digest", status: "live", channels: ["email"], icon: "mail", order: 5 },
  { id: "streak_reminder", kind: "streak_reminder", status: "live", channels: ["push"], icon: "flame", order: 6 },
]);

/** Deterministic hold-out (control group) membership: no message, still measured. */
function inHoldout(userId, campaignId, pct = 10) {
  const p = Math.max(0, Math.min(50, Number(pct) || 0));
  if (!p) return false;
  const h = crypto.createHash("sha256").update(`holdout\n${campaignId}\n${userId}`).digest();
  return h.readUInt16BE(0) % 100 < p;
}

/** Placeholders used in a template text that are not known. */
function unknownPlaceholders(text) {
  const out = [];
  String(text || "").replace(/\{([a-z0-9_]+)\}/gi, (_, name) => {
    if (!PLACEHOLDERS.includes(name) && !out.includes(name)) out.push(name);
    return "";
  });
  return out;
}

/** Fill {arkadas_1} etc.; unknown or empty values become "". */
function renderTemplate(text, vars = {}) {
  return String(text || "")
    .replace(/\{([a-z0-9_]+)\}/gi, (_, name) => (vars[name] == null ? "" : String(vars[name])))
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Validate an admin template patch for one language. */
function validateTemplate(body = {}) {
  const out = {};
  const limits = { pushTitle: 80, pushBody: 180, emailSubject: 120, emailBody: 1200 };
  for (const [k, max] of Object.entries(limits)) {
    if (body[k] === undefined) continue;
    const v = String(body[k] ?? "").replace(/\r/g, "").trim();
    if (v.length > max) return { ok: false, error: `too_long_${k}` };
    const bad = unknownPlaceholders(v);
    if (bad.length) return { ok: false, error: "unknown_placeholder", placeholders: bad };
    out[k] = v;
  }
  if (body.approved !== undefined) out.approved = Boolean(body.approved);
  return { ok: true, template: out };
}

/** Funnel numbers of one wave / campaign from lifecycle_messages rows. */
function funnel(rows = []) {
  const real = rows.filter((r) => !r.holdout);
  const n = (f) => real.filter(f).length;
  return {
    sent: n((r) => r.status !== "failed"),
    failed: n((r) => r.status === "failed"),
    delivered: n((r) => r.delivered_at),
    opened: n((r) => r.opened_at),
    openedApp: n((r) => r.returned_at),
    acted: n((r) => r.return_kind === "voice" || r.return_kind === "message"),
    recalled: n((r) => r.recalled_at),
  };
}

/** Return rate (%) with the control group's rate and the net difference in points. */
function liftVsHoldout(rows = []) {
  const sent = rows.filter((r) => !r.holdout);
  const ctrl = rows.filter((r) => r.holdout);
  const rate = (list) => (list.length ? Math.round((list.filter((r) => r.returned_at).length / list.length) * 1000) / 10 : null);
  const a = rate(sent);
  const b = rate(ctrl);
  return { rate: a, control: b, net: a != null && b != null ? Math.round((a - b) * 10) / 10 : null, n: sent.length, controlN: ctrl.length };
}

/* ---- tracking tokens ----------------------------------------------------- */

function trackSecret(env = process.env) {
  return String(env.REENGAGE_UNSUB_SECRET || env.JWT_SECRET || "");
}

/** Signed token for one lifecycle_messages row: "<userId>.<kind b64>.<sig>". */
function signTrack(userId, kind, env = process.env) {
  const secret = trackSecret(env);
  if (!secret || !userId || !kind) return null;
  const k = Buffer.from(String(kind)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(`rg-track\n${userId}\n${kind}`).digest("base64url").slice(0, 22);
  return `${userId}.${k}.${sig}`;
}

function verifyTrack(token, env = process.env) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const [userId, k, sig] = parts;
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !k || !sig) return null;
  let kind;
  try {
    kind = Buffer.from(k, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!kind || kind.length > 64) return null;
  const expected = signTrack(userId, kind, env);
  if (!expected) return null;
  const want = expected.split(".")[2];
  if (want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
  return { userId, kind };
}

module.exports = {
  HOUR_MS,
  DAY_MS,
  IMPORTANT_MAX,
  TYPE_KEYS,
  VOICE_PREFS,
  MESSAGE_PREFS,
  PRIMARY_ACTIONS,
  SERVER_LEVELS,
  MUTE_CHOICES,
  DEFAULT_SETTINGS,
  WINBACK,
  TASK_REWARDS,
  SHARED_BONUS,
  VOICE_TASK_MINUTES,
  LANGS,
  PLACEHOLDERS,
  CAMPAIGN_STATUSES,
  RECALL_REASONS,
  UNDO_MS,
  DEFAULT_CAMPAIGNS,
  normalizeSettings,
  validateSettingsPatch,
  localClock,
  hourInQuiet,
  isQuietFor,
  msUntilQuietEnds,
  normalizePerson,
  isMuted,
  validatePersonPatch,
  personBadge,
  voiceKind,
  voiceVerdict,
  nextVoiceWindow,
  hourHistogram,
  bestHour,
  atBestHour,
  dayNum,
  dayStr,
  absence,
  winbackTarget,
  episodeKey,
  closestFriend,
  callerAllowed,
  targetAllowed,
  sameDeviceOrIp,
  rewardDecision,
  pairKey,
  streakAdvance,
  streakView,
  nudgeAllowed,
  planTasks,
  taskProgress,
  inHoldout,
  unknownPlaceholders,
  renderTemplate,
  validateTemplate,
  funnel,
  liftVsHoldout,
  signTrack,
  verifyTrack,
};
