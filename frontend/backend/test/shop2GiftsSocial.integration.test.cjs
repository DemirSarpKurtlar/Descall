"use strict";

/**
 * Market 2.0 gifts and social side (bug hunt, 16 Nov 2026):
 *  - the gift sheet's recipients carry presence (the "Çevrimiçi" filter was always empty);
 *  - a blocked gift quote carries the reason as an API message (shown before "Gönder");
 *  - the action log ("Son işlemlerin") gets names: item, set, recipient (payloads hold ids).
 */

const assert = require("assert");
const { U, I, boot, harness } = require("./shop2Fixture.cjs");

(async () => {
  const { check, finish } = harness("shop2GiftsSocial.integration");
  const env = await boot();
  const { call } = env;
  const { presence } = require("../runtime/sharedState");
  presence.set(U(2), { username: "friend", status: "idle", socketId: "s-2" });
  presence.set(U(4), { username: "newbie", status: "invisible", socketId: "s-4" });

  await check("recipients carry presence; invisible reads as offline", async () => {
    const r = await call(`/shop2/gifts/recipients?itemId=${I(30)}`);
    assert.strictEqual(r.status, 200);
    const by = new Map(r.body.recipients.map((x) => [x.user.id, x.user.status]));
    assert.strictEqual(by.get(U(2)), "idle");
    assert.strictEqual(by.get(U(4)), "offline");
    assert.strictEqual(by.get(U(5)), "offline");
  });

  await check("a blocked quote says why (translatable template + values)", async () => {
    const notFriend = await call("/shop2/gifts/quote", { method: "POST", body: { toUserId: U(3), itemId: I(30) } });
    assert.strictEqual(notFriend.status, 200);
    assert.strictEqual(notFriend.body.ok, false);
    assert.strictEqual(notFriend.body.code, "recipient_not_friend");
    assert.strictEqual(notFriend.body.error, "You can only send gifts to friends.");
    const newbie = await call("/shop2/gifts/quote", { method: "POST", user: 4, body: { toUserId: U(2), itemId: I(30) } });
    assert.strictEqual(newbie.body.code, "gift_new_account");
    assert.ok(/^New accounts can send gifts after \{days, plural/.test(newbie.body.errorKey), newbie.body.errorKey);
    assert.ok(newbie.body.errorVars && Number(newbie.body.errorVars.days) > 0);
    const ok = await call("/shop2/gifts/quote", { method: "POST", body: { toUserId: U(2), itemId: I(30) } });
    assert.strictEqual(ok.body.ok, true);
    assert.strictEqual(ok.body.error, undefined);
  });

  await check("action log entries are named (item, set, recipient)", async () => {
    await call("/shop2/wishlist", { method: "POST", body: { itemId: I(31) } });
    await call("/shop2/wishlist", { method: "POST", body: { setKey: "gece-limani" } });
    const g = await call("/shop2/gifts", { method: "POST", body: { toUserId: U(2), setKey: "bakir-kervan", idempotencyKey: "social-test-1" } });
    assert.strictEqual(g.status, 200, JSON.stringify(g.body));
    const h = await call("/shop2/history?limit=10");
    assert.strictEqual(h.status, 200);
    const gift = h.body.entries.find((e) => e.kind === "gift_send");
    assert.ok(gift, "gift entry");
    assert.strictEqual(gift.setKey, "bakir-kervan");
    assert.ok(gift.setName, "set gift reads as the set");
    assert.strictEqual(gift.item, null);
    assert.strictEqual(gift.to && gift.to.id, U(2));
    const wishSet = h.body.entries.find((e) => e.kind === "wishlist_add" && e.setKey === "gece-limani");
    assert.ok(wishSet && wishSet.setName, "wishlisted set has its name");
    const wishItem = h.body.entries.find((e) => e.kind === "wishlist_add" && e.item);
    assert.strictEqual(wishItem.item.id, I(31));
    assert.ok(wishItem.payload && wishItem.payload.itemId === I(31), "payload unchanged");
  });

  await check("end-of-call featured item is one of today's storefront cards (never a browse-only s2 row)", async () => {
    const sessions = require("../lib/callCoinSessions");
    const sf = await call("/shop2/storefront");
    const slotIds = sf.body.slots.filter((x) => !x.owned).map((x) => String(x.item.id));
    const f = await sessions.loadFeatured(U(1), 30000);
    assert.ok(f, "featured item");
    assert.ok(slotIds.includes(String(f.id)), `${f.id} is a storefront card`);
    assert.strictEqual(f.source, "shop2");
    assert.ok(f.price > 0);
    // Every card owned: no s2 item from "Tüm ürünler" (direct_sale false); none qualifies.
    for (const id of slotIds) env.fake._tables.user_inventory.rows.push({ id: `own-${id}`, user_id: U(1), item_id: id, acquired_via: "purchase", acquired_at: new Date().toISOString() });
    const none = await sessions.loadFeatured(U(1), 30000);
    assert.ok(!none || !String(none.sku || "").startsWith("s2-"), JSON.stringify(none));
  });

  env.close();
  finish();
})();
