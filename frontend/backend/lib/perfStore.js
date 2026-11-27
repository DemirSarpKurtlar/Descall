"use strict";

/**
 * Performans data access (tables from supabase/migrations/20261124v_perf.sql).
 * A missing table answers PERF_UNAVAILABLE (the panel shows "not set up"); the beacon
 * keeps a small in-memory queue and writes it in batches, so a burst of page loads is a
 * handful of inserts, never one insert per metric.
 */

const model = require("./perfModel");

let dbOverride = null;
const db = () => dbOverride || require("../db/supabase");

const PAGE = 1000;
const FLUSH_MS = 2000;
const FLUSH_AT = 300;
const QUEUE_MAX = 5000;

let queue = [];
let flushTimer = null;
let flushing = null;
let missingUntil = 0;

function isMissing(err) {
  const msg = String(err?.message || err?.details || "");
  return err?.code === "42P01" || err?.code === "PGRST205" || err?.code === "PGRST202" || /relation .* does not exist|could not find the (table|function)/i.test(msg);
}

class PerfUnavailable extends Error {
  constructor() {
    super("Performance tables are not set up yet.");
    this.code = "PERF_UNAVAILABLE";
    this.status = 503;
  }
}

function check(res) {
  if (res?.error) {
    if (isMissing(res.error)) {
      missingUntil = Date.now() + 60e3;
      throw new PerfUnavailable();
    }
    const e = new Error(res.error.message || "Database error");
    e.code = res.error.code || "DB_ERROR";
    throw e;
  }
  return res?.data;
}

/* ---------------- raw events (beacon) ---------------- */

/** Queue validated events; resolves immediately (the beacon never waits for the DB). */
function enqueue(events) {
  if (Date.now() < missingUntil) return false;
  for (const e of events) {
    if (queue.length >= QUEUE_MAX) break;
    queue.push(e);
  }
  if (queue.length >= FLUSH_AT) flush().catch(() => {});
  else if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush().catch(() => {});
    }, FLUSH_MS);
    flushTimer.unref?.();
  }
  return true;
}

function flush() {
  if (flushing) return flushing.then(() => (queue.length ? flush() : false));
  if (!queue.length) return Promise.resolve(false);
  const rows = queue.splice(0, 1000);
  flushing = (async () => {
    try {
      check(await db().from("perf_events").insert(rows));
      return true;
    } catch (err) {
      if (err?.code !== "PERF_UNAVAILABLE") console.warn("[perf] insert failed:", err?.message || err);
      return false;
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

/* ---------------- rollups ---------------- */

const DIM_COLS = "metric, route, platform, app_version, device_class, connection, country";
const AGG_COLS = "n, good, ni, poor, total, hist";

function applyFilters(q, query, { skip = null } = {}) {
  for (const k of model.FILTER_KEYS) {
    if (k === skip) continue;
    const want = query?.[k];
    if (want && want.length) q = q.in(model.FILTER_COL[k], want);
  }
  return q;
}

/** Every page of a query builder factory (fn(from, to) -> builder). */
async function allPages(make, max = 60) {
  const out = [];
  for (let i = 0; i < max; i++) {
    const rows = check(await make(i * PAGE, i * PAGE + PAGE - 1)) || [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/**
 * Rollup rows in a time range.
 * @param {{grain: "daily"|"hourly", from: string, to?: string, metrics?: string[], query?: object, skip?: string}} p
 */
async function loadRollups({ grain = "daily", from, to = null, metrics = null, query = null, skip = null }) {
  const table = grain === "hourly" ? "perf_rollup_hourly" : "perf_rollup_daily";
  const col = grain === "hourly" ? "bucket" : "day";
  return allPages((a, b) => {
    let q = db().from(table).select(`${col}, ${DIM_COLS}, ${AGG_COLS}`).gte(col, from);
    if (to) q = q.lt(col, to);
    if (metrics && metrics.length) q = q.in("metric", metrics);
    q = applyFilters(q, query, { skip });
    return q.order(col, { ascending: true }).range(a, b);
  });
}

/** One hour of raw samples grouped for the rollup (SQL function, JS fallback). */
async function hourBuckets(fromIso, toIso) {
  const res = await db().rpc("perf_hour_buckets", { p_from: fromIso, p_to: toIso });
  if (!res?.error) return { grouped: true, rows: res.data || [] };
  if (res.error && /perf_events/.test(String(res.error.message || "")) && isMissing(res.error)) throw new PerfUnavailable();
  const rows = await allPages((a, b) =>
    db().from("perf_events").select(`${DIM_COLS}, value, rating`).gte("at", fromIso).lt("at", toIso).order("id", { ascending: true }).range(a, b)
  );
  return { grouped: false, rows };
}

async function upsertRollups(grain, rows) {
  if (!rows.length) return 0;
  const table = grain === "hourly" ? "perf_rollup_hourly" : "perf_rollup_daily";
  const conflict = `${grain === "hourly" ? "bucket" : "day"},metric,route,platform,app_version,device_class,connection,country`;
  const now = new Date().toISOString();
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => ({ ...r, updated_at: now }));
    check(await db().from(table).upsert(chunk, { onConflict: conflict }));
  }
  return rows.length;
}

/** Rows of one bucket the last upsert did not touch (dimension sets that vanished). */
async function deleteStale(grain, key, beforeIso) {
  const table = grain === "hourly" ? "perf_rollup_hourly" : "perf_rollup_daily";
  const col = grain === "hourly" ? "bucket" : "day";
  check(await db().from(table).delete().eq(col, key).lt("updated_at", beforeIso));
}

async function purge({ now = Date.now() } = {}) {
  const raw = new Date(now - model.RAW_RETENTION_DAYS * 86400e3).toISOString();
  const hourly = new Date(now - 35 * 86400e3).toISOString();
  const daily = new Date(now - 400 * 86400e3).toISOString().slice(0, 10);
  check(await db().from("perf_events").delete().lt("at", raw));
  check(await db().from("perf_rollup_hourly").delete().lt("bucket", hourly));
  check(await db().from("perf_rollup_daily").delete().lt("day", daily));
}

/* ---------------- raw reads for the panel ---------------- */

const EVENT_COLS = "at, session_id, user_id, metric, value, rating, route, platform, app_version, device_class, connection, country, browser, attribution";

async function rawEvents({ from, route = null, metrics = null, query = null, userId = null, limit = 4000 }) {
  let q = db().from("perf_events").select(EVENT_COLS).gte("at", from);
  if (route) q = q.eq("route", route);
  if (metrics && metrics.length) q = q.in("metric", metrics);
  if (userId) q = q.eq("user_id", userId);
  q = applyFilters(q, query, { skip: route ? "route" : null });
  return check(await q.order("value", { ascending: false }).limit(limit)) || [];
}

async function sessionEvents(sessionId) {
  return check(await db().from("perf_events").select(EVENT_COLS).eq("session_id", sessionId).order("at", { ascending: true }).limit(200)) || [];
}

async function userSessions(userId, from) {
  return check(await db().from("perf_events").select("session_id, at, platform, app_version, route").eq("user_id", userId).eq("metric", "sess").gte("at", from).order("at", { ascending: false }).limit(50)) || [];
}

/** Sampled page loads in the last 5 minutes ("Canlı · 1.284 oturum / 5 dk"). */
async function liveSessions({ now = Date.now() } = {}) {
  const res = await db().from("perf_events").select("id", { count: "exact", head: true }).eq("metric", "sess").gte("at", new Date(now - 5 * 60e3).toISOString());
  check(res);
  return Number(res.count) || 0;
}

async function lastEventAt() {
  const rows = check(await db().from("perf_events").select("at, sample_rate").order("at", { ascending: false }).limit(1)) || [];
  return rows[0] || null;
}

/* ---------------- views, rules, alerts ---------------- */

async function listViews() {
  return check(await db().from("perf_views").select("*").order("created_at", { ascending: true }).limit(100)) || [];
}

async function saveView(row) {
  const data = check(await db().from("perf_views").insert(row).select("*").single());
  return data;
}

async function deleteView(id) {
  check(await db().from("perf_views").delete().eq("id", id));
}

async function listRules() {
  return check(await db().from("perf_alert_rules").select("*").order("created_at", { ascending: true }).limit(50)) || [];
}

async function saveRule(id, row) {
  if (id && id !== "default") {
    return check(await db().from("perf_alert_rules").update({ ...row, updated_at: new Date().toISOString() }).eq("id", id).select("*").single());
  }
  return check(await db().from("perf_alert_rules").insert(row).select("*").single());
}

async function deleteRule(id) {
  check(await db().from("perf_alert_rules").delete().eq("id", id));
}

async function listAlerts({ status = null, since = null, limit = 50 } = {}) {
  let q = db().from("perf_alerts").select("*");
  if (status) q = q.eq("status", status);
  if (since) q = q.gte("created_at", since);
  return check(await q.order("created_at", { ascending: false }).limit(limit)) || [];
}

async function alertByKey(key) {
  const rows = check(await db().from("perf_alerts").select("*").eq("alert_key", key).limit(1)) || [];
  return rows[0] || null;
}

async function insertAlert(row) {
  return check(await db().from("perf_alerts").insert(row).select("*").single());
}

async function updateAlert(id, patch) {
  return check(await db().from("perf_alerts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select("*").single());
}

/* ---------------- Lighthouse ---------------- */

async function lighthouseRuns({ since, limit = 3000 }) {
  return check(await db().from("lighthouse_runs").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(limit)) || [];
}

function __setDbForTests(client) {
  dbOverride = client;
  queue = [];
  missingUntil = 0;
}

function __queue() {
  return queue;
}

module.exports = {
  PerfUnavailable,
  isMissing,
  enqueue,
  flush,
  loadRollups,
  hourBuckets,
  upsertRollups,
  deleteStale,
  purge,
  rawEvents,
  sessionEvents,
  userSessions,
  liveSessions,
  lastEventAt,
  listViews,
  saveView,
  deleteView,
  listRules,
  saveRule,
  deleteRule,
  listAlerts,
  alertByKey,
  insertAlert,
  updateAlert,
  lighthouseRuns,
  __setDbForTests,
  __queue,
};
