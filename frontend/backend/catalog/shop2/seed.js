#!/usr/bin/env node
"use strict";
// Market 2.0 catalog seed builder (C4 glue).
//
//   node frontend/backend/catalog/shop2/seed.js            -> writes the migration
//   node frontend/backend/catalog/shop2/seed.js --stdout   -> prints it
//
// Reads every catalog file in this folder that exports `items` (c1-*.js, c2-*.js, ...),
// and generates supabase/migrations/20261116_shop2_catalog_seed.sql:
//   1. schema guards (idempotent, same names as 20261115_shop2.sql): set_key, retired_at,
//      i18n, tags, meta on shop_items; equipped_voice_tile_id / equipped_join_sound_id on
//      users; the category check gains voice_tile and join_sound;
//   2. upsert of every catalog item by sku (active, not retired);
//   3. retire the old catalog: every non-`s2-` item that is not a country flag gets
//      active = false and retired_at = now(). Rows are never deleted and user_inventory /
//      equipped columns are never touched, so owners keep (and can still wear) them.
// The output is a generated file: the coordinator reviews and applies it.

const fs = require("fs");
const path = require("path");

const DIR = __dirname;
const OUT = path.join(DIR, "..", "..", "..", "..", "supabase", "migrations", "20261116_shop2_catalog_seed.sql");
const LOCALES = ["tr", "en", "de", "es", "fr", "pt-BR", "ru"];

/** Categories the shop_items check must allow (existing list + Market 2.0). */
const KNOWN_CATEGORIES = [
  "banner", "avatar_frame", "profile_background", "theme",
  "profile_badge", "profile_title", "name_effect", "avatar_effect", "chat_bubble",
  "presence_flare", "profile_aura", "sound_pack",
  "typing_flare", "reaction_burst", "call_overlay", "countries", "profile_color",
  "voice_tile", "join_sound",
];
const RARITIES = new Set(["common", "rare", "epic", "legendary", "mythic"]);

/** Every item exported by a catalog file in `dir` (files without `items` are helpers). */
function collectItems(dir = DIR) {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => !e.name.startsWith("."));
  const topJs = new Set(entries.filter((e) => e.isFile() && e.name.endsWith(".js")).map((e) => e.name.slice(0, -3)));
  const files = [];
  for (const e of entries) {
    if (e.isFile() && e.name.endsWith(".js") && e.name !== "seed.js") files.push(e.name);
    // A group folder (c3/) counts unless a top-level c3.js aggregates it; with an
    // index.js only that file is read, else every .js inside that exports items.
    if (e.isDirectory() && !topJs.has(e.name)) {
      const sub = path.join(dir, e.name);
      if (fs.existsSync(path.join(sub, "index.js"))) files.push(`${e.name}/index.js`);
      else for (const f of fs.readdirSync(sub)) if (f.endsWith(".js")) files.push(`${e.name}/${f}`);
    }
  }
  files.sort();
  const items = [];
  const sources = [];
  for (const f of files) {
    const mod = require(path.join(dir, f));
    if (!mod || !Array.isArray(mod.items)) continue;
    sources.push({ file: f, count: mod.items.length });
    for (const it of mod.items) items.push({ ...it, __file: f });
  }
  return { items, sources };
}

/** Problems that must stop the seed (duplicates, bad skus, missing languages, ...). */
function validateItems(items) {
  const errors = [];
  const seen = new Map();
  for (const it of items) {
    const at = `${it.__file || "?"}:${it.sku || "?"}`;
    if (typeof it.sku !== "string" || !/^s2-[a-z0-9_]+-[a-z0-9-]+$/.test(it.sku)) errors.push(`${at} sku must look like s2-<category>-<slug>`);
    else if (!it.sku.startsWith(`s2-${it.category}-`)) errors.push(`${at} sku prefix does not match category ${it.category}`);
    if (seen.has(it.sku)) errors.push(`${at} duplicate sku (also in ${seen.get(it.sku)})`);
    seen.set(it.sku, it.__file);
    if (!KNOWN_CATEGORIES.includes(it.category)) errors.push(`${at} unknown category ${it.category}`);
    if (!RARITIES.has(it.rarity)) errors.push(`${at} bad rarity ${it.rarity}`);
    if (!Number.isInteger(it.price_descoin) || it.price_descoin < 0) errors.push(`${at} bad price`);
    for (const field of ["name", "description"]) {
      const v = it[field];
      if (!v || typeof v !== "object") {
        errors.push(`${at} ${field} must be a { locale: text } object`);
        continue;
      }
      for (const loc of LOCALES) if (typeof v[loc] !== "string" || !v[loc].trim()) errors.push(`${at} ${field}.${loc} missing`);
    }
    if (it.category === "join_sound" && (!it.recipe || typeof it.recipe !== "object")) errors.push(`${at} join sound without recipe`);
  }
  return errors;
}

const q = (v) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const qj = (v) => (v === null || v === undefined ? "NULL" : `${q(JSON.stringify(v))}::jsonb`);
const qi = (v) => (Number.isFinite(Number(v)) ? String(Math.round(Number(v))) : "0");

function rowSql(it) {
  const en = (o) => (o && (o.en || o.tr)) || "";
  const meta = {};
  if (it.recipe) meta.recipe = it.recipe;
  return `(${[
    q(it.sku),
    q(en(it.name)),
    q(en(it.description)),
    q(it.category),
    q(it.asset_url || "data:,"),
    q(it.preview_url || null),
    qi(it.price_descoin),
    q(it.theme_key || null),
    q(it.badge_icon || null),
    q(it.effect_key || null),
    q(it.rarity),
    qi(it.sort_order || 0),
    q(it.set_key || null),
    qj({ name: it.name, description: it.description }),
    qj(Array.isArray(it.tags) ? it.tags : []),
    qj(Object.keys(meta).length ? meta : null),
  ].join(", ")})`;
}

/** The whole migration as a string. `items` = collectItems().items. */
function buildSql(items, { sources = [] } = {}) {
  const errors = validateItems(items);
  if (errors.length) throw new Error(`catalog seed invalid:\n  ${errors.slice(0, 40).join("\n  ")}`);
  const cats = [...new Set([...KNOWN_CATEGORIES, ...items.map((i) => i.category)])];
  const byCat = {};
  for (const it of items) byCat[it.category] = (byCat[it.category] || 0) + 1;
  const lines = [];
  lines.push("-- GENERATED FILE. Do not edit by hand.");
  lines.push("-- Source: frontend/backend/catalog/shop2/*.js, built by frontend/backend/catalog/shop2/seed.js");
  lines.push("-- Market 2.0 catalog: upsert the new s2- items by sku and retire the old catalog.");
  lines.push("-- Never deletes rows, never touches user_inventory or equipped columns: owners keep");
  lines.push("-- retired items, they still render and stay equippable (inventory: \"Eski koleksiyon\").");
  lines.push("-- Country flags (category countries) are not retired.");
  lines.push(`-- Items: ${items.length} (${Object.entries(byCat).map(([k, v]) => `${k} ${v}`).join(", ")})`);
  if (sources.length) lines.push(`-- Files: ${sources.map((s) => `${s.file} (${s.count})`).join(", ")}`);
  lines.push("");
  lines.push("BEGIN;");
  lines.push("");
  lines.push("-- 1. Schema guards (no-ops once 20261115_shop2.sql is applied).");
  lines.push("ALTER TABLE public.shop_items ADD COLUMN IF NOT EXISTS set_key TEXT;");
  lines.push("ALTER TABLE public.shop_items ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ;");
  lines.push("ALTER TABLE public.shop_items ADD COLUMN IF NOT EXISTS i18n JSONB;");
  lines.push("ALTER TABLE public.shop_items ADD COLUMN IF NOT EXISTS tags TEXT[];");
  lines.push("ALTER TABLE public.shop_items ADD COLUMN IF NOT EXISTS meta JSONB;");
  lines.push("ALTER TABLE public.users ADD COLUMN IF NOT EXISTS equipped_voice_tile_id UUID REFERENCES public.shop_items(id) ON DELETE SET NULL;");
  lines.push("ALTER TABLE public.users ADD COLUMN IF NOT EXISTS equipped_join_sound_id UUID REFERENCES public.shop_items(id) ON DELETE SET NULL;");
  lines.push("ALTER TABLE public.shop_items DROP CONSTRAINT IF EXISTS shop_items_category_check;");
  lines.push(`ALTER TABLE public.shop_items ADD CONSTRAINT shop_items_category_check CHECK (category IN (\n  ${cats.map((c) => q(c)).join(",")}));`);
  lines.push("");
  lines.push("-- 2. Stage the catalog, then upsert by sku (tags cast to the live column type).");
  lines.push("CREATE TEMP TABLE _shop2_seed (");
  lines.push("  sku TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, category TEXT NOT NULL,");
  lines.push("  asset_url TEXT NOT NULL, preview_url TEXT, price_descoin INTEGER NOT NULL, theme_key TEXT,");
  lines.push("  badge_icon TEXT, effect_key TEXT, rarity TEXT NOT NULL, sort_order INTEGER NOT NULL,");
  lines.push("  set_key TEXT, i18n JSONB, tags JSONB, meta JSONB");
  lines.push(") ON COMMIT DROP;");
  lines.push("");
  const CHUNK = 40;
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    lines.push("INSERT INTO _shop2_seed (sku, name, description, category, asset_url, preview_url, price_descoin, theme_key, badge_icon, effect_key, rarity, sort_order, set_key, i18n, tags, meta) VALUES");
    lines.push(chunk.map(rowSql).join(",\n") + ";");
    lines.push("");
  }
  lines.push("DO $seed$");
  lines.push("DECLARE");
  lines.push("  tags_expr TEXT := 's.tags';");
  lines.push("BEGIN");
  lines.push("  IF (SELECT data_type FROM information_schema.columns");
  lines.push("      WHERE table_schema = 'public' AND table_name = 'shop_items' AND column_name = 'tags') = 'ARRAY' THEN");
  lines.push("    tags_expr := 'ARRAY(SELECT jsonb_array_elements_text(s.tags))';");
  lines.push("  END IF;");
  lines.push("  EXECUTE format($q$");
  lines.push("    INSERT INTO public.shop_items AS t");
  lines.push("      (sku, name, description, category, asset_url, preview_url, price_cents, price_descoin, theme_key,");
  lines.push("       badge_icon, effect_key, rarity, sort_order, active, set_key, i18n, tags, meta, retired_at)");
  lines.push("    SELECT s.sku, s.name, s.description, s.category, s.asset_url, s.preview_url, 0, s.price_descoin, s.theme_key,");
  lines.push("           s.badge_icon, s.effect_key, s.rarity, s.sort_order, TRUE, s.set_key, s.i18n, %s, s.meta, NULL");
  lines.push("    FROM _shop2_seed s");
  lines.push("    ON CONFLICT (sku) DO UPDATE SET");
  lines.push("      name = EXCLUDED.name, description = EXCLUDED.description, category = EXCLUDED.category,");
  lines.push("      asset_url = EXCLUDED.asset_url, preview_url = EXCLUDED.preview_url, price_descoin = EXCLUDED.price_descoin,");
  lines.push("      theme_key = EXCLUDED.theme_key, badge_icon = EXCLUDED.badge_icon, effect_key = EXCLUDED.effect_key,");
  lines.push("      rarity = EXCLUDED.rarity, sort_order = EXCLUDED.sort_order, active = TRUE, set_key = EXCLUDED.set_key,");
  lines.push("      i18n = EXCLUDED.i18n, tags = EXCLUDED.tags, meta = EXCLUDED.meta, retired_at = NULL");
  lines.push("  $q$, tags_expr);");
  lines.push("END");
  lines.push("$seed$;");
  lines.push("");
  lines.push("-- 3. Retire the old catalog (not deleted; country flags stay on sale).");
  lines.push("UPDATE public.shop_items");
  lines.push("SET active = FALSE, retired_at = COALESCE(retired_at, now())");
  lines.push("WHERE sku NOT LIKE 's2-%'");
  lines.push("  AND category <> 'countries'");
  lines.push("  AND (active OR retired_at IS NULL);");
  lines.push("");
  lines.push("COMMIT;");
  lines.push("");
  return lines.join("\n");
}

function main(argv = process.argv.slice(2)) {
  const { items, sources } = collectItems();
  const sql = buildSql(items, { sources });
  if (argv.includes("--stdout")) {
    process.stdout.write(sql);
    return;
  }
  fs.writeFileSync(OUT, sql);
  console.log(`[shop2 seed] ${items.length} items from ${sources.map((s) => s.file).join(", ")} -> ${path.relative(process.cwd(), OUT)}`);
}

if (require.main === module) main();

module.exports = { collectItems, validateItems, buildSql, KNOWN_CATEGORIES, LOCALES, OUT };
