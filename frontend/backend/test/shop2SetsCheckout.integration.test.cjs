"use strict";

/**
 * Market 2.0 sets, checkout and inventory (bug hunt, Nov 2026), end to end on the fake database:
 * - the completion title is recorded however the last piece arrives (a single piece through
 *   /items/:id/buy, not only /sets/:key/buy), and the buy answers `completed`;
 * - pieces chosen inside the 7-day partial window cost the list sum at the set rate rounded to
 *   10 once, which is what the client quotes (an expectedPrice of that value is accepted);
 * - the automatic "previous look" kept before "Hepsini kuşan" is an unnamed `previous` outfit,
 *   so it never fills the 30 named looks;
 * - the server member list carries the Market 2.0 frame and badge a member wears.
 * Run: node frontend/backend/test/shop2SetsCheckout.integration.test.cjs
 */

const assert = require("node:assert/strict");
const http = require("http");
const { boot, harness, U } = require("./shop2Fixture.cjs");

const { check, finish } = harness("shop2SetsCheckout.integration.test.cjs");

async function run() {
  const h = await boot();
  const { call, rows } = h;
  const setPieces = (key) => rows("shop_items").filter((r) => r.set_key === key).sort((a, b) => a.sort_order - b.sort_order);
  try {
    await check("last piece bought alone completes the set: completion row, completed in the answer, titleUnlocked", async () => {
      const pieces = setPieces("bakir-kervan");
      const first = await call("/shop2/sets/bakir-kervan/buy", { method: "POST", body: { pieceIds: pieces.slice(0, 7).map((p) => p.id), holdToken: "hold-seven-0001" } });
      assert.equal(first.status, 200, JSON.stringify(first.body));
      assert.deepEqual(first.body.completed, []);
      const last = await call(`/shop2/items/${pieces[7].id}/buy`, { method: "POST", body: { idempotencyKey: "item-last-piece-01" } });
      assert.equal(last.status, 200, JSON.stringify(last.body));
      assert.equal(last.body.completed.length, 1);
      assert.equal(last.body.completed[0].setKey, "bakir-kervan");
      assert.ok(rows("shop2_set_completions").some((r) => r.user_id === U(1) && r.set_key === "bakir-kervan"));
      const detail = await call("/shop2/sets/bakir-kervan");
      assert.equal(detail.body.complete, true);
      assert.equal(detail.body.titleUnlocked, true);
      const list = await call("/shop2/sets");
      assert.equal(list.body.sets.find((s) => s.key === "bakir-kervan").completedTitle, true);
    });

    await check("partial window: chosen pieces cost round10(list x set rate), the client quote passes", async () => {
      const pieces = setPieces("gece-limani");
      const one = await call(`/shop2/items/${pieces[0].id}/buy`, { method: "POST", body: { idempotencyKey: "item-opens-lock-1" } });
      assert.equal(one.status, 200, JSON.stringify(one.body));
      assert.ok(one.body.partialPriceUntil, "a single piece opens the 7-day window");
      const d = (await call("/shop2/sets/gece-limani")).body;
      const chosen = d.pieces.filter((p) => !p.owned).slice(0, 3);
      const list = chosen.reduce((a, p) => a + p.price, 0);
      const quote = Math.round((list * (d.setPrice / d.sum)) / 10) * 10;
      const r = await call("/shop2/sets/gece-limani/buy", { method: "POST", body: { pieceIds: chosen.map((p) => p.item.id), holdToken: "hold-partial-0001", expectedPrice: quote } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.mode, "partial");
      assert.equal(r.body.paid, quote);
      // Each piece row shows that rate too (priceNow), not its list price.
      for (const p of d.pieces.filter((x) => !x.owned)) assert.equal(p.priceNow, Math.round((p.price * (d.setPrice / d.sum)) / 10) * 10);
    });

    await check("automatic previous look: unnamed, kind previous, newest 5, never counts as a named look", async () => {
      for (let i = 0; i < 7; i += 1) {
        const r = await call("/shop2/outfits", { method: "POST", body: { kind: "previous", look: {} } });
        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.equal(r.body.outfit.kind, "previous");
        assert.equal(r.body.outfit.name, null);
      }
      const list = (await call("/shop2/outfits")).body.outfits;
      assert.equal(list.filter((o) => o.kind === "previous").length, 5);
      assert.equal(list.filter((o) => o.kind === "saved").length, 0);
      const named = await call("/shop2/outfits", { method: "POST", body: { name: "Gece", look: {} } });
      assert.equal(named.status, 200);
      assert.equal(named.body.outfit.kind, "saved");
      const noName = await call("/shop2/outfits", { method: "POST", body: { look: {} } });
      assert.equal(noName.status, 400, "a named look still needs a name");
    });

    await check("server member list: the Market 2.0 frame and badge a member wears", async () => {
      const pieces = setPieces("gece-limani");
      const frame = pieces.find((p) => p.category === "avatar_frame");
      const badge = pieces.find((p) => p.category === "profile_badge");
      frame.asset_url = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 132 132'><circle cx='66' cy='66' r='60' fill='none' stroke='%2335d0e0' stroke-width='6'/></svg>";
      const peer = rows("users").find((u) => u.id === U(2));
      peer.equipped_avatar_frame_id = frame.id;
      peer.equipped_badge_id = badge.id;
      h.fake._tables.servers = h.fake._tables.servers || { rows: [] };
      h.fake._tables.server_members = h.fake._tables.server_members || { rows: [] };
      h.fake._tables.servers.rows.push({ id: "srv-1", name: "S", owner_id: U(1) });
      const at = new Date().toISOString();
      h.fake._tables.server_members.rows.push({ server_id: "srv-1", user_id: U(1), joined_at: at }, { server_id: "srv-1", user_id: U(2), joined_at: at });
      const express = require("express");
      const app = express();
      app.use(express.json());
      app.use("/servers", require("../routes/servers"));
      const srv = http.createServer(app);
      await new Promise((r) => srv.listen(0, r));
      try {
        const { signToken } = require("../config/jwt");
        const res = await fetch(`http://127.0.0.1:${srv.address().port}/servers/srv-1/members`, { headers: { Authorization: `Bearer ${signToken({ id: U(1), username: "u1", sid: "s1" })}` } });
        const body = await res.json();
        assert.equal(res.status, 200, JSON.stringify(body));
        const row = body.members.find((m) => m.userId === U(2));
        assert.equal(row.equippedAvatarFrame?.id, frame.id);
        assert.equal(row.equippedAvatarFrame.category, "avatar_frame");
        assert.match(row.equippedAvatarFrame.asset_url, /^\/api\/shop\/assets\//, "lean record, not the inline SVG");
        assert.equal(row.equippedBadge?.id, badge.id);
        assert.equal(body.members.find((m) => m.userId === U(1)).equippedAvatarFrame, null);
      } finally {
        srv.close();
      }
    });
  } finally {
    h.close();
  }
}

run().then(finish, (err) => {
  console.error(err);
  process.exit(1);
});
