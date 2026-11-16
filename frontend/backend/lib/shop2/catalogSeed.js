"use strict";

/**
 * Market 2.0 catalog on boot: upsert the s2- items from catalog/shop2/*.js into shop_items by
 * sku (same rows as supabase/migrations/20261116_shop2_catalog_seed.sql, which is too large to
 * apply through the SQL console), then retire the old catalog. Retired = active false +
 * retired_at; never deletes rows, never touches user_inventory or equipped columns, so owners
 * keep their items ("Eski koleksiyon"). Country flags stay on sale.
 *
 * Idempotent and cheap after the first run: a content hash of the catalog is stored in
 * shop2_settings (key "catalog_seed"); a boot with the same hash skips the upsert and only
 * keeps old rows (for example one inserted by an older boot ensure) off sale.
 */

const crypto = require("crypto");

const SETTINGS_KEY = "catalog_seed";
const BATCH = 40;

function itemRow(it) {
  const en = (o) => (o && (o.en || o.tr)) || "";
  const meta = it.recipe ? { recipe: it.recipe } : null;
  return {
    sku: it.sku,
    name: en(it.name),
    description: en(it.description),
    category: it.category,
    asset_url: it.asset_url || "data:,",
    preview_url: it.preview_url || null,
    price_cents: 0,
    price_descoin: Math.round(Number(it.price_descoin) || 0),
    theme_key: it.theme_key || null,
    badge_icon: it.badge_icon || null,
    effect_key: it.effect_key || null,
    rarity: it.rarity,
    sort_order: Math.round(Number(it.sort_order) || 0),
    active: true,
    set_key: it.set_key || null,
    i18n: { name: it.name, description: it.description },
    tags: Array.isArray(it.tags) ? it.tags.map(String) : [],
    meta,
    retired_at: null,
  };
}

function catalogRows() {
  const { collectItems, validateItems } = require("../../catalog/shop2/seed");
  const { items } = collectItems();
  const errors = validateItems(items);
  if (errors.length) throw new Error(`shop2 catalog invalid: ${errors.slice(0, 5).join("; ")}`);
  return items.map(itemRow);
}

function hashRows(rows) {
  return crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex").slice(0, 32);
}

/**
 * @param {object} supabase service-role client
 * @param {{ log?: Function, rows?: object[] }} [opts]
 * @returns {Promise<{ skipped?: boolean, upserted?: number, retired?: number, hash: string }>}
 */
async function seedShop2Catalog(supabase, { log = console.log, rows = null } = {}) {
  const all = rows || catalogRows();
  const hash = hashRows(all);

  const { data: setting, error: settingError } = await supabase
    .from("shop2_settings").select("value").eq("key", SETTINGS_KEY).maybeSingle();
  if (settingError) throw settingError;
  const same = setting?.value?.hash === hash;

  let upserted = 0;
  for (let i = 0; !same && i < all.length; i += BATCH) {
    const chunk = all.slice(i, i + BATCH);
    const { error } = await supabase.from("shop_items").upsert(chunk, { onConflict: "sku" });
    if (error) throw error;
    upserted += chunk.length;
  }

  const { data: retiredRows, error: retireError } = await supabase
    .from("shop_items")
    .update({ active: false, retired_at: new Date().toISOString() })
    .not("sku", "like", "s2-%")
    .neq("category", "countries")
    .is("retired_at", null)
    .select("id");
  if (retireError) throw retireError;
  // Rows retired earlier but switched back on by an old boot ensure: keep them off sale.
  const { error: offError } = await supabase
    .from("shop_items")
    .update({ active: false })
    .not("sku", "like", "s2-%")
    .neq("category", "countries")
    .not("retired_at", "is", null)
    .eq("active", true);
  if (offError) throw offError;

  const retired = (retiredRows || []).length;
  if (same) {
    if (retired) log(`[shop2] catalog unchanged, ${retired} old items retired`);
    return { skipped: true, retired, hash };
  }

  const { error: saveError } = await supabase.from("shop2_settings").upsert({
    key: SETTINGS_KEY,
    value: { hash, items: all.length, at: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  }, { onConflict: "key" });
  if (saveError) throw saveError;

  log(`[shop2] catalog seeded: ${upserted} items upserted, ${retired} old items retired`);
  return { upserted, retired, hash };
}

module.exports = { seedShop2Catalog, catalogRows, itemRow, hashRows, SETTINGS_KEY };
