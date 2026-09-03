"use strict";

const { withTimeout, isMissingRelationError } = require("./adminOverview");

const SETTINGS_ID = "default";
const LOAD_MS = 5000;

const DEFAULT_SYSTEM_CONFIG = {
  dmRateLimitMs: 200,
  loggingLevel: "info",
  featureFlags: { voice: true, dm: true, video: true, screen: true },
  themeForce: null,
  maintenanceMode: false,
  chatFrozen: false,
  slowModeSeconds: 0,
  registrationEnabled: true,
  dmEnabled: true,
  groupCreationEnabled: true,
  maxLoginAttempts: 5,
  maxMessagesPerMinute: 60,
  maxMessageLength: 2000,
  rateLimitGlobalMs: 0,
};

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

function pickFeatureFlags(input) {
  if (!input || typeof input !== "object") return { ...DEFAULT_SYSTEM_CONFIG.featureFlags };
  return {
    voice: input.voice !== false,
    dm: input.dm !== false,
    video: input.video !== false,
    screen: input.screen !== false,
  };
}

function pickProfanityWords(input) {
  if (!Array.isArray(input)) return undefined;
  const out = [];
  const seen = new Set();
  for (const raw of input) {
    const w = String(raw || "").trim();
    if (!w || seen.has(w)) continue;
    seen.add(w);
    out.push(w);
    if (out.length >= 2000) break;
  }
  return out;
}

/** Keep only known keys so RAM isolates cannot persist garbage. */
function pickConfig(input) {
  if (!input || typeof input !== "object") return {};
  const out = {};
  if (input.dmRateLimitMs !== undefined) out.dmRateLimitMs = clampInt(input.dmRateLimitMs, 200, 0, 60_000);
  if (input.loggingLevel !== undefined) {
    const level = String(input.loggingLevel || "info").toLowerCase();
    out.loggingLevel = ["debug", "info", "warn", "error"].includes(level) ? level : "info";
  }
  if (input.featureFlags !== undefined) out.featureFlags = pickFeatureFlags(input.featureFlags);
  if (input.themeForce !== undefined) {
    out.themeForce = input.themeForce == null || input.themeForce === "" ? null : String(input.themeForce).slice(0, 32);
  }
  if (input.maintenanceMode !== undefined) out.maintenanceMode = Boolean(input.maintenanceMode);
  if (input.chatFrozen !== undefined) out.chatFrozen = Boolean(input.chatFrozen);
  if (input.slowModeSeconds !== undefined) out.slowModeSeconds = clampInt(input.slowModeSeconds, 0, 0, 3600);
  if (input.registrationEnabled !== undefined) out.registrationEnabled = input.registrationEnabled !== false;
  if (input.dmEnabled !== undefined) out.dmEnabled = input.dmEnabled !== false;
  if (input.groupCreationEnabled !== undefined) out.groupCreationEnabled = input.groupCreationEnabled !== false;
  if (input.maxLoginAttempts !== undefined) out.maxLoginAttempts = clampInt(input.maxLoginAttempts, 5, 1, 100);
  if (input.maxMessagesPerMinute !== undefined) out.maxMessagesPerMinute = clampInt(input.maxMessagesPerMinute, 60, 1, 10_000);
  if (input.maxMessageLength !== undefined) out.maxMessageLength = clampInt(input.maxMessageLength, 2000, 1, 20_000);
  if (input.rateLimitGlobalMs !== undefined) out.rateLimitGlobalMs = clampInt(input.rateLimitGlobalMs, 0, 0, 60_000);
  const words = pickProfanityWords(input.profanityWords);
  if (words) out.profanityWords = words;
  return out;
}

function mergeSystemConfig(stored) {
  const picked = pickConfig(stored);
  return {
    ...DEFAULT_SYSTEM_CONFIG,
    ...picked,
    featureFlags: pickFeatureFlags(picked.featureFlags || stored?.featureFlags || DEFAULT_SYSTEM_CONFIG.featureFlags),
  };
}

function applySystemConfigToState(state, config) {
  if (!state || !state.systemConfig || !config) return state;
  Object.assign(state.systemConfig, mergeSystemConfig(config));
  if (Array.isArray(config.profanityWords) && state.profanityWords && typeof state.profanityWords.clear === "function") {
    state.profanityWords.clear();
    for (const w of config.profanityWords) state.profanityWords.add(w);
  }
  return state;
}

function emptySettings(extra) {
  return {
    config: mergeSystemConfig({}),
    startedAt: null,
    missingTable: false,
    ...(extra || {}),
  };
}

async function loadSystemSettings(client, opts) {
  const options = opts || {};
  const timeoutMs = options.timeoutMs || LOAD_MS;
  if (!client) return emptySettings({ missingTable: true });

  const res = await withTimeout(
    client.from("system_settings").select("id, config, started_at, updated_at").eq("id", SETTINGS_ID).maybeSingle(),
    timeoutMs,
    { data: null, error: { message: "timeout" } }
  );

  if (res?.error) {
    if (isMissingRelationError(res.error) || /Could not find the table/i.test(String(res.error.message || ""))) {
      return emptySettings({ missingTable: true });
    }
    if (res.error.message !== "timeout") {
      console.warn("[system-settings] load:", res.error.message || res.error);
    }
    return emptySettings({ error: res.error });
  }

  if (!res.data) {
    const nowIso = new Date().toISOString();
    const ins = await withTimeout(
      client
        .from("system_settings")
        .insert({ id: SETTINGS_ID, config: {}, started_at: nowIso })
        .select("id, config, started_at")
        .maybeSingle(),
      timeoutMs,
      { data: null, error: { message: "timeout" } }
    );
    if (ins?.error && isMissingRelationError(ins.error)) {
      return emptySettings({ missingTable: true });
    }
    return {
      config: mergeSystemConfig(ins?.data?.config),
      startedAt: ins?.data?.started_at || nowIso,
      missingTable: false,
    };
  }

  return {
    config: mergeSystemConfig(res.data.config),
    startedAt: res.data.started_at || null,
    missingTable: false,
  };
}

async function persistSystemConfig(client, patch, opts) {
  const options = opts || {};
  const timeoutMs = options.timeoutMs || LOAD_MS;
  const loaded = await loadSystemSettings(client, options);
  const config = mergeSystemConfig({ ...loaded.config, ...pickConfig(patch) });
  if (!client || loaded.missingTable) return { ...loaded, config, persisted: false };

  const stored = pickConfig(config);
  const res = await withTimeout(
    client
      .from("system_settings")
      .update({ config: stored, updated_at: new Date().toISOString() })
      .eq("id", SETTINGS_ID)
      .select("id, config, started_at")
      .maybeSingle(),
    timeoutMs,
    { data: null, error: { message: "timeout" } }
  );
  if (res?.error) {
    if (isMissingRelationError(res.error)) return { ...loaded, config, persisted: false, missingTable: true };
    console.warn("[system-settings] persist:", res.error.message || res.error);
    return { ...loaded, config, persisted: false, error: res.error };
  }
  return {
    config: mergeSystemConfig(res?.data?.config || stored),
    startedAt: res?.data?.started_at || loaded.startedAt,
    missingTable: false,
    persisted: true,
  };
}

module.exports = {
  SETTINGS_ID,
  DEFAULT_SYSTEM_CONFIG,
  pickConfig,
  mergeSystemConfig,
  applySystemConfigToState,
  loadSystemSettings,
  persistSystemConfig,
};
