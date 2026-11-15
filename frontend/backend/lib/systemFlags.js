"use strict";

/**
 * Sistem page feature flags (Draft A "Kontrol merkezi": table + editor drawer).
 *
 * Every flag is shown and edited as a rule { mode, percent, platforms, staff }
 * (lib/featureRollout.js). Storage:
 *   iosGlass, desktopGlass, bootDiet  featureFlags.<key> = boolean or rule
 *   presenceScoped                    featureFlags.presenceScoped = boolean (server-wide)
 *   edgeRealtime                      featureFlags.edgeRealtime (master) + edgeRealtimePercent,
 *                                     edgeRealtimePlatforms, edgeRealtimeAllowUserIds
 * Changes go through lib/systemSettingsChange.applySettingsChange, so every change is in
 * the shared settings history (lib/settingsHistory.js, the same one Güvenlik Merkezi
 * shows) with its old and new value, audited and revertible. meta.flagState keeps the
 * whole rule after the change so "Buna dön" can put any older state back.
 */

const rollout = require("./featureRollout");
const history = require("./settingsHistory");

const ROLLOUT_PLATFORMS = rollout.PLATFORMS;

/** Order and capabilities of the table rows (labels live in the sysx.* locale files). */
const FLAG_CATALOG = Object.freeze([
  { key: "iosGlass", icon: "phone", allowed: ["ios"], defaultOn: true, kind: "client" },
  { key: "desktopGlass", icon: "monitor", allowed: ["web", "electron", "android"], defaultOn: false, kind: "client" },
  { key: "presenceScoped", icon: "users", allowed: [], defaultOn: true, kind: "server" },
  { key: "bootDiet", icon: "zap", allowed: ROLLOUT_PLATFORMS.slice(), defaultOn: true, kind: "user" },
  { key: "edgeRealtime", icon: "cloud", allowed: ROLLOUT_PLATFORMS.slice(), defaultOn: false, kind: "edge" },
]);
const FLAG_KEYS = Object.freeze(FLAG_CATALOG.map((f) => f.key));
const EDGE_KEYS = Object.freeze(["featureFlags.edgeRealtime", "edgeRealtimePercent", "edgeRealtimePlatforms", "edgeRealtimeAllowUserIds"]);
/** Edge rollout stages of the pipeline ("Gölge, Ekip, %5, %25, %50, %100"). */
const EDGE_STAGES = Object.freeze(["shadow", "team", "p5", "p25", "p50", "p100"]);
const STAGE_PERCENT = Object.freeze({ shadow: 0, team: 0, p5: 5, p25: 25, p50: 50, p100: 100 });

function catalogOf(key) {
  return FLAG_CATALOG.find((f) => f.key === key) || null;
}

function historyKeysOf(key) {
  return key === "edgeRealtime" ? EDGE_KEYS.slice() : [`featureFlags.${key}`];
}

/** The rule the editor shows for a flag in this config. */
function ruleFromConfig(key, config = {}) {
  const def = catalogOf(key);
  if (!def) return null;
  const flags = config.featureFlags || {};
  if (def.kind === "edge") {
    const on = flags.edgeRealtime === true;
    const pct = Math.max(0, Math.min(100, Math.round(Number(config.edgeRealtimePercent) || 0)));
    const platforms = Array.isArray(config.edgeRealtimePlatforms) && config.edgeRealtimePlatforms.length ? config.edgeRealtimePlatforms : ["web"];
    const staff = Array.isArray(config.edgeRealtimeAllowUserIds) ? config.edgeRealtimeAllowUserIds.map((x) => String(x).toLowerCase()) : [];
    const mode = !on ? "off" : pct >= 100 ? "all" : pct > 0 ? "rollout" : "staff";
    const clean = rollout.normalizeRule({ mode: "all", platforms }).platforms;
    return { mode, percent: pct, platforms: clean.length === ROLLOUT_PLATFORMS.length ? [] : clean, staff };
  }
  const rule = rollout.toRule(flags[key], def.defaultOn);
  if (def.kind === "server") return { mode: rule.mode === "all" || rule.mode === "rollout" ? "all" : "off", percent: rule.mode === "off" ? 0 : 100, platforms: [], staff: [] };
  if (def.allowed.length === 1) rule.platforms = def.allowed.slice();
  return rule;
}

/**
 * Validate an editor rule for this flag. Returns { rule } or { error }.
 * Server-wide flags only take off / all; platform lists are cut to what the flag allows.
 */
function validateRule(key, input) {
  const def = catalogOf(key);
  if (!def) return { error: "UNKNOWN_FLAG" };
  if (!input || typeof input !== "object") return { error: "BAD_RULE" };
  if (!rollout.MODES.includes(input.mode)) return { error: "BAD_MODE" };
  const rule = rollout.normalizeRule({ ...input });
  if (def.kind === "server") {
    if (rule.mode === "staff" || rule.mode === "rollout") return { error: "SERVER_WIDE" };
    return { rule: { mode: rule.mode, percent: rule.mode === "all" ? 100 : 0, platforms: [], staff: [] } };
  }
  if (def.allowed.length === 1) rule.platforms = def.allowed.slice();
  else rule.platforms = rule.platforms.filter((p) => def.allowed.includes(p));
  if (rule.mode === "rollout" && (rule.percent <= 0 || rule.percent >= 100)) return { error: "BAD_PERCENT" };
  return { rule };
}

/** The config patch that stores `rule` for this flag (merged with the live flags). */
function patchForRule(key, rule, config = {}) {
  const def = catalogOf(key);
  const flags = { ...(config.featureFlags || {}) };
  if (def.kind === "edge") {
    if (rule.mode === "off") return { featureFlags: { ...flags, edgeRealtime: false } };
    return {
      featureFlags: { ...flags, edgeRealtime: true },
      edgeRealtimePercent: rule.mode === "all" ? 100 : rule.mode === "rollout" ? rule.percent : 0,
      edgeRealtimePlatforms: rule.platforms.length ? rule.platforms : ROLLOUT_PLATFORMS.slice(),
      edgeRealtimeAllowUserIds: rule.staff,
    };
  }
  if (def.kind === "server") return { featureFlags: { ...flags, [key]: rule.mode === "all" } };
  // A single-platform flag (iosGlass) needs no platform list; compact() stores plain
  // on / off as a boolean and keeps a paused rollout's percent.
  const stored = def.allowed.length === 1 ? { ...rule, platforms: [] } : rule;
  return { featureFlags: { ...flags, [key]: rollout.compact(stored) } };
}

/** The quick switch in the table row: off <-> back to the last rollout (or everyone). */
function toggledRule(key, config, on) {
  const cur = ruleFromConfig(key, config);
  if (!on) return { ...cur, mode: "off" };
  if (cur.mode !== "off") return cur;
  const def = catalogOf(key);
  if (def.kind === "server") return { ...cur, mode: "all", percent: 100 };
  if (cur.percent > 0 && cur.percent < 100) return { ...cur, mode: "rollout" };
  return { ...cur, mode: "all", percent: 100 };
}

/** Pipeline stage of the edge rule (null when off). */
function edgeStage(rule) {
  if (!rule || rule.mode === "off") return null;
  if (rule.mode === "all" || rule.percent >= 100) return "p100";
  if (rule.percent >= 50) return "p50";
  if (rule.percent >= 25) return "p25";
  if (rule.percent >= 5) return "p5";
  if (rule.percent > 0) return "p5";
  return rule.staff.length ? "team" : "shadow";
}

function ruleForStage(stage, current) {
  const base = current && current.mode !== "off" ? current : { mode: "staff", percent: 0, platforms: current?.platforms || ["web"], staff: current?.staff || [] };
  const pct = STAGE_PERCENT[stage];
  if (stage === "shadow") return { ...base, mode: "staff", percent: 0, staff: [] };
  if (stage === "team") return { ...base, mode: "staff", percent: 0 };
  if (pct >= 100) return { ...base, mode: "all", percent: 100 };
  return { ...base, mode: "rollout", percent: pct };
}

/** The flag's rule recorded in a history entry (meta.flagState, else the stored values). */
function stateFromEntry(key, entry) {
  if (!entry) return null;
  const meta = entry.meta || {};
  if (meta.flag === key && meta.flagState && typeof meta.flagState === "object") return rollout.normalizeRule(meta.flagState);
  const changes = entry.changes || [];
  if (key === "edgeRealtime") {
    const get = (k) => changes.find((c) => c.key === k);
    const master = get("featureFlags.edgeRealtime");
    if (master && master.to === false) return { mode: "off", percent: 0, platforms: [], staff: [] };
    const pct = get("edgeRealtimePercent");
    if (!master && !pct) return null;
    const p = pct ? Number(pct.to) || 0 : null;
    const platforms = get("edgeRealtimePlatforms");
    return {
      mode: p == null ? "staff" : p >= 100 ? "all" : p > 0 ? "rollout" : "staff",
      percent: p == null ? 0 : p,
      platforms: Array.isArray(platforms?.to) ? platforms.to : [],
      staff: [],
      partial: true,
    };
  }
  const c = changes.find((x) => x.key === `featureFlags.${key}`);
  if (!c) return null;
  return rollout.toRule(c.to, false);
}

function sameRule(a, b) {
  if (!a || !b) return false;
  const n = (r) => JSON.stringify({ m: r.mode, p: r.mode === "rollout" ? r.percent : 0, pl: (r.platforms || []).slice().sort(), s: (r.staff || []).slice().sort() });
  return n(a) === n(b);
}

/** History entries that touch this flag, newest first (shared settings history). */
async function flagHistory(key, { limit = 20 } = {}) {
  const keys = historyKeysOf(key);
  const touches = (e) => (e.changes || []).some((c) => keys.includes(c.key));
  let entries = null;
  if (history.persistent()) {
    try {
      const db = require("../db/supabase");
      const all = [];
      for (const k of keys) {
        const { data, error } = await db.from(history.TABLE).select("*").contains("changes", [{ key: k }]).order("at", { ascending: false }).limit(limit);
        if (error) throw error;
        for (const r of data || []) all.push(history.fromRow(r));
      }
      const seen = new Set();
      entries = all.filter((e) => (seen.has(e.id) ? false : seen.add(e.id))).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    } catch {
      entries = null;
    }
  }
  if (!entries) {
    const page = await history.list({ limit: 200 });
    entries = page.entries.filter(touches);
  }
  return entries.slice(0, limit).map((e) => ({
    id: e.id,
    at: e.at,
    by: e.actorUsername || null,
    reason: e.reason || null,
    source: e.source,
    state: stateFromEntry(key, e),
    revertedAt: e.revertedAt || null,
    auto: e.source === "auto_rollback",
  }));
}

/** Last change of each flag (who, when) for the table subtitles. */
async function lastChanges() {
  const page = await history.list({ limit: 200 });
  const out = {};
  for (const e of page.entries) {
    for (const key of FLAG_KEYS) {
      if (out[key]) continue;
      const keys = historyKeysOf(key);
      if ((e.changes || []).some((c) => keys.includes(c.key))) out[key] = { at: e.at, by: e.actorUsername || null };
    }
  }
  return out;
}

/** Each socket gets the public flags resolved for its own account and platform. */
function emitFeaturesToAll(io) {
  if (!io) return 0;
  const state = require("../runtime/sharedState");
  const { publicFeatureFlags } = require("./systemSettings");
  const { clientPlatform } = require("./edgeRealtime");
  let n = 0;
  try {
    for (const socket of io.of("/").sockets.values()) {
      try {
        socket.emit("features:updated", publicFeatureFlags(state.systemConfig.featureFlags, { userId: socket.user?.id || null, platform: clientPlatform(socket) }));
        n += 1;
      } catch {
        /* gone */
      }
    }
  } catch {
    /* no sockets */
  }
  return n;
}

/**
 * "Kaydetmeden önce kendi hesabımda dene": only the admin's own open apps get the
 * proposed rule (as if they were on the staff list). Nothing is stored.
 */
function trialForUser(io, userId, key, rule) {
  if (!io || !userId) return 0;
  const state = require("../runtime/sharedState");
  const { publicFeatureFlags } = require("./systemSettings");
  const { clientPlatform } = require("./edgeRealtime");
  const flags = { ...state.systemConfig.featureFlags, [key]: { ...rule, mode: rule.mode === "off" ? "off" : "staff", staff: [String(userId).toLowerCase()] } };
  let n = 0;
  for (const socket of io.of("/").sockets.values()) {
    if (socket.user?.id !== userId) continue;
    try {
      socket.emit("features:updated", publicFeatureFlags(flags, { userId, platform: clientPlatform(socket) }));
      n += 1;
    } catch {
      /* gone */
    }
  }
  return n;
}

/* ---------------- automatic rollback guard ---------------- */

const GUARD_WINDOW_MS = 15 * 60 * 1000;
const GUARD_TICK_MS = 60 * 1000;
const GUARD_THRESHOLD = 0.02;
const GUARD_MIN_USERS = 3;
const guards = new Map(); // key -> { since, previous, timer, historyId, actor }

/**
 * Share of connected users that reported a client error since `since`. Pure, tested.
 * @returns {{ users: number, rate: number }}
 */
function errorRate(entries, since, connected) {
  const from = Date.parse(since);
  const who = new Set();
  for (const e of entries || []) {
    const at = Date.parse(e.timestamp || e.at || "");
    if (!Number.isFinite(at) || at < from) continue;
    const sev = String(e.severity || "error").toLowerCase();
    if (sev === "info" || sev === "debug" || sev === "warning" || sev === "warn") continue;
    who.add(String(e.user?.id || e.userId || e.id));
  }
  const users = who.size;
  return { users, rate: connected > 0 ? users / connected : 0 };
}

function shouldRollBack({ users, rate }) {
  return users >= GUARD_MIN_USERS && rate > GUARD_THRESHOLD;
}

function guardStatus(key) {
  const g = guards.get(key);
  if (!g) return null;
  return { since: g.since, until: new Date(Date.parse(g.since) + GUARD_WINDOW_MS).toISOString(), threshold: GUARD_THRESHOLD };
}

function clearGuard(key) {
  const g = guards.get(key);
  if (g?.timer) clearInterval(g.timer);
  guards.delete(key);
}

/**
 * Watch the client error rate for 15 minutes after a change; above 2 % the previous
 * rule comes back by itself (history source "auto_rollback", audit, admin room).
 */
function armGuard({ key, previous, actor, io, apply }) {
  clearGuard(key);
  const since = new Date().toISOString();
  const g = { since, previous, actor };
  g.timer = setInterval(async () => {
    if (Date.now() - Date.parse(since) > GUARD_WINDOW_MS) return clearGuard(key);
    const state = require("../runtime/sharedState");
    let connected = 0;
    try {
      connected = io?.engine?.clientsCount ?? io?.of("/").sockets.size ?? 0;
    } catch {
      connected = 0;
    }
    const r = errorRate([...(state.errorLogs || []), ...(state.serverErrorLog || [])], since, connected);
    if (!shouldRollBack(r)) return undefined;
    clearGuard(key);
    try {
      await apply({ rule: previous, reason: `auto: ${Math.round(r.rate * 1000) / 10}% (${r.users})`, source: "auto_rollback" });
    } catch {
      /* next change wins */
    }
    return undefined;
  }, GUARD_TICK_MS);
  g.timer.unref?.();
  guards.set(key, g);
  return guardStatus(key);
}

module.exports = {
  FLAG_CATALOG,
  FLAG_KEYS,
  EDGE_KEYS,
  EDGE_STAGES,
  STAGE_PERCENT,
  GUARD_THRESHOLD,
  GUARD_WINDOW_MS,
  catalogOf,
  historyKeysOf,
  ruleFromConfig,
  validateRule,
  patchForRule,
  toggledRule,
  edgeStage,
  ruleForStage,
  stateFromEntry,
  sameRule,
  flagHistory,
  lastChanges,
  emitFeaturesToAll,
  trialForUser,
  errorRate,
  shouldRollBack,
  armGuard,
  clearGuard,
  guardStatus,
};
