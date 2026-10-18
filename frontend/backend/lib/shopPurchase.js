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

async function purchaseItem(userId, item) {
  return descoin.runSerialized(userId, async () => {
    if (await shop.userOwnsItem(userId, item.id)) {
      return { alreadyOwned: true, balance: await descoin.getBalance(userId) };
    }

    const price = Number(item.price_descoin) || 0;
    const debitResult = await descoin.debit(userId, price, "shop_purchase", {
      itemId: item.id,
      sku: item.sku,
    });

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
      throw grantError;
    }
    if (!granted) {
      const refund = await descoin.credit(userId, price, "shop_refund", {
        itemId: item.id,
        sku: item.sku,
      });
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

    return { alreadyOwned: false, balance: debitResult.balance, item };
  });
}

module.exports = { purchaseItem };
