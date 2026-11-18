"use strict";
// performance-10: the overview's durable counts are cached for 60 s per client, and the
// message tables use an estimated count instead of an exact full-table count(*).
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder";
const assert = require("assert");
const { fetchDurableAdminCounts } = require("../lib/adminOverview");

function client() {
  const calls = [];
  const q = (table) => {
    const b = {
      opts: null,
      select(_c, opts) { b.opts = opts; calls.push([table, opts && opts.count]); return b; },
      eq() { return b; }, or() { return b; }, not() { return b; }, gt() { return b; },
      then(res, rej) { return Promise.resolve({ count: 7, error: null }).then(res, rej); },
    };
    return b;
  };
  return { calls, from: q };
}

(async () => {
  const c = client();
  const a = await fetchDurableAdminCounts(c, { timeoutMs: 200 });
  const n = c.calls.length;
  assert.ok(n >= 8, "first load queries every metric");
  const b = await fetchDurableAdminCounts(c, { timeoutMs: 200 });
  assert.strictEqual(c.calls.length, n, "second load within 60 s is served from the cache");
  assert.deepStrictEqual(a, b);
  for (const t of ["dm_messages", "group_messages", "server_messages"]) {
    assert.ok(c.calls.some(([tab, kind]) => tab === t && kind === "estimated"), `${t} uses an estimated count`);
  }
  assert.ok(c.calls.some(([tab, kind]) => tab === "users" && kind === "exact"), "users stays exact");
  await fetchDurableAdminCounts(c, { timeoutMs: 200, cacheMs: 0 });
  assert.ok(c.calls.length > n, "cacheMs 0 bypasses the cache");
  console.log("adminOverviewCountsCache.unit: ok");
})().catch((e) => { console.error(e); process.exit(1); });
