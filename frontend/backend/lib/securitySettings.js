"use strict";

/**
 * Güvenlik Merkezi (admin remake, owner-approved Draft A "Komuta merkezi", Nov 2026):
 * the security part of system_settings.config, kept apart from lib/systemSettings.js
 * so the Sistem page can reuse it.
 *
 *   dmMinAccountAgeHours  new accounts may send DMs only after this many hours (0 = off)
 *   disposableEmailBlock  password sign-up refuses throwaway email providers
 *   securityLocks         emergency locks: { registration | dm | readOnly: Lock }
 *     Lock = { startedAt, until (ISO or null = until lifted), minutes, reason, by, byId, banner }
 *
 * A lock never rewrites the permanent switches (registrationEnabled, dmEnabled): the
 * platform policy reads both, so when a lock ends (lifted or expired) everything is
 * exactly as it was before the lock. readOnly works like the chat freeze (no message
 * anywhere) and also stops new groups and servers.
 *
 * Also here: which settings belong to which history category, the flattened
 * key -> value view and the { key, from, to } diff stored by the settings history.
 */

const LOCK_MODES = Object.freeze(["registration", "dm", "readOnly"]);
/** Auto-expiry presets of the emergency lock dialog, in minutes (null = until lifted). */
const LOCK_DURATIONS = Object.freeze({ "15m": 15, "1h": 60, "6h": 360, "24h": 1440, manual: null });
const MAX_LOCK_MINUTES = 7 * 24 * 60;
const REASON_MAX = 300;

const SECURITY_DEFAULTS = Object.freeze({
  dmMinAccountAgeHours: 0,
  disposableEmailBlock: false,
});

/** Settings the Güvenlik Merkezi may change with PATCH /security/settings. */
const SECURITY_SETTING_KEYS = Object.freeze([
  "registrationEnabled",
  "dmEnabled",
  "groupCreationEnabled",
  "maxLoginAttempts",
  "maxMessagesPerMinute",
  "dmRateLimitMs",
  "dmMinAccountAgeHours",
  "disposableEmailBlock",
]);

/** History filter chips of the drawer (Kilitler / Hız limitleri / Kayıt koruması / Erişim). */
const HISTORY_CATEGORIES = Object.freeze(["locks", "rateLimits", "signup", "access"]);
const KEY_CATEGORY = Object.freeze({
  registrationEnabled: "access",
  dmEnabled: "access",
  groupCreationEnabled: "access",
  chatFrozen: "access",
  maintenanceMode: "access",
  maxLoginAttempts: "rateLimits",
  maxMessagesPerMinute: "rateLimits",
  dmRateLimitMs: "rateLimits",
  slowModeSeconds: "rateLimits",
  rateLimitGlobalMs: "rateLimits",
  maxMessageLength: "rateLimits",
  disposableEmailBlock: "signup",
  dmMinAccountAgeHours: "signup",
});

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function cleanText(value, max = REASON_MAX) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);
}

function isoOrNull(value) {
  if (value == null || value === "") return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function pickLock(raw) {
  if (!raw || typeof raw !== "object") return null;
  const startedAt = isoOrNull(raw.startedAt);
  if (!startedAt) return null;
  const minutes = raw.minutes == null ? null : clampInt(raw.minutes, null, 1, MAX_LOCK_MINUTES);
  return {
    startedAt,
    until: isoOrNull(raw.until),
    minutes,
    reason: cleanText(raw.reason) || null,
    by: raw.by ? cleanText(raw.by, 64) : null,
    byId: raw.byId ? cleanText(raw.byId, 64) : null,
    banner: raw.banner !== false,
  };
}

function pickSecurityLocks(input) {
  const out = {};
  if (!input || typeof input !== "object") return out;
  for (const mode of LOCK_MODES) {
    const lock = pickLock(input[mode]);
    if (lock) out[mode] = lock;
  }
  return out;
}

/** Known security keys only; hooked into systemSettings.pickConfig. */
function pickSecurityConfig(input) {
  const out = {};
  if (!input || typeof input !== "object") return out;
  if (input.dmMinAccountAgeHours !== undefined) out.dmMinAccountAgeHours = clampInt(input.dmMinAccountAgeHours, 0, 0, 720);
  if (input.disposableEmailBlock !== undefined) out.disposableEmailBlock = input.disposableEmailBlock === true;
  if (input.securityLocks !== undefined) out.securityLocks = pickSecurityLocks(input.securityLocks);
  return out;
}

/* ---------------- locks ---------------- */

function lockOf(config, mode) {
  const lock = config && config.securityLocks && config.securityLocks[mode];
  return lock && typeof lock === "object" && lock.startedAt ? lock : null;
}

function lockExpired(lock, now = Date.now()) {
  return Boolean(lock && lock.until && Date.parse(lock.until) <= now);
}

/** True while this lock is on (an expired lock reads as off even before the timer clears it). */
function lockActive(config, mode, now = Date.now()) {
  const lock = lockOf(config, mode);
  return Boolean(lock) && !lockExpired(lock, now);
}

function activeLocks(config, now = Date.now()) {
  const out = {};
  for (const mode of LOCK_MODES) if (lockActive(config, mode, now)) out[mode] = lockOf(config, mode);
  return out;
}

function expiredLockModes(config, now = Date.now()) {
  return LOCK_MODES.filter((mode) => {
    const lock = lockOf(config, mode);
    return lock && lockExpired(lock, now);
  });
}

/**
 * What every user sees while a lock with "Kullanıcılara bilgi bandı göster" is on:
 * { modes: [...], until: ISO|null (the latest end, null when any is until lifted) } or null.
 */
function publicNotice(config, now = Date.now()) {
  const locks = activeLocks(config, now);
  const modes = LOCK_MODES.filter((m) => locks[m] && locks[m].banner !== false);
  if (!modes.length) return null;
  let until = null;
  let open = false;
  for (const m of modes) {
    if (!locks[m].until) open = true;
    else if (!until || Date.parse(locks[m].until) > Date.parse(until)) until = locks[m].until;
  }
  return { modes, until: open ? null : until };
}

/* ---------------- history: flatten + diff ---------------- */

function lockSummary(lock) {
  if (!lock) return null;
  return { until: lock.until || null, minutes: lock.minutes == null ? null : lock.minutes };
}

/**
 * key -> value view of a config for the history diff. Feature flags become
 * featureFlags.<name>, each lock becomes lock.<mode> (null when off), long lists
 * are summarised by length.
 */
function flattenConfig(config, now = Date.now()) {
  const out = {};
  const src = config && typeof config === "object" ? config : {};
  for (const [k, v] of Object.entries(src)) {
    if (k === "featureFlags" && v && typeof v === "object") {
      for (const [fk, fv] of Object.entries(v)) out[`featureFlags.${fk}`] = fv;
      continue;
    }
    if (k === "securityLocks") continue;
    if (k === "profanityWords") {
      out.profanityWordCount = Array.isArray(v) ? v.length : 0;
      continue;
    }
    if (Array.isArray(v)) {
      out[k] = v.length > 20 ? `[${v.length}]` : v.slice();
      continue;
    }
    if (v !== null && typeof v === "object") continue;
    out[k] = v;
  }
  for (const k of Object.keys(SECURITY_DEFAULTS)) if (!(k in out)) out[k] = SECURITY_DEFAULTS[k];
  for (const mode of LOCK_MODES) {
    const lock = lockOf(src, mode);
    out[`lock.${mode}`] = lock && !lockExpired(lock, now) ? lockSummary(lock) : null;
  }
  return out;
}

function same(a, b) {
  return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
}

/** [{ key, from, to }] for every key whose value changed (sorted: locks first, then by key). */
function diffConfig(before, after, now = Date.now()) {
  const a = flattenConfig(before, now);
  const b = flattenConfig(after, now);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out = [];
  for (const key of keys) {
    if (same(a[key], b[key])) continue;
    out.push({ key, from: a[key] === undefined ? null : a[key], to: b[key] === undefined ? null : b[key] });
  }
  return out.sort((x, y) => Number(!x.key.startsWith("lock.")) - Number(!y.key.startsWith("lock.")) || x.key.localeCompare(y.key));
}

function categoryOfKey(key) {
  if (String(key).startsWith("lock.")) return "locks";
  return KEY_CATEGORY[key] || "other";
}

/** One category for a history entry: the first change that has one. */
function categoryOf(changes) {
  for (const c of changes || []) {
    const cat = categoryOfKey(c.key);
    if (cat !== "other") return cat;
  }
  return "other";
}

/**
 * The patch that puts these changes back. Lock entries are not reverted through
 * here (a lock is lifted instead), so lock.* keys are skipped.
 */
function revertPatch(changes) {
  const patch = {};
  for (const c of changes || []) {
    if (!c || typeof c.key !== "string" || c.key.startsWith("lock.")) continue;
    if (c.key.startsWith("featureFlags.")) {
      patch.featureFlags = patch.featureFlags || {};
      patch.featureFlags[c.key.slice("featureFlags.".length)] = c.from;
      continue;
    }
    if (c.key === "profanityWordCount") continue;
    if (typeof c.from === "string" && /^\[\d+\]$/.test(c.from)) continue;
    patch[c.key] = c.from;
  }
  return patch;
}

/** Keys of this change whose live value moved on since (the revert would overwrite them). */
function staleKeys(changes, currentConfig, now = Date.now()) {
  const cur = flattenConfig(currentConfig, now);
  return (changes || []).filter((c) => !String(c.key).startsWith("lock.") && !same(cur[c.key], c.to)).map((c) => c.key);
}

/** Security-settings view the page reads (defaults filled in). */
function securityView(config, now = Date.now()) {
  const c = config || {};
  return {
    registrationEnabled: c.registrationEnabled !== false,
    dmEnabled: c.dmEnabled !== false,
    groupCreationEnabled: c.groupCreationEnabled !== false,
    chatFrozen: Boolean(c.chatFrozen),
    maxLoginAttempts: Number.isFinite(Number(c.maxLoginAttempts)) ? Number(c.maxLoginAttempts) : 5,
    maxMessagesPerMinute: Number.isFinite(Number(c.maxMessagesPerMinute)) ? Number(c.maxMessagesPerMinute) : 60,
    dmRateLimitMs: Number.isFinite(Number(c.dmRateLimitMs)) ? Number(c.dmRateLimitMs) : 200,
    dmMinAccountAgeHours: clampInt(c.dmMinAccountAgeHours, 0, 0, 720),
    disposableEmailBlock: c.disposableEmailBlock === true,
    locks: activeLocks(c, now),
  };
}

/** Validate a PATCH /security/settings body: { patch } with known keys only, or { error }. */
function validateSettingsPatch(body) {
  const raw = body && typeof body === "object" ? body.patch || body : {};
  const patch = {};
  for (const key of SECURITY_SETTING_KEYS) {
    if (raw[key] === undefined) continue;
    const v = raw[key];
    if (["registrationEnabled", "dmEnabled", "groupCreationEnabled", "disposableEmailBlock"].includes(key)) {
      if (typeof v !== "boolean") return { error: "bad_value", key };
      patch[key] = v;
    } else {
      const n = Number(v);
      if (!Number.isFinite(n)) return { error: "bad_value", key };
      patch[key] = n;
    }
  }
  if (!Object.keys(patch).length) return { error: "empty" };
  return { patch };
}

/** A patch that switches something off (or loosens a limit) needs a reason. */
function patchNeedsReason(patch) {
  if (!patch) return false;
  return ["registrationEnabled", "dmEnabled", "groupCreationEnabled"].some((k) => patch[k] === false);
}

module.exports = {
  LOCK_MODES,
  LOCK_DURATIONS,
  MAX_LOCK_MINUTES,
  REASON_MAX,
  SECURITY_DEFAULTS,
  SECURITY_SETTING_KEYS,
  HISTORY_CATEGORIES,
  KEY_CATEGORY,
  cleanText,
  pickSecurityConfig,
  pickSecurityLocks,
  lockOf,
  lockActive,
  lockExpired,
  activeLocks,
  expiredLockModes,
  publicNotice,
  flattenConfig,
  diffConfig,
  categoryOf,
  categoryOfKey,
  revertPatch,
  staleKeys,
  securityView,
  validateSettingsPatch,
  patchNeedsReason,
};
