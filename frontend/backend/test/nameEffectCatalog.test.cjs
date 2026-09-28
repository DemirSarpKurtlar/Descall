"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { NAME_EFFECT_CATALOG, RESERVED_EFFECT_KEYS, toSqlInsert } = require("../lib/nameEffectCatalog");

const css = fs.readFileSync(
  path.join(__dirname, "../../src/styles/name-effects-sigil.css"),
  "utf8"
);

const staticItems = NAME_EFFECT_CATALOG.filter((item) => !item.animated);
const animatedItems = NAME_EFFECT_CATALOG.filter((item) => item.animated);

assert.ok(NAME_EFFECT_CATALOG.length >= 25 && NAME_EFFECT_CATALOG.length <= 35, "catalog size");
assert.strictEqual(staticItems.length, 16, "expected 16 static name effects");
assert.strictEqual(animatedItems.length, 14, "expected 14 animated name effects");

const skus = new Set();
const keys = new Set();
const signatures = new Set();
for (const item of NAME_EFFECT_CATALOG) {
  assert.ok(!skus.has(item.sku), `duplicate sku ${item.sku}`);
  assert.ok(!keys.has(item.effect_key), `duplicate effect ${item.effect_key}`);
  skus.add(item.sku);
  keys.add(item.effect_key);
  assert.strictEqual(item.category, "name_effect");
  assert.ok(item.effect_key.startsWith("sigil-"));
  assert.ok(!RESERVED_EFFECT_KEYS.includes(item.effect_key.replace(/^sigil-/, "")), item.effect_key);
  assert.ok(item.description.length > 40, item.sku);
  assert.ok(item.price_descoin >= 200 && item.price_descoin <= 700, item.sku);
  const selector = `.cosmetic-name-effect.effect-${item.effect_key}`;
  assert.ok(css.includes(selector), `missing css for ${item.effect_key}`);
  const slug = item.effect_key.replace(/^sigil-/, "");
  const animRef = `animation: sigil-${slug}`;
  const keyframe = `@keyframes sigil-${slug}`;
  const blockStart = css.indexOf(selector);
  const next = css.indexOf(".cosmetic-name-effect.effect-sigil-", blockStart + selector.length);
  const block = css.slice(blockStart, next === -1 ? css.length : next);
  const signature = block
    .replace(selector, "")
    .replace(/\s+/g, " ")
    .trim();
  assert.ok(!signatures.has(signature), `css clone ${item.effect_key}`);
  signatures.add(signature);
  if (item.animated) {
    assert.ok(css.includes(animRef), `missing animation ${slug}`);
    assert.ok(css.includes(keyframe), `missing keyframes ${slug}`);
    assert.ok(block.includes(animRef), `animation not on ${slug}`);
  } else {
    assert.ok(!css.includes(animRef), `static skin animates ${slug}`);
    assert.ok(!css.includes(keyframe), `static skin has keyframes ${slug}`);
    assert.ok(!block.includes("animation:"), `static block animates ${slug}`);
  }
}

const sqlPath = path.join(__dirname, "../../../supabase/migrations/20260928_name_effect_sigil.sql");
const sql = fs.readFileSync(sqlPath, "utf8");
assert.strictEqual(sql.trim(), toSqlInsert().trim(), "SQL migration drifted from catalog");
for (const item of NAME_EFFECT_CATALOG) {
  assert.ok(sql.includes(item.sku));
  assert.ok(sql.includes("ON CONFLICT (sku) DO NOTHING"));
}

async function main() {
  process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
  process.env.SUPABASE_URL = "https://placeholder.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
  const { createFakeSupabase } = require("./fakeSupabase.cjs");
  const fake = createFakeSupabase({
    shop_items: [{ sku: NAME_EFFECT_CATALOG[0].sku, name: "already" }],
  });
  const supabasePath = require.resolve("../db/supabase");
  require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };
  delete require.cache[require.resolve("../lib/shop")];
  const shop = require("../lib/shop");
  const created = await shop.ensureNameEffectCatalog();
  assert.strictEqual(created, NAME_EFFECT_CATALOG.length - 1);
  const again = await shop.ensureNameEffectCatalog();
  assert.strictEqual(again, 0);
  const rows = fake._tables.shop_items.rows.filter((row) => String(row.sku).startsWith("name-effect-sigil-"));
  assert.strictEqual(rows.length, NAME_EFFECT_CATALOG.length);
  const sample = rows.find((row) => row.sku === "name-effect-sigil-aurora");
  assert.strictEqual(sample.category, "name_effect");
  assert.strictEqual(sample.effect_key, "sigil-aurora");
  assert.strictEqual(sample.active, true);
  console.log("nameEffectCatalog.test.cjs ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
