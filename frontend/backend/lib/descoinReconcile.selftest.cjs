"use strict";
// node backend/lib/descoinReconcile.selftest.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const r = require("./descoinReconcile");

const UID = "11111111-2222-4333-8444-555555555555";
const snap = {
  users_checked: 164, ledger_rows: 6258, mismatch_count: 1, no_ledger_count: 0,
  last_row_mismatch_count: 0, abs_drift: 250,
  mismatches: [{ user_id: UID, balance: 1250, ledger_sum: 1000, ledger_rows: 4, last_balance_after: 1250, drift: 250 }],
};

const s = r.summarizeSnapshot(snap);
assert.equal(s.mismatch_count, 1);
assert.equal(s.mismatches[0].drift, 250);
assert.deepEqual(r.summarizeSnapshot(null).mismatches, []);
assert.equal(r.summarizeSnapshot({ mismatches: [{ user_id: "x", balance: 5, ledger_sum: 2 }] }).mismatches[0].drift, 3);

const now = Date.parse("2026-10-18T12:00:00Z");
assert.equal(r.isRunDue(null, now), true);
assert.equal(r.isRunDue("2026-10-18T01:00:00Z", now), false, "11h ago is not due");
assert.equal(r.isRunDue("2026-10-17T12:00:00Z", now), true, "24h ago is due");
assert.equal(r.isRunDue("garbage", now), true);

const line = r.alertLine(s);
assert.ok(line.includes("1 user balance(s)") && line.includes("NOT changed"));
assert.ok(!line.includes(UID), "alert log line must not carry user ids");

// Fake supabase: records every call; anything that could change data except the run insert fails the test.
function fakeSupabase({ rpcData = snap, rpcError = null } = {}) {
  const calls = [];
  return {
    calls,
    rpc(name, args, opts) {
      calls.push({ rpc: name, args, opts });
      return Promise.resolve({ data: rpcData, error: rpcError });
    },
    from(table) {
      const q = {
        insert(row) { calls.push({ table, insert: row }); return { select: () => ({ maybeSingle: async () => ({ data: { id: "run-1" }, error: null }) }) }; },
        update() { throw new Error(`update on ${table} is forbidden`); },
        upsert() { throw new Error(`upsert on ${table} is forbidden`); },
        delete() { throw new Error(`delete on ${table} is forbidden`); },
        select() { return q; }, order() { return q; }, limit: async () => ({ data: [], error: null }),
      };
      return q;
    },
  };
}

(async () => {
  const logs = [];
  const log = { log: (m) => logs.push(["log", m]), error: (m) => logs.push(["error", m]), warn: (m) => logs.push(["warn", m]) };
  const alerts = [];
  const sb = fakeSupabase();
  const run = await r.runReconciliation({ trigger: "cron", deps: { supabase: sb, captureMessage: (...a) => alerts.push(a), log } });
  const rpc = sb.calls.find((c) => c.rpc);
  assert.equal(rpc.rpc, "descoin_reconciliation_snapshot");
  assert.equal(rpc.opts && rpc.opts.get, true, "must use GET (PostgREST read-only transaction)");
  const inserts = sb.calls.filter((c) => c.insert);
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].table, "descoin_reconciliation_runs", "only the report table is written");
  assert.equal(run.mismatch_count, 1);
  assert.ok(logs.some(([lvl, m]) => lvl === "error" && /ALERT/.test(m)), "mismatch writes an alert log line");
  assert.equal(alerts.length, 1);
  assert.ok(!JSON.stringify(alerts).includes(UID), "Sentry alert carries counts only");

  const sb2 = fakeSupabase({ rpcData: null, rpcError: { message: "boom" } });
  const failed = await r.runReconciliation({ deps: { supabase: sb2, captureMessage: () => {}, log } });
  assert.equal(failed.error, "boom");

  // The tick schedules a run when there is no previous run.
  const sb3 = fakeSupabase({ rpcData: { ...snap, mismatch_count: 0, mismatches: [] } });
  await r.tick({ supabase: sb3, captureMessage: () => {}, log });
  assert.ok(sb3.calls.some((c) => c.rpc), "tick runs when no run exists");

  // Source guard: the job never writes balances or ledger rows.
  const src = fs.readFileSync(path.join(__dirname, "descoinReconcile.js"), "utf8");
  assert.ok(!/\.update\(|\.upsert\(|\.delete\(/.test(src), "no update/upsert/delete in the reconciliation job");
  assert.ok(!/from\("users"\)|from\("descoin_ledger"\)/.test(src), "job reads balances only through the read-only snapshot function");

  console.log("descoinReconcile.selftest.cjs: ok");
})().catch((e) => { console.error(e); process.exit(1); });
