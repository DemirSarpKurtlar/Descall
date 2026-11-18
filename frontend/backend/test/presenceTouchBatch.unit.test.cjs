"use strict";
// performance-11: throttled last_seen touches are batched into one update ... in (ids);
// forced touches (disconnect, signup) write at once.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder";
const assert = require("assert");
const calls = [];
const fake = {
  from(table) {
    const q = {
      update(v) { q.v = v; return q; },
      eq(col, val) { calls.push({ table, kind: "eq", ids: [val], v: q.v }); return Promise.resolve({ error: null }); },
      in(col, vals) { calls.push({ table, kind: "in", ids: vals, v: q.v }); return Promise.resolve({ error: null }); },
    };
    return q;
  },
};
const p = require.resolve("../db/supabase");
require.cache[p] = { id: p, filename: p, loaded: true, exports: fake };
const { touchLastSeen, flushLastSeen } = require("../lib/presenceTouch");
const { lastSeenByUserId } = require("../runtime/sharedState");

(async () => {
  for (const id of ["u1", "u2", "u3"]) await touchLastSeen(id);
  assert.strictEqual(calls.length, 0, "throttled touches are queued, not written one by one");
  assert.ok(lastSeenByUserId.get("u2"), "memory is updated at once");
  await touchLastSeen("u1"); // inside the 5 min window: not queued twice
  const n = await flushLastSeen();
  assert.strictEqual(n, 3);
  assert.strictEqual(calls.length, 1, "one statement for the batch");
  assert.deepStrictEqual(calls[0].ids.sort(), ["u1", "u2", "u3"]);
  assert.strictEqual(calls[0].kind, "in");
  assert.ok(calls[0].v.last_seen);

  await touchLastSeen("u4", { force: true });
  assert.strictEqual(calls.length, 2, "a forced touch writes at once");
  assert.deepStrictEqual(calls[1].ids, ["u4"]);
  assert.strictEqual(await flushLastSeen(), 0, "nothing left queued");
  console.log("presenceTouchBatch.unit: ok");
})().catch((e) => { console.error(e); process.exit(1); });
