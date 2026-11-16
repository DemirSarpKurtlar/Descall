"use strict";
// node frontend/backend/lib/shop2/catalogSeed.selftest.cjs
const assert = require("assert");
const { seedShop2Catalog, catalogRows } = require("./catalogSeed");

function fakeDb({ existing = [] } = {}) {
  const calls = [];
  const state = { setting: null, existing };
  function q(table) {
    const ctx = { table, op: null, filters: [], payload: null };
    const api = {
      select() { if (!ctx.op) ctx.op = "select"; return api; },
      eq(c, v) { ctx.filters.push(["eq", c, v]); return api; },
      neq(c, v) { ctx.filters.push(["neq", c, v]); return api; },
      not(c, o, v) { ctx.filters.push(["not", c, o, v]); return api; },
      is(c, v) { ctx.filters.push(["is", c, v]); return api; },
      like(c, v) { ctx.filters.push(["like", c, v]); return api; },
      order() { return api; },
      range(a, b) { ctx.range = [a, b]; return api; },
      maybeSingle() { return Promise.resolve({ data: state.setting, error: null }); },
      upsert(p) { ctx.op = "upsert"; ctx.payload = p; calls.push(ctx); if (table === "shop2_settings") state.setting = { value: p.value }; return Promise.resolve({ error: null }); },
      update(p) { ctx.op = "update"; ctx.payload = p; calls.push(ctx); return api; },
      then(res, rej) {
        if (ctx.op === "select" && ctx.range) return Promise.resolve({ data: state.existing.slice(ctx.range[0], ctx.range[1] + 1).map((sku) => ({ sku })), error: null }).then(res, rej);
        return Promise.resolve({ data: ctx.op === "update" && ctx.payload.retired_at ? [{ id: 1 }, { id: 2 }] : [], error: null }).then(res, rej);
      },
    };
    return api;
  }
  return { from: q, calls, state };
}

(async () => {
  const rows = catalogRows();
  assert.ok(rows.length >= 600, `catalog rows ${rows.length}`);
  assert.ok(rows.every((r) => r.sku.startsWith("s2-") && r.active === true && r.retired_at === null));
  assert.ok(rows.every((r) => Array.isArray(r.tags) && r.i18n && r.i18n.name && r.i18n.name.tr));

  const db = fakeDb();
  const first = await seedShop2Catalog(db, { log: () => {} });
  assert.strictEqual(first.upserted, rows.length);
  assert.strictEqual(first.retired, 2);
  const retire = db.calls.find((c) => c.table === "shop_items" && c.op === "update" && c.payload.retired_at);
  assert.deepStrictEqual(retire.filters.map((f) => f.slice(0, 2)), [["not", "sku"], ["neq", "category"], ["is", "retired_at"]]);
  assert.strictEqual(retire.filters[1][2], "countries");
  assert.ok(!db.calls.some((c) => c.table === "user_inventory" || c.table === "users"), "never touches inventory or users");

  const before = db.calls.filter((c) => c.op === "upsert" && c.table === "shop_items").length;
  const second = await seedShop2Catalog(db, { log: () => {} });
  assert.strictEqual(second.skipped, true);
  assert.strictEqual(db.calls.filter((c) => c.op === "upsert" && c.table === "shop_items").length, before, "same hash: no upsert");
  // Catalog files changed: an existing row keeps its sale state, a new row goes on sale.
  const half = Math.floor(rows.length / 2);
  const db2 = fakeDb({ existing: rows.slice(0, half).map((r) => r.sku) });
  const third = await seedShop2Catalog(db2, { log: () => {}, rows: rows.map((r, i) => (i === 0 ? { ...r, name: `${r.name} v2` } : r)) });
  assert.strictEqual(third.upserted, rows.length);
  const ups = db2.calls.filter((c) => c.op === "upsert" && c.table === "shop_items").flatMap((c) => c.payload);
  const kept = ups.filter((r) => rows.slice(0, half).some((x) => x.sku === r.sku));
  assert.ok(kept.length && kept.every((r) => !("active" in r) && !("retired_at" in r) && !("price_descoin" in r)), "existing rows keep active / retired_at / admin price");
  const added = ups.filter((r) => !rows.slice(0, half).some((x) => x.sku === r.sku));
  assert.ok(added.length && added.every((r) => r.active === true && r.retired_at === null && Number.isFinite(r.price_descoin)), "new rows go on sale");
  console.log("catalogSeed selftest ok");
})().catch((e) => { console.error(e); process.exit(1); });
