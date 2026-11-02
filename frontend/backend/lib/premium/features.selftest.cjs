"use strict";

// node backend/lib/premium/features.selftest.cjs
// The client list (src/premium/features.js), its backend mirror, the CONTRACT table and the plan
// seed in the migration must name the same Descall+ / Ultra feature keys.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const backend = require("./features");
const entitlements = require("./entitlements");

const ROOT = path.join(__dirname, "../../../..");

(async () => {
  const client = await import(pathToFileURL(path.join(ROOT, "frontend/src/premium/features.js")).href);

  // 1) client === backend, entry by entry and in order
  assert.deepEqual(backend.FEATURES.map((f) => ({ ...f })), client.FEATURES.map((f) => ({ ...f })), "backend mirror equals the client list");
  assert.deepEqual([...backend.TIERS], [...client.TIERS]);
  for (const plan of ["plus", "ultra", null, "gold"]) {
    assert.deepEqual(backend.featuresFor(plan), client.featuresFor(plan), `featuresFor(${plan})`);
  }

  // 2) shape
  const keys = backend.FEATURES.map((f) => f.key);
  assert.equal(new Set(keys).size, keys.length, "no duplicate keys");
  for (const f of backend.FEATURES) {
    assert.match(f.key, /^[a-z][a-z0-9_]+$/);
    assert.ok(["plus", "ultra"].includes(f.tier), `${f.key} tier`);
    assert.equal(typeof f.desktop, "boolean", `${f.key} desktop flag`);
  }
  const plus = backend.featuresFor("plus");
  const ultra = backend.featuresFor("ultra");
  assert.ok(plus.every((k) => ultra.includes(k)), "every plus key is also on ultra");
  assert.equal(ultra.length, backend.FEATURES.length);
  assert.deepEqual(backend.featuresFor(null), []);

  // 3) the CONTRACT table
  const contract = fs.readFileSync(path.join(ROOT, "docs/premium/CONTRACT.md"), "utf8");
  const rows = [...contract.matchAll(/^\| ([a-z_]+) \| (plus|ultra) \| (yes|no) \|$/gm)].map((m) => ({ key: m[1], tier: m[2], desktop: m[3] === "yes" }));
  assert.ok(rows.length > 0, "contract table found");
  assert.deepEqual(backend.FEATURES.map((f) => ({ ...f })), rows, "lists follow the CONTRACT table");

  // 4) the plan seed in the migration
  const sql = fs.readFileSync(path.join(ROOT, "supabase/migrations/20261106_premium_memberships.sql"), "utf8");
  const seed = (id) => JSON.parse(sql.match(new RegExp(`\\('${id}', '[^']+', NULL, '(\\[[^']+\\])'::jsonb`))[1]);
  assert.deepEqual([...seed("plus")].sort(), [...plus].sort(), "plus seed");
  assert.deepEqual([...seed("ultra")].sort(), [...ultra].sort(), "ultra seed");

  // 5) entitlements: cache, fail closed, middleware
  let calls = 0;
  let answer = { data: { plan: "plus", status: "active", ends_at: null, unlimited: true, monthly_descoin: 5000, next_coin_at: null }, error: null };
  entitlements.__setDbForTests({ rpc: async (name, args) => { calls += 1; assert.equal(name, "premium_me"); assert.ok(args.p_user); return answer; } });
  assert.equal(await entitlements.hasFeature("u1", "mini_mode"), true, "plus has mini_mode");
  assert.equal(await entitlements.hasFeature("u1", "voice_hud"), false, "plus lacks ultra keys");
  assert.equal(await entitlements.hasFeature("u1", "not_a_key"), false, "unknown key fails closed");
  assert.equal(calls, 1, "cached between calls");
  answer = { data: { plan: "ultra", status: "active" }, error: null };
  assert.equal(await entitlements.hasFeature("u1", "voice_hud"), false, "cache still holds plus");
  entitlements.invalidate("u1");
  assert.equal(await entitlements.hasFeature("u1", "voice_hud"), true, "after invalidate: ultra");
  answer = { data: null, error: { code: "PGRST202", message: "missing" } };
  assert.equal(await entitlements.hasFeature("u2", "mini_mode"), false, "missing function fails closed");
  const later = Date.now() + entitlements.CACHE_MS + 1;
  assert.equal((await entitlements.loadMe("u1", { now: later })).plan, "ultra", "a transient error keeps the last answer");
  const me = entitlements.publicMe({ plan: "plus", status: "active", ends_at: "2026-12-01T00:00:00Z", unlimited: false, monthly_descoin: 5000, next_coin_at: "x" });
  assert.deepEqual(Object.keys(me).slice(0, 7), ["plan", "status", "ends_at", "unlimited", "features", "monthly_descoin", "next_coin_at"], "contract shape");
  assert.deepEqual(entitlements.publicMe(null), { plan: null, status: "none", ends_at: null, unlimited: false, features: [], monthly_descoin: null, next_coin_at: null, started_at: null });
  assert.throws(() => entitlements.requireFeature("nope"), /Unknown premium feature/);
  const mw = entitlements.requireFeature("mini_mode");
  const run = (user) => new Promise((resolve) => {
    const res = { status(c) { this.code = c; return this; }, json(b) { resolve({ status: this.code, body: b }); } };
    mw({ user }, res, () => resolve({ passed: true }));
  });
  assert.equal((await run(null)).status, 401);
  entitlements.invalidate();
  answer = { data: { plan: null, status: "none" }, error: null };
  const denied = await run({ id: "u3" });
  assert.deepEqual([denied.status, denied.body.code, denied.body.feature], [403, "PREMIUM_REQUIRED", "mini_mode"]);
  answer = { data: { plan: "plus", status: "active" }, error: null };
  assert.equal((await run({ id: "u4" })).passed, true);
  entitlements.__setDbForTests(null);

  console.log("features.selftest.cjs: ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
