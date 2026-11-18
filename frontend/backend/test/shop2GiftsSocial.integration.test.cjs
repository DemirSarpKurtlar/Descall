"use strict";

/**
 * Market 2.0 gifts and social side (bug hunt, 16 Nov 2026):
 *  - the gift sheet's recipients carry presence (the "Çevrimiçi" filter was always empty);
 *  - a blocked gift quote carries the reason as an API message (shown before "Gönder");
 *  - the action log ("Son işlemlerin") gets names: item, set, recipient (payloads hold ids);
 *  - "deliver on their birthday" was removed: the server refuses it, already scheduled ones still arrive.
 */

const assert = require("assert");
const { U, I, boot, harness } = require("./shop2Fixture.cjs");

(async () => {
  const { check, finish } = harness("shop2GiftsSocial.integration");
  const env = await boot();
  const { call } = env;
  const balance = (u) => env.rows("users").find((r) => r.id === U(u)).descoin_balance;
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

  await check("birthday delivery is refused with a translated reason; nothing is charged", async () => {
    const gifts = env.rows("shop2_gifts").length;
    const before = balance(1);
    const q = await call("/shop2/gifts/quote", { method: "POST", body: { toUserId: U(5), itemId: I(30), delivery: "birthday" } });
    assert.strictEqual(q.status, 200);
    assert.strictEqual(q.body.ok, false);
    assert.strictEqual(q.body.code, "gift_birthday_removed");
    assert.strictEqual(q.body.error, "Birthday delivery is no longer available. Send the gift now or pick a time.");
    const sendAt = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const s = await call("/shop2/gifts", { method: "POST", body: { toUserId: U(5), itemId: I(30), when: "birthday", sendAt, idempotencyKey: "bday-refused-1" } });
    assert.strictEqual(s.status, 400, JSON.stringify(s.body));
    assert.strictEqual(s.body.code, "gift_birthday_removed");
    assert.strictEqual(s.body.error, q.body.error);
    assert.strictEqual(balance(1), before, "no debit");
    assert.strictEqual(env.rows("shop2_gifts").length, gifts, "no gift row, not even a blocked one");
    // "now" and "at" stay valid modes; an unknown mode reads as a bad time.
    const at = await call("/shop2/gifts/quote", { method: "POST", body: { toUserId: U(5), itemId: I(30), delivery: "at", sendAt } });
    assert.strictEqual(at.body.ok, true, JSON.stringify(at.body));
    const odd = await call("/shop2/gifts/quote", { method: "POST", body: { toUserId: U(5), itemId: I(30), delivery: "someday" } });
    assert.strictEqual(odd.body.code, "gift_bad_time");
  });

  await check("a gift already scheduled for a birthday is still delivered and can be opened", async () => {
    // Birthday gifts were stored as plain scheduled rows (send_at = the birthday), so one
    // made before the removal looks exactly like this.
    const before = balance(1);
    const sendAt = new Date(Date.now() + 3_600_000).toISOString();
    const s = await call("/shop2/gifts", { method: "POST", body: { toUserId: U(5), itemId: I(30), sendAt, idempotencyKey: "bday-legacy-1" } });
    assert.strictEqual(s.status, 200, JSON.stringify(s.body));
    assert.strictEqual(s.body.status, "scheduled");
    assert.strictEqual(balance(1), before - s.body.paid, "paid once, at send time");
    const delivered = await require("../lib/shop2/gifts").deliverDue({ now: Date.now() + 2 * 3_600_000 });
    assert.strictEqual(delivered, 1);
    const row = env.rows("shop2_gifts").find((g) => g.id === s.body.giftId);
    assert.strictEqual(row.status, "delivered");
    const o = await call(`/shop2/gifts/${s.body.giftId}/open`, { method: "POST", user: 5, body: {} });
    assert.strictEqual(o.status, 200, JSON.stringify(o.body));
    assert.ok(env.rows("user_inventory").some((r) => r.user_id === U(5) && r.item_id === I(30)), "the friend got the item");
    assert.strictEqual(balance(1), before - s.body.paid, "no second debit, no refund");
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
