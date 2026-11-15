"use strict";

const { apiText } = require("./apiError");

/**
 * Platform switches from Yönetici Paneli › Sistem / Güvenlik (3.1.3).
 * Until 3.1.3 these were saved to system_settings but nothing read them; every
 * send / signup / group create / login path now asks this module.
 *
 *   chatFrozen            no new messages anywhere (DM, group, server), admins exempt
 *   slowModeSeconds       global minimum gap between one user's messages (0 = off)
 *   rateLimitGlobalMs     minimum gap in ms between one user's messages (0 = off)
 *   maxMessagesPerMinute  per-user cap over a rolling 60 s window (0 = off)
 *   dmEnabled             false = no new DMs (admins exempt)
 *   groupCreationEnabled  false = no new groups (admins exempt)
 *   registrationEnabled   false = no new accounts (password, Google, Apple); existing log in
 *   maxLoginAttempts      failed password logins per account per minute
 *   securityLocks         Güvenlik Merkezi emergency locks (registration / dm / readOnly), with expiry
 *
 * Pure decisions over the live config (state.systemConfig) plus an in-memory
 * per-user send history. `now` is injectable for tests.
 */

const MINUTE_MS = 60_000;
// Güvenlik Merkezi emergency locks (lib/securitySettings.js): an expired lock reads as off.
const { lockActive } = require("./securitySettings");

/** Güvenlik Merkezi live feed; never breaks a send. */
function noteRateLimit(userId, kind, cfg, count) {
  try {
    require("./securityEvents").note("rate_limit", { userId: userId || null, reason: kind || "message", detail: { kind: kind || "message", limit: Math.floor(num(cfg.maxMessagesPerMinute)) || null, rejected: count } });
  } catch {
    /* feed optional */
  }
}
const sendHistory = new Map(); // userId -> number[] (send times, newest last)

const MESSAGES = {
  frozen: "Chat is frozen by an admin right now. Try again in a bit.",
  dmOff: "Direct messages are turned off right now.",
  // { message, messageKey, messageVars } (lib/apiError.js): the app translates the template.
  slow: (sec) => apiText("message", "Slow mode is on: you can send another message in {seconds, plural, one {# second} other {# seconds}}.", { seconds: sec }),
  perMinute: "You're sending messages too fast. Wait a moment and try again.",
  groupsOff: "Creating new groups is turned off right now.",
  signupOff: "New sign-ups are turned off right now.",
  readOnly: "Descall is read-only for a short while. Try again later.",
};

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function block(code, message, retryAfterMs = 0) {
  const text = message && typeof message === "object" ? message : { message };
  return { ok: false, code, ...text, retryAfterMs: Math.max(0, Math.ceil(retryAfterMs)) };
}

/**
 * May this user send a message now? Records the send when allowed, so call it
 * once per real send attempt, after cheap validation and before the DB write.
 * @param {{config: object, userId: string, isAdmin?: boolean, kind: "dm"|"group"|"server", now?: number}} p
 */
function checkMessageSend({ config, userId, isAdmin = false, kind, now = Date.now() }) {
  const cfg = config || {};
  if (isAdmin) return { ok: true };
  if (cfg.chatFrozen || lockActive(cfg, "readOnly", now)) return block("CHAT_FROZEN", MESSAGES.frozen);
  if (kind === "dm" && (cfg.dmEnabled === false || lockActive(cfg, "dm", now))) return block("DMS_DISABLED", MESSAGES.dmOff);

  const key = String(userId || "");
  const history = (sendHistory.get(key) || []).filter((t) => now - t < MINUTE_MS);
  const last = history.length ? history[history.length - 1] : null;

  const gapMs = Math.max(num(cfg.slowModeSeconds) * 1000, num(cfg.rateLimitGlobalMs));
  if (gapMs > 0 && last !== null && now - last < gapMs) {
    const wait = gapMs - (now - last);
    const code = num(cfg.slowModeSeconds) * 1000 >= num(cfg.rateLimitGlobalMs) ? "SLOW_MODE" : "RATE_LIMITED";
    if (code === "RATE_LIMITED") noteRateLimit(key, kind, cfg, 1);
    return block(code, code === "SLOW_MODE" ? MESSAGES.slow(Math.max(1, Math.ceil(wait / 1000))) : MESSAGES.perMinute, wait);
  }

  const perMinute = Math.floor(num(cfg.maxMessagesPerMinute));
  if (perMinute > 0 && history.length >= perMinute) {
    noteRateLimit(key, kind, cfg, 1);
    return block("RATE_LIMITED", MESSAGES.perMinute, MINUTE_MS - (now - history[0]));
  }

  history.push(now);
  sendHistory.set(key, history);
  return { ok: true };
}

/**
 * Chat freeze / read-only lock only (no rate history): for edits, game posts and other
 * writes that are not a new message but must stop while chat is frozen (server audit MSG-6).
 */
function checkChatFrozen({ config, isAdmin = false, now = Date.now() } = {}) {
  const cfg = config || {};
  if (isAdmin) return { ok: true };
  if (cfg.chatFrozen || lockActive(cfg, "readOnly", now)) return block("CHAT_FROZEN", MESSAGES.frozen);
  return { ok: true };
}

function checkGroupCreate({ config, isAdmin = false, now = Date.now() }) {
  if (isAdmin) return { ok: true };
  if (lockActive(config || {}, "readOnly", now)) return block("READ_ONLY", MESSAGES.readOnly);
  if ((config || {}).groupCreationEnabled !== false) return { ok: true };
  return block("GROUPS_DISABLED", MESSAGES.groupsOff);
}

/** Güvenlik Merkezi read-only lock: no new servers either (admins exempt). */
function checkServerCreate({ config, isAdmin = false, now = Date.now() }) {
  if (isAdmin || !lockActive(config || {}, "readOnly", now)) return { ok: true };
  return block("READ_ONLY", MESSAGES.readOnly);
}

/** New accounts only; logging in to an existing account is never blocked here. */
function checkRegistration({ config, now = Date.now() }) {
  const cfg = config || {};
  if (cfg.registrationEnabled !== false && !lockActive(cfg, "registration", now)) return { ok: true };
  return block("REGISTRATION_CLOSED", MESSAGES.signupOff);
}

/** Failed password logins allowed per account per minute (1..50, default 5). */
function loginAttemptsPerMinute(config) {
  const n = Math.floor(num((config || {}).maxLoginAttempts, 5));
  return Math.min(50, Math.max(1, n || 5));
}

/** Platform admin on a socket (same rule as App.jsx / requireAdmin). */
function isPlatformAdmin(socket) {
  const u = socket?.user || {};
  return Boolean(u.is_admin) || u.username === "admin";
}

function resetPlatformPolicyForTests() {
  sendHistory.clear();
}

module.exports = {
  MESSAGES,
  checkMessageSend,
  checkChatFrozen,
  checkGroupCreate,
  checkServerCreate,
  checkRegistration,
  loginAttemptsPerMinute,
  isPlatformAdmin,
  resetPlatformPolicyForTests,
};
