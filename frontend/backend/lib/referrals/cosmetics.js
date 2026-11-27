"use strict";

/**
 * Davet ödülleri: grant / take back the exclusive invite cosmetics
 * (catalog/referral/cosmetics.js; rows in shop_items are active = false, so the store and
 * shop gifts can never sell or send them). A grant is idempotent (user_inventory upsert on
 * user + item, duplicates ignored) and puts the item on when that slot is still empty, so
 * the profile card shows it right away. Taking back (a revoked milestone) removes it from the
 * inventory and takes it off when it is worn.
 */

const CATALOG = require("../../catalog/referral/cosmetics");

const EQUIP_COLUMN = {
  profile_badge: "equipped_badge_id",
  avatar_frame: "equipped_avatar_frame_id",
  banner: "equipped_banner_id",
  name_effect: "equipped_name_effect_id",
};

function db() {
  return require("../../db/supabase");
}

async function categoryOf(itemId) {
  const known = CATALOG.ITEMS.find((it) => it.id === itemId);
  if (known) return known.category;
  const { data } = await db().from("shop_items").select("category").eq("id", itemId).maybeSingle();
  return data?.category || null;
}

/** Grant each item once; returns the ids that were granted (already owned ones included). */
async function grant(userId, itemIds, { giftedBy = null, equip = true } = {}) {
  const out = [];
  for (const id of itemIds || []) {
    if (!id) continue;
    try {
      await require("../shop").grantItem(userId, id, { acquiredVia: "gift", giftedBy });
      out.push(id);
      const column = EQUIP_COLUMN[await categoryOf(id)];
      if (equip && column) {
        await db().from("users").update({ [column]: id }).eq("id", userId).is(column, null);
      }
    } catch (err) {
      console.warn("[referrals] cosmetic grant failed:", err?.message || err);
    }
  }
  return out;
}

/** Take items back (inventory row and the worn slot). */
async function remove(userId, itemIds) {
  const ids = (itemIds || []).filter(Boolean);
  if (!ids.length) return 0;
  try {
    await db().from("user_inventory").delete().eq("user_id", userId).in("item_id", ids);
    for (const id of ids) {
      const column = EQUIP_COLUMN[await categoryOf(id)];
      if (column) await db().from("users").update({ [column]: null }).eq("id", userId).eq(column, id);
    }
    return ids.length;
  } catch (err) {
    console.warn("[referrals] cosmetic removal failed:", err?.message || err);
    return 0;
  }
}

/** Public art for Davet Merkezi / the landing (GET /api/invites/art/:key). */
function art(key) {
  const it = CATALOG.ITEMS.find((x) => x.key === key);
  return it && it.svg ? it.svg() : null;
}

/** The items of a milestone / of the invitee gift, as the screens draw them. */
function describe(itemIds) {
  return (itemIds || [])
    .map((id) => CATALOG.ITEMS.find((it) => it.id === id))
    .filter(Boolean)
    .map((it) => ({ id: it.id, key: it.key, category: it.category, effectKey: it.effect_key || null, name: it.name }));
}

module.exports = { grant, remove, art, describe, EQUIP_COLUMN };
