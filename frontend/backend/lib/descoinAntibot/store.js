"use strict";

/**
 * Thin, failure-tolerant persistence for the anti-bot tables.
 *
 * - Every query goes through supabase-js (PostgREST, parameterized); no SQL
 *   strings are built here.
 * - The tables come from db/descoinAntibotMigration.sql. Until that migration
 *   is applied, the first "table missing" error latches that table off and
 *   logs one line; the app (and every DesCoin earning path) keeps working.
 * - Errors are logged as messages only, never with row data.
 * - High-volume inserts (message fingerprints) are buffered and flushed in
 *   batches.
 */

function db() {
  return require("../../db/supabase");
}

const missing = new Set();
const warned = new Set();

function isMissingTableError(err) {
  if (!err) return false;
  const code = String(err.code || "");
  const msg = String(err.message || "");
  if (code === "42P01" || code === "PGRST205") return true;
  return /could not find the table|relation "?[\w.]+"? does not exist/i.test(msg);
}

function warnOnce(key, msg) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(msg);
}

function available(table) {
  return !missing.has(table);
}

function noteError(table, err, op) {
  if (!err) return;
  if (isMissingTableError(err)) {
    missing.add(table);
    warnOnce(`missing:${table}`, `[antibot] table ${table} not found; run db/descoinAntibotMigration.sql. Persistence for it is off until restart.`);
    return;
  }
  warnOnce(`${table}:${op}:${String(err.code || err.message || "").slice(0, 40)}`, `[antibot] ${table} ${op} failed: ${String(err.message || err).slice(0, 200)}`);
}

/**
 * Run `build(supabase)` → query for `table`; returns `{ data, error, skipped }`.
 * Never throws.
 */
async function run(table, op, build) {
  if (!available(table)) return { data: null, error: null, skipped: true };
  try {
    const res = await build(db());
    if (res?.error) noteError(table, res.error, op);
    return { data: res?.data ?? null, error: res?.error || null, count: res?.count, skipped: false };
  } catch (err) {
    noteError(table, err, op);
    return { data: null, error: err, skipped: false };
  }
}

// --- batched inserts -------------------------------------------------------

const buffers = new Map(); // table -> rows[]
const MAX_BUFFER = 2000;
let flushTimer = null;

function enqueue(table, row) {
  if (!available(table)) return;
  const buf = buffers.get(table) || [];
  if (buf.length >= MAX_BUFFER) buf.shift(); // bounded memory; oldest dropped
  buf.push(row);
  buffers.set(table, buf);
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush().catch(() => {});
    }, 15_000);
    flushTimer.unref?.();
  }
}

async function flush() {
  for (const [table, buf] of buffers) {
    if (!buf.length) continue;
    const rows = buf.splice(0, buf.length);
    for (let i = 0; i < rows.length; i += 500) {
      const part = rows.slice(i, i + 500);
      await run(table, "insert", (s) => s.from(table).insert(part));
    }
  }
}

function _reset() {
  missing.clear();
  warned.clear();
  buffers.clear();
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
}

module.exports = { run, enqueue, flush, available, isMissingTableError, _reset, _missing: missing, _buffers: buffers };
