"use strict";

/**
 * Daily DesCoin reconciliation (2.11.1). READ-ONLY with respect to balances:
 * compares users.descoin_balance with SUM(descoin_ledger.amount) per user and
 * records the result in descoin_reconciliation_runs (admin panel + alert log).
 * It never modifies a balance or a ledger row; fixing drift stays a manual
 * admin decision (Admin → Shop → DesCoin reconciliation).
 *
 * The comparison runs in Postgres (descoin_reconciliation_snapshot, STABLE, so
 * the database rejects writes inside it) and is called over PostgREST GET,
 * which executes in a READ ONLY transaction.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const CHECK_EVERY_MS = 60 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 3 * 60 * 1000;
const MANUAL_COOLDOWN_MS = 60 * 1000;
const MAX_LISTED = 500;

/** Pure: normalise the snapshot JSON from Postgres into the run row we store. */
function summarizeSnapshot(snapshot) {
  const s = snapshot && typeof snapshot === "object" ? snapshot : {};
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const mismatches = (Array.isArray(s.mismatches) ? s.mismatches : []).map((m) => ({
    user_id: m.user_id,
    balance: num(m.balance),
    ledger_sum: num(m.ledger_sum),
    ledger_rows: num(m.ledger_rows),
    last_balance_after: m.last_balance_after == null ? null : num(m.last_balance_after),
    drift: num(m.drift != null ? m.drift : num(m.balance) - num(m.ledger_sum)),
  }));
  return {
    users_checked: num(s.users_checked),
    ledger_rows: num(s.ledger_rows),
    mismatch_count: num(s.mismatch_count),
    no_ledger_count: num(s.no_ledger_count),
    last_row_mismatch_count: num(s.last_row_mismatch_count),
    abs_drift: num(s.abs_drift),
    mismatches,
  };
}

/** Pure: should the hourly tick start a run, given the last run's start time? */
function isRunDue(lastStartedAt, now = Date.now()) {
  if (!lastStartedAt) return true;
  const t = Date.parse(lastStartedAt);
  if (!Number.isFinite(t)) return true;
  return now - t >= DAY_MS - 5 * 60 * 1000;
}

/** Pure: one-line alert text, counts only (no user ids in logs). */
function alertLine(summary) {
  return `[descoin-reconcile] ALERT: ${summary.mismatch_count} user balance(s) differ from the ledger sum ` +
    `(no ledger rows: ${summary.no_ledger_count}, total |drift| ${summary.abs_drift} DC, ` +
    `checked ${summary.users_checked} users / ${summary.ledger_rows} ledger rows). Balances were NOT changed.`;
}

function defaultDeps() {
  return {
    supabase: require("../db/supabase"),
    captureMessage: require("../instrument").captureMessage,
    log: console,
  };
}

let running = null;
let lastManualAt = 0;

async function lastRun(supabase) {
  const { data, error } = await supabase
    .from("descoin_reconciliation_runs")
    .select("id, started_at")
    .order("started_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data && data[0]) || null;
}

async function runReconciliation({ trigger = "cron", triggeredBy = null, deps = null } = {}) {
  if (running) return running;
  const { supabase, captureMessage, log } = deps || defaultDeps();
  running = (async () => {
    const startedAt = new Date().toISOString();
    let summary = null;
    let error = null;
    try {
      const { data, error: rpcError } = await supabase.rpc(
        "descoin_reconciliation_snapshot",
        { max_rows: MAX_LISTED },
        { get: true },
      );
      if (rpcError) throw rpcError;
      summary = summarizeSnapshot(data);
    } catch (err) {
      error = String((err && err.message) || err).slice(0, 500);
    }
    const row = {
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      trigger,
      triggered_by: triggeredBy,
      ...(summary || {}),
      error,
    };
    const { data: inserted, error: insertError } = await supabase
      .from("descoin_reconciliation_runs")
      .insert(row)
      .select("id")
      .maybeSingle();
    if (insertError) log.error("[descoin-reconcile] could not store run:", insertError.message);
    if (error) {
      log.error(`[descoin-reconcile] run failed: ${error}`);
      captureMessage?.("DesCoin reconciliation failed", "error", { error });
    } else if (summary.mismatch_count > 0) {
      const line = alertLine(summary);
      log.error(line);
      captureMessage?.("DesCoin balance/ledger mismatch", "warning", {
        mismatch_count: summary.mismatch_count,
        no_ledger_count: summary.no_ledger_count,
        abs_drift: summary.abs_drift,
      });
    } else {
      log.log(`[descoin-reconcile] ok: ${summary.users_checked} users, ${summary.ledger_rows} ledger rows, 0 mismatches`);
    }
    return { id: inserted?.id || null, ...row };
  })();
  try {
    return await running;
  } finally {
    running = null;
  }
}

async function runManual(adminId, deps = null) {
  const now = Date.now();
  if (now - lastManualAt < MANUAL_COOLDOWN_MS) {
    const err = new Error("Reconciliation was run less than a minute ago.");
    err.status = 429;
    throw err;
  }
  lastManualAt = now;
  return runReconciliation({ trigger: "manual", triggeredBy: adminId, deps });
}

async function tick(deps = null) {
  const { supabase, log } = deps || defaultDeps();
  try {
    const last = await lastRun(supabase);
    if (isRunDue(last && last.started_at)) await runReconciliation({ trigger: "cron", deps });
  } catch (err) {
    log.warn("[descoin-reconcile] scheduler check failed:", (err && err.message) || err);
  }
}

let timers = null;
/** Hourly check; runs when the last stored run is ~24h old. Restarts and extra instances share the DB guard. */
function startReconcileScheduler() {
  if (timers || process.env.DESCOIN_RECONCILE_DISABLED === "1") return;
  const first = setTimeout(() => tick(), FIRST_CHECK_DELAY_MS);
  const every = setInterval(() => tick(), CHECK_EVERY_MS);
  first.unref?.();
  every.unref?.();
  timers = { first, every };
}

async function listRuns(supabase, limit = 14) {
  const { data, error } = await supabase
    .from("descoin_reconciliation_runs")
    .select("id, started_at, finished_at, trigger, users_checked, ledger_rows, mismatch_count, no_ledger_count, last_row_mismatch_count, abs_drift, mismatches, error")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

module.exports = {
  summarizeSnapshot,
  isRunDue,
  alertLine,
  runReconciliation,
  runManual,
  startReconcileScheduler,
  listRuns,
  tick,
};
