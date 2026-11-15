"use strict";

/**
 * One DesCoin shop purchase. Two taps, or two API instances, must not
 * debit the wallet twice for a single inventory row.
 *
 * The per-user queue closes the race on this process. The inventory upsert
 * is already idempotent; if it does not insert (another instance won), the
 * debit is refunded with shop_refund, which does not count as earned coins.
 */

const supabase = require("../db/supabase");
const shop = require("./shop");
const descoin = require("./descoin");

/**
 * opts.price   effective price (sale) decided by the route; defaults to the list price.
 * opts.limited the item has a stock limit: one unit is reserved (race-safe, lib/shopMerchStore)
 *              before the debit and given back if anything after it fails.
 * opts.pricing { list, pct, source, campaignId } for the ledger meta.
 */
async function purchaseItem(userId, item, opts = {}) {
  return descoin.runSerialized(userId, async () => {
    if (await shop.userOwnsItem(userId, item.id)) {
      return { alreadyOwned: true, balance: await descoin.getBalance(userId) };
    }

    const price = Math.max(0, Math.round(Number(opts.price ?? item.price_descoin) || 0));
    const limited = Boolean(opts.limited);
    const merchStore = limited ? require("./shopMerchStore") : null;
    if (limited) {
      const reserved = await merchStore.reserveStock(item.id);
      if (!reserved.ok) {
        const err = new Error("SOLD_OUT");
        err.code = "SOLD_OUT";
        throw err;
      }
    }
    const releaseIfLimited = async () => {
      if (!limited) return;
      await merchStore.releaseStock(item.id).catch((e) => console.error(`[shopPurchase] stock release failed for item ${item.id}:`, e?.message || e));
    };

    const pricing = opts.pricing || null;
    const meta = { itemId: item.id, sku: item.sku };
    if (pricing && pricing.pct) {
      meta.listPrice = pricing.list;
      meta.discountPct = pricing.pct;
      if (pricing.campaignId) meta.campaignId = pricing.campaignId;
    }
    let debitResult;
    try {
      debitResult = await descoin.debit(userId, price, "shop_purchase", meta);
    } catch (err) {
      await releaseIfLimited();
      throw err;
    }

    let granted;
    try {
      granted = await shop.grantItem(userId, item.id, { acquiredVia: "purchase" });
    } catch (grantError) {
      // The debit already happened: give the coins back before surfacing the error
      // (a failed grant used to keep the money and give nothing).
      try {
        await descoin.credit(userId, price, "shop_refund", {
          itemId: item.id,
          sku: item.sku,
          reason: "grant_failed",
        });
      } catch (refundError) {
        console.error(
          `[shopPurchase] CRITICAL: grant failed and refund failed for user ${userId}, item ${item.id}`,
          refundError
        );
      }
      await releaseIfLimited();
      throw grantError;
    }
    if (!granted) {
      const refund = await descoin.credit(userId, price, "shop_refund", {
        itemId: item.id,
        sku: item.sku,
      });
      await releaseIfLimited();
      return { alreadyOwned: true, balance: refund.balance, refunded: true };
    }

    const { error } = await supabase.from("shop_purchases").insert({
      user_id: userId,
      item_id: item.id,
      amount_descoin: price,
      status: "paid",
    });
    // The item is granted and paid; a failed receipt row must not report the purchase
    // as failed (the user would retry and the next call says "already owned").
    if (error) console.error(`[shopPurchase] receipt insert failed for user ${userId}, item ${item.id}:`, error.message);

    return { alreadyOwned: false, balance: debitResult.balance, item, paid: price, limited };
  });
}

module.exports = { purchaseItem };
