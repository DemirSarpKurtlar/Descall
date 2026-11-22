"use strict";

/**
 * Inventory "Stüdyo" endpoints: POST /look (several slots in one request, take-off, owned only,
 * own slot only, unchanged, undo through the action log, "Geri dön"), GET /equip-history (per-slot
 * from / to, single equips from /api/shop/equip included) and PATCH /outfits/:id (rename, pin,
 * the automatic look kept as a named one, other users' looks untouched).
 * Run: node frontend/backend/test/shop2Looks.integration.test.cjs
 */

const assert = require("node:assert/strict");
const { boot, harness, U, I, iso, DAY } = require("./shop2Fixture.cjs");

const { check, finish } = harness("shop2Looks.integration.test.cjs");

async function run() {
  const h = await boot();
  const { call, rows } = h;
  const user = (n) => rows("users").find((r) => r.id === U(n));
  const grant = (u, itemId, via = "purchase") => rows("user_inventory").push({ id: `inv-${u}-${itemId}`, user_id: U(u), item_id: itemId, acquired_via: via, acquired_at: iso(Date.now() - DAY) });
  // Buyer (1) owns the gece-limani frame, banner, bubble and the bakir-kervan frame.
  for (const id of [I(1), I(2), I(6), I(9)]) grant(1, id);

  try {
    await check("POST /look wears several owned slots in one request and logs one undoable action", async () => {
      const r = await call("/shop2/look", { method: "POST", body: { look: { avatar_frame: I(1), banner: I(2), chat_bubble: I(6) }, source: "inventory" } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.deepEqual(r.body.applied, { avatar_frame: I(1), banner: I(2), chat_bubble: I(6) });
      assert.equal(user(1).equipped_avatar_frame_id, I(1));
      assert.equal(user(1).equipped_banner_id, I(2));
      assert.equal(user(1).equipped_chat_bubble_id, I(6));
      const acts = rows("shop2_actions").filter((a) => a.user_id === U(1) && a.kind === "look_apply");
      assert.equal(acts.length, 1);
      assert.deepEqual(acts[0].payload.before, { avatar_frame: null, banner: null, chat_bubble: null });
      assert.ok(r.body.previousOutfitId, "several slots keep the previous look");
    });

    await check("POST /look: take off with null, unchanged slots skipped, other slots left alone", async () => {
      const r = await call("/shop2/look", { method: "POST", body: { look: { avatar_frame: I(9), chat_bubble: null, banner: I(2) } } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.deepEqual(r.body.applied, { avatar_frame: I(9), chat_bubble: null });
      assert.deepEqual(r.body.before, { avatar_frame: I(1), chat_bubble: I(6) });
      assert.equal(user(1).equipped_banner_id, I(2), "banner unchanged");
      assert.ok(!user(1).equipped_chat_bubble_id);
      const same = await call("/shop2/look", { method: "POST", body: { look: { avatar_frame: I(9) } } });
      assert.equal(same.status, 200);
      assert.equal(same.body.unchanged, true);
    });

    await check("POST /look refuses what is not owned, wrong slots and empty looks", async () => {
      const notOwned = await call("/shop2/look", { method: "POST", body: { look: { avatar_effect: I(5) } } });
      assert.equal(notOwned.status, 409);
      assert.equal(notOwned.body.code, "look_not_owned");
      const wrongSlot = await call("/shop2/look", { method: "POST", body: { look: { profile_badge: I(2) } } });
      assert.equal(wrongSlot.status, 409, "a banner never goes into the badge slot");
      assert.ok(!user(1).equipped_badge_id);
      assert.equal((await call("/shop2/look", { method: "POST", body: { look: {} } })).status, 400);
      assert.equal((await call("/shop2/look", { method: "POST", body: { look: [I(1)] } })).status, 400);
      assert.equal((await call("/shop2/look", { method: "POST", body: { look: { nope: I(1) } } })).status, 400, "unknown slots only");
      // Another user's look is never written.
      assert.ok(!user(2).equipped_avatar_frame_id);
    });

    await check("GET /equip-history lists per-slot from / to, newest first, with single equips", async () => {
      await require("../lib/shop2/looks").logSingle(U(1), "banner", I(2), null);
      const r = await call("/shop2/equip-history");
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const [first, second, third] = r.body.entries;
      assert.equal(first.source, "single");
      assert.deepEqual(first.changes, [{ category: "banner", from: I(2), to: null }]);
      assert.deepEqual(second.changes.find((c) => c.category === "avatar_frame"), { category: "avatar_frame", from: I(1), to: I(9) });
      assert.equal(third.changes.length, 3);
      assert.ok(r.body.items[I(9)], "s2 items come along");
      assert.equal(r.body.total, 3);
      const other = await call("/shop2/equip-history", { user: 2 });
      assert.equal(other.body.entries.length, 0, "only my own history");
    });

    await check("Geri dön: the before items go back through POST /look (source revert)", async () => {
      const hist = (await call("/shop2/equip-history")).body.entries;
      const entry = hist.find((e) => e.changes.some((c) => c.category === "avatar_frame" && c.to === I(9)));
      const look = Object.fromEntries(entry.changes.map((c) => [c.category, c.from]));
      const r = await call("/shop2/look", { method: "POST", body: { look, source: "revert" } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(user(1).equipped_avatar_frame_id, I(1));
      assert.equal(user(1).equipped_chat_bubble_id, I(6));
      assert.equal((await call("/shop2/equip-history")).body.entries[0].source, "revert");
    });

    await check("undo of a look_apply restores only the slots it changed", async () => {
      const a = await call("/shop2/look", { method: "POST", body: { look: { avatar_frame: I(9) } } });
      assert.equal(user(1).equipped_avatar_frame_id, I(9));
      const u = await call(`/shop2/history/${a.body.actionId}/undo`, { method: "POST", body: {} });
      assert.equal(u.status, 200, JSON.stringify(u.body));
      assert.equal(user(1).equipped_avatar_frame_id, I(1));
      assert.equal(user(1).equipped_chat_bubble_id, I(6), "other slots untouched");
    });

    await check("PATCH /outfits/:id renames and pins; the automatic look becomes a named one", async () => {
      const o = await call("/shop2/outfits", { method: "POST", body: { name: "Gece" } });
      const id = o.body.outfit.id;
      let r = await call(`/shop2/outfits/${id}`, { method: "PATCH", body: { name: "  Gece Resifi  " } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.outfit.name, "Gece Resifi");
      r = await call(`/shop2/outfits/${id}`, { method: "PATCH", body: { pinned: true } });
      assert.equal(r.body.outfit.pinned, true);
      assert.equal((await call("/shop2/outfits")).body.outfits.find((x) => x.id === id).pinned, true);
      r = await call(`/shop2/outfits/${id}`, { method: "PATCH", body: { pinned: false } });
      assert.equal(r.body.outfit.pinned, false);
      assert.equal((await call(`/shop2/outfits/${id}`, { method: "PATCH", body: { name: "   " } })).status, 400);
      assert.equal((await call(`/shop2/outfits/${id}`, { method: "PATCH", body: { pinned: "yes" } })).status, 400);
      assert.equal((await call(`/shop2/outfits/${id}`, { method: "PATCH", body: {} })).status, 400);
      assert.equal((await call(`/shop2/outfits/${id}`, { method: "PATCH", user: 2, body: { name: "Hijack" } })).status, 404, "not someone else's look");
      const prev = (await call("/shop2/outfits")).body.outfits.find((x) => x.kind === "previous");
      assert.ok(prev, "an automatic look exists");
      r = await call(`/shop2/outfits/${prev.id}`, { method: "PATCH", body: { name: "Keep" } });
      assert.equal(r.body.outfit.kind, "saved");
      assert.equal((await call(`/shop2/outfits/${id}`, { method: "DELETE" })).status, 200);
      assert.equal((await call(`/shop2/outfits/${id}`, { method: "PATCH", body: { name: "Gone" } })).status, 404);
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
