"use strict";

/**
 * Pure rules of the Sistem page (Draft A): kill switches grouped by area, limits,
 * the memory backup file. No I/O here (tested in test/adminSystem.test.cjs).
 */

/** "Acil anahtarlar" by area, in the order the card shows them. */
const SWITCH_GROUPS = Object.freeze([
  { id: "chat", keys: ["chatFrozen", "slowModeSeconds"] },
  { id: "account", keys: ["registrationEnabled", "dmEnabled", "groupCreationEnabled"] },
  { id: "media", keys: ["voice", "video", "screen"] },
  { id: "maintenance", keys: ["maintenanceMode"] },
]);
const FLAG_SWITCHES = Object.freeze(["voice", "video", "screen"]);
const BOOL_SWITCHES = Object.freeze(["chatFrozen", "registrationEnabled", "dmEnabled", "groupCreationEnabled", "maintenanceMode", ...FLAG_SWITCHES]);
/** Value that cuts something off for users (needs a reason). */
const CUTTING = Object.freeze({
  chatFrozen: true,
  maintenanceMode: true,
  registrationEnabled: false,
  dmEnabled: false,
  groupCreationEnabled: false,
  voice: false,
  video: false,
  screen: false,
});

const LIMIT_DEFAULTS = Object.freeze({ maxMessageLength: 2000, rateLimitGlobalMs: 0, maxMessagesPerMinute: 60 });
const LIMIT_RANGES = Object.freeze({
  maxMessageLength: [1, 20000],
  rateLimitGlobalMs: [0, 60000],
  maxMessagesPerMinute: [1, 10000],
});
const REASON_MAX = 300;

function cleanReason(v) {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, REASON_MAX);
}

/** Current switch values (defaults filled in). */
function switchesView(config = {}) {
  const f = config.featureFlags || {};
  return {
    chatFrozen: Boolean(config.chatFrozen),
    slowModeSeconds: Number(config.slowModeSeconds) || 0,
    registrationEnabled: config.registrationEnabled !== false,
    dmEnabled: config.dmEnabled !== false,
    groupCreationEnabled: config.groupCreationEnabled !== false,
    voice: f.voice !== false,
    video: f.video !== false,
    screen: f.screen !== false,
    maintenanceMode: Boolean(config.maintenanceMode),
  };
}

/**
 * Validate PATCH /system/switches. Returns { patch, cutting } or { error, key }.
 * `patch` is a system_settings patch (voice / video / screen go under featureFlags).
 */
function validateSwitchPatch(body, config = {}) {
  const raw = body && typeof body === "object" ? body.patch || {} : {};
  const patch = {};
  const flags = {};
  const cutting = [];
  for (const [key, value] of Object.entries(raw)) {
    if (key === "slowModeSeconds") {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0 || n > 3600) return { error: "BAD_VALUE", key };
      patch.slowModeSeconds = Math.floor(n);
      continue;
    }
    if (!BOOL_SWITCHES.includes(key)) return { error: "UNKNOWN_SWITCH", key };
    if (typeof value !== "boolean") return { error: "BAD_VALUE", key };
    if (FLAG_SWITCHES.includes(key)) flags[key] = value;
    else patch[key] = value;
    if (CUTTING[key] === value) cutting.push(key);
  }
  if (Object.keys(flags).length) patch.featureFlags = { ...(config.featureFlags || {}), ...flags };
  if (!Object.keys(patch).length) return { error: "EMPTY" };
  return { patch, cutting };
}

/** Validate PATCH /system/limits. Returns { patch } or { error, key }. */
function validateLimitsPatch(body) {
  const raw = body && typeof body === "object" ? body.patch || {} : {};
  const patch = {};
  for (const [key, value] of Object.entries(raw)) {
    const range = LIMIT_RANGES[key];
    if (!range) return { error: "UNKNOWN_LIMIT", key };
    const n = Number(value);
    if (!Number.isFinite(n) || Math.floor(n) !== n || n < range[0] || n > range[1]) return { error: "BAD_VALUE", key };
    patch[key] = n;
  }
  if (!Object.keys(patch).length) return { error: "EMPTY" };
  return { patch };
}

function limitsView(config = {}) {
  const out = {};
  for (const k of Object.keys(LIMIT_DEFAULTS)) {
    const n = Number(config[k]);
    out[k] = Number.isFinite(n) ? n : LIMIT_DEFAULTS[k];
  }
  return out;
}

/** descall-backup-2026-11-15-0300.json (Istanbul time). */
function backupFileName(now = Date.now()) {
  const d = new Date(now + 3 * 3600 * 1000).toISOString();
  return `descall-backup-${d.slice(0, 10)}-${d.slice(11, 13)}${d.slice(14, 16)}.json`;
}

/** The memory backup ("Bellek yedeği"): general chat, settings, flags, an audit sample. */
function buildBackup({ state, info = {}, now = Date.now() }) {
  const cfg = JSON.parse(JSON.stringify(state.systemConfig || {}));
  return {
    kind: "descall-memory-backup",
    version: 2,
    at: new Date(now).toISOString(),
    server: { bootId: info.bootId || null, commit: info.commit || null, version: info.version || null, uptimeSec: info.uptimeSec ?? null },
    systemConfig: cfg,
    profanityWords: Array.from(state.profanityWords || []),
    generalMessages: Array.isArray(state.generalMessages) ? state.generalMessages : [],
    dmKeys: state.dmHistory && typeof state.dmHistory.keys === "function" ? [...state.dmHistory.keys()] : [],
    auditSample: Array.isArray(state.auditLog) ? state.auditLog.slice(0, 50) : [],
  };
}

module.exports = {
  SWITCH_GROUPS,
  FLAG_SWITCHES,
  BOOL_SWITCHES,
  CUTTING,
  LIMIT_DEFAULTS,
  LIMIT_RANGES,
  REASON_MAX,
  cleanReason,
  switchesView,
  validateSwitchPatch,
  validateLimitsPatch,
  limitsView,
  backupFileName,
  buildBackup,
};
