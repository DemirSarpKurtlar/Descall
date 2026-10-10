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

    const granted = await shop.grantItem(userId, item.id, { acquiredVia: "purchase" });
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
    if (error) throw error;

    return { alreadyOwned: false, balance: debitResult.balance, item };
  });
}

module.exports = { purchaseItem };
