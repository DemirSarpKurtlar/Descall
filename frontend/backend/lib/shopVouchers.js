"use strict";

/**
 * Free-item vouchers (2.13.0). Profile titles were retired; the users who had
 * paid DesCoin for a title received one free country flag each. A voucher is
 * an inventory credit, not a DesCoin balance change: redeeming one grants the
 * item at 0 DesCoin and writes no ledger row. Gifts never produce a voucher.
 *
 * Table: public.shop_vouchers (service role only, RLS on, no policies).
 */

const supabase = require("../db/supabase");
const shop = require("./shop");
const descoin = require("./descoin");

const VOUCHER_COLUMNS = "id, user_id, category, reason, granted_at, redeemed_at, redeemed_item_id";

/** Unredeemed vouchers per category, e.g. `{ countries: 1 }`. Missing table → `{}`. */
async function getOpenVoucherCounts(userId) {
  const { data, error } = await supabase
    .from("shop_vouchers")
    .select("id, category")
    .eq("user_id", userId)
    .is("redeemed_at", null);
  if (error) {
    // Before the migration runs the table does not exist; treat as no vouchers.
    if (error.code === "42P01" || /shop_vouchers/.test(String(error.message || ""))) return {};
    throw error;
  }
  const out = {};
  for (const row of data || []) out[row.category] = (out[row.category] || 0) + 1;
  return out;
}

/**
 * Redeem one open voucher of `item.category` for `item`. Returns
 * `{ redeemed: true, item }`, `{ alreadyOwned: true }` or throws
 * `NO_VOUCHER`. Serialized per user with the DesCoin queue, so a double tap
 * cannot spend two vouchers or race a paid purchase of the same item.
 */
async function redeemVoucher(userId, item) {
  return descoin.runSerialized(userId, async () => {
    if (await shop.userOwnsItem(userId, item.id)) return { alreadyOwned: true };

    const { data: open, error } = await supabase
      .from("shop_vouchers")
      .select(VOUCHER_COLUMNS)
      .eq("user_id", userId)
      .eq("category", item.category)
      .is("redeemed_at", null)
      .order("granted_at", { ascending: true })
      .limit(1);
    if (error) throw error;
    const voucher = (open || [])[0];
    if (!voucher) throw Object.assign(new Error("NO_VOUCHER"), { code: "NO_VOUCHER" });

    // Conditional update: only one request can flip redeemed_at from null.
    const { data: claimed, error: claimError } = await supabase
      .from("shop_vouchers")
      .update({ redeemed_at: new Date().toISOString(), redeemed_item_id: item.id })
      .eq("id", voucher.id)
      .is("redeemed_at", null)
      .select("id")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) throw Object.assign(new Error("NO_VOUCHER"), { code: "NO_VOUCHER" });

    let granted = null;
    try {
      granted = await shop.grantItem(userId, item.id, { acquiredVia: "voucher" });
    } catch (grantError) {
      await releaseVoucher(voucher.id);
      throw grantError;
    }
    if (!granted) {
      await releaseVoucher(voucher.id);
      return { alreadyOwned: true };
    }
    return { redeemed: true, item };
  });
}

async function releaseVoucher(voucherId) {
  const { error } = await supabase
    .from("shop_vouchers")
    .update({ redeemed_at: null, redeemed_item_id: null })
    .eq("id", voucherId);
  if (error) console.error(`[shopVouchers] CRITICAL: could not release voucher ${voucherId}:`, error.message);
}

module.exports = { getOpenVoucherCounts, redeemVoucher };
