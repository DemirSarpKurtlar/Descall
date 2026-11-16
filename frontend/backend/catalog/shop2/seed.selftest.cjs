// Market 2.0 catalog seed: SQL shape and safety. Run: node backend/catalog/shop2/seed.selftest.cjs
"use strict";
const assert = require("assert/strict");
const fs = require("fs");
const { collectItems, validateItems, buildSql, LOCALES, OUT } = require("./seed");

const { items, sources } = collectItems();
assert.ok(sources.some((s) => s.file === "c4-voice.js"), "reads c4-voice.js");
assert.ok(items.length >= 72);
assert.deepEqual(validateItems(items), [], "catalog files are valid");
const sql = buildSql(items, { sources });

// Transaction, guards, never destructive (statements only, comments stripped).
const code = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
assert.match(sql, /^-- GENERATED FILE/);
assert.match(sql, /\nBEGIN;\n/);
assert.match(sql, /\nCOMMIT;\n$/);
assert.ok(!/\bDELETE\s+FROM\b/i.test(code), "never deletes");
assert.ok(!/\bTRUNCATE\b|\bDROP TABLE\b/i.test(code), "never truncates or drops tables");
assert.ok(!/user_inventory/i.test(code), "never touches user_inventory");
assert.ok(!/UPDATE\s+public\.users/i.test(code), "never changes what users wear");
assert.match(sql, /ADD COLUMN IF NOT EXISTS equipped_voice_tile_id UUID/);
assert.match(sql, /ADD COLUMN IF NOT EXISTS equipped_join_sound_id UUID/);
assert.match(sql, /ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ/);
const check = /shop_items_category_check CHECK \(category IN \(\s*([^)]*)\)\)/.exec(sql);
assert.ok(check, "category check rebuilt");
for (const c of ["voice_tile", "join_sound", "countries", "profile_color", "chat_bubble"]) assert.ok(check[1].includes(`'${c}'`), `check allows ${c}`);

// Upsert by sku, active, not retired.
assert.match(sql, /ON CONFLICT \(sku\) DO UPDATE SET/);
assert.match(sql, /active = TRUE/);
assert.match(sql, /retired_at = NULL/);
for (const it of items) {
  const hits = sql.split(`'${it.sku}'`).length - 1;
  assert.equal(hits, 1, `${it.sku} staged exactly once`);
}

// Retire: only old, non-country rows; flags stay.
const retire = /UPDATE public\.shop_items\s+SET active = FALSE, retired_at = COALESCE\(retired_at, now\(\)\)\s+WHERE sku NOT LIKE 's2-%'\s+AND category <> 'countries'/.test(sql);
assert.ok(retire, "retire statement keeps s2- items and country flags");

// Text: English row name, 7 languages in i18n, recipes in meta, quotes escaped.
const voice = items.find((i) => i.sku === "s2-join_sound-gece-limani");
assert.ok(sql.includes(`'s2-join_sound-gece-limani', 'Harbor Bell'`));
assert.ok(sql.includes('"recipe":{"v":1'), "join sound recipe stored in meta");
assert.ok(voice.recipe.voices.length > 0);
const tricky = {
  sku: "s2-voice_tile-test-quote",
  category: "voice_tile",
  rarity: "rare",
  price_descoin: 400,
  effect_key: "vt-test",
  name: Object.fromEntries(LOCALES.map((l) => [l, "Night's Watch"])),
  description: Object.fromEntries(LOCALES.map((l) => [l, "It's 'quoted'"])),
};
const one = buildSql([tricky]);
assert.ok(one.includes("'Night''s Watch'"), "single quotes doubled");
assert.ok(!/[^']'s Watch/.test(one.replace(/''/g, "")), "no raw quote left");

// Validation catches broken data.
const dup = validateItems([{ ...tricky, __file: "a.js" }, { ...tricky, __file: "b.js" }]);
assert.ok(dup.some((e) => e.includes("duplicate sku")));
const noRu = validateItems([{ ...tricky, name: { ...tricky.name, ru: "" } }]);
assert.ok(noRu.some((e) => e.includes("name.ru missing")));
assert.ok(validateItems([{ ...tricky, sku: "voice-old" }]).length > 0, "sku must start with s2-");
assert.ok(validateItems([{ ...tricky, category: "join_sound", sku: "s2-join_sound-x" }]).some((e) => e.includes("recipe")));
assert.throws(() => buildSql([{ ...tricky, rarity: "ultra" }]), /bad rarity/);

// The committed migration is the generated output of the current catalog.
if (fs.existsSync(OUT)) {
  const committed = fs.readFileSync(OUT, "utf8");
  assert.match(committed, /^-- GENERATED FILE/);
  if (committed !== sql) console.warn("seed.selftest: note: migration is older than the catalog files; run node backend/catalog/shop2/seed.js");
}

console.log(`seed.selftest: ok (${items.length} items from ${sources.length} files)`);
