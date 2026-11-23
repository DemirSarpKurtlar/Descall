"use strict";

/**
 * Turnstile outcome counters for Güvenlik Merkezi ("İnsan doğrulaması" card).
 *
 * Every check (lib/turnstile.js gate) records one (action, outcome) in an hourly bucket
 * in memory. Every 60 s this process upserts its own rows into
 * public.turnstile_stats_hourly (node = this process, so the write is an absolute count,
 * never an increment, and two processes never touch the same row). The admin summary
 * adds the other processes' rows from the table to this process' memory, so nothing is
 * counted twice. Without the table (migration 20261124t_turnstile.sql not applied) the
 * card shows this process' memory and says so.
 *
 * Outcomes:
 *   pass      the token was valid
 *   fail      the token was refused (bad, expired, used, wrong site / action)
 *   blocked   no token and the fallback budget was used up: request refused
 *   fallback  no token (widget could not load, old app), accepted within the budget
 *   failOpen  Cloudflare could not be reached (or answered an internal error): accepted
 *   monitor   would have been refused, accepted because the mode is "monitor"
 *   challenged  a sign-in was asked for the check (step-up after failed passwords)
 */

const os = require("os");
const crypto = require("crypto");

const TABLE = "turnstile_stats_hourly";
const HOUR_MS = 60 * 60 * 1000;
const KEEP_HOURS = 26;
const FLUSH_MS = 60 * 1000;
const RETENTION_DAYS = 30;
const PAUSE_MS = 10 * 60 * 1000;

const ACTIONS = Object.freeze(["register", "login", "password_reset", "social_signup"]);
const OUTCOMES = Object.freeze(["pass", "fail", "blocked", "fallback", "failOpen", "monitor", "challenged"]);

const NODE = `${String(process.env.RENDER_INSTANCE_ID || os.hostname() || "node").slice(0, 40)}:${crypto.randomBytes(4).toString("hex")}`;

let dbOverride = null;
const db = () => dbOverride || require("../db/supabase");

/** hourStartMs -> Map("action|outcome" -> count) */
const buckets = new Map();
const dirty = new Set();
let timer = null;
let pausedUntil = 0;
let warned = false;
let lastPruneAt = 0;
let lastRemoteOk = null;

function hourOf(ms) {
  return Math.floor(ms / HOUR_MS) * HOUR_MS;
}

function trim(now) {
  const oldest = hourOf(now) - (KEEP_HOURS - 1) * HOUR_MS;
  for (const h of buckets.keys()) if (h < oldest) buckets.delete(h);
}

function record(action, outcome, now = Date.now()) {
  if (!ACTIONS.includes(action) || !OUTCOMES.includes(outcome)) return;
  const h = hourOf(now);
  let b = buckets.get(h);
  if (!b) {
    b = new Map();
    buckets.set(h, b);
    trim(now);
  }
  const key = `${action}|${outcome}`;
  b.set(key, (b.get(key) || 0) + 1);
  dirty.add(h);
  schedule();
}

function schedule() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    flush().catch(() => {});
  }, FLUSH_MS);
  if (typeof timer.unref === "function") timer.unref();
}

function isMissingTable(err) {
  const msg = String(err?.message || err?.details || "");
  return err?.code === "42P01" || err?.code === "PGRST205" || (/turnstile_stats_hourly/.test(msg) && /does not exist|not find|schema cache/i.test(msg));
}

function pause(err) {
  pausedUntil = Date.now() + PAUSE_MS;
  if (!warned) {
    warned = true;
    console.warn("[turnstile] stats table missing, counting in memory only:", err?.message || err, "(apply supabase/migrations/20261124t_turnstile.sql)");
  }
}

function persistent() {
  return Date.now() >= pausedUntil && lastRemoteOk !== false;
}

async function flush(now = Date.now()) {
  if (!dirty.size) return { written: 0 };
  if (Date.now() < pausedUntil) {
    schedule();
    return { written: 0, paused: true };
  }
  const hours = [...dirty];
  dirty.clear();
  const rows = [];
  const at = new Date(now).toISOString();
  for (const h of hours) {
    const b = buckets.get(h);
    if (!b) continue;
    for (const [key, count] of b) {
      const [action, outcome] = key.split("|");
      rows.push({ bucket: new Date(h).toISOString(), node: NODE, action, outcome, count, updated_at: at });
    }
  }
  if (!rows.length) return { written: 0 };
  try {
    const { error } = await db().from(TABLE).upsert(rows, { onConflict: "bucket,node,action,outcome" });
    if (error) throw error;
    lastRemoteOk = true;
  } catch (err) {
    for (const h of hours) dirty.add(h);
    if (isMissingTable(err)) {
      lastRemoteOk = false;
      pause(err);
    } else {
      console.warn("[turnstile] stats write failed:", err?.message || err);
      schedule();
    }
    return { written: 0, error: true };
  }
  if (now - lastPruneAt > 6 * HOUR_MS) {
    lastPruneAt = now;
    const cutoff = new Date(now - RETENTION_DAYS * 24 * HOUR_MS).toISOString();
    Promise.resolve(db().from(TABLE).delete().lt("bucket", cutoff)).catch(() => {});
  }
  return { written: rows.length };
}

function emptyTotals() {
  const o = {};
  for (const k of OUTCOMES) o[k] = 0;
  return o;
}

/**
 * Last 24 hours: totals per outcome, per action, and 24 hourly points of
 * pass / refused (fail + blocked) / let-through (fallback + failOpen + monitor).
 * `remoteRows` are the other processes' rows ({ bucket, action, outcome, count }).
 */
function summarize(remoteRows = [], now = Date.now()) {
  const start = hourOf(now) - 23 * HOUR_MS;
  const totals = emptyTotals();
  const byAction = {};
  for (const a of ACTIONS) byAction[a] = emptyTotals();
  const series = { start: new Date(start).toISOString(), bucketMs: HOUR_MS, pass: new Array(24).fill(0), refused: new Array(24).fill(0), let: new Array(24).fill(0) };
  const add = (hourMs, action, outcome, count) => {
    const n = Number(count) || 0;
    if (!n || hourMs < start || hourMs > hourOf(now)) return;
    if (!OUTCOMES.includes(outcome) || !ACTIONS.includes(action)) return;
    totals[outcome] += n;
    byAction[action][outcome] += n;
    const i = Math.round((hourMs - start) / HOUR_MS);
    if (i < 0 || i > 23) return;
    if (outcome === "pass") series.pass[i] += n;
    else if (outcome === "fail" || outcome === "blocked") series.refused[i] += n;
    else if (outcome !== "challenged") series.let[i] += n;
  };
  for (const r of remoteRows || []) {
    if (r.node === NODE) continue;
    add(hourOf(Date.parse(r.bucket)), r.action, r.outcome, r.count);
  }
  for (const [h, b] of buckets) {
    for (const [key, count] of b) {
      const [action, outcome] = key.split("|");
      add(h, action, outcome, count);
    }
  }
  const checks = totals.pass + totals.fail + totals.blocked + totals.fallback + totals.failOpen + totals.monitor;
  return {
    totals,
    byAction,
    series,
    checks,
    passRate: checks ? Math.round((totals.pass / checks) * 1000) / 10 : null,
  };
}

/** Summary across every process (reads the table; falls back to this process' memory). */
async function summary(now = Date.now()) {
  let remote = [];
  if (Date.now() >= pausedUntil) {
    try {
      const since = new Date(hourOf(now) - 23 * HOUR_MS).toISOString();
      const res = await Promise.race([
        Promise.resolve(db().from(TABLE).select("bucket, node, action, outcome, count").gte("bucket", since).limit(5000)),
        new Promise((resolve) => setTimeout(() => resolve({ data: null, error: { message: "timeout" } }), 4000)),
      ]);
      if (res?.error) {
        if (isMissingTable(res.error)) {
          lastRemoteOk = false;
          pause(res.error);
        }
      } else {
        lastRemoteOk = true;
        remote = res?.data || [];
      }
    } catch {
      remote = [];
    }
  }
  return { ...summarize(remote, now), persistent: persistent() };
}

function __resetForTests(client) {
  buckets.clear();
  dirty.clear();
  if (timer) clearTimeout(timer);
  timer = null;
  pausedUntil = 0;
  warned = false;
  lastPruneAt = 0;
  lastRemoteOk = null;
  dbOverride = client || null;
}

module.exports = { ACTIONS, OUTCOMES, NODE, record, flush, summarize, summary, persistent, __resetForTests };
