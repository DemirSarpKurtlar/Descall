"use strict";

/**
 * Emergency locks of the Güvenlik Merkezi ("Acil kilit", Draft A frame A2):
 *   registration  no new accounts (password, Google, Apple); existing accounts sign in
 *   dm            no new direct messages; server and group chats stay open
 *   readOnly      no message anywhere (like the chat freeze), no new groups or servers
 * Each lock has a reason (audited), an optional auto-expiry and an optional info band
 * for users. Locks live in system_settings.config.securityLocks, so they survive a
 * restart; the platform policy reads them directly (lib/platformPolicy.js) and treats
 * an expired lock as off at once. The sweep timer then clears it, writes the history
 * entry and the audit line (security_lock_expired) and tells the admin room.
 * Admins are never affected by a lock.
 */

const state = require("../runtime/sharedState");
const sec = require("./securitySettings");
const { applySettingsChange } = require("./systemSettingsChange");

const SWEEP_MS = 15 * 1000;
let sweepTimer = null;
let ioRef = null;

function bad(message, code, status = 400) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

function currentLocks(now = Date.now()) {
  return sec.activeLocks(state.systemConfig, now);
}

/** Tell every open app what to show (null = no band). */
function broadcastNotice(io = ioRef) {
  if (!io || typeof io.emit !== "function") return;
  try {
    io.emit("platform:notice", sec.publicNotice(state.systemConfig));
  } catch {
    /* no sockets */
  }
}

function untilFor(minutes, now) {
  return minutes == null ? null : new Date(now + minutes * 60000).toISOString();
}

/**
 * Start one or more locks. Modes already on are skipped (returned in `skipped`).
 * @param {{ modes: string[], duration: string, reason: string, banner?: boolean, actor: object, io?: object }} p
 */
async function startLocks({ modes, duration, reason, banner = true, actor, io = ioRef, now = Date.now() }) {
  const want = [...new Set((Array.isArray(modes) ? modes : []).map(String))].filter((m) => sec.LOCK_MODES.includes(m));
  if (!want.length) throw bad("Pick at least one lock.", "NO_MODES");
  if (!Object.prototype.hasOwnProperty.call(sec.LOCK_DURATIONS, String(duration))) throw bad("Invalid duration.", "BAD_DURATION");
  const why = sec.cleanText(reason);
  if (why.length < 3) throw bad("A reason is required.", "REASON_REQUIRED");
  const minutes = sec.LOCK_DURATIONS[duration];
  const active = currentLocks(now);
  const fresh = want.filter((m) => !active[m]);
  const skipped = want.filter((m) => active[m]);
  if (!fresh.length) throw bad("These locks are already on.", "ALREADY_ON", 409);
  const locks = { ...active };
  for (const mode of fresh) {
    locks[mode] = {
      startedAt: new Date(now).toISOString(),
      until: untilFor(minutes, now),
      minutes,
      reason: why,
      by: actor?.username || null,
      byId: actor?.id || null,
      banner: banner !== false,
    };
  }
  const result = await applySettingsChange({
    patch: { securityLocks: locks },
    actor,
    reason: why,
    source: "lock",
    action: "security_lock_start",
    title: fresh.length === 1 ? `lock.${fresh[0]}` : "lock.multi",
    meta: { modes: fresh, duration, minutes, banner: banner !== false, until: untilFor(minutes, now) },
    io,
  });
  broadcastNotice(io);
  return { started: fresh, skipped, locks: currentLocks(), entry: result.entry };
}

/** Lift locks now (by an admin, or by the sweep when they expired). */
async function liftLocks({ modes, reason, actor, io = ioRef, expired = false, now = Date.now() }) {
  const active = sec.activeLocks(state.systemConfig, expired ? 0 : now);
  const raw = state.systemConfig.securityLocks || {};
  const want = (Array.isArray(modes) && modes.length ? modes : Object.keys(raw)).map(String).filter((m) => sec.LOCK_MODES.includes(m) && raw[m]);
  if (!want.length) throw bad("No lock to lift.", "NOT_ON", 404);
  const why = sec.cleanText(reason) || (expired ? "expired" : "");
  if (!expired && why.length < 3) throw bad("A reason is required.", "REASON_REQUIRED");
  const next = {};
  for (const [m, lock] of Object.entries(raw)) if (!want.includes(m)) next[m] = lock;
  const lifted = want.map((m) => ({ mode: m, startedAt: raw[m].startedAt, by: raw[m].by || null, until: raw[m].until || null }));
  const result = await applySettingsChange({
    patch: { securityLocks: next },
    actor: expired ? null : actor,
    reason: expired ? null : why,
    source: expired ? "lock_expiry" : "lock",
    action: expired ? "security_lock_expired" : "security_lock_lift",
    title: expired ? "lock.expired" : "lock.lift",
    meta: { modes: want, lifted, wasActive: Object.keys(active) },
    io,
    diffAt: 0,
  });
  broadcastNotice(io);
  return { lifted: want, locks: currentLocks(), entry: result.entry };
}

/** Move a lock's end (minutes from now; null = until lifted). */
async function extendLock({ mode, minutes, actor, io = ioRef, now = Date.now() }) {
  if (!sec.LOCK_MODES.includes(String(mode))) throw bad("Unknown lock.", "BAD_MODE");
  const active = currentLocks(now);
  if (!active[mode]) throw bad("This lock is not on.", "NOT_ON", 404);
  let mins = minutes == null ? null : Math.floor(Number(minutes));
  if (mins != null && (!Number.isFinite(mins) || mins < 5 || mins > sec.MAX_LOCK_MINUTES)) throw bad("Invalid duration.", "BAD_DURATION");
  const locks = { ...active, [mode]: { ...active[mode], until: untilFor(mins, now), minutes: mins } };
  const result = await applySettingsChange({
    patch: { securityLocks: locks },
    actor,
    reason: active[mode].reason,
    source: "lock",
    action: "security_lock_extend",
    title: `lock.${mode}`,
    meta: { modes: [mode], minutes: mins, until: untilFor(mins, now), extended: true },
    io,
  });
  broadcastNotice(io);
  return { locks: currentLocks(), entry: result.entry };
}

/** Clear expired locks (history + audit + admin room + users' band). */
async function sweep(io = ioRef, now = Date.now()) {
  const modes = sec.expiredLockModes(state.systemConfig, now);
  if (!modes.length) return [];
  await liftLocks({ modes, actor: null, io, expired: true, now });
  return modes;
}

function startTimer(io) {
  ioRef = io || ioRef;
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    sweep().catch((err) => console.warn("[security-locks] sweep:", err?.message || err));
  }, SWEEP_MS);
  if (typeof sweepTimer.unref === "function") sweepTimer.unref();
}

function stopTimer() {
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = null;
}

module.exports = { startLocks, liftLocks, extendLock, sweep, startTimer, stopTimer, broadcastNotice, currentLocks };
