"use strict";

/**
 * Sistem page health tiles (Draft A "Kontrol merkezi", Nov 2026): CPU, RAM (RSS), event
 * loop lag, connected sockets (+ edge), database round trip and uptime, each with a short
 * history for the sparkline. One sample every 20 s, the last 45 kept (15 minutes).
 * The daily peak of sockets / edge sockets / RSS goes to public.system_metrics_daily
 * for the 14-day Edge realtime chart (supabase/migrations/20261115_system_control_center.sql);
 * until that table exists the chart shows today only.
 */

const os = require("os");
const { monitorEventLoopDelay } = require("perf_hooks");

const SAMPLE_MS = 20_000;
const KEEP = 45;
const DAILY_WRITE_MS = 5 * 60 * 1000;
const DB_TIMEOUT_MS = 3000;
const TABLE = "system_metrics_daily";

const samples = [];
let timer = null;
let hist = null;
let lastCpu = null;
let lastAt = 0;
let getIo = () => null;
let getEdge = () => ({});
let dbClient = null;
let dailyDisabledUntil = 0;
let lastDailyWrite = 0;
const today = { day: null, peakSockets: 0, peakEdge: 0, peakRssMb: 0, loaded: false };

function cores() {
  try {
    return typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length || 1;
  } catch {
    return 1;
  }
}

/** Memory the process may use: SYSTEM_MEMORY_LIMIT_MB, the cgroup limit, or the machine. */
function memoryLimitMb(env = process.env) {
  const fromEnv = Number(env.SYSTEM_MEMORY_LIMIT_MB);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return Math.round(fromEnv);
  try {
    const c = typeof process.constrainedMemory === "function" ? process.constrainedMemory() : 0;
    if (c && c > 0 && c < 2 ** 50) return Math.round(c / 1048576);
  } catch {
    /* older Node */
  }
  return Math.round(os.totalmem() / 1048576);
}

/** Istanbul calendar day (UTC+3, no DST) of a time. */
function istanbulDay(ms = Date.now()) {
  return new Date(ms + 3 * 3600 * 1000).toISOString().slice(0, 10);
}

function socketCounts() {
  let sockets = 0;
  let edgeSockets = 0;
  const io = getIo();
  try {
    if (io?.engine && Number.isFinite(io.engine.clientsCount)) sockets = io.engine.clientsCount;
    else if (io?.of) sockets = io.of("/").sockets.size;
  } catch {
    sockets = 0;
  }
  try {
    const e = getEdge() || {};
    edgeSockets = Number(e.clients) || 0;
  } catch {
    edgeSockets = 0;
  }
  return { sockets, edgeSockets };
}

async function pingDb() {
  if (!dbClient) return null;
  const started = Date.now();
  try {
    const q = dbClient.from("system_settings").select("id").limit(1);
    const res = await Promise.race([q, new Promise((resolve) => setTimeout(() => resolve({ error: { message: "timeout" } }), DB_TIMEOUT_MS).unref?.())]);
    if (res?.error) return null;
    return Date.now() - started;
  } catch {
    return null;
  }
}

/** Status words the tiles colour by (ok / warn / bad). Pure, tested. */
function levels(s) {
  const out = {};
  out.cpu = s.cpu == null ? "unknown" : s.cpu < 70 ? "ok" : s.cpu < 90 ? "warn" : "bad";
  const memPct = s.rssMb != null && s.memLimitMb ? (s.rssMb / s.memLimitMb) * 100 : null;
  out.memory = memPct == null ? "unknown" : memPct < 75 ? "ok" : memPct < 90 ? "warn" : "bad";
  out.lag = s.lagP99 == null ? "unknown" : s.lagP99 < 50 ? "ok" : s.lagP99 < 200 ? "warn" : "bad";
  out.db = s.dbMs == null ? "bad" : s.dbMs < 150 ? "ok" : s.dbMs < 500 ? "warn" : "bad";
  return out;
}

/** Thresholds of the memory alert on Yönetici Paneli › Sistem. */
const MEM_WARN_PCT = 80;
const MEM_BAD_PCT = 90;
/** Samples (20 s each) the "sustained" check looks at: 5 minutes. */
const MEM_WINDOW = 15;

/**
 * Memory alert for the Sistem banner. Pure, tested.
 * - "bad": memory is at 90 % of the limit now, or has stayed there for the window.
 * - "warn": memory has stayed at 80 % or more for the window (a deploy or a single GC
 *   spike does not count: 80 % of the window's samples must be at or above it).
 * - "peak": fine now, but today's peak reached 90 % (worth a look, no action yet).
 * - "ok" / "unknown" otherwise.
 * `recommendMb` is the next plan size worth moving to (2 GB, then double).
 */
function memoryAlert({ rssSeries = [], rssMb = null, memLimitMb = null, peakRssMb = null } = {}) {
  const limit = Number(memLimitMb);
  if (!Number.isFinite(limit) || limit <= 0 || rssMb == null) {
    return { level: "unknown", pct: null, sustainedPct: null, peakPct: null, windowMin: 0, rssMb, memLimitMb, recommendMb: null };
  }
  const pctOf = (mb) => Math.round((Number(mb) / limit) * 1000) / 10;
  const pct = pctOf(rssMb);
  const win = rssSeries.filter((v) => Number.isFinite(Number(v)) && v != null).slice(-MEM_WINDOW).map(pctOf);
  // The value 80 % of the window is at or above (the 20th percentile).
  const sorted = [...win].sort((a, b) => a - b);
  const sustainedPct = sorted.length >= Math.ceil(MEM_WINDOW / 2) ? sorted[Math.floor(sorted.length * 0.2)] : null;
  const peakPct = peakRssMb ? pctOf(Math.max(Number(peakRssMb), rssMb)) : pct;
  let level = "ok";
  if (pct >= MEM_BAD_PCT || (sustainedPct != null && sustainedPct >= MEM_BAD_PCT)) level = "bad";
  else if (sustainedPct != null && sustainedPct >= MEM_WARN_PCT) level = "warn";
  else if (peakPct >= MEM_BAD_PCT) level = "peak";
  const windowMin = Math.round((win.length * SAMPLE_MS) / 60000);
  const recommendMb = limit < 2048 ? 2048 : limit * 2;
  return { level, pct, sustainedPct, peakPct, windowMin, rssMb, memLimitMb: limit, recommendMb };
}

async function loadToday(day) {
  if (today.loaded && today.day === day) return;
  today.day = day;
  today.peakSockets = 0;
  today.peakEdge = 0;
  today.peakRssMb = 0;
  today.loaded = true;
  if (!dbClient || Date.now() < dailyDisabledUntil) return;
  try {
    const { data, error } = await dbClient.from(TABLE).select("day, peak_sockets, peak_edge, peak_rss_mb").eq("day", day).maybeSingle();
    if (error) {
      dailyDisabledUntil = Date.now() + 10 * 60 * 1000;
      return;
    }
    if (data) {
      today.peakSockets = Math.max(today.peakSockets, Number(data.peak_sockets) || 0);
      today.peakEdge = Math.max(today.peakEdge, Number(data.peak_edge) || 0);
      today.peakRssMb = Math.max(today.peakRssMb, Number(data.peak_rss_mb) || 0);
    }
  } catch {
    /* table missing */
  }
}

async function writeDaily(force = false) {
  if (!dbClient || Date.now() < dailyDisabledUntil) return;
  if (!force && Date.now() - lastDailyWrite < DAILY_WRITE_MS) return;
  lastDailyWrite = Date.now();
  try {
    const { error } = await dbClient.from(TABLE).upsert(
      { day: today.day, peak_sockets: today.peakSockets, peak_edge: today.peakEdge, peak_rss_mb: today.peakRssMb, updated_at: new Date().toISOString() },
      { onConflict: "day" }
    );
    if (error) dailyDisabledUntil = Date.now() + 10 * 60 * 1000;
  } catch {
    dailyDisabledUntil = Date.now() + 10 * 60 * 1000;
  }
}

async function sample() {
  const now = Date.now();
  const cpuNow = process.cpuUsage();
  let cpu = null;
  if (lastCpu && lastAt) {
    const usedUs = cpuNow.user - lastCpu.user + (cpuNow.system - lastCpu.system);
    const wallUs = (now - lastAt) * 1000;
    cpu = wallUs > 0 ? Math.max(0, Math.min(100, (usedUs / (wallUs * cores())) * 100)) : null;
  }
  lastCpu = cpuNow;
  lastAt = now;
  let lagMs = null;
  let lagP99 = null;
  if (hist) {
    lagMs = Number.isFinite(hist.mean) ? hist.mean / 1e6 : null;
    lagP99 = hist.count ? hist.percentile(99) / 1e6 : null;
    hist.reset();
  }
  const { sockets, edgeSockets } = socketCounts();
  const dbMs = await pingDb();
  const rssMb = Math.round(process.memoryUsage().rss / 1048576);
  const row = {
    at: new Date(now).toISOString(),
    cpu: cpu == null ? null : Math.round(cpu * 10) / 10,
    rssMb,
    lagMs: lagMs == null ? null : Math.round(lagMs * 10) / 10,
    lagP99: lagP99 == null ? null : Math.round(lagP99 * 10) / 10,
    sockets,
    edgeSockets,
    dbMs,
  };
  samples.push(row);
  if (samples.length > KEEP) samples.splice(0, samples.length - KEEP);
  const day = istanbulDay(now);
  await loadToday(day);
  const before = `${today.peakSockets}|${today.peakEdge}|${today.peakRssMb}`;
  today.peakSockets = Math.max(today.peakSockets, sockets);
  today.peakEdge = Math.max(today.peakEdge, edgeSockets);
  today.peakRssMb = Math.max(today.peakRssMb, rssMb);
  // Hybrid server: the daily peaks row is Render's (a secondary node would overwrite it).
  if (before !== `${today.peakSockets}|${today.peakEdge}|${today.peakRssMb}` && require("./cluster").role !== "secondary") await writeDaily();
  return row;
}

/**
 * Start sampling (idempotent). Not in tests unless asked.
 * @param {{ getIo?: Function, getEdge?: Function, supabase?: object, force?: boolean }} opts
 */
function start(opts = {}) {
  if (opts.getIo) getIo = opts.getIo;
  if (opts.getEdge) getEdge = opts.getEdge;
  if (opts.supabase) dbClient = opts.supabase;
  if (timer) return;
  if (process.env.NODE_ENV === "test" && !opts.force) return;
  try {
    hist = monitorEventLoopDelay({ resolution: 20 });
    hist.enable();
  } catch {
    hist = null;
  }
  lastCpu = process.cpuUsage();
  lastAt = Date.now();
  timer = setInterval(() => {
    sample().catch(() => {});
  }, SAMPLE_MS);
  timer.unref?.();
  // First point soon after boot so the tiles are not empty.
  const first = setTimeout(() => sample().catch(() => {}), 2000);
  first.unref?.();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  try {
    hist?.disable();
  } catch {
    /* ignore */
  }
  hist = null;
}

function series(key) {
  return samples.map((s) => s[key]);
}

/** Tiles + sparklines. `extra` = { uptimeSec, availability } from lib/systemBoot. */
function snapshot(extra = {}) {
  const last = samples[samples.length - 1] || null;
  const live = socketCounts();
  const memLimitMb = memoryLimitMb();
  const rssNow = Math.round(process.memoryUsage().rss / 1048576);
  const lagSeries = series("lagP99").filter((v) => v != null);
  const cur = {
    cpu: last?.cpu ?? null,
    cores: cores(),
    rssMb: rssNow,
    memLimitMb,
    lagMs: last?.lagMs ?? null,
    lagP99: lagSeries.length ? Math.max(...lagSeries.slice(-15)) : last?.lagP99 ?? null,
    sockets: live.sockets,
    edgeSockets: live.edgeSockets,
    dbMs: last ? last.dbMs : null,
    uptimeSec: Math.round(extra.uptimeSec ?? process.uptime()),
    availability: extra.availability ?? null,
  };
  return {
    at: new Date().toISOString(),
    sampleMs: SAMPLE_MS,
    current: cur,
    levels: levels(cur),
    memoryAlert: memoryAlert({ rssSeries: series("rssMb"), rssMb: rssNow, memLimitMb, peakRssMb: today.day === istanbulDay() ? today.peakRssMb : null }),
    series: {
      cpu: series("cpu"),
      rss: series("rssMb"),
      lag: series("lagMs"),
      sockets: series("sockets"),
      edge: series("edgeSockets"),
      db: series("dbMs"),
      at: series("at"),
    },
  };
}

/**
 * Last `days` Istanbul days of peak sockets / edge sockets (oldest first, today from memory).
 * @returns {Promise<{ days: Array<{ day, sockets, edge }>, persistent: boolean }>}
 */
async function dailyHistory(days = 14, now = Date.now()) {
  const list = [];
  for (let i = days - 1; i >= 0; i -= 1) list.push(istanbulDay(now - i * 86400000));
  const byDay = new Map(list.map((d) => [d, { day: d, sockets: null, edge: null }]));
  let persistent = false;
  if (dbClient && Date.now() >= dailyDisabledUntil) {
    try {
      const { data, error } = await dbClient.from(TABLE).select("day, peak_sockets, peak_edge").gte("day", list[0]).lte("day", list[list.length - 1]).order("day", { ascending: true });
      if (!error) {
        persistent = true;
        for (const r of data || []) {
          const d = String(r.day).slice(0, 10);
          if (byDay.has(d)) byDay.set(d, { day: d, sockets: Number(r.peak_sockets) || 0, edge: Number(r.peak_edge) || 0 });
        }
      }
    } catch {
      /* table missing */
    }
  }
  const t = istanbulDay(now);
  if (byDay.has(t)) {
    const live = socketCounts();
    const prev = byDay.get(t);
    byDay.set(t, {
      day: t,
      sockets: Math.max(prev.sockets || 0, today.day === t ? today.peakSockets : 0, live.sockets),
      edge: Math.max(prev.edge || 0, today.day === t ? today.peakEdge : 0, live.edgeSockets),
    });
  }
  return { days: list.map((d) => byDay.get(d)), persistent };
}

function __resetForTests() {
  stop();
  samples.length = 0;
  lastCpu = null;
  lastAt = 0;
  dbClient = null;
  dailyDisabledUntil = 0;
  lastDailyWrite = 0;
  today.day = null;
  today.loaded = false;
  getIo = () => null;
  getEdge = () => ({});
}

function __configureForTests(opts = {}) {
  if (opts.getIo) getIo = opts.getIo;
  if (opts.getEdge) getEdge = opts.getEdge;
  if (opts.supabase !== undefined) dbClient = opts.supabase;
}

module.exports = {
  SAMPLE_MS,
  KEEP,
  start,
  stop,
  sample,
  snapshot,
  levels,
  memoryAlert,
  MEM_WARN_PCT,
  MEM_BAD_PCT,
  dailyHistory,
  memoryLimitMb,
  istanbulDay,
  __resetForTests,
  __configureForTests,
};
