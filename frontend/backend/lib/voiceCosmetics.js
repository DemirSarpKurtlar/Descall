"use strict";

/**
 * Market 2.0 (C4) voice cosmetics: equipped voice tile + join sound per user.
 *
 * Kept out of the main equip query on purpose: users.equipped_voice_tile_id /
 * equipped_join_sound_id arrive with the catalog seed (20261116_shop2_catalog_seed.sql).
 * Until then this module answers "nothing equipped" and the rest of the cosmetics keep
 * working. The records are compact ({ id, sku, category, effect_key, rarity, name }) because
 * they travel with every voice / call member; the client draws the tile from effect_key
 * and plays the join sound from the bundled recipe (custom recipes ride along as `recipe`).
 */

const supabase = require("../db/supabase");

const VOICE_EQUIP_COLUMNS = {
  voice_tile: "equipped_voice_tile_id",
  join_sound: "equipped_join_sound_id",
};
const VOICE_CATEGORIES = new Set(Object.keys(VOICE_EQUIP_COLUMNS));
const UNAVAILABLE_RETRY_MS = 5 * 60_000;

let unavailableUntil = 0;
let bundledKeys = null;

function bundledRecipeKeys() {
  if (bundledKeys) return bundledKeys;
  try {
    bundledKeys = new Set(Object.keys(require("../catalog/shop2/c4-join-sounds.json")));
  } catch {
    bundledKeys = new Set();
  }
  return bundledKeys;
}

function isMissingSchema(error) {
  const code = String(error?.code || "");
  const msg = String(error?.message || "");
  return code === "42703" || code === "PGRST204" || /column .* does not exist|schema cache/i.test(msg);
}

/** Compact record sent with member data. */
function compactItem(row) {
  if (!row) return null;
  const out = {
    id: row.id,
    sku: row.sku,
    category: row.category,
    effect_key: row.effect_key || null,
    rarity: row.rarity || null,
    name: row.name || null,
  };
  const recipe = row.meta && typeof row.meta === "object" ? row.meta.recipe : null;
  if (row.category === "join_sound" && recipe && !bundledRecipeKeys().has(out.effect_key)) out.recipe = recipe;
  return out;
}

async function selectItems(ids) {
  let res = await supabase.from("shop_items").select("id, sku, category, effect_key, rarity, name, meta").in("id", ids);
  if (res.error && isMissingSchema(res.error)) {
    res = await supabase.from("shop_items").select("id, sku, category, effect_key, rarity, name").in("id", ids);
  }
  if (res.error) throw res.error;
  return res.data || [];
}

/**
 * userId -> { voiceTile, joinSound } (compact items or null). Never throws: a missing
 * column (seed not applied) or a failed query means nothing equipped.
 */
async function loadVoiceEquipped(userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  const out = new Map();
  if (!ids.length || Date.now() < unavailableUntil) return out;
  try {
    const { data: users, error } = await supabase
      .from("users")
      .select("id, equipped_voice_tile_id, equipped_join_sound_id")
      .in("id", ids);
    if (error) {
      if (isMissingSchema(error)) unavailableUntil = Date.now() + UNAVAILABLE_RETRY_MS;
      return out;
    }
    const itemIds = new Set();
    for (const u of users || []) {
      if (u.equipped_voice_tile_id) itemIds.add(u.equipped_voice_tile_id);
      if (u.equipped_join_sound_id) itemIds.add(u.equipped_join_sound_id);
    }
    const byId = new Map();
    if (itemIds.size) for (const row of await selectItems([...itemIds])) byId.set(row.id, row);
    for (const u of users || []) {
      const tile = byId.get(u.equipped_voice_tile_id);
      const sound = byId.get(u.equipped_join_sound_id);
      out.set(u.id, {
        // A row in the wrong slot (data repair, old client) is ignored, never painted.
        voiceTile: tile && tile.category === "voice_tile" ? compactItem(tile) : null,
        joinSound: sound && sound.category === "join_sound" ? compactItem(sound) : null,
      });
    }
  } catch (err) {
    console.warn("[voiceCosmetics] load failed:", err?.message || err);
  }
  return out;
}

/** Called after an equip so the next load retries a column that just appeared. */
function resetAvailability() {
  unavailableUntil = 0;
}

module.exports = {
  VOICE_EQUIP_COLUMNS,
  VOICE_CATEGORIES,
  loadVoiceEquipped,
  compactItem,
  resetAvailability,
  isMissingSchema,
};
