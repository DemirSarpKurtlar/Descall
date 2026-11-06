// features.js must match the binding table in docs/premium/CONTRACT.md, and the
// Electron mirror (electron/premium/featureTiers.cjs) must match features.js.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { FEATURES, FEATURE_KEYS, PLAN_COIN, tierAllows, featuresForPlan, normalizePlan } from "./features.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const contractPath = path.join(here, "..", "..", "..", "docs", "premium", "CONTRACT.md");
const require = createRequire(import.meta.url);
const tiers = require("../../electron/premium/featureTiers.cjs");

function contractTable() {
  const text = fs.readFileSync(contractPath, "utf8");
  const rows = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^\|\s*([a-z0-9_]+)\s*\|\s*(plus|ultra)\s*\|\s*(yes|no)\s*\|\s*$/);
    if (m) rows.push({ key: m[1], tier: m[2], desktop: m[3] === "yes" });
  }
  return rows;
}

test("FEATURES equals the CONTRACT table (keys, order, tier, desktop)", { skip: !fs.existsSync(contractPath) && "CONTRACT.md not in this checkout" }, () => {
  const rows = contractTable();
  assert.ok(rows.length >= 40, `parsed ${rows.length} rows`);
  assert.deepEqual(FEATURE_KEYS, rows.map((r) => r.key));
  for (const r of rows) {
    assert.deepEqual({ ...FEATURES[r.key] }, { tier: r.tier, desktop: r.desktop }, r.key);
  }
});

test("PLAN_COIN is the contract gift", () => {
  assert.deepEqual({ ...PLAN_COIN }, { plus: 5000, ultra: 15000 });
});

test("tierAllows: plus keys on both plans, ultra keys only on ultra, nothing on free", () => {
  assert.equal(tierAllows("plus", "mini_mode"), true);
  assert.equal(tierAllows("ultra", "mini_mode"), true);
  assert.equal(tierAllows("plus", "desktop_sidebar"), false);
  assert.equal(tierAllows("ultra", "desktop_sidebar"), true);
  assert.equal(tierAllows(null, "mini_mode"), false);
  assert.equal(tierAllows("free", "mini_mode"), false);
  assert.equal(tierAllows("ULTRA", "window_layouts"), true);
  assert.equal(tierAllows("ultra", "nope"), false);
  assert.equal(tierAllows("ultra", "__proto__"), false);
  assert.equal(normalizePlan("gold"), null);
});

test("featuresForPlan", () => {
  const plus = featuresForPlan("plus");
  const ultra = featuresForPlan("ultra");
  assert.ok(plus.every((k) => FEATURES[k].tier === "plus"));
  assert.equal(ultra.length, FEATURE_KEYS.length);
  assert.deepEqual(featuresForPlan(null), []);
});

test("Electron featureTiers.cjs mirrors features.js", () => {
  assert.deepEqual(Object.keys(tiers.TIERS), FEATURE_KEYS);
  for (const k of FEATURE_KEYS) assert.equal(tiers.TIERS[k], FEATURES[k].tier, k);
  assert.deepEqual(tiers.featuresForPlan("plus"), featuresForPlan("plus"));
});
