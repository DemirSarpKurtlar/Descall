// Market 2.0 storefront ("Vitrin") client rules from the bug hunt: the countdown follows the
// server's clock (serverTime skew), a stored card whose item left the catalog is dropped,
// refreshes left count granted ones, the refresh confirm knows what is left after it, the night
// summary carries eligibility, and "when" labels know today / tomorrow / weekday.
// Run: node src/lib/shop2Vitrin.selftest.mjs
import assert from "node:assert/strict";
import { normalizeStorefront, refreshPlan, whenOf } from "./shop2Logic.js";

const item = (id, extra = {}) => ({ id, sku: `s2-${id}`, category: "banner", rarity: "rare", price_descoin: 400, ...extra });

// Clock skew: the device runs 5 minutes behind the server; resetsAt and night times move with it.
{
  const server = Date.parse("2026-11-16T20:50:00Z");
  const client = server - 5 * 60_000;
  const sf = normalizeStorefront({
    day: "2026-11-16",
    serverTime: new Date(server).toISOString(),
    resetsAt: "2026-11-16T21:00:00.000Z",
    slots: [{ slot: 1, item: item("a"), price: 400 }],
    nightMarket: { open: false, nextStartsAt: "2026-11-20T19:00:00.000Z" },
  }, client);
  assert.equal(sf.clockSkew, 5 * 60_000);
  assert.equal(sf.resetsAt - client, 10 * 60_000, "10 minutes left on the device clock too");
  assert.equal(sf.nightMarket.nextOpensAt, Date.parse("2026-11-20T19:00:00Z") - 5 * 60_000);
  // A small difference (network latency) is ignored.
  const near = normalizeStorefront({ serverTime: new Date(server).toISOString(), resetsAt: "2026-11-16T21:00:00.000Z", slots: [] }, server - 800);
  assert.equal(near.clockSkew, 0);
  assert.equal(near.resetsAt, Date.parse("2026-11-16T21:00:00Z"));
}

// A stored card whose item is gone (server sends item: null) is not a card.
{
  const sf = normalizeStorefront({ slots: [{ slot: 1, item: null, price: null }, { slot: 2, item: item("b"), price: 300 }] });
  assert.equal(sf.slots.length, 1);
  assert.equal(sf.slots[0].item.id, "b");
}

// Refreshes left: the daily one + granted; the confirm says what is left after this one.
{
  const fresh = normalizeStorefront({ slots: [], refresh: { available: true, price: 150, used: 0, dailyUsed: 0, perDay: 1, freeGrants: 0, left: 1 } });
  assert.equal(fresh.refresh.left, 1);
  const p1 = refreshPlan(fresh, { balance: 1000 });
  assert.equal(p1.leftAfter, 0);
  assert.equal(p1.free, false);
  const granted = normalizeStorefront({ slots: [], refresh: { available: true, price: 0, free: "grant", used: 1, dailyUsed: 1, perDay: 1, freeGrants: 2, left: 2 } });
  assert.equal(granted.refresh.left, 2);
  assert.equal(granted.refresh.freeKind, "grant");
  const p2 = refreshPlan(granted, { balance: 0 });
  assert.equal(p2.price, 0);
  assert.equal(p2.free, true);
  assert.equal(p2.affordable, true);
  assert.equal(p2.leftAfter, 1);
  // Older server without `left`: daily left (perDay - dailyUsed / used) + grants.
  const old = normalizeStorefront({ slots: [], refresh: { available: true, price: 150, used: 1, perDay: 1, freeGrants: 1 } });
  assert.equal(old.refresh.left, 1);
}

// Night summary: an open night that is not for this account.
{
  const sf = normalizeStorefront({ slots: [], nightMarket: { open: true, eligible: false, startsAt: "2026-11-20T19:00:00Z", endsAt: "2026-11-20T23:00:00Z" } });
  assert.equal(sf.nightMarket.open, true);
  assert.equal(sf.nightMarket.eligible, false);
  assert.equal(normalizeStorefront({ slots: [], nightMarket: { open: true } }).nightMarket.eligible, true);
}

// "When" of a future time on the device calendar.
{
  const now = new Date(2026, 10, 16, 15, 0, 0).getTime(); // Monday 15:00 local
  assert.equal(whenOf(new Date(2026, 10, 16, 22, 0).getTime(), now).kind, "today");
  assert.equal(whenOf(new Date(2026, 10, 17, 0, 30).getTime(), now).kind, "tomorrow");
  const fri = whenOf(new Date(2026, 10, 20, 22, 0).getTime(), now);
  assert.equal(fri.kind, "day");
  assert.equal(fri.days, 4);
  assert.equal(whenOf(new Date(2026, 10, 30, 22, 0).getTime(), now).kind, "date");
  assert.equal(whenOf(null, now), null);
}

console.log("shop2Vitrin.selftest: ok");
