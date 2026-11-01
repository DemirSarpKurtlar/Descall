"use strict";

/**
 * Character cosmetics purchase flow over real HTTP (routes/world3d.js + cosmeticsService)
 * with the in-memory store (same contract as world_cosmetics_purchase; the SQL itself is
 * tested in test/worldCosmetics.db.test.cjs):
 * admin gate, server prices, needs_purchase, insufficient balance, double submit and
 * idempotency, buying an item already owned, equipping unowned paid items, balance event.
 * Run: node frontend/backend/lib/world3d/cosmeticsService.selftest.cjs
 */

const assert = require("assert");
const http = require("http");
const express = require("express");
const createWorld3dRouter = require("../../routes/world3d");
const { createCosmeticsService } = require("./cosmeticsService");
const { createMemoryStore } = require("./cosmeticsMemoryStore");

const admins = new Set(["rich", "poor", "twin", "owner"]);

async function main() {
  const store = createMemoryStore({ balances: { rich: 1000, poor: 100, twin: 400, owner: 500 }, owned: { owner: ["top_bomber"] }, delayMs: 3 });
  const service = createCosmeticsService({ store });
  const app = express();
  app.use(express.json());
  const events = [];
  app.set("io", { to: (room) => ({ emit: (ev, data) => events.push({ room, ev, data }) }) });
  app.use("/api/world3d", createWorld3dRouter({
    service,
    requireAuth: (req, res, next) => {
      const id = req.get("x-test-user");
      if (!id) return res.status(401).json({ error: "auth" });
      req.user = { id, username: id };
      return next();
    },
    loadAdminRow: async (id) => ({ id, username: id, is_admin: admins.has(id) }),
    saveLimit: { ratePerSec: 0, burst: 14 },
  }));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}/api/world3d`;
  const call = async (user, method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { "content-type": "application/json", ...(user ? { "x-test-user": user } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const look = (over = {}) => ({ v: 1, hair: "hair_swept", top: "top_hoodie", face: "face_classic", acc: [], skin: 0, colors: {}, ...over });

  try {
    // gate
    assert.strictEqual((await call(null, "GET", "/cosmetics")).status, 401);
    assert.strictEqual((await call("mallory", "GET", "/cosmetics")).status, 403, "non-admin: 403");
    assert.strictEqual((await call("mallory", "POST", "/look", { look: look() })).status, 403, "non-admin cannot save");

    // state: server prices, nothing owned, no saved look
    let r = await call("rich", "GET", "/cosmetics");
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.items.find((i) => i.id === "top_varsity").price, 220);
    assert.deepStrictEqual([r.body.owned, r.body.look, r.body.balance], [[], null, 1000]);

    // free look saves straight away
    r = await call("rich", "POST", "/look", { look: look({ hair: "hair_bob", acc: ["acc_glasses"], colors: { hair: 2 } }) });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.purchase, null);
    assert.deepStrictEqual((await call("rich", "GET", "/cosmetics")).body.look.acc, ["acc_glasses"]);

    // invalid looks
    assert.strictEqual((await call("rich", "POST", "/look", { look: { hair: "x" } })).body.code, "invalid_look");
    assert.strictEqual((await call("rich", "POST", "/look", { look: look({ acc: ["acc_cap", "acc_beanie"] }) })).body.code, "invalid_look");

    // equipping unowned paid items without buying: refused, priced by the server
    const paid = look({ top: "top_varsity", acc: ["acc_cap"] });
    r = await call("rich", "POST", "/look", { look: paid });
    assert.strictEqual(r.status, 402);
    assert.strictEqual(r.body.code, "needs_purchase");
    assert.deepStrictEqual(r.body.items, [{ id: "top_varsity", price: 220 }, { id: "acc_cap", price: 90 }]);
    assert.strictEqual(r.body.total, 310);
    assert.strictEqual((await call("rich", "GET", "/cosmetics")).body.look.top, "top_hoodie", "nothing saved");

    // a client that claims a lower total is refused (prices are the server's)
    r = await call("rich", "POST", "/look", { look: paid, purchase: { items: ["top_varsity", "acc_cap"], total: 10, requestId: "req-rich-0001" } });
    assert.deepStrictEqual([r.status, r.body.code, r.body.total], [409, "price_changed", 310]);
    // buying only part of what the look needs is refused
    r = await call("rich", "POST", "/look", { look: paid, purchase: { items: ["acc_cap"], total: 90, requestId: "req-rich-0002" } });
    assert.deepStrictEqual([r.status, r.body.code], [409, "needs_purchase"]);
    assert.strictEqual(await store.balance("rich"), 1000, "no money moved yet");
    assert.strictEqual((await call("rich", "POST", "/look", { look: paid, purchase: { items: ["top_varsity", "acc_cap"], total: 310 } })).body.code, "bad_request_id");

    // purchase + save
    r = await call("rich", "POST", "/look", { look: paid, purchase: { items: ["top_varsity", "acc_cap"], total: 310, requestId: "req-rich-0003" } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.balance, 690);
    assert.deepStrictEqual(r.body.purchase.charged, [{ id: "top_varsity", price: 220 }, { id: "acc_cap", price: 90 }]);
    assert.deepStrictEqual(r.body.owned.sort(), ["acc_cap", "top_varsity"]);
    assert.deepStrictEqual(events.at(-1), { room: "user:rich", ev: "descoin:balance", data: { balance: 690, delta: -310, reason: "shop_purchase" } }, "app balance refreshes");
    assert.strictEqual(store.ledger.filter((l) => l.user_id === "rich").length, 1, "one ledger row");
    assert.strictEqual(store.ledger[0].amount, -310);
    assert.strictEqual(store.ledger[0].reason, "shop_purchase");
    // the same request again (double submit, retry after a lost response): no second charge
    const eventsBefore = events.length;
    r = await call("rich", "POST", "/look", { look: paid, purchase: { items: ["top_varsity", "acc_cap"], total: 310, requestId: "req-rich-0003" } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(await store.balance("rich"), 690);
    assert.strictEqual(store.ledger.filter((l) => l.user_id === "rich").length, 1);
    assert.strictEqual(events.length, eventsBefore, "no balance event for a replay");
    // now owned: saving the look needs no purchase
    assert.strictEqual((await call("rich", "POST", "/look", { look: paid })).status, 200);

    // insufficient balance: nothing charged, nothing owned, nothing saved
    r = await call("poor", "POST", "/look", { look: paid, purchase: { items: ["top_varsity", "acc_cap"], total: 310, requestId: "req-poor-0001" } });
    assert.deepStrictEqual([r.status, r.body.code, r.body.balance, r.body.total], [402, "insufficient", 100, 310]);
    assert.strictEqual(await store.balance("poor"), 100);
    assert.deepStrictEqual([...(await store.loadOwned("poor"))], []);
    assert.strictEqual(await store.loadLook("poor"), null);
    assert.strictEqual(store.ledger.filter((l) => l.user_id === "poor").length, 0);

    // double submit with two different request ids at the same time: charged once
    const twinLook = look({ top: "top_raincoat" });
    const both = await Promise.all([
      call("twin", "POST", "/look", { look: twinLook, purchase: { items: ["top_raincoat"], total: 180, requestId: "req-twin-000a" } }),
      call("twin", "POST", "/look", { look: twinLook, purchase: { items: ["top_raincoat"], total: 180, requestId: "req-twin-000b" } }),
    ]);
    assert.ok(both.every((x) => x.status === 200), JSON.stringify(both.map((x) => x.body)));
    assert.strictEqual(await store.balance("twin"), 220, "400 - 180, once");
    assert.strictEqual(store.ledger.filter((l) => l.user_id === "twin").length, 1);
    assert.strictEqual(both.filter((x) => x.body.purchase.charged.length === 1).length, 1);
    assert.ok(both.some((x) => x.body.purchase.alreadyOwned.includes("top_raincoat")), "the second one found it owned");
    // and the same request id twice at the same time
    const same = await Promise.all([0, 1].map(() => call("twin", "POST", "/look", { look: look({ hair: "hair_fringe" }), purchase: { items: ["hair_fringe"], total: 90, requestId: "req-twin-same" } })));
    assert.ok(same.every((x) => x.status === 200));
    assert.strictEqual(await store.balance("twin"), 130);
    assert.strictEqual(same.filter((x) => x.body.purchase.replayed).length, 1, "one of them is the replay");

    // buying an item already owned: not charged again, the new one is
    r = await call("owner", "POST", "/look", { look: look({ top: "top_bomber", acc: ["acc_backpack"] }), purchase: { items: ["top_bomber", "acc_backpack"], total: 310, requestId: "req-owner-001" } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(r.body.purchase.charged, [{ id: "acc_backpack", price: 160 }]);
    assert.deepStrictEqual(r.body.purchase.alreadyOwned, ["top_bomber"]);
    assert.strictEqual(r.body.balance, 340);
    r = await call("owner", "POST", "/look", { look: look({ top: "top_bomber" }) });
    assert.strictEqual(r.status, 200, "owned item equips without a purchase");

    // frozen wallet
    store.frozen.add("owner");
    r = await call("owner", "POST", "/look", { look: look({ top: "top_vest" }), purchase: { items: ["top_vest"], total: 120, requestId: "req-owner-002" } });
    assert.deepStrictEqual([r.status, r.body.code], [403, "WALLET_FROZEN"]);

    // the socket's loader: owned items only
    assert.deepStrictEqual((await service.loadWearableLook("rich")).acc, ["acc_cap"]);
    assert.strictEqual(await service.loadWearableLook("nobody"), null);

    // rate limit on saves
    let limited = 0;
    for (let i = 0; i < 12; i += 1) if ((await call("rich", "POST", "/look", { look: paid })).status === 429) limited += 1;
    assert.ok(limited > 0, "POST /look is rate limited");
  } finally {
    server.close();
  }
  console.log("cosmeticsService.selftest: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
