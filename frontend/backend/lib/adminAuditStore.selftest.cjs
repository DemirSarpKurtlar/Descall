"use strict";
// Run: node lib/adminAuditStore.selftest.cjs
// Admin audit entries survive restarts (3.1.3): every appendAudit is written to
// admin_audit, secrets never reach the row, a missing table never breaks an action.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const store = require("./adminAuditStore");

function fakeClient({ error = null, rows = [] } = {}) {
  const inserts = [];
  const filters = [];
  const q = {
    select() { return q; },
    eq(k, v) { filters.push(["eq", k, v]); return q; },
    lt(k, v) { filters.push(["lt", k, v]); return q; },
    order() { return q; },
    limit(n) { filters.push(["limit", n]); return Promise.resolve({ data: rows, error }); },
  };
  return {
    inserts,
    filters,
    from(table) {
      assert.equal(table, "admin_audit");
      return { insert(row) { inserts.push(row); return Promise.resolve({ error }); }, ...q };
    },
  };
}

(async () => {
  // Row shape + secret stripping.
  const c = fakeClient();
  store.__setClientForTests(c);
  const ok = await store.persist({
    id: "1700000000000-abc", at: "2026-10-30T19:00:00.000Z",
    actorId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301", actorUsername: "demir",
    action: "ban", target: "spam_bot",
    meta: { reason: "spam", password: "x", token: "y", resetCode: "123456", nested: { a: 1 } },
  });
  assert.equal(ok, true);
  const row = c.inserts[0];
  assert.equal(row.id, "1700000000000-abc");
  assert.equal(row.action, "ban");
  assert.equal(row.actor_id, "3f2504e0-4f89-11d3-9a0c-0305e82c3301");
  assert.deepEqual(row.meta, { reason: "spam", nested: { a: 1 } }, "password/token/code keys dropped");

  // Non-uuid actor id (legacy) is kept as username only.
  assert.equal(store.toRow({ id: "x", actorId: "admin", action: "a" }).actor_id, null);
  // Huge meta is truncated, not rejected.
  const big = store.cleanMeta({ blob: "z".repeat(10_000) });
  assert.equal(big.truncated, true);
  assert.ok(JSON.stringify(big).length < 4100);

  // Missing table: the action still succeeds; writes pause instead of hammering.
  const missing = fakeClient({ error: { code: "42P01", message: 'relation "admin_audit" does not exist' } });
  store.__setClientForTests(missing);
  const origWarn = console.warn; let warns = 0; console.warn = () => { warns += 1; };
  assert.equal(await store.persist({ id: "a", action: "x" }, { now: 1000 }), false);
  assert.equal(await store.persist({ id: "b", action: "x" }, { now: 2000 }), false);
  assert.equal(missing.inserts.length, 1, "paused after the first missing-table error");
  assert.equal(await store.persist({ id: "c", action: "x" }, { now: 1000 + 11 * 60 * 1000 }), false);
  assert.equal(missing.inserts.length, 2, "retries after the pause");
  console.warn = origWarn;
  assert.equal(warns, 1, "warns once");

  // list(): newest first rows mapped back; filters passed; error → null.
  const reader = fakeClient({ rows: [{ id: "r1", at: "2026-10-30T19:00:00Z", actor_id: null, actor_username: "demir", action: "chat_freeze", target: "true", meta: {} }] });
  store.__setClientForTests(reader);
  const rows = await store.list({ limit: 50, action: "chat_freeze" });
  assert.equal(rows[0].action, "chat_freeze");
  assert.equal(rows[0].durable, true);
  assert.deepEqual(reader.filters.find((f) => f[0] === "eq"), ["eq", "action", "chat_freeze"]);
  store.__setClientForTests(fakeClient({ error: { message: "boom" } }));
  assert.equal(await store.list({}), null);

  // Wiring: the single choke point persists; the audit tab and overview read the table.
  const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
  assert.match(read("runtime/sharedState.js"), /require\("\.\.\/lib\/adminAuditStore"\)\.persist\(entry\)/);
  assert.match(read("routes/admin.js"), /adminAuditStore\.list\(\{ limit \}\)/);
  assert.match(read("routes/adminOverview.js"), /adminAuditStore\.list\(\{ limit: 8 \}\)/);
  const sql = fs.readFileSync(path.join(__dirname, "../../../supabase/migrations/20261030_admin_audit.sql"), "utf8");
  assert.match(sql, /BEFORE UPDATE OR DELETE ON public\.admin_audit/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  store.__setClientForTests(null);
  console.log("adminAuditStore.selftest ok");
})().catch((e) => { console.error(e); process.exit(1); });
