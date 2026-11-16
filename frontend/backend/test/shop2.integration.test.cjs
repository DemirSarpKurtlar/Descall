"use strict";

/**
 * Market 2.0 user API end to end on the fake database (migration applied):
 * storefront (4 personal cards, never owned / retired / legacy, stable, lock + paid refresh,
 * free refresh), item purchase (idempotent, atomic debit, receipt, admin sale event), refund
 * window, sets (owned deduction, single piece opens the 7-day partial price, hold token,
 * completion title, equip all + undo), night market (flip, keep limit, buy at the revealed
 * discount), gifts (friends only, caps, new account, scheduled + recall, open, set gift minus
 * recipient's pieces, ring flag, privacy), history + undo, outfits, wishlist.
 * Run: node frontend/backend/test/shop2.integration.test.cjs
 */

const assert = require("node:assert/strict");
const { boot, harness, U, I, PIECES } = require("./shop2Fixture.cjs");

const { check, finish } = harness("shop2.integration.test.cjs");

async function run() {
  const h = await boot();
  const { call, rows, emitted } = h;
  const ledger = (u) => rows("descoin_ledger").filter((r) => r.user_id === U(u));
  const balance = (u) => rows("users").find((r) => r.id === U(u)).descoin_balance;
  const owns = (u, item) => rows("user_inventory").some((r) => r.user_id === U(u) && r.item_id === item);
  const setPieces = (key) => rows("shop_items").filter((r) => r.set_key === key).sort((a, b) => a.sort_order - b.sort_order);
  let sf1;

  try {
    await check("storefront: 4 personal cards, never owned, retired, inactive or legacy; stable on reload", async () => {
      const r = await call("/shop2/storefront");
      assert.equal(r.status, 200, JSON.stringify(r.body));
      sf1 = r.body;
      assert.equal(sf1.slots.length, 4);
      const ids = sf1.slots.map((s) => s.item.id);
      assert.equal(new Set(ids).size, 4);
      for (const id of ids) {
        assert.ok(![I(17), I(90), I(91), I(92)].includes(id), `bad item ${id}`);
        assert.ok(!owns(1, id));
      }
      assert.ok(sf1.slots.some((s) => ["epic", "legendary", "mythic"].includes(s.item.rarity)), "epic floor");
      assert.ok(Date.parse(sf1.resetsAt) > Date.now());
      assert.equal(sf1.refresh.available, true);
      assert.equal(sf1.refresh.price, 150);
      assert.ok(Array.isArray(sf1.featuredSets) && sf1.featuredSets.length >= 1);
      assert.equal(typeof sf1.nightMarket.open, "boolean");
      const again = await call("/shop2/storefront");
      assert.deepEqual(again.body.slots.map((s) => s.item.id), ids);
      assert.equal(rows("shop2_storefronts").length, 1);
    });

    await check("lock: only a card from today's storefront; refresh keeps it, charges 150 once a day", async () => {
      const bad = await call("/shop2/storefront/lock", { method: "POST", body: { itemId: I(25) === sf1.slots[0].item.id ? I(26) : I(25) } });
      if (!sf1.slots.some((s) => s.item.id === I(25))) assert.equal(bad.status, 400);
      const keep = sf1.slots[1].item.id;
      const lock = await call("/shop2/storefront/lock", { method: "POST", body: { itemId: keep } });
      assert.equal(lock.status, 200, JSON.stringify(lock.body));
      assert.equal(lock.body.lock.itemId, keep);
      const before = balance(1);
      const ref = await call("/shop2/storefront/refresh", { method: "POST", body: {}, headers: { "Idempotency-Key": "refresh-key-0001" } });
      assert.equal(ref.status, 200, JSON.stringify(ref.body));
      assert.equal(ref.body.paid, 150);
      assert.equal(balance(1), before - 150);
      const after = ref.body.storefront.slots;
      assert.equal(after[1].item.id, keep, "locked card stays in its slot");
      assert.ok(after[1].locked);
      for (const s of after) if (s.item.id !== keep) assert.ok(!sf1.slots.some((o) => o.item.id === s.item.id), "refresh repeated a card");
      const dup = await call("/shop2/storefront/refresh", { method: "POST", body: {}, headers: { "Idempotency-Key": "refresh-key-0001" } });
      assert.equal(dup.body.duplicate, true);
      assert.equal(balance(1), before - 150, "idempotent");
      const second = await call("/shop2/storefront/refresh", { method: "POST", body: {} });
      assert.equal(second.status, 409);
      assert.equal(second.body.code, "refresh_used");
      const l = ledger(1).filter((x) => x.meta?.shop2 === "refresh");
      assert.equal(l.length, 1);
      assert.equal(l[0].amount, -150);
      assert.ok(emitted.some((e) => e.to === `user:${U(1)}` && e.ev === "shop2:storefront" && e.p.reason === "refresh"));
      sf1 = (await call("/shop2/storefront")).body;
    });

    let bought;
    await check("item purchase: atomic debit, idempotent, receipt, admin sale event, card shows owned", async () => {
      const slot = sf1.slots.find((s) => !s.item.set_key && !s.owned) || sf1.slots[0];
      const item = slot.item;
      const before = balance(1);
      const headers = { "Idempotency-Key": "buy-key-000000001" };
      const [a, b] = await Promise.all([
        call(`/shop2/items/${item.id}/buy`, { method: "POST", body: { expectedPrice: slot.price }, headers }),
        call(`/shop2/items/${item.id}/buy`, { method: "POST", body: { expectedPrice: slot.price }, headers }),
      ]);
      assert.equal(a.status, 200, JSON.stringify(a.body));
      assert.equal(b.status, 200, JSON.stringify(b.body));
      assert.ok(a.body.duplicate !== b.body.duplicate, "one of them is the duplicate");
      const paid = a.body.duplicate ? b.body.paid : a.body.paid;
      assert.equal(balance(1), before - paid);
      assert.equal(rows("user_inventory").filter((r) => r.user_id === U(1) && r.item_id === item.id).length, 1);
      assert.equal(rows("shop_purchases").filter((r) => r.item_id === item.id).length, 1);
      assert.ok(emitted.some((e) => e.to === "admin" && e.ev === "shop2:admin:sale"));
      bought = { item, purchaseId: a.body.purchaseId || b.body.purchaseId, paid };
      const sf = (await call("/shop2/storefront")).body;
      assert.equal(sf.slots.find((s) => s.item.id === item.id).owned, true);
      const again = await call(`/shop2/items/${item.id}/buy`, { method: "POST", body: {} });
      assert.equal(again.status, 409);
      assert.equal(again.body.code, "already_owned");
    });

    await check("purchase guards: retired, legacy, poor wallet, price changed", async () => {
      assert.equal((await call(`/shop2/items/${I(90)}/buy`, { method: "POST", body: {} })).status, 404);
      assert.equal((await call(`/shop2/items/${I(92)}/buy`, { method: "POST", body: {} })).status, 404);
      const poor = await call(`/shop2/items/${I(20)}/buy`, { method: "POST", body: {}, user: 6 });
      assert.equal(poor.status, 402);
      assert.equal(poor.body.code, "insufficient_balance");
      const pc = await call(`/shop2/items/${I(20)}/buy`, { method: "POST", body: { expectedPrice: 1 } });
      assert.equal(pc.status, 409);
      assert.equal(pc.body.code, "price_changed");
      assert.ok(pc.body.price > 1);
    });

    await check("refund: inside 10 minutes, unequipped only, once", async () => {
      const before = balance(1);
      const user = rows("users").find((r) => r.id === U(1));
      const col = { banner: "equipped_banner_id", chat_bubble: "equipped_chat_bubble_id", name_effect: "equipped_name_effect_id", avatar_frame: "equipped_avatar_frame_id", profile_aura: "equipped_profile_aura_id", theme: "equipped_theme_id" }[bought.item.category];
      user[col] = bought.item.id;
      const eq = await call(`/shop2/purchases/${bought.purchaseId}/refund`, { method: "POST", body: {} });
      assert.equal(eq.status, 409);
      assert.equal(eq.body.code, "refund_equipped");
      user[col] = null;
      const r = await call(`/shop2/purchases/${bought.purchaseId}/refund`, { method: "POST", body: {} });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.refunded, bought.paid);
      assert.equal(balance(1), before + bought.paid);
      assert.ok(!owns(1, bought.item.id));
      assert.ok(ledger(1).some((x) => x.reason === "shop_refund" && x.meta?.purchaseId === bought.purchaseId));
      const twice = await call(`/shop2/purchases/${bought.purchaseId}/refund`, { method: "POST", body: {} });
      assert.equal(twice.status, 409);
      const p = rows("shop2_purchases").find((x) => x.id === bought.purchaseId);
      p.status = "paid";
      p.refundable_until = new Date(Date.now() - 1000).toISOString();
      const late = await call(`/shop2/purchases/${bought.purchaseId}/refund`, { method: "POST", body: {} });
      assert.equal(late.status, 409);
      p.status = "refunded";
    });

    const pieces = setPieces("gece-limani");
    await check("set detail: sum, set price 20-30 % lower, owned flags, 30-day history", async () => {
      const r = await call("/shop2/sets/gece-limani");
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.sum, 5000);
      assert.equal(r.body.setPrice, 3750);
      assert.equal(r.body.yourPrice, 3750);
      assert.equal(r.body.pieces.length, 8);
      assert.deepEqual(r.body.pieces.map((p) => p.category), PIECES);
      assert.equal(r.body.priceHistory30d.length, 30);
      assert.equal(r.body.partialPriceUntil, null);
      assert.ok(r.body.name.tr && r.body.name.ru);
      const list = await call("/shop2/sets");
      assert.ok(list.body.sets.some((s) => s.key === "gece-limani" && s.setPrice === 3750));
    });

    await check("set: one piece at full price opens the 7-day partial price for the rest", async () => {
      const piece = pieces[0];
      const before = balance(1);
      const r = await call(`/shop2/items/${piece.id}/buy`, { method: "POST", body: {} });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.paid, 700);
      assert.ok(r.body.partialPriceUntil);
      assert.ok(Date.parse(r.body.partialPriceUntil) - Date.now() > 6.9 * 86_400_000);
      assert.equal(balance(1), before - 700);
      const d = (await call("/shop2/sets/gece-limani")).body;
      assert.equal(d.owned, 1);
      assert.equal(d.yourPrice, 3230, "4300 at the set rate, rounded");
      assert.ok(d.partialPriceUntil);
      const p2 = d.pieces.find((p) => p.item.id === pieces[1].id);
      assert.equal(p2.mode, "partial");
      assert.equal(p2.priceNow, 600, "800 at 75 %");
    });

    await check("set: hold token required, buy all missing at the quote, duplicate safe, title, equip all + undo", async () => {
      const no = await call("/shop2/sets/gece-limani/buy", { method: "POST", body: { all: true } });
      assert.equal(no.status, 400);
      assert.equal(no.body.code, "hold_token_required");
      const user = rows("users").find((r) => r.id === U(1));
      user.equipped_banner_id = I(17);
      const before = balance(1);
      const body = { all: true, holdToken: "hold-token-abc-123", expectedPrice: 3230, equip: "all" };
      const r = await call("/shop2/sets/gece-limani/buy", { method: "POST", body });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.paid, 3230);
      assert.equal(r.body.mode, "set");
      assert.equal(balance(1), before - 3230);
      for (const p of pieces) assert.ok(owns(1, p.id), `missing ${p.sku}`);
      assert.equal(r.body.completed.length, 1);
      assert.equal(r.body.completed[0].setKey, "gece-limani");
      assert.equal(user.equipped_banner_id, pieces[1].id, "equipped the set banner");
      const dup = await call("/shop2/sets/gece-limani/buy", { method: "POST", body });
      assert.equal(dup.body.duplicate, true);
      assert.equal(balance(1), before - 3230);
      assert.equal(ledger(1).filter((x) => x.meta?.setKey === "gece-limani" && x.meta?.shop2 === "set").length, 1);
      const purchase = rows("shop2_purchases").find((p) => p.idempotency_key === "hold-token-abc-123");
      assert.equal(purchase.owned_deducted, 3750 - 3230);
      const hist = (await call("/shop2/history")).body.entries;
      const equip = hist.find((e) => e.kind === "equip");
      assert.ok(equip && equip.undoable);
      const u = await call(`/shop2/history/${equip.id}/undo`, { method: "POST", body: {} });
      assert.equal(u.status, 200, JSON.stringify(u.body));
      assert.equal(user.equipped_banner_id, I(17), "previous look restored");
      assert.ok(rows("shop2_outfits").some((o) => o.user_id === U(1) && o.kind === "previous"));
      const d = (await call("/shop2/sets/gece-limani")).body;
      assert.equal(d.complete, true);
      assert.equal(d.titleUnlocked, true);
      assert.equal(d.ownersCount, 1);
    });

    await check("share my look: owned only, friends only, real DM send path with a look link", async () => {
      const notOwned = await call("/shop2/share", { method: "POST", body: { setKey: "bakir-kervan", toUserIds: [U(2)] } });
      assert.equal(notOwned.status, 403);
      assert.equal(notOwned.body.code, "share_not_owned");
      assert.equal((await call("/shop2/share", { method: "POST", body: { setKey: "gece-limani", toUserIds: [] } })).body.code, "share_no_recipients");
      const r = await call("/shop2/share", { method: "POST", body: { setKey: "gece-limani", toUserIds: [U(2), U(3)], message: "Yeni görünümüm" } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.sent, 1);
      assert.deepEqual(r.body.results.find((x) => x.userId === U(3)), { userId: U(3), ok: false, code: "recipient_not_friend" });
      const dm = rows("dm_messages").find((m) => m.from_user_id === U(1) && m.to_user_id === U(2));
      assert.ok(dm, "DM row written");
      const parsed = require("../lib/shop2/share").parseShareText(dm.content);
      assert.deepEqual(parsed, { kind: "set", ref: "gece-limani", note: "Yeni görünümüm" });
      const item = await call("/shop2/share", { method: "POST", body: { itemId: pieces[0].id, toUserIds: [U(4)] } });
      assert.equal(item.body.sent, 1, JSON.stringify(item.body));
      assert.ok(/\/shop\/look\/item\//.test(item.body.link));
    });

    await check("night market: closed by default, open-now, flip, flips limit, keep limit, buy at discount", async () => {
      const closed = await call("/shop2/night-market/flip", { method: "POST", body: { cardIndex: 0 } });
      if (closed.status !== 200) assert.equal(closed.body.code, "night_closed");
      const open = await call("/admin/shop2/night-markets/open-now", { method: "POST", body: { reason: "Weekend test night", durationHours: 2 } });
      assert.equal(open.status, 200, JSON.stringify(open.body));
      const v = (await call("/shop2/night-market")).body;
      assert.equal(v.open, true);
      assert.equal(v.cards.length, 6);
      assert.ok(v.cards.every((c) => !c.flipped && c.hint));
      const f0 = await call("/shop2/night-market/flip", { method: "POST", body: { cardIndex: 0 } });
      assert.equal(f0.status, 200, JSON.stringify(f0.body));
      const c0 = f0.body.nightMarket.cards[0];
      assert.ok(c0.flipped && c0.item && c0.price < c0.listPrice);
      assert.equal((await call("/shop2/night-market/flip", { method: "POST", body: { cardIndex: 0 } })).body.code, "card_flipped");
      await call("/shop2/night-market/flip", { method: "POST", body: { cardIndex: 1 } });
      await call("/shop2/night-market/flip", { method: "POST", body: { cardIndex: 2 } });
      const fourth = await call("/shop2/night-market/flip", { method: "POST", body: { cardIndex: 3 } });
      assert.equal(fourth.status, 409);
      assert.equal(fourth.body.code, "no_flips_left");
      assert.equal((await call("/shop2/night-market/keep", { method: "POST", body: { cardIndex: 0 } })).status, 200);
      assert.equal((await call("/shop2/night-market/keep", { method: "POST", body: { cardIndex: 1 } })).status, 200);
      const k3 = await call("/shop2/night-market/keep", { method: "POST", body: { cardIndex: 2 } });
      assert.equal(k3.body.code, "keep_limit");
      const before = balance(1);
      const buy = await call("/shop2/night-market/buy", { method: "POST", body: { cardIndex: 0, expectedPrice: c0.price } });
      assert.equal(buy.status, 200, JSON.stringify(buy.body));
      assert.equal(buy.body.paid, c0.price);
      assert.equal(balance(1), before - c0.price);
      assert.ok(owns(1, c0.item.id));
      assert.equal((await call("/shop2/night-market/buy", { method: "POST", body: { cardIndex: 0 } })).body.code, "card_bought");
      const after = (await call("/shop2/night-market")).body;
      assert.equal(after.cards[0].bought, true);
      assert.equal(after.savings, c0.listPrice - c0.price);
      assert.ok(after.log.some((l) => l.kind === "buy"));
    });

    await check("gifts: friends only, new account limit, privacy", async () => {
      const s = await call("/shop2/gifts", { method: "POST", body: { toUserId: U(3), itemId: I(30), message: "hi" } });
      assert.equal(s.status, 403);
      assert.equal(s.body.code, "recipient_not_friend");
      const n = await call("/shop2/gifts", { method: "POST", body: { toUserId: U(2), itemId: I(30) }, user: 4 });
      assert.equal(n.status, 403);
      assert.equal(n.body.code, "gift_new_account");
      assert.ok(n.body.errorKey && n.body.errorVars.days === 7);
      await call("/shop2/gifts/privacy", { method: "PUT", body: { giftPrivacy: "nobody" }, user: 4 });
      const p = await call("/shop2/gifts", { method: "POST", body: { toUserId: U(4), itemId: I(30) } });
      assert.equal(p.body.code, "recipient_no_gifts");
      await call("/shop2/gifts/privacy", { method: "PUT", body: { giftPrivacy: "friends" }, user: 4 });
    });

    let giftId;
    await check("gifts: send pays once, recipient opens and gets the item, sender cannot recall after", async () => {
      const before = balance(1);
      const item = rows("shop_items").find((r) => r.id === I(31));
      const r = await call("/shop2/gifts", { method: "POST", body: { toUserId: U(2), itemId: I(31), message: "Iyi ki dogdun", hidden: true }, headers: { "Idempotency-Key": "gift-key-00000001" } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.status, "delivered");
      assert.equal(balance(1), before - item.price_descoin);
      giftId = r.body.giftId;
      const dup = await call("/shop2/gifts", { method: "POST", body: { toUserId: U(2), itemId: I(31) }, headers: { "Idempotency-Key": "gift-key-00000001" } });
      assert.equal(dup.body.duplicate, true);
      assert.equal(balance(1), before - item.price_descoin);
      assert.ok(emitted.some((e) => e.to === `user:${U(2)}` && e.ev === "shop2:gift"));
      const inbox = (await call("/shop2/gifts", { user: 2 })).body;
      const g = inbox.received.find((x) => x.id === giftId);
      assert.equal(g.canOpen, true);
      assert.equal(g.items.length, 0, "hidden until opened");
      assert.equal(g.amount, undefined, "recipient never sees the price");
      const o = await call(`/shop2/gifts/${giftId}/open`, { method: "POST", body: {}, user: 2 });
      assert.equal(o.status, 200, JSON.stringify(o.body));
      assert.ok(owns(2, I(31)));
      assert.equal(rows("user_inventory").find((x) => x.user_id === U(2) && x.item_id === I(31)).acquired_via, "gift");
      const rc = await call(`/shop2/gifts/${giftId}/recall`, { method: "POST", body: {} });
      assert.equal(rc.status, 409);
      const th = await call(`/shop2/gifts/${giftId}/thank`, { method: "POST", body: {}, user: 2 });
      assert.equal(th.body.status, "thanked");
      const sent = (await call("/shop2/gifts")).body.sent.find((x) => x.id === giftId);
      assert.equal(sent.status, "thanked");
    });

    await check("gifts: scheduled delivery is invisible to the recipient until due; recall refunds", async () => {
      const before = balance(1);
      const sendAt = new Date(Date.now() + 3 * 86_400_000).toISOString();
      const r = await call("/shop2/gifts", { method: "POST", body: { toUserId: U(4), itemId: I(32), sendAt, anonymous: true } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.status, "scheduled");
      const inbox = (await call("/shop2/gifts", { user: 4 })).body;
      assert.ok(!inbox.received.some((x) => x.id === r.body.giftId));
      const open = await call(`/shop2/gifts/${r.body.giftId}/open`, { method: "POST", body: {}, user: 4 });
      assert.equal(open.status, 409);
      const rc = await call(`/shop2/gifts/${r.body.giftId}/recall`, { method: "POST", body: {} });
      assert.equal(rc.status, 200, JSON.stringify(rc.body));
      assert.equal(balance(1), before);
      assert.ok(!owns(4, I(32)));
    });

    await check("gifts: daily cap (3) refuses the 4th (a recalled gift does not count) and records the blocked attempt", async () => {
      const r = await call("/shop2/gifts", { method: "POST", body: { toUserId: U(5), itemId: I(33) } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const r2 = await call("/shop2/gifts", { method: "POST", body: { toUserId: U(4), itemId: I(36) } });
      assert.equal(r2.status, 200, JSON.stringify(r2.body));
      const cap = await call("/shop2/gifts", { method: "POST", body: { toUserId: U(4), itemId: I(34) } });
      assert.equal(cap.status, 403, JSON.stringify(cap.body));
      assert.equal(cap.body.code, "gift_daily_cap");
      assert.ok(rows("shop2_gifts").some((g) => g.status === "blocked" && g.meta.code === "gift_daily_cap"));
    });

    await check("gifts: a set gift deducts the recipient's pieces; a ring of gifts is flagged", async () => {
      const kervan = setPieces("bakir-kervan");
      h.fake._tables.user_inventory.rows.push({ id: "inv-k", user_id: U(5), item_id: kervan[0].id, acquired_via: "purchase", acquired_at: new Date().toISOString() });
      const q = await call("/shop2/gifts/quote", { method: "POST", body: { toUserId: U(5), setKey: "bakir-kervan" }, user: 2 });
      assert.equal(q.body.ok, true, JSON.stringify(q.body));
      assert.equal(q.body.itemIds.length, 7);
      assert.equal(q.body.price, 3230);
      const s = await call("/shop2/gifts", { method: "POST", body: { toUserId: U(5), setKey: "bakir-kervan" }, user: 2 });
      assert.equal(s.status, 200, JSON.stringify(s.body));
      assert.equal(s.body.paid, 3230);
      // 1 -> 2 (earlier), 2 -> 5 (now), 5 -> 1 closes the ring.
      const ring = await call("/shop2/gifts", { method: "POST", body: { toUserId: U(1), itemId: I(35) }, user: 5 });
      assert.equal(ring.status, 200, JSON.stringify(ring.body));
      assert.equal(ring.body.flagged, true);
      assert.ok(rows("shop2_gift_flags").length >= 1);
    });

    await check("gift sheet recipients (owned 1/8, wishlist first) and friend feed", async () => {
      await call("/shop2/wishlist", { method: "POST", body: { setKey: "bakir-kervan" }, user: 4 });
      const r = await call("/shop2/gifts/recipients?setKey=bakir-kervan");
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const list = r.body.recipients;
      assert.deepEqual(new Set(list.map((x) => x.user.username)), new Set(["friend", "newbie", "third"]));
      assert.equal(list[0].user.username, "newbie", "wishlist match comes first");
      const third = list.find((x) => x.user.username === "third");
      assert.equal(third.owned, 1);
      assert.equal(third.total, 8);
      const feed = await call("/shop2/feed", { user: 2 });
      assert.ok(feed.body.entries.some((e) => e.user.username === "buyer" && e.setKey === "gece-limani"));
    });

    await check("history, wishlist and outfits with undo", async () => {
      const w = await call("/shop2/wishlist", { method: "POST", body: { itemId: I(40) } });
      assert.equal(w.status, 200, JSON.stringify(w.body));
      await call("/shop2/wishlist", { method: "POST", body: { setKey: "bakir-kervan" } });
      const list = (await call("/shop2/wishlist")).body;
      assert.ok(list.items.some((x) => x.item.id === I(40)));
      assert.ok(list.sets.some((x) => x.setKey === "bakir-kervan"));
      const hist = (await call("/shop2/history")).body.entries;
      const add = hist.find((e) => e.kind === "wishlist_add" && e.payload.itemId === I(40));
      assert.ok(add.undoable);
      assert.equal((await call(`/shop2/history/${add.id}/undo`, { method: "POST", body: {} })).status, 200);
      assert.ok(!(await call("/shop2/wishlist")).body.items.some((x) => x.item.id === I(40)));
      assert.equal((await call(`/shop2/history/${add.id}/undo`, { method: "POST", body: {} })).status, 409);
      const o = await call("/shop2/outfits", { method: "POST", body: { name: "Gece" } });
      assert.equal(o.status, 200, JSON.stringify(o.body));
      assert.equal((await call("/shop2/outfits", { method: "POST", body: { name: "  " } })).status, 400);
      const outs = (await call("/shop2/outfits")).body.outfits;
      assert.ok(outs.some((x) => x.name === "Gece"));
      assert.equal((await call(`/shop2/outfits/${o.body.outfit.id}/apply`, { method: "POST", body: {} })).status, 200);
      assert.equal((await call(`/shop2/outfits/${o.body.outfit.id}`, { method: "DELETE" })).status, 200);
      const kinds = new Set((await call("/shop2/history")).body.entries.map((e) => e.kind));
      for (const k of ["refresh", "lock", "purchase", "refund", "equip", "gift_send", "gift_recall", "outfit_save"]) assert.ok(kinds.has(k), `history lacks ${k}`);
    });

    await check("assets: inline SVG served publicly with a versioned URL", async () => {
      const d = (await call("/shop2/sets/gece-limani")).body;
      const banner = d.pieces.find((p) => p.category === "banner").item;
      assert.ok(/\/api\/shop2\/assets\//.test(banner.asset_url));
      const path = banner.asset_url.replace(/^https?:\/\/[^/]+\/api/, "");
      const res = await fetch(h.base + path);
      assert.equal(res.status, 200);
      assert.match(res.headers.get("content-type"), /image\/svg\+xml/);
      assert.match(res.headers.get("cache-control"), /immutable/);
      assert.match(await res.text(), /<svg/);
    });
  } finally {
    h.close();
  }
  finish();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
