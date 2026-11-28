"use strict";

/**
 * Yönetici Paneli › Sistem (remake, owner-approved Draft A "Kontrol merkezi", Nov 2026).
 * Mounted inside routes/admin.js: requireAuth + requireAdmin + admin 2FA + step-up on
 * every write + section "system" (lib/adminPermissions: anything unlisted is "system").
 *
 *   GET   /system/overview                     header chips, health tiles, flags, edge, switches, limits, broadcast, backup
 *   GET   /system/health                       tiles + sparklines (polled every 5 s)
 *   GET   /system/edge/history                 14 days of peak sockets / edge sockets + rollout markers
 *   GET   /system/flags/history                every flag change (card link "Değişiklik geçmişi")
 *   GET   /system/flags/:key/history           shared settings history for this flag
 *   PATCH /system/flags/:key { rule, reason, autoRollback }   editor drawer "Kaydet ve yayınla"
 *   POST  /system/flags/:key/toggle { on }     row switch (off keeps the rollout for later)
 *   POST  /system/flags/:key/restore { historyId, reason }    "Buna dön"
 *   POST  /system/flags/:key/try { rule }      "Kaydetmeden önce kendi hesabımda dene" (nothing stored)
 *   POST  /system/edge/stage { stage, reason } Edge rollout stage pills
 *   PATCH /system/switches { patch, reason }   kill switches (a reason when something is cut off)
 *   PATCH /system/limits { patch, reason }     limits;  POST /system/limits/reset { reason }
 *   POST  /system/history/:id/undo             undo toast after any change made here
 *   GET   /system/staff-search?q=              people for "Her zaman açık (ekip)"
 *   POST  /system/broadcast { text }           instant notice to everyone online; GET /system/broadcasts
 *   POST  /system/backup                       memory backup as a file download (audited)
 *   GET   /system/restart                      safe restart dialog data;  POST /system/restart (fresh code + typed confirm)
 */

const { apiError } = require("../lib/apiError");
const express = require("express");
const { escapeLike } = require("../lib/usernamePolicy");
const state = require("../runtime/sharedState");
const supabase = require("../db/supabase");
const { withTimeout } = require("../lib/adminOverview");
const { applySettingsChange } = require("../lib/systemSettingsChange");
const history = require("../lib/settingsHistory");
const sec = require("../lib/securitySettings");
const flags = require("../lib/systemFlags");
const model = require("../lib/systemControlModel");
const health = require("../lib/systemHealth");
const boot = require("../lib/systemBoot");
const restart = require("../lib/systemRestart");
const edgeRuntime = require("../runtime/edgeRuntime");

const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FRESH_STEP_UP_MS = 2 * 60 * 1000;

// Sampling and the boot row start with the server (this module loads at boot).
if (process.env.NODE_ENV !== "test") {
  health.start({ getIo: () => require("../lib/auditRuntime").getIo?.() || null, getEdge: () => edgeRuntime.edgeStats(), supabase });
  boot.register(supabase).catch(() => {});
}

function getIo(req) {
  const io = req.app?.get?.("io") || null;
  if (io) health.start({ getIo: () => io });
  return io;
}

function fail(res, err, fallback) {
  const status = err?.status || 500;
  if (status >= 500) console.error("[system]", err?.message || err);
  return res.status(status).json({ error: status >= 500 ? fallback : err.message, code: err?.code || null });
}

function bad(res, code, extra = {}) {
  return res.status(400).json({ error: code, code, ...extra });
}

function flagKey(req) {
  const key = String(req.params.key || "");
  return flags.FLAG_KEYS.includes(key) ? key : null;
}

/* ---------------- cached lookups ---------------- */

let usersCount = { at: 0, value: null };
async function totalUsers() {
  if (Date.now() - usersCount.at < 5 * 60 * 1000) return usersCount.value;
  const res = await withTimeout(supabase.from("users").select("id", { count: "exact", head: true }), 5000, { count: null, error: { message: "timeout" } });
  usersCount = { at: Date.now(), value: res?.error ? usersCount.value : Number(res?.count) || null };
  return usersCount.value;
}

async function usernames(ids) {
  const list = [...new Set((ids || []).filter((x) => UUID_RE.test(String(x))))];
  if (!list.length) return {};
  const res = await withTimeout(supabase.from("users").select("id, username").in("id", list), 4000, { data: [] });
  const out = {};
  for (const r of res?.data || []) out[String(r.id).toLowerCase()] = r.username;
  return out;
}

async function auditEntries(actions, limit = 20) {
  const store = require("../lib/adminAuditStore");
  let rows = [];
  for (const action of actions) {
    const got = await store.list({ action, limit });
    if (Array.isArray(got)) rows.push(...got);
  }
  if (!rows.length) rows = state.auditLog.filter((e) => actions.includes(e.action)).slice(0, limit);
  const seen = new Set();
  return rows
    .filter((e) => (seen.has(e.id) ? false : seen.add(e.id)))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, limit);
}

async function nextMaintenance() {
  try {
    const { service } = require("../runtime/maintenanceInstance");
    const m = require("../lib/maintenance");
    const rows = await service.ensure();
    const cur = m.currentWindow(rows, Date.now());
    const v = m.adminView(cur, Date.now());
    return v ? { id: v.id, title: v.title, status: v.status, startsAt: v.startsAt, endsAt: v.endsAt } : null;
  } catch {
    return null;
  }
}

function connectedUsers(io) {
  const ids = new Set();
  try {
    for (const s of io.of("/").sockets.values()) if (s.user?.id) ids.add(s.user.id);
  } catch {
    /* no io */
  }
  return ids.size;
}

/* ---------------- views ---------------- */

async function flagsView() {
  const cfg = state.systemConfig;
  const last = await lastChangesSafe();
  return flags.FLAG_CATALOG.map((def) => {
    const rule = flags.ruleFromConfig(def.key, cfg);
    return {
      key: def.key,
      icon: def.icon,
      kind: def.kind,
      allowed: def.allowed,
      rule,
      on: rule.mode !== "off",
      lastChange: last[def.key] || null,
      guard: flags.guardStatus(def.key),
    };
  });
}

async function lastChangesSafe() {
  try {
    return await flags.lastChanges();
  } catch {
    return {};
  }
}

function edgeView() {
  const rule = flags.ruleFromConfig("edgeRealtime", state.systemConfig);
  const stats = edgeRuntime.edgeStats() || {};
  const snap = health.snapshot();
  const total = snap.current.sockets + (Number(stats.clients) || 0);
  return {
    rule,
    stage: flags.edgeStage(rule),
    stages: flags.EDGE_STAGES,
    bridge: { configured: Boolean(stats.enabled), open: Boolean(stats.open), clients: Number(stats.clients) || 0 },
    share: total > 0 ? Math.round(((Number(stats.clients) || 0) / total) * 1000) / 10 : 0,
  };
}

async function limitsViewWithLast() {
  const values = model.limitsView(state.systemConfig);
  const last = {};
  try {
    const page = await history.list({ limit: 200 });
    for (const e of page.entries) {
      for (const k of Object.keys(model.LIMIT_DEFAULTS)) {
        if (last[k]) continue;
        if ((e.changes || []).some((c) => c.key === k)) last[k] = { at: e.at, by: e.actorUsername || null };
      }
    }
  } catch {
    /* history optional */
  }
  return { values, defaults: model.LIMIT_DEFAULTS, ranges: model.LIMIT_RANGES, last };
}

/**
 * "Çalışma süresi" tile: since the last real outage (deploys hand over), with the 30-day
 * availability; the header chip shows this process. Kept from the last overview so the
 * 5-second health poll does not query the boots table.
 */
let uptimeCache = { upSince: null, availability: null };
function uptimeExtra(boots) {
  if (boots) uptimeCache = { upSince: boots.upSince || null, availability: boots.availability ?? null };
  const own = boot.info().uptimeSec;
  const since = uptimeCache.upSince ? Math.round((Date.now() - Date.parse(uptimeCache.upSince)) / 1000) : 0;
  return { uptimeSec: Math.max(own, Number.isFinite(since) ? since : 0), availability: uptimeCache.availability };
}

/* ---------------- read ---------------- */

router.get("/system/overview", async (req, res) => {
  try {
    getIo(req);
    const [flagList, users, maintenance, limits, boots, broadcasts, backups] = await Promise.all([
      flagsView(),
      totalUsers(),
      nextMaintenance(),
      limitsViewWithLast(),
      boot.recent(1),
      auditEntries(["system_broadcast", "broadcast"], 12),
      auditEntries(["system_backup"], 1),
    ]);
    const staffIds = flagList.flatMap((f) => f.rule.staff || []);
    const names = await usernames(staffIds);
    const info = boot.info();
    res.set("Cache-Control", "no-store");
    res.json({
      serverTime: new Date().toISOString(),
      info,
      health: health.snapshot(uptimeExtra(boots)),
      flags: flagList,
      names,
      totalUsers: users,
      edge: edgeView(),
      switches: model.switchesView(state.systemConfig),
      groups: model.SWITCH_GROUPS,
      locks: sec.activeLocks(state.systemConfig),
      maintenance,
      limits,
      broadcast: {
        count: broadcasts.length,
        last: broadcasts[0] ? { at: broadcasts[0].at, by: broadcasts[0].actorUsername, reach: broadcasts[0].meta?.reach ?? null, text: broadcasts[0].meta?.text || null } : null,
      },
      backup: { last: backups[0] ? { at: backups[0].at, by: backups[0].actorUsername, bytes: backups[0].meta?.bytes ?? null } : null },
      historyPersistent: history.persistent(),
    });
  } catch (err) {
    fail(res, err, "Could not load the system overview.");
  }
});

router.get("/system/health", async (req, res) => {
  getIo(req);
  const info = boot.info();
  res.set("Cache-Control", "no-store");
  res.json({ ...health.snapshot(uptimeExtra(null)), bootId: info.bootId, restart: restart.status() });
});

router.get("/system/edge/history", async (req, res) => {
  try {
    getIo(req);
    const days = await health.dailyHistory(14);
    const changes = await flags.flagHistory("edgeRealtime", { limit: 40 });
    const from = Date.parse(`${days.days[0].day}T00:00:00+03:00`);
    const markers = changes
      .filter((c) => Date.parse(c.at) >= from && c.state)
      .map((c) => ({ at: c.at, stage: flags.edgeStage(c.state), percent: c.state.percent, by: c.by }))
      .filter((m) => m.stage)
      .reverse();
    res.set("Cache-Control", "no-store");
    res.json({ ...days, markers });
  } catch (err) {
    fail(res, err, "Could not load the edge history.");
  }
});

/** "Değişiklik geçmişi" link of the flags card: every flag change, newest first. */
router.get("/system/flags/history", async (_req, res) => {
  try {
    const page = await history.list({ limit: 200 });
    const out = [];
    for (const e of page.entries) {
      const key = flags.FLAG_KEYS.find((k) => (e.changes || []).some((c) => flags.historyKeysOf(k).includes(c.key)));
      if (!key) continue;
      out.push({ id: e.id, key, at: e.at, by: e.actorUsername || null, reason: e.reason || null, source: e.source, state: flags.stateFromEntry(key, e), revertedAt: e.revertedAt || null });
      if (out.length >= 60) break;
    }
    res.set("Cache-Control", "no-store");
    res.json({ entries: out, persistent: page.persistent });
  } catch (err) {
    fail(res, err, "Could not load the flag history.");
  }
});

router.get("/system/flags/:key/history", async (req, res) => {
  const key = flagKey(req);
  if (!key) return res.status(404).json(apiError("Unknown flag.", null, { code: "UNKNOWN_FLAG" }));
  try {
    const entries = await flags.flagHistory(key, { limit: 20 });
    const current = flags.ruleFromConfig(key, state.systemConfig);
    const names = await usernames(entries.flatMap((e) => e.state?.staff || []));
    res.set("Cache-Control", "no-store");
    res.json({ key, current, entries: entries.map((e) => ({ ...e, current: flags.sameRule(e.state, current) })), names, persistent: history.persistent() });
  } catch (err) {
    fail(res, err, "Could not load the flag history.");
  }
});

router.get("/system/staff-search", async (req, res) => {
  const q = String(req.query.q || "").trim().slice(0, 32);
  try {
    let query = supabase.from("users").select("id, username, is_admin").limit(8);
    query = q ? query.ilike("username", `${escapeLike(q)}%`) : query.eq("is_admin", true);
    const r = await withTimeout(query, 4000, { data: [] });
    const people = (r?.data || []).map((u) => ({ id: String(u.id).toLowerCase(), username: u.username, staff: Boolean(u.is_admin) }));
    people.sort((a, b) => Number(b.staff) - Number(a.staff) || String(a.username).localeCompare(String(b.username)));
    res.json({ people });
  } catch (err) {
    fail(res, err, "Could not search people.");
  }
});

/* ---------------- flags ---------------- */

/** Store a flag rule through the shared settings change (history + audit + admin room). */
async function applyFlagRule({ key, rule, actor, reason, io, source = "system", action = "system_flag", meta = {}, revertOf = null }) {
  const patch = flags.patchForRule(key, rule, state.systemConfig);
  const result = await applySettingsChange({
    patch,
    actor,
    reason,
    source,
    action,
    title: `flag.${key}`,
    meta: { flag: key, flagState: flags.ruleFromConfig(key, { ...state.systemConfig, ...patch, featureFlags: { ...state.systemConfig.featureFlags, ...(patch.featureFlags || {}) } }), ...meta },
    revertOf,
    io,
  });
  flags.emitFeaturesToAll(io);
  edgeRuntime.broadcastAdvice();
  return result;
}

function guardFor({ key, previous, actor, io }) {
  return flags.armGuard({
    key,
    previous,
    actor,
    io,
    apply: async ({ rule, reason, source }) => {
      const out = await applyFlagRule({ key, rule, actor: { id: null, username: "system" }, reason, io, source, action: "system_flag_auto_rollback", meta: { triggeredBy: actor?.username || null } });
      require("../socket/adminHandlers").notifyAdminRoom?.(io, { type: "system_flag_rollback", key, reason });
      return out;
    },
  });
}

router.patch("/system/flags/:key", async (req, res) => {
  const key = flagKey(req);
  if (!key) return res.status(404).json(apiError("Unknown flag.", null, { code: "UNKNOWN_FLAG" }));
  const v = flags.validateRule(key, req.body?.rule);
  if (v.error) return bad(res, v.error);
  const reason = model.cleanReason(req.body?.reason) || null;
  try {
    const io = getIo(req);
    const previous = flags.ruleFromConfig(key, state.systemConfig);
    const result = await applyFlagRule({ key, rule: v.rule, actor: req.user, reason, io, meta: { autoRollback: Boolean(req.body?.autoRollback) } });
    let guard = null;
    if (req.body?.autoRollback && result.changes.length && v.rule.mode !== "off") guard = guardFor({ key, previous, actor: req.user, io });
    else flags.clearGuard(key);
    res.json({ ok: true, changed: result.changes.length > 0, entry: result.entry, flag: (await flagsView()).find((f) => f.key === key), guard });
  } catch (err) {
    fail(res, err, "Could not save the flag.");
  }
});

router.post("/system/flags/:key/toggle", async (req, res) => {
  const key = flagKey(req);
  if (!key) return res.status(404).json(apiError("Unknown flag.", null, { code: "UNKNOWN_FLAG" }));
  if (typeof req.body?.on !== "boolean") return bad(res, "BAD_VALUE");
  try {
    const io = getIo(req);
    const rule = flags.toggledRule(key, state.systemConfig, req.body.on);
    const result = await applyFlagRule({ key, rule, actor: req.user, reason: model.cleanReason(req.body?.reason) || null, io, meta: { toggle: req.body.on } });
    if (!req.body.on) flags.clearGuard(key);
    res.json({ ok: true, changed: result.changes.length > 0, entry: result.entry, flag: (await flagsView()).find((f) => f.key === key) });
  } catch (err) {
    fail(res, err, "Could not switch the flag.");
  }
});

router.post("/system/flags/:key/restore", async (req, res) => {
  const key = flagKey(req);
  if (!key) return res.status(404).json(apiError("Unknown flag.", null, { code: "UNKNOWN_FLAG" }));
  try {
    const entry = await history.get(req.body?.historyId);
    if (!entry) return res.status(404).json(apiError("Change not found.", null, { code: "NOT_FOUND" }));
    const target = flags.stateFromEntry(key, entry);
    if (!target) return res.status(409).json(apiError("This change has no state for the flag.", null, { code: "NOT_RESTORABLE" }));
    const cur = flags.ruleFromConfig(key, state.systemConfig);
    // A partial edge entry (no meta) only moves what it recorded.
    const rule = target.partial ? { ...cur, mode: target.mode, percent: target.percent, platforms: target.platforms.length ? target.platforms : cur.platforms } : target;
    const v = flags.validateRule(key, rule);
    if (v.error) return bad(res, v.error);
    const io = getIo(req);
    const result = await applyFlagRule({
      key,
      rule: v.rule,
      actor: req.user,
      reason: model.cleanReason(req.body?.reason) || null,
      io,
      source: "revert",
      action: "system_flag_restore",
      meta: { restoreOf: entry.id, restoreAt: entry.at },
    });
    flags.clearGuard(key);
    res.json({ ok: true, changed: result.changes.length > 0, entry: result.entry, flag: (await flagsView()).find((f) => f.key === key) });
  } catch (err) {
    fail(res, err, "Could not restore the flag.");
  }
});

router.post("/system/flags/:key/try", async (req, res) => {
  const key = flagKey(req);
  if (!key) return res.status(404).json(apiError("Unknown flag.", null, { code: "UNKNOWN_FLAG" }));
  const def = flags.catalogOf(key);
  if (def.kind !== "client") return bad(res, "TRY_CLIENT_ONLY");
  const v = flags.validateRule(key, req.body?.rule);
  if (v.error) return bad(res, v.error);
  const reached = flags.trialForUser(getIo(req), req.user.id, key, v.rule);
  state.appendAudit(req.user.id, req.user.username, "system_flag_try", key, { rule: v.rule, reached });
  res.json({ ok: true, reached });
});

router.post("/system/edge/stage", async (req, res) => {
  const stage = String(req.body?.stage || "");
  if (!flags.EDGE_STAGES.includes(stage)) return bad(res, "BAD_STAGE");
  try {
    const io = getIo(req);
    const cur = flags.ruleFromConfig("edgeRealtime", state.systemConfig);
    const rule = flags.ruleForStage(stage, cur);
    const v = flags.validateRule("edgeRealtime", rule);
    if (v.error) return bad(res, v.error);
    const result = await applyFlagRule({ key: "edgeRealtime", rule: v.rule, actor: req.user, reason: model.cleanReason(req.body?.reason) || null, io, meta: { stage } });
    res.json({ ok: true, changed: result.changes.length > 0, entry: result.entry, edge: edgeView() });
  } catch (err) {
    fail(res, err, "Could not change the stage.");
  }
});

/* ---------------- switches, limits, undo ---------------- */

router.patch("/system/switches", async (req, res) => {
  const v = model.validateSwitchPatch(req.body, state.systemConfig);
  if (v.error) return bad(res, v.error, { key: v.key || null });
  const reason = model.cleanReason(req.body?.reason);
  if (v.cutting.length && reason.length < 3) return bad(res, "REASON_REQUIRED", { keys: v.cutting });
  try {
    const io = getIo(req);
    const result = await applySettingsChange({ patch: v.patch, actor: req.user, reason: reason || null, source: "system", action: "system_switch", title: Object.keys(req.body.patch).join(","), meta: { switches: Object.keys(req.body.patch) }, io });
    if (v.patch.featureFlags) flags.emitFeaturesToAll(io);
    if ("chatFrozen" in v.patch) require("../socket/adminHandlers").notifyAdminRoom?.(io, { type: "chat_freeze", frozen: state.systemConfig.chatFrozen });
    res.json({ ok: true, changed: result.changes.length > 0, entry: result.entry, switches: model.switchesView(state.systemConfig) });
  } catch (err) {
    fail(res, err, "Could not change the switch.");
  }
});

router.patch("/system/limits", async (req, res) => {
  const v = model.validateLimitsPatch(req.body);
  if (v.error) return bad(res, v.error, { key: v.key || null });
  try {
    const result = await applySettingsChange({ patch: v.patch, actor: req.user, reason: model.cleanReason(req.body?.reason) || null, source: "system", action: "system_limits", title: "limits", io: getIo(req) });
    res.json({ ok: true, changed: result.changes.length > 0, entry: result.entry, limits: await limitsViewWithLast() });
  } catch (err) {
    fail(res, err, "Could not save the limits.");
  }
});

router.post("/system/limits/reset", async (req, res) => {
  try {
    const result = await applySettingsChange({ patch: { ...model.LIMIT_DEFAULTS }, actor: req.user, reason: model.cleanReason(req.body?.reason) || null, source: "system", action: "system_limits_reset", title: "limits", io: getIo(req) });
    res.json({ ok: true, changed: result.changes.length > 0, entry: result.entry, limits: await limitsViewWithLast() });
  } catch (err) {
    fail(res, err, "Could not reset the limits.");
  }
});

router.post("/system/history/:id/undo", async (req, res) => {
  try {
    const entry = await history.get(req.params.id);
    if (!entry) return res.status(404).json(apiError("Change not found.", null, { code: "NOT_FOUND" }));
    if (entry.revertedAt) return res.status(409).json(apiError("Already undone.", null, { code: "ALREADY_REVERTED" }));
    if (entry.changes.some((c) => String(c.key).startsWith("lock."))) return res.status(409).json(apiError("Locks are lifted in Security Center.", null, { code: "NOT_REVERTIBLE" }));
    const stale = sec.staleKeys(entry.changes, state.systemConfig);
    if (stale.length && !req.body?.force) return res.status(409).json(apiError("Changed again since.", null, { code: "STALE", keys: stale }));
    const patch = sec.revertPatch(entry.changes);
    if (!Object.keys(patch).length) return res.status(409).json(apiError("Nothing to undo.", null, { code: "NOT_REVERTIBLE" }));
    const io = getIo(req);
    const result = await applySettingsChange({ patch, actor: req.user, reason: model.cleanReason(req.body?.reason) || null, source: "revert", action: "system_undo", title: entry.title, meta: { revertOf: entry.id }, revertOf: entry.id, io });
    await history.markReverted(entry.id, req.user);
    if (patch.featureFlags) {
      flags.emitFeaturesToAll(io);
      edgeRuntime.broadcastAdvice();
    }
    res.json({ ok: true, changes: result.changes });
  } catch (err) {
    fail(res, err, "Could not undo the change.");
  }
});

/* ---------------- broadcast, backup ---------------- */

router.post("/system/broadcast", (req, res) => {
  const text = String(req.body?.text || "").replace(/\s+/g, " ").trim();
  if (!text) return bad(res, "TEXT_REQUIRED");
  if (text.length > 500) return bad(res, "TEXT_TOO_LONG");
  const io = getIo(req);
  const reach = io ? connectedUsers(io) : 0;
  const at = new Date().toISOString();
  try {
    io?.emit("server:announcement", { text, at, from: "admin" });
  } catch {
    /* no sockets */
  }
  state.appendAudit(req.user.id, req.user.username, "system_broadcast", "all", { text, reach, len: text.length });
  res.json({ ok: true, at, reach });
});

router.get("/system/broadcasts", async (_req, res) => {
  try {
    const rows = await auditEntries(["system_broadcast", "broadcast"], 30);
    res.set("Cache-Control", "no-store");
    res.json({ entries: rows.map((e) => ({ id: e.id, at: e.at, by: e.actorUsername || null, text: e.meta?.text || null, reach: e.meta?.reach ?? null, len: e.meta?.len ?? null })) });
  } catch (err) {
    fail(res, err, "Could not load broadcasts.");
  }
});

router.post("/system/backup", (req, res) => {
  const now = Date.now();
  const body = JSON.stringify(model.buildBackup({ state, info: boot.info(), now }), null, 2);
  const bytes = Buffer.byteLength(body);
  const name = model.backupFileName(now);
  state.appendAudit(req.user.id, req.user.username, "system_backup", name, { bytes, reason: model.cleanReason(req.body?.reason) || null });
  res.set("Cache-Control", "no-store");
  res.set("Content-Type", "application/json; charset=utf-8");
  res.set("Content-Disposition", `attachment; filename="${name}"`);
  res.set("X-Backup-Bytes", String(bytes));
  res.set("Access-Control-Expose-Headers", "Content-Disposition, X-Backup-Bytes");
  res.send(body);
});

/* ---------------- safe restart ---------------- */

/** The restart needs a code entered in the last two minutes, not just this session's token. */
function freshStepUp(req) {
  if (req.apiToken) return true; // Admin Token: acts directly (owner decision)
  if (!req.adminTotpKnown) return true; // 2FA migration not applied: nothing to check
  const raw = req.get("x-admin-step-up");
  try {
    const t = raw ? require("../config/jwt").verifyToken(String(raw)) : null;
    const own = t && t.stepUp && t.sub === req.user.id && (t.sid || null) === (req.user.sid || null);
    return Boolean(own) && Date.now() - Number(t.iat || 0) * 1000 <= FRESH_STEP_UP_MS;
  } catch {
    return false;
  }
}

router.get("/system/restart", async (req, res) => {
  try {
    const io = getIo(req);
    const [boots, maintenance] = await Promise.all([boot.recent(3), nextMaintenance()]);
    const snap = health.snapshot();
    res.set("Cache-Control", "no-store");
    res.json({
      info: boot.info(),
      sockets: snap.current.sockets,
      users: io ? connectedUsers(io) : 0,
      edgeSockets: snap.current.edgeSockets,
      countdownSec: restart.COUNTDOWN_SEC,
      confirmWords: restart.CONFIRM_WORDS,
      estimate: { minSec: 40, maxSec: 60 },
      restarts: boots.restarts,
      persistent: boots.persistent,
      maintenance,
      run: restart.status(),
    });
  } catch (err) {
    fail(res, err, "Could not load the restart details.");
  }
});

router.post("/system/restart", async (req, res) => {
  const reason = restart.cleanText(req.body?.reason);
  if (reason.length < restart.REASON_MIN) return bad(res, "REASON_REQUIRED");
  if (!restart.confirmMatches(req.body?.confirm)) return bad(res, "CONFIRM_MISMATCH");
  if (!freshStepUp(req)) return res.status(403).json(apiError("Enter a new verification code to restart.", null, { code: "STEP_UP_REQUIRED" }));
  try {
    const io = getIo(req);
    const actor = { id: req.user.id, username: req.user.username };
    const skipCountdown = req.body?.skipCountdown === true;
    const notifyTeam = req.body?.notifyTeam !== false;
    if (notifyTeam && io) notifyTeamOfRestart(io, actor, reason, skipCountdown).catch(() => {});
    const run = restart.start({
      io,
      actor,
      reason,
      skipCountdown,
      backupBytes: req.body?.backupBytes,
      isEdgeSocket: edgeRuntime.isEdgeSocket,
      onBeforeExit: async ({ run: r }) => {
        state.appendAudit(actor.id, actor.username, "system_restart_exit", "process", { runId: r.id, sockets: r.socketsAtStart });
        await boot.markExit({ actor, reason, meta: { runId: r.id, sockets: r.socketsAtStart, edge: r.edgeSockets, backupBytes: r.backupBytes, skipCountdown } });
        // Give the audit row a moment to reach the database.
        await new Promise((resolve) => setTimeout(resolve, 600));
      },
    });
    state.appendAudit(actor.id, actor.username, "system_restart", "process", { reason, runId: run.id, sockets: run.socketsAtStart, edge: run.edgeSockets, skipCountdown, notifyTeam, backupBytes: run.backupBytes });
    res.json({ ok: true, run, bootId: boot.info().bootId });
  } catch (err) {
    fail(res, err, "Could not start the restart.");
  }
});

const TEAM_TEXT = require("../i18n/systemRestart").teamNotice;

async function notifyTeamOfRestart(io, actor, reason) {
  const res = await withTimeout(supabase.from("users").select("id, language").eq("is_admin", true).limit(200), 4000, { data: [] });
  const admins = res?.data || [];
  const popup = require("../lib/adminBroadcastPopup");
  for (const a of admins) {
    if (a.id === actor.id) continue;
    const [title, body] = TEAM_TEXT[a.language === "tr" ? "tr" : "en"];
    const built = popup.buildPopupPayload({ title, body: body.replace("{who}", `@${actor.username}`).replace("{reason}", reason).slice(0, 280), severity: "warning" }, { actor });
    if (!built.ok) continue;
    const payload = { ...built.popup, icon: "server", track: false };
    delete payload.emoji;
    for (const s of io.of("/").sockets.values()) {
      if (s.user?.id !== a.id) continue;
      try {
        s.emit("admin:popup", payload);
      } catch {
        /* gone */
      }
    }
  }
}

module.exports = router;
