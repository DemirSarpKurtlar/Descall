"use strict";

/**
 * Re-engagement rules (item 4) as pure functions: no database, no network, no
 * clock of their own (callers pass `now`). Tested by reengage.selftest.cjs.
 *
 *  - mode(env): REENGAGE_ENABLED / REENGAGE_DRY_RUN -> "off" | "dry_run" | "live"
 *  - quiet hours: never 23:00-09:00 in the recipient's time zone (Istanbul when
 *    none is stored; the "UTC" column default counts as none)
 *  - friend-in-voice throttle: one per recipient per 6 h, three per 24 h
 *  - lifecycle (day 3 / day 7) and activity-email (friend request / server
 *    invite fallback) eligibility
 *  - signed one-click unsubscribe tokens
 */

const crypto = require("crypto");

const DEFAULT_TZ = "Europe/Istanbul";
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const QUIET_START_HOUR = 23;
const QUIET_END_HOUR = 9;

const FRIEND_VOICE_GAP_MS = 6 * HOUR_MS;
const FRIEND_VOICE_MAX_PER_DAY = 3;

const FEATURES = Object.freeze(["friend_voice", "activity_email", "lifecycle"]);
const LIFECYCLE_KINDS = Object.freeze(["day3", "day7"]);
// Age windows (days since sign-up) in which each lifecycle email may go out.
// A user who is past the window when the feature is switched on is skipped.
const LIFECYCLE_WINDOWS = Object.freeze({ day3: [3, 6], day7: [7, 10] });
// Activity email (friend request / invite) only when the recipient can't get the
// push, or has not been seen for this long.
const ACTIVITY_EMAIL_AWAY_MS = DAY_MS;

const UNSUB_SCOPES = Object.freeze(["activity", "lifecycle"]);

function truthy(v) {
  return ["1", "true", "yes", "on"].includes(String(v ?? "").trim().toLowerCase());
}

/** "off" (default), "dry_run" (log what would be sent) or "live". */
function mode(env = process.env) {
  if (truthy(env.REENGAGE_DRY_RUN)) return "dry_run";
  if (truthy(env.REENGAGE_ENABLED)) return "live";
  return "off";
}

/** REENGAGE_FEATURES="friend_voice,lifecycle" narrows what runs; unset = all. */
function featureOn(feature, env = process.env) {
  if (!FEATURES.includes(feature)) return false;
  const raw = String(env.REENGAGE_FEATURES ?? "").trim();
  if (!raw) return true;
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase())
    .includes(feature);
}

function validTimeZone(tz) {
  const value = String(tz || "").trim();
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * The recipient's time zone. users.timezone defaults to 'UTC' and the app never
 * writes it, so 'UTC' / 'Etc/UTC' / empty / invalid mean "not set" -> Istanbul.
 */
function recipientTimeZone(stored) {
  const value = String(stored || "").trim();
  if (!value || /^(etc\/)?(utc|gmt|uct|zulu)$/i.test(value)) return DEFAULT_TZ;
  return validTimeZone(value) ? value : DEFAULT_TZ;
}

/** Hour of day (0-23) at `now` in `tz`. */
function localHour(tz, now = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: recipientTimeZone(tz),
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(now));
  const h = Number(parts.find((p) => p.type === "hour")?.value);
  return Number.isFinite(h) ? h % 24 : 0;
}

/** True between 23:00 and 09:00 local time: nothing is pushed or mailed then. */
function isQuietHours(tz, now = Date.now()) {
  const h = localHour(tz, now);
  return h >= QUIET_START_HOUR || h < QUIET_END_HOUR;
}

/** Istanbul calendar day "YYYY-MM-DD" (same day boundary as user_active_days). */
function istDay(when) {
  const d = when instanceof Date ? when : new Date(when);
  if (!Number.isFinite(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: DEFAULT_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function toMs(value) {
  if (value == null || value === "") return NaN;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  const s = String(value);
  // Postgres "timestamp without time zone" comes back without an offset: it is UTC.
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(s) || !/T|\d \d/.test(s) ? s : `${s.replace(" ", "T")}Z`;
  return Date.parse(iso);
}

/**
 * Whether one more friend-in-voice push may go to a recipient whose earlier
 * ones went out at `sentAt` (list of times). { ok, reason }.
 */
function friendVoiceThrottle(sentAt, now = Date.now()) {
  const times = (sentAt || []).map(toMs).filter((t) => Number.isFinite(t) && t <= now + 60_000);
  if (times.some((t) => now - t < FRIEND_VOICE_GAP_MS)) return { ok: false, reason: "gap_6h" };
  if (times.filter((t) => now - t < DAY_MS).length >= FRIEND_VOICE_MAX_PER_DAY) return { ok: false, reason: "max_per_day" };
  return { ok: true, reason: null };
}

/** Idempotency key of a friend-in-voice push: one per recipient per 6 h slot. */
function friendVoiceKind(now = Date.now()) {
  return `friend_voice:${Math.floor(now / FRIEND_VOICE_GAP_MS)}`;
}

/** Idempotency key of a once-a-day activity email ("friend_request_email:2026-11-08"). */
function dailyKind(base, now = Date.now()) {
  return `${base}:${istDay(now)}`;
}

/**
 * Friend-in-voice recipient check (one friend). `r` is what the caller loaded:
 *   { presence: null | "online" | "idle" | "dnd" | "invisible", inVoice, storedStatus,
 *     optIn, banned, deleted, blocksJoiner, joinerBlocks, canJoin, serverLevel,
 *     channelMuted, dmMuted, dmLevel, hasPushTarget, timezone, sentAt }
 * Returns { ok, reason }.
 */
function friendVoiceEligible(r = {}, now = Date.now()) {
  if (r.banned || r.deleted) return { ok: false, reason: "account" };
  if (r.optIn === false) return { ok: false, reason: "opted_out" };
  // Only people who are away: an online (or invisible, i.e. present) app shows it live.
  if (r.presence && r.presence !== "idle") return { ok: false, reason: "online" };
  if (r.inVoice) return { ok: false, reason: "in_voice" };
  if (String(r.storedStatus || "") === "dnd" || r.presence === "dnd") return { ok: false, reason: "dnd" };
  if (r.blocksJoiner || r.joinerBlocks) return { ok: false, reason: "blocked" };
  if (!r.canJoin) return { ok: false, reason: "no_access" };
  const level = String(r.serverLevel || "all").toLowerCase();
  if (level !== "all") return { ok: false, reason: "server_level" };
  if (r.channelMuted) return { ok: false, reason: "channel_muted" };
  if (r.dmMuted || String(r.dmLevel || "all") === "none") return { ok: false, reason: "dm_muted" };
  if (!r.hasPushTarget) return { ok: false, reason: "no_device" };
  if (isQuietHours(r.timezone, now)) return { ok: false, reason: "quiet_hours" };
  return friendVoiceThrottle(r.sentAt, now);
}

/** Lifecycle kind due for an account created at `createdAt`, or null. */
function lifecycleKindFor(createdAt, now = Date.now()) {
  const t = toMs(createdAt);
  if (!Number.isFinite(t)) return null;
  const ageDays = (now - t) / DAY_MS;
  for (const kind of ["day7", "day3"]) {
    const [from, to] = LIFECYCLE_WINDOWS[kind];
    if (ageDays >= from && ageDays < to) return kind;
  }
  return null;
}

/**
 * Not active since the sign-up day: no user_active_days row after the Istanbul
 * sign-up day. `activeDays` null = unknown (table missing), then last_seen decides;
 * both unknown -> treated as active (no email).
 */
function inactiveSinceSignup({ createdAt, activeDays = null, lastSeen = null }) {
  const signupDay = istDay(toMs(createdAt));
  if (!signupDay) return false;
  if (Array.isArray(activeDays)) return !activeDays.some((d) => String(d).slice(0, 10) > signupDay);
  const seen = toMs(lastSeen);
  if (!Number.isFinite(seen)) return false;
  return istDay(seen) <= signupDay;
}

function hasUsableEmail(u = {}) {
  const email = String(u.email || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

/**
 * Lifecycle email check. Promotional, so it needs a confirmed product-update
 * opt-in (marketing_subscribers, lib/marketingOptIn.js) for the same address.
 *   u: { email, email_confirmed_at, created_at, last_seen, is_banned, deleted_at,
 *        deletion_requested_at, email_notify_opt_out_at, timezone }
 *   ctx: { kind, activeDays, consent: { confirmed_at, unsubscribed_at } | null, alreadySent }
 */
function lifecycleEligible(u = {}, ctx = {}, now = Date.now()) {
  if (!LIFECYCLE_KINDS.includes(ctx.kind)) return { ok: false, reason: "kind" };
  if (lifecycleKindFor(u.created_at, now) !== ctx.kind) return { ok: false, reason: "window" };
  if (u.is_banned || u.deleted_at || u.deletion_requested_at) return { ok: false, reason: "account" };
  if (!hasUsableEmail(u)) return { ok: false, reason: "no_email" };
  if (!u.email_confirmed_at) return { ok: false, reason: "email_unverified" };
  if (u.email_notify_opt_out_at) return { ok: false, reason: "unsubscribed" };
  const c = ctx.consent;
  if (!c || !c.confirmed_at || c.unsubscribed_at) return { ok: false, reason: "no_consent" };
  if (ctx.alreadySent) return { ok: false, reason: "already_sent" };
  if (!inactiveSinceSignup({ createdAt: u.created_at, activeDays: ctx.activeDays, lastSeen: u.last_seen })) {
    return { ok: false, reason: "active" };
  }
  if (isQuietHours(u.timezone, now)) return { ok: false, reason: "quiet_hours" };
  return { ok: true, reason: null };
}

/**
 * Friend-request / server-invite fallback email. Transactional (about something a
 * person did for this account), so no marketing consent, but always with the
 * one-click unsubscribe. Only when the recipient is offline and either has no
 * push device or has not been seen for a day.
 *   u: { email, email_confirmed_at, is_banned, deleted_at, deletion_requested_at,
 *        email_notify_opt_out_at, last_seen }
 *   ctx: { online, hasPushTarget, alreadySentToday }
 */
function activityEmailEligible(u = {}, ctx = {}, now = Date.now()) {
  if (u.is_banned || u.deleted_at || u.deletion_requested_at) return { ok: false, reason: "account" };
  if (!hasUsableEmail(u)) return { ok: false, reason: "no_email" };
  if (!u.email_confirmed_at) return { ok: false, reason: "email_unverified" };
  if (u.email_notify_opt_out_at) return { ok: false, reason: "unsubscribed" };
  if (ctx.online) return { ok: false, reason: "online" };
  if (ctx.alreadySentToday) return { ok: false, reason: "already_sent" };
  if (ctx.hasPushTarget) {
    const seen = toMs(u.last_seen);
    if (Number.isFinite(seen) && now - seen < ACTIVITY_EMAIL_AWAY_MS) return { ok: false, reason: "push_enough" };
  }
  return { ok: true, reason: null };
}

/* ---- one-click unsubscribe ------------------------------------------------ */

function unsubSecret(env = process.env) {
  return String(env.REENGAGE_UNSUB_SECRET || env.JWT_SECRET || "");
}

function signUnsub(userId, scope, env = process.env) {
  const secret = unsubSecret(env);
  if (!secret || !userId || !UNSUB_SCOPES.includes(scope)) return null;
  return crypto.createHmac("sha256", secret).update(`reengage-unsub\n${userId}\n${scope}`).digest("base64url").slice(0, 32);
}

function verifyUnsub(userId, scope, token, env = process.env) {
  const expected = signUnsub(String(userId || ""), String(scope || ""), env);
  const given = String(token || "");
  if (!expected || given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given));
}

function publicOrigin(env = process.env) {
  return String(env.PUBLIC_APP_URL || "https://descall.com").replace(/\/+$/, "");
}

function unsubscribeUrl(userId, scope, env = process.env) {
  const t = signUnsub(userId, scope, env);
  if (!t) return null;
  const q = new URLSearchParams({ u: String(userId), s: scope, t });
  return `${publicOrigin(env)}/api/reengage/unsubscribe?${q.toString()}`;
}

/* ---- server invite links in a DM ------------------------------------------ */

const INVITE_CODE = "[A-Za-z0-9_-]{4,32}";

/** First server invite code in a message ("descall.com/servers/join/<code>", "/invite/s/<code>"). */
function inviteCodeFromText(text, env = process.env) {
  const s = String(text || "");
  if (!s) return null;
  const hosts = new Set(["descall.com", "www.descall.com"]);
  try {
    hosts.add(new URL(publicOrigin(env)).host.toLowerCase());
  } catch {
    /* default hosts only */
  }
  const re = new RegExp(`(?:https?://)?([a-z0-9.-]+(?::\\d+)?)/(?:servers/join|invite/s)/(${INVITE_CODE})(?![A-Za-z0-9_-])`, "gi");
  let m;
  while ((m = re.exec(s))) {
    if (hosts.has(m[1].toLowerCase())) return m[2];
  }
  return null;
}

module.exports = {
  DEFAULT_TZ,
  FEATURES,
  LIFECYCLE_KINDS,
  LIFECYCLE_WINDOWS,
  FRIEND_VOICE_GAP_MS,
  FRIEND_VOICE_MAX_PER_DAY,
  UNSUB_SCOPES,
  mode,
  featureOn,
  recipientTimeZone,
  localHour,
  isQuietHours,
  istDay,
  toMs,
  friendVoiceThrottle,
  friendVoiceKind,
  dailyKind,
  friendVoiceEligible,
  lifecycleKindFor,
  inactiveSinceSignup,
  hasUsableEmail,
  lifecycleEligible,
  activityEmailEligible,
  signUnsub,
  verifyUnsub,
  unsubscribeUrl,
  publicOrigin,
  inviteCodeFromText,
};
