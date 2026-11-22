"use strict";

/**
 * Process starts and restarts for the Sistem page (Draft A): "Son yeniden başlatmalar",
 * the availability figure on the uptime tile, and the version chips in the header.
 * Table public.system_boots (supabase/migrations/20261115_system_control_center.sql).
 * Each start inserts a row and moves last_beat_at every 15 s; the next start reads the
 * previous row: downtime = start - (exit_at || last_beat_at), cause = admin (the safe
 * restart wrote exit_*), deploy (new commit) or auto. Without the table everything
 * still works for this process; the history is empty and `persistent` is false.
 */

const crypto = require("crypto");

const TABLE = "system_boots";
const BEAT_MS = 15_000;
const PAUSE_MS = 10 * 60 * 1000;

const BOOT_ID = crypto.randomUUID();
const STARTED_AT = new Date().toISOString();

let db = null;
let beat = null;
let pausedUntil = 0;
let registered = false;
let current = null; // this process's row

function shortCommit(env = process.env) {
  const raw = String(env.RENDER_GIT_COMMIT || env.GIT_COMMIT || env.SOURCE_VERSION || "").trim();
  return /^[0-9a-f]{7,40}$/i.test(raw) ? raw.slice(0, 7).toLowerCase() : null;
}

function appVersion() {
  try {
    // frontend/package.json: the version the whole app ships as (Render builds from frontend/).
    return String(require("../../package.json").version || "") || null;
  } catch {
    return null;
  }
}

function serviceName(env = process.env) {
  const s = String(env.RENDER_SERVICE_NAME || "").trim();
  return s ? s.slice(0, 64) : null;
}

function persistent() {
  return Boolean(db) && Date.now() >= pausedUntil;
}

function pause(err) {
  pausedUntil = Date.now() + PAUSE_MS;
  if (err) console.warn("[system-boots]", err?.message || err, "(apply supabase/migrations/20261115_system_control_center.sql)");
}

/** Why the process with `row` started, given the row before it. Pure, tested. */
function causeOf(prev, row) {
  if (!prev) return "first";
  if (prev.exit_at) return "admin";
  if (prev.commit && row.commit && prev.commit !== row.commit) return "deploy";
  return "auto";
}

/** Seconds between the previous process going away and this one starting. Pure, tested. */
function downtimeOf(prev, startedAt) {
  if (!prev) return null;
  const gone = Date.parse(prev.exit_at || prev.last_beat_at || prev.started_at);
  const up = Date.parse(startedAt);
  if (!Number.isFinite(gone) || !Number.isFinite(up)) return null;
  return Math.max(0, Math.round((up - gone) / 1000));
}

/** Availability over `days` from the stored downtimes (0-100, two decimals). Pure, tested. */
function availabilityOf(rows, days = 30, now = Date.now()) {
  const from = now - days * 86400000;
  let down = 0;
  for (const r of rows || []) {
    const at = Date.parse(r.started_at);
    if (!Number.isFinite(at) || at < from) continue;
    down += Number(r.downtime_sec) || 0;
  }
  const pct = 100 - (down / (days * 86400)) * 100;
  return Math.max(0, Math.min(100, Math.round(pct * 100) / 100));
}

/**
 * Start of the current unbroken service: the newest start that followed a real outage
 * (an admin restart or a crash; a deploy hands over with almost no gap), else the oldest
 * known start. Rows newest first. Pure, tested.
 */
function upSinceOf(rows) {
  const list = rows || [];
  if (!list.length) return null;
  const hit = list.find((r) => r.cause === "admin" || (r.cause === "auto" && Number(r.downtime_sec) > 30));
  return (hit || list[list.length - 1]).started_at || null;
}

async function register(client) {
  if (registered) return current;
  registered = true;
  // Hybrid server: the boot history is Render's; a secondary node keeps its own in memory.
  db = require("./cluster").role === "secondary" ? null : client || null;
  current = {
    id: BOOT_ID,
    started_at: STARTED_AT,
    last_beat_at: STARTED_AT,
    commit: shortCommit(),
    version: appVersion(),
    prev_boot_id: null,
    downtime_sec: null,
    cause: "first",
  };
  if (!db) return current;
  try {
    const { data: prev, error } = await db.from(TABLE).select("*").order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (error) {
      pause(error);
      return current;
    }
    current.prev_boot_id = prev?.id || null;
    current.cause = causeOf(prev, current);
    current.downtime_sec = downtimeOf(prev, STARTED_AT);
    const ins = await db.from(TABLE).insert(current);
    if (ins?.error) {
      pause(ins.error);
      return current;
    }
  } catch (err) {
    pause(err);
    return current;
  }
  beat = setInterval(() => {
    if (!persistent()) return;
    const at = new Date().toISOString();
    current.last_beat_at = at;
    Promise.resolve(db.from(TABLE).update({ last_beat_at: at }).eq("id", BOOT_ID)).catch(() => {});
  }, BEAT_MS);
  beat.unref?.();
  return current;
}

/** The safe restart writes who and why on this process's row just before it exits. */
async function markExit({ actor, reason, meta = {} } = {}) {
  const at = new Date().toISOString();
  if (current) {
    current.exit_at = at;
    current.exit_by_username = actor?.username || null;
    current.exit_reason = reason || null;
  }
  if (!persistent()) return;
  try {
    await db
      .from(TABLE)
      .update({
        exit_at: at,
        last_beat_at: at,
        exit_by_id: /^[0-9a-f-]{36}$/i.test(String(actor?.id || "")) ? actor.id : null,
        exit_by_username: actor?.username || null,
        exit_reason: reason || null,
        exit_meta: meta || {},
      })
      .eq("id", BOOT_ID);
  } catch {
    /* best effort */
  }
}

/**
 * Recent restarts, newest first: each start after the first, with who asked and why
 * (from the row before it) and the downtime.
 */
async function recent(limit = 6) {
  if (!persistent()) return { restarts: [], availability: null, upSince: null, persistent: false };
  try {
    const { data, error } = await db.from(TABLE).select("*").order("started_at", { ascending: false }).limit(200);
    if (error) {
      pause(error);
      return { restarts: [], availability: null, persistent: false };
    }
    const rows = data || [];
    const restarts = [];
    for (let i = 0; i < rows.length && restarts.length < limit; i += 1) {
      const row = rows[i];
      if (row.cause === "first") continue;
      const prev = rows[i + 1] || null;
      restarts.push({
        id: row.id,
        at: row.started_at,
        cause: row.cause,
        by: prev?.exit_by_username || null,
        reason: prev?.exit_reason || null,
        downtimeSec: row.downtime_sec == null ? null : Number(row.downtime_sec),
        version: row.version || null,
        commit: row.commit || null,
      });
    }
    return { restarts, availability: availabilityOf(rows, 30), upSince: upSinceOf(rows), persistent: true };
  } catch {
    return { restarts: [], availability: null, persistent: false };
  }
}

function info() {
  return {
    bootId: BOOT_ID,
    startedAt: STARTED_AT,
    uptimeSec: Math.round(process.uptime()),
    commit: shortCommit(),
    version: appVersion(),
    service: serviceName(),
    host: process.env.RENDER ? "render" : null,
  };
}

function __resetForTests() {
  if (beat) clearInterval(beat);
  beat = null;
  db = null;
  pausedUntil = 0;
  registered = false;
  current = null;
}

module.exports = {
  TABLE,
  BOOT_ID,
  register,
  markExit,
  recent,
  info,
  causeOf,
  downtimeOf,
  availabilityOf,
  upSinceOf,
  shortCommit,
  __resetForTests,
};
