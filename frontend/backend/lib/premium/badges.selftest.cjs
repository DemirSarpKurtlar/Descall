"use strict";

/**
 * lib/premium/badges.js: other people's Descall+ / Ultra badges come from batched
 * premium_active_for calls with a short cache, never one query per person.
 */

const assert = require("assert");
const badges = require("./badges");

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

(async () => {
  const seen = [];
  const active = new Map([[U(1), "plus"], [U(2), "ultra"]]);
  badges.__resetForTests({
    rpc: async (ids) => {
      seen.push(ids.length);
      await new Promise((r) => setTimeout(r, 5));
      return ids.filter((id) => active.has(id)).map((id) => ({ user_id: id, plan: active.get(id) }));
    },
  });

  // 450 people: three batched calls (200 + 200 + 50), not 450.
  const many = Array.from({ length: 450 }, (_, i) => U(i + 1));
  const plans = await badges.plansFor([...many, "not-a-uuid", null, U(1)]);
  assert.deepEqual(seen, [200, 200, 50], "batched by 200");
  assert.equal(plans.get(U(1)), "plus");
  assert.equal(plans.get(U(2)), "ultra");
  assert.equal(plans.get(U(3)), null, "no membership = null");
  assert.ok(!plans.has("not-a-uuid"), "invalid ids are skipped");

  // Cached: the same list again costs nothing; the sync read sees it.
  await badges.plansFor(many);
  assert.equal(badges.__calls(), 3, "served from the cache");
  assert.equal(badges.cachedPlan(U(2)), "ultra");
  assert.equal(badges.cachedPlan(U(3)), null, "known non-member");
  assert.equal(badges.cachedPlan(U(999)), undefined, "unknown stays undefined (key left out of the JSON)");

  // Concurrent callers share one request.
  badges.__resetForTests({ rpc: async (ids) => { seen.push(`c${ids.length}`); await new Promise((r) => setTimeout(r, 10)); return []; } });
  await Promise.all([badges.plansFor([U(7), U(8)]), badges.plansFor([U(8), U(7)]), badges.planOf(U(7))]);
  assert.equal(badges.__calls(), 1, "one request for overlapping lookups");

  // attachPlans sets premium_plan on each row.
  badges.__resetForTests({ rpc: async (ids) => ids.filter((id) => id === U(5)).map((id) => ({ user_id: id, plan: "ultra" })) });
  const rows = await badges.attachPlans([{ id: U(5) }, { id: U(6) }]);
  assert.deepEqual(rows.map((r) => r.premium_plan), ["ultra", null]);

  // A change (premium:updated) drops the entry; the next read asks again.
  active.clear();
  badges.invalidate(U(5));
  assert.equal(badges.cachedPlan(U(5)), undefined);

  // Fails closed: an error gives no badge and no exception.
  badges.__resetForTests({ rpc: async () => { throw Object.assign(new Error("Could not find the function"), { code: "PGRST202" }); } });
  const failed = await badges.plansFor([U(1)]);
  assert.equal(failed.get(U(1)), null);
  await badges.plansFor([U(1)]);
  assert.equal(badges.__calls(), 1, "a missing function pauses lookups instead of retrying on every payload");

  badges.__resetForTests();
  console.log("premium badges selftest: ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
