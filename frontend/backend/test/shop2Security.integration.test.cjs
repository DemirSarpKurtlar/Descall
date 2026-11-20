"use strict";

/**
 * Market 2.0 security regressions (bug hunt, Nov 2026): equip slots through outfits / undo,
 * old removed frames, night card double use, gift cap races, flip limit races, set pieces that
 * are off sale, refund after the partial-price window was used, completion title after a
 * refund, recall refund unequip, and the mounted admin chain (non-admin, admin without the
 * shop section, step-up).
 * Run: node frontend/backend/test/shop2Security.integration.test.cjs
 */

const assert = require("node:assert/strict");
const { boot, harness, U, I, iso, DAY, skipOpenScheduledNight } = require("./shop2Fixture.cjs");

const { check, finish } = harness("shop2Security.integration.test.cjs");

async function run() {
  const h = await boot();
  const { call, rows, fake } = h;
  const user = (n) => rows("users").find((r) => r.id === U(n));
  const owns = (u, itemId) => rows("user_inventory").some((r) => r.user_id === U(u) && r.item_id === itemId);
  const grant = (u, itemId, via = "purchase") => rows("user_inventory").push({ id: `inv-${u}-${itemId}`, user_id: U(u), item_id: itemId, acquired_via: via, acquired_at: iso(Date.now() - DAY) });

  try {
    await check("outfit apply: an item only goes into its own slot; old removed frames never equip", async () => {
      // Old (pre Market 2.0) frame still sitting in an inventory.
      rows("shop_items").push({ id: I(95), sku: "frame-old-gold", name: "Old frame", category: "avatar_frame", price_descoin: 300, rarity: "rare", active: false, sort_order: 950, created_at: iso(Date.now() - 500 * DAY) });
      grant(3, I(95));
      grant(3, I(17)); // s2 banner (single 0)
      grant(3, I(18)); // s2 avatar frame (single 1)
      const o = await call("/shop2/outfits", { method: "POST", user: 3, body: { name: "Mixed", look: { avatar_frame: I(17), banner: I(17), profile_badge: I(95) } } });
      assert.equal(o.status, 200, JSON.stringify(o.body));
      const a = await call(`/shop2/outfits/${o.body.outfit.id}/apply`, { method: "POST", user: 3, body: {} });
      assert.equal(a.status, 200, JSON.stringify(a.body));
      assert.notEqual(user(3).equipped_avatar_frame_id, I(17), "a banner must not be equipped as a frame");
      assert.equal(user(3).equipped_banner_id, I(17));
      assert.ok(!user(3).equipped_badge_id, "an old frame must not be equipped anywhere");
      const o2 = await call("/shop2/outfits", { method: "POST", user: 3, body: { name: "Old", look: { avatar_frame: I(95) } } });
      await call(`/shop2/outfits/${o2.body.outfit.id}/apply`, { method: "POST", user: 3, body: {} });
      assert.ok(!user(3).equipped_avatar_frame_id, "old removed frame stays removed");
      const o3 = await call("/shop2/outfits", { method: "POST", user: 3, body: { name: "New", look: { avatar_frame: I(18) } } });
      await call(`/shop2/outfits/${o3.body.outfit.id}/apply`, { method: "POST", user: 3, body: {} });
      assert.equal(user(3).equipped_avatar_frame_id, I(18), "a Market 2.0 frame equips");
    });

    await check("outfit save: the stored look keeps only known slots with short ids", async () => {
      const junk = { banner: I(17), nope: "x", theme: { $gt: "" }, chat_bubble: "a".repeat(500) };
      for (let i = 0; i < 50; i += 1) junk[`k${i}`] = "y".repeat(100);
      const o = await call("/shop2/outfits", { method: "POST", user: 3, body: { name: "Junk", look: junk } });
      assert.equal(o.status, 200, JSON.stringify(o.body));
      assert.deepEqual(Object.keys(o.body.outfit.look), ["banner"]);
    });

    // Races run against the services directly: with the in-memory fake every HTTP request
    // finishes inside one tick, while a real database yields on every query.
    const gifts = require("../lib/shop2/gifts");
    const night = require("../lib/shop2/night");
    const notOwnedBy5 = () => rows("shop_items").filter((r) => /^s2-single-\d+$/.test(r.sku) && !owns(5, r.id)).map((r) => r.id);
    const settle = (list) => Promise.allSettled(list).then((rs) => rs.map((r) => (r.status === "fulfilled" ? "ok" : r.reason?.code || r.reason?.message)));

    await check("night market: a revealed card is bought or gifted once, even in parallel", async () => {
      await skipOpenScheduledNight(call);
      const open = await call("/admin/shop2/night-markets/open-now", { method: "POST", body: { reason: "Security night", durationHours: 2 } });
      assert.equal(open.status, 200, JSON.stringify(open.body));
      const f = await call("/shop2/night-market/flip", { method: "POST", user: 5, body: { cardIndex: 0 } });
      assert.equal(f.status, 200, JSON.stringify(f.body));
      const before = user(5).descoin_balance;
      const card = f.body.nightMarket.cards[0];
      const out = await settle([night.buy(U(5), 0), gifts.send(U(5), { toUserId: U(2), nightCardIndex: 0 }), gifts.send(U(5), { toUserId: U(1), nightCardIndex: 0 })]);
      assert.equal(out.filter((x) => x === "ok").length, 1, out.join(","));
      assert.ok(out.filter((x) => x !== "ok").every((x) => x === "card_bought"), out.join(","));
      assert.equal(user(5).descoin_balance, before - card.price, "charged once");
      // A failed charge gives the card back.
      const v = (await call("/shop2/night-market", { user: 5 })).body;
      assert.equal(v.cards[0].bought, true);
    });

    await check("night market: parallel flips never exceed the flip allowance", async () => {
      const out = await settle([0, 1, 2, 3, 4, 5].map((i) => night.flip(U(2), i)));
      const v = (await call("/shop2/night-market", { user: 2 })).body;
      assert.ok(v.flips.used <= v.flips.total, `used ${v.flips.used} of ${v.flips.total}`);
      assert.equal(out.filter((x) => x === "ok").length, v.flips.used, out.join(","));
      assert.equal(rows("shop2_night_flips").filter((x) => x.user_id === U(2)).length, v.flips.used);
    });

    await check("gifts: parallel sends cannot pass the daily cap", async () => {
      const lim = await call("/admin/shop2/limits", { method: "PUT", body: { reason: "Security test caps", limits: { gifts: { perDay: 3, perRecipientDay: 20, receivePerDay: 20 } } } });
      assert.equal(lim.status, 200, JSON.stringify(lim.body));
      const before = user(2).descoin_balance;
      const out = await settle(notOwnedBy5().slice(0, 6).map((id) => gifts.send(U(2), { toUserId: U(5), itemId: id })));
      assert.equal(out.filter((x) => x === "ok").length, 3, out.join(","));
      assert.ok(out.filter((x) => x !== "ok").every((x) => x === "gift_daily_cap"), out.join(","));
      const paid = rows("shop2_gifts").filter((g) => g.from_user === U(2) && g.status !== "blocked").reduce((a, g) => a + g.amount, 0);
      assert.equal(user(2).descoin_balance, before - paid);
    });

    await check("gifts: one idempotency key sent twice in parallel charges once", async () => {
      const before = user(1).descoin_balance;
      const key = "gift-idem-key-0001";
      const itemId = notOwnedBy5().pop();
      const out = await Promise.all([1, 2].map(() => gifts.send(U(1), { toUserId: U(5), itemId, idempotencyKey: key })));
      assert.equal(rows("shop2_gifts").filter((g) => g.from_user === U(1) && g.idempotency_key === key).length, 1);
      assert.equal(out.filter((r) => r.duplicate).length, 1);
      assert.equal(user(1).descoin_balance, before - Number(out[0].gift.amount));
      const http = await call("/shop2/gifts", { method: "POST", user: 1, body: { toUserId: U(5), itemId }, headers: { "Idempotency-Key": key } });
      assert.equal(http.status, 200);
      assert.equal(http.body.duplicate, true);
    });

    await check("sets: a piece taken off sale is never sold or gifted with its set", async () => {
      // User 5 bought a random night card above (the deck depends on the night id, a fresh
      // UUID each run), which is now and then a piece of this set: take off sale a piece
      // neither buyer owns yet, so "not granted" tests the set purchase and nothing else.
      const off = rows("shop_items")
        .filter((r) => r.set_key === "bakir-kervan" && r.active !== false)
        .sort((a, b) => a.sort_order - b.sort_order)
        .find((r) => !owns(5, r.id) && !owns(3, r.id));
      assert.ok(off, "a bakir-kervan piece neither buyer owns");
      off.active = false;
      require("../lib/shop2/catalog").invalidate();
      try {
        const d = (await call("/shop2/sets/bakir-kervan", { user: 5 })).body;
        assert.ok(!(d.pieces || []).some((p) => p.item && p.item.id === off.id), "off-sale piece not offered");
        const r = await call("/shop2/sets/bakir-kervan/buy", { method: "POST", user: 5, body: { all: true, holdToken: "hold-sec-set-0001" } });
        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.ok(!r.body.itemIds.includes(off.id));
        assert.ok(!owns(5, off.id), "off-sale piece not granted");
        const piece = await call("/shop2/sets/bakir-kervan/buy", { method: "POST", user: 3, body: { pieceIds: [off.id], holdToken: "hold-sec-set-0002" } });
        assert.notEqual(piece.status, 200);
        assert.ok(!owns(3, off.id));
      } finally {
        // Back on sale even when an assertion failed, so later checks see the real catalog.
        off.active = true;
        require("../lib/shop2/catalog").invalidate();
      }
    });

    await check("refund: the piece that opened the partial price cannot be refunded once the window was used", async () => {
      const pieces = rows("shop_items").filter((r) => r.set_key === "gece-limani").sort((a, b) => a.sort_order - b.sort_order);
      const first = await call(`/shop2/items/${pieces[0].id}/buy`, { method: "POST", user: 2, body: {} });
      assert.equal(first.status, 200, JSON.stringify(first.body));
      assert.ok(first.body.partialPriceUntil);
      const rest = await call("/shop2/sets/gece-limani/buy", { method: "POST", user: 2, body: { pieceIds: pieces.slice(1, 7).map((p) => p.id), holdToken: "hold-sec-lock-0001" } });
      assert.equal(rest.status, 200, JSON.stringify(rest.body));
      assert.equal(rest.body.mode, "partial");
      const back = await call(`/shop2/purchases/${first.body.purchaseId}/refund`, { method: "POST", user: 2, body: {} });
      assert.equal(back.status, 409, JSON.stringify(back.body));
      assert.equal(back.body.code, "refund_window_closed");
      assert.ok(owns(2, pieces[0].id));
    });

    await check("refund: a refunded set loses its completion title", async () => {
      const r = await call("/shop2/sets/gece-limani/buy", { method: "POST", user: 3, body: { all: true, holdToken: "hold-sec-title-0001" } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.ok(r.body.completed.some((c) => c.setKey === "gece-limani"));
      const back = await call(`/shop2/purchases/${r.body.purchaseId}/refund`, { method: "POST", user: 3, body: {} });
      assert.equal(back.status, 200, JSON.stringify(back.body));
      assert.ok(!rows("shop2_set_completions").some((c) => c.user_id === U(3) && c.set_key === "gece-limani"), "completion removed");
    });

    await check("refund: an item equipped meanwhile is taken off when the refund removes it", async () => {
      const it = I(26); // single 9 (name_effect)
      rows("shop_items").find((x) => x.id === it).direct_sale = true; // singles off the storefront need direct_sale
      const r = await call(`/shop2/items/${it}/buy`, { method: "POST", user: 3, body: {} });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      // The refund passed its equipped check, then an equip landed before the delete.
      const purchases = require("../lib/shop2/purchases");
      const people = require("../lib/shop2/people");
      const real = people.equippedSnapshot;
      let calls = 0;
      people.equippedSnapshot = async (uid) => {
        const snap = await real(uid);
        calls += 1;
        if (calls === 1) {
          user(3).equipped_name_effect_id = it;
          return { ...snap, name_effect: null };
        }
        return snap;
      };
      try {
        await purchases.refund(U(3), r.body.purchaseId);
      } finally {
        people.equippedSnapshot = real;
      }
      assert.ok(!owns(3, it));
      assert.ok(!user(3).equipped_name_effect_id, "no longer owned, no longer equipped");
    });

    await check("recall with refund unequips only the refunded piece, not another item of that slot", async () => {
      const key = "bakir-kervan";
      const banner = rows("shop_items").find((r) => r.sku === `s2-banner-${key}`);
      const r = await call(`/shop2/items/${banner.id}/buy`, { method: "POST", user: 4, body: {} });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      grant(4, I(17));
      user(4).equipped_banner_id = I(17);
      const rc = await call(`/admin/shop2/sets/${key}/recall`, { method: "POST", body: { reason: "Security recall", option: "refund" } });
      assert.equal(rc.status, 200, JSON.stringify(rc.body));
      await require("../lib/shop2/admin").finalizeRecall(key);
      assert.ok(!owns(4, banner.id));
      assert.equal(user(4).equipped_banner_id, I(17), "the other banner stays on");
    });

    await check("mounted admin router: 403 for non-admins and for admins without the shop section; step-up for writes", async () => {
      rows("users").push({ id: U(10), active_sessions: [{ id: "s10" }], username: "modonly", is_admin: true, admin_permissions: ["people"], created_at: iso(Date.now() - 300 * DAY) });
      rows("users").push({ id: U(11), active_sessions: [{ id: "s11" }], username: "shopadmin", is_admin: true, admin_permissions: ["shop"], created_at: iso(Date.now() - 300 * DAY) });
      rows("users").push({ id: U(12), active_sessions: [{ id: "s12" }], username: "shopadmin2fa", is_admin: true, admin_permissions: ["shop"], totp_enabled_at: iso(Date.now() - DAY), totp_secret_enc: "enc", created_at: iso(Date.now() - 300 * DAY) });
      const express = require("express");
      const app = express();
      app.use(express.json());
      app.use("/api/admin/shop2", require("../routes/adminShop2"));
      const srv = require("http").createServer(app);
      await new Promise((r) => srv.listen(0, r));
      const { signToken, signStepUpToken } = require("../config/jwt");
      const at = (n) => ({ Authorization: `Bearer ${signToken({ id: U(n), username: `u${n}`, sid: `s${n}` })}`, "Content-Type": "application/json" });
      const base = `http://127.0.0.1:${srv.address().port}/api/admin/shop2`;
      const req = (path, n, init = {}) => fetch(base + path, { ...init, headers: { ...at(n), ...(init.headers || {}) } });
      try {
        assert.equal((await req("/dashboard", 1)).status, 403);
        assert.equal((await req("/limits", 1, { method: "PUT", body: JSON.stringify({ reason: "x x x" }) })).status, 403);
        const g = await req("/dashboard", 10);
        assert.equal(g.status, 403);
        assert.equal((await g.json()).code, "ADMIN_PERMISSION_DENIED");
        for (const [method, path] of [["POST", "/sets"], ["PUT", "/limits"], ["POST", "/gifts/freeze"], ["POST", `/users/${U(1)}/storefront/regenerate`], ["DELETE", "/timeline/events/x"]]) {
          const w = await req(path, 10, { method, body: JSON.stringify({ reason: "nope nope" }) });
          assert.equal(w.status, 403, `${method} ${path}`);
          assert.equal((await w.json()).code, "ADMIN_PERMISSION_DENIED", `${method} ${path}`);
        }
        assert.equal((await req("/dashboard", 11)).status, 200);
        const flag = await req("/gifts/flags/x/resolve", 11, { method: "POST", body: JSON.stringify({ action: "freeze", reason: "abc abc" }) });
        assert.equal(flag.status, 403, "wallet freezes also need the casino section");
        const noCode = await req("/limits", 12, { method: "PUT", body: JSON.stringify({ reason: "need a code" }) });
        assert.equal(noCode.status, 403);
        assert.equal((await noCode.json()).code, "STEP_UP_REQUIRED");
        const sim = await req("/rules/simulate", 12, { method: "POST", body: JSON.stringify({}) });
        assert.equal(sim.status, 200, "simulate is a read");
        const tok = signStepUpToken({ id: U(12), sid: "s12" });
        const withCode = await req("/timeline/events", 12, { method: "POST", headers: { "X-Admin-Step-Up": tok }, body: JSON.stringify({ title: "Kampanya", startsAt: iso(Date.now() + DAY) }) });
        assert.equal(withCode.status, 200);
        const otherSession = signStepUpToken({ id: U(12), sid: "other" });
        assert.equal((await req("/timeline/events", 12, { method: "POST", headers: { "X-Admin-Step-Up": otherSession }, body: JSON.stringify({ title: "x", startsAt: iso(Date.now() + DAY) }) })).status, 403);
      } finally {
        srv.close();
      }
    });

    await check("user routes: another user's purchase, gift, outfit and action are not found", async () => {
      const free = rows("shop_items").find((r) => /^s2-single-\d+$/.test(r.sku) && !owns(5, r.id) && r.id !== I(28));
      free.direct_sale = true;
      const mine = await call(`/shop2/items/${free.id}/buy`, { method: "POST", user: 5, body: {} });
      assert.equal(mine.status, 200, JSON.stringify(mine.body));
      assert.equal((await call(`/shop2/purchases/${mine.body.purchaseId}/refund`, { method: "POST", user: 3, body: {} })).status, 404);
      const g = rows("shop2_gifts").find((x) => x.status === "delivered" && x.to_user !== U(3) && x.from_user !== U(3));
      assert.ok(g);
      assert.equal((await call(`/shop2/gifts/${g.id}/open`, { method: "POST", user: 3, body: {} })).status, 404);
      assert.equal((await call(`/shop2/gifts/${g.id}/recall`, { method: "POST", user: 3, body: {} })).status, 404);
      assert.equal((await call(`/shop2/gifts/${g.id}/thank`, { method: "POST", user: 3, body: {} })).status, 404);
      const o = rows("shop2_outfits").find((x) => x.user_id !== U(5));
      assert.equal((await call(`/shop2/outfits/${o.id}/apply`, { method: "POST", user: 5, body: {} })).status, 404);
      assert.equal((await call(`/shop2/outfits/${o.id}`, { method: "DELETE", user: 5 })).status, 404);
      const act = rows("shop2_actions").find((x) => x.user_id === U(5) && x.undo);
      assert.equal((await call(`/shop2/history/${act.id}/undo`, { method: "POST", user: 3, body: {} })).status, 404);
    });

    await check("scheduler on two instances: the 00:00 reset is announced once", async () => {
      const path = require.resolve("../lib/shop2/scheduler");
      delete require.cache[path];
      const a = require("../lib/shop2/scheduler");
      delete require.cache[path];
      const b = require("../lib/shop2/scheduler");
      assert.notEqual(a, b);
      const t0 = Date.now() + 5 * DAY;
      await a.tick({ now: t0 });
      await b.tick({ now: t0 });
      const count = () => h.emitted.filter((e) => e.to === "all" && e.ev === "shop2:storefront" && e.p.reason === "daily").length;
      const before = count();
      const ra = await a.tick({ now: t0 + DAY });
      const rb = await b.tick({ now: t0 + DAY });
      assert.equal(count() - before, 1, "one announcement");
      assert.equal(Number(ra.daily) + Number(rb.daily), 1);
    });

    await check("catalog payload: a recipe item (data:,) gets no image URL that would 404", async () => {
      const catalog = require("../lib/shop2/catalog");
      const it = catalog.toPoolItem({ id: "x1", sku: "s2-chat_bubble-x", category: "chat_bubble", asset_url: "data:,", price_descoin: 300 });
      assert.equal(catalog.publicItem(it, "http://h").asset_url, null);
      const img = catalog.toPoolItem({ id: "x2", sku: "s2-banner-x", category: "banner", asset_url: "data:image/svg+xml;utf8,<svg/>", price_descoin: 300 });
      assert.match(catalog.publicItem(img, "http://h").asset_url, /^http:\/\/h\/api\/shop2\/assets\/x2\?v=/);
    });

    await check("price tampering: expectedPrice, negative and huge values never lower the price", async () => {
      const before = user(5).descoin_balance;
      const pick = rows("shop_items").find((r) => /^s2-single-\d+$/.test(r.sku) && !owns(5, r.id));
      pick.direct_sale = true;
      const r = await call(`/shop2/items/${pick.id}/buy`, { method: "POST", user: 5, body: { expectedPrice: -5000 } });
      assert.equal(r.status, 409);
      assert.equal(r.body.code, "price_changed");
      const r2 = await call(`/shop2/items/${pick.id}/buy`, { method: "POST", user: 5, body: { expectedPrice: 1e12, quantity: -3, price: 1 } });
      assert.equal(r2.status, 200, JSON.stringify(r2.body));
      const listed = rows("shop_items").find((x) => x.id === pick.id).price_descoin;
      assert.equal(r2.body.paid, listed);
      assert.equal(user(5).descoin_balance, before - listed);
    });
  } finally {
    h.close();
  }
  void fake;
}

run().then(finish, (err) => {
  console.error(err);
  process.exit(1);
});
