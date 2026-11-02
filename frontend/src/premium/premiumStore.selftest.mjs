// Renderer entitlement store: /api/premium/me parsing, 404 = free, sync hasPremiumFeature.
import test from "node:test";
import assert from "node:assert/strict";
import {
  __resetPremiumStoreForTests,
  configurePremiumFetch,
  getPremiumState,
  hasPremiumFeature,
  onPremiumEntitlements,
  parsePremiumMe,
  refreshPremium,
  subscribePremium,
} from "./premiumStore.js";

const httpError = (status) => Object.assign(new Error(`HTTP ${status}`), { status });

test("parsePremiumMe drops unknown keys and keys above the plan", () => {
  const s = parsePremiumMe({ plan: "plus", status: "active", features: ["mini_mode", "desktop_sidebar", "hack"], ends_at: "2026-12-01T00:00:00Z", next_coin_at: "2026-12-01T00:00:00Z", monthly_descoin: 5000 });
  assert.equal(s.plan, "plus");
  assert.deepEqual(s.features, ["mini_mode"]);
  assert.equal(s.endsAt, "2026-12-01T00:00:00Z");
  assert.equal(s.monthlyDescoin, 5000);
});

test("parsePremiumMe derives the list when the server sends none; expired is free", () => {
  assert.ok(parsePremiumMe({ plan: "ultra", status: "active" }).features.includes("desktop_sidebar"));
  const exp = parsePremiumMe({ plan: "plus", status: "expired", features: ["mini_mode"] });
  assert.equal(exp.plan, null);
  assert.deepEqual(exp.features, []);
  assert.equal(exp.status, "expired");
  assert.equal(parsePremiumMe(null).plan, null);
});

test("store: active plan, sync gate, listeners and entitlement push", async () => {
  __resetPremiumStoreForTests();
  const pushed = [];
  onPremiumEntitlements((keys, plan) => pushed.push([keys.length, plan]));
  let calls = 0;
  configurePremiumFetch(async (p) => {
    calls += 1;
    assert.equal(p, "/api/premium/me");
    return { plan: "plus", status: "active", unlimited: true, ends_at: null, features: ["mini_mode", "pip_call"] };
  });
  let seen = 0;
  subscribePremium(() => { seen += 1; });
  assert.equal(hasPremiumFeature("mini_mode"), false);
  await Promise.all([refreshPremium(), refreshPremium()]);
  assert.equal(calls, 1, "concurrent refreshes share one request");
  assert.equal(hasPremiumFeature("mini_mode"), true);
  assert.equal(hasPremiumFeature("desktop_sidebar"), false);
  assert.equal(getPremiumState().unlimited, true);
  assert.ok(seen >= 1);
  assert.deepEqual(pushed.at(-1), [2, "plus"]);
});

test("store: missing endpoint (404) is free and nothing throws", async () => {
  __resetPremiumStoreForTests();
  configurePremiumFetch(async () => { throw httpError(404); });
  const s = await refreshPremium();
  assert.equal(s.plan, null);
  assert.equal(s.loaded, true);
  assert.equal(s.error, null);
  assert.equal(hasPremiumFeature("mini_mode"), false);
});

test("store: network error keeps the last known state", async () => {
  __resetPremiumStoreForTests();
  configurePremiumFetch(async () => ({ plan: "ultra", status: "active" }));
  await refreshPremium();
  configurePremiumFetch(async () => { throw httpError(0); });
  const s = await refreshPremium();
  assert.equal(s.plan, "ultra");
  assert.ok(s.error);
  assert.equal(hasPremiumFeature("window_layouts"), true);
});

test("store: signed out is free without a request", async () => {
  __resetPremiumStoreForTests();
  let calls = 0;
  configurePremiumFetch(async () => { calls += 1; return { plan: "plus", status: "active" }; });
  const s = await refreshPremium({ signedIn: false });
  assert.equal(calls, 0);
  assert.equal(s.plan, null);
});
