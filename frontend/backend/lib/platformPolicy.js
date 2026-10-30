"use strict";

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
 *
 * Pure decisions over the live config (state.systemConfig) plus an in-memory
 * per-user send history. `now` is injectable for tests.
 */

const MINUTE_MS = 60_000;
const sendHistory = new Map(); // userId -> number[] (send times, newest last)

const MESSAGES = {
  frozen: "Sohbet şu an yönetici tarafından donduruldu. Biraz sonra tekrar dene.",
  dmOff: "Özel mesajlar şu an kapalı.",
  slow: (sec) => `Yavaş mod açık: ${sec} saniye sonra tekrar mesaj gönderebilirsin.`,
  perMinute: "Çok hızlı mesaj gönderiyorsun. Biraz bekleyip tekrar dene.",
  groupsOff: "Yeni grup oluşturma şu an kapalı.",
  signupOff: "Yeni kayıtlar şu an kapalı.",
};

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function block(code, message, retryAfterMs = 0) {
  return { ok: false, code, message, retryAfterMs: Math.max(0, Math.ceil(retryAfterMs)) };
}

/**
 * May this user send a message now? Records the send when allowed, so call it
 * once per real send attempt, after cheap validation and before the DB write.
 * @param {{config: object, userId: string, isAdmin?: boolean, kind: "dm"|"group"|"server", now?: number}} p
 */
function checkMessageSend({ config, userId, isAdmin = false, kind, now = Date.now() }) {
  const cfg = config || {};
  if (isAdmin) return { ok: true };
  if (cfg.chatFrozen) return block("CHAT_FROZEN", MESSAGES.frozen);
  if (kind === "dm" && cfg.dmEnabled === false) return block("DMS_DISABLED", MESSAGES.dmOff);

  const key = String(userId || "");
  const history = (sendHistory.get(key) || []).filter((t) => now - t < MINUTE_MS);
  const last = history.length ? history[history.length - 1] : null;

  const gapMs = Math.max(num(cfg.slowModeSeconds) * 1000, num(cfg.rateLimitGlobalMs));
  if (gapMs > 0 && last !== null && now - last < gapMs) {
    const wait = gapMs - (now - last);
    const code = num(cfg.slowModeSeconds) * 1000 >= num(cfg.rateLimitGlobalMs) ? "SLOW_MODE" : "RATE_LIMITED";
    return block(code, code === "SLOW_MODE" ? MESSAGES.slow(Math.max(1, Math.ceil(wait / 1000))) : MESSAGES.perMinute, wait);
  }

  const perMinute = Math.floor(num(cfg.maxMessagesPerMinute));
  if (perMinute > 0 && history.length >= perMinute) {
    return block("RATE_LIMITED", MESSAGES.perMinute, MINUTE_MS - (now - history[0]));
  }

  history.push(now);
  sendHistory.set(key, history);
  return { ok: true };
}

function checkGroupCreate({ config, isAdmin = false }) {
  if (isAdmin || (config || {}).groupCreationEnabled !== false) return { ok: true };
  return block("GROUPS_DISABLED", MESSAGES.groupsOff);
}

/** New accounts only; logging in to an existing account is never blocked here. */
function checkRegistration({ config }) {
  if ((config || {}).registrationEnabled !== false) return { ok: true };
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
  checkGroupCreate,
  checkRegistration,
  loginAttemptsPerMinute,
  isPlatformAdmin,
  resetPlatformPolicyForTests,
};
