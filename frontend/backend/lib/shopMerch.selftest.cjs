"use strict";

// Mağaza merchandising rules: node frontend/backend/lib/shopMerch.selftest.cjs
const assert = require("node:assert/strict");
const m = require("./shopMerch");

const NOW = Date.parse("2026-11-14T12:00:00Z");
const iso = (d) => new Date(d).toISOString();
const H = 3_600_000;

// price: item sale window vs campaign, best wins, paid never becomes free
{
  const item = { id: "a", category: "banner", price_descoin: 1200, sale_pct: 30, sale_starts_at: iso(NOW - H), sale_ends_at: iso(NOW + H) };
  assert.deepEqual(m.effectivePricing(item, [], NOW).price, 840);
  assert.equal(m.effectivePricing({ ...item, sale_ends_at: iso(NOW - 1) }, [], NOW).price, 1200, "ended sale");
  assert.equal(m.effectivePricing({ ...item, sale_starts_at: iso(NOW + 1) }, [], NOW).pct, 0, "future sale");
  const camp = { id: "c", kind: "discount", discount_pct: 40, scope: { categories: ["banner"] }, starts_at: iso(NOW - H), ends_at: iso(NOW + H), enabled: true };
  const p = m.effectivePricing(item, [camp], NOW);
  assert.equal(p.price, 720);
  assert.equal(p.source, "campaign");
  assert.equal(p.campaignId, "c");
  assert.equal(m.effectivePricing(item, [{ ...camp, enabled: false }], NOW).source, "item", "draft campaign ignored");
  assert.equal(m.effectivePricing({ ...item, category: "theme" }, [camp], NOW).source, "item", "out of scope");
  assert.equal(m.discounted(5, 95), 1, "never free");
  assert.equal(m.discounted(0, 50), 0);
  assert.equal(m.discounted(9000, 30), 6300);
}

// availability: windows, stock, drops
{
  const base = { id: "b", category: "banner", price_descoin: 100 };
  assert.equal(m.availability(base, [], NOW).state, "live");
  assert.equal(m.availability({ ...base, available_from: iso(NOW + H) }, [], NOW).state, "scheduled");
  assert.equal(m.availability({ ...base, available_until: iso(NOW - H) }, [], NOW).state, "expired");
  const lim = m.availability({ ...base, stock_limit: 500, stock_sold: 312 }, [], NOW);
  assert.equal(lim.stockLeft, 188);
  assert.equal(m.availability({ ...base, stock_limit: 3, stock_sold: 3 }, [], NOW).state, "soldout");
  assert.equal(m.isListed({ state: "soldout" }), true);
  assert.equal(m.isListed({ state: "scheduled" }), false);
  const drop = { id: "d", kind: "drop", scope: { itemIds: ["b"] }, starts_at: iso(NOW + H), ends_at: iso(NOW + 5 * H), enabled: true };
  assert.equal(m.availability(base, [drop], NOW).state, "scheduled", "drop not open yet");
  assert.equal(m.availability(base, [drop], NOW + 2 * H).state, "live");
  assert.equal(m.availability(base, [drop], NOW + 2 * H).endsAt, drop.ends_at);
  assert.equal(m.availability(base, [drop], NOW + 6 * H).state, "expired");
  const f = m.merchFields({ ...base, stock_limit: 10, stock_sold: 4, sale_pct: 50 }, [], NOW);
  assert.deepEqual([f.price_descoin, f.list_price_descoin, f.discount_pct, f.stock_left, f.sold_out], [50, 100, 50, 6, false]);
}

// campaign status
{
  const c = { starts_at: iso(NOW + H), ends_at: iso(NOW + 2 * H), enabled: true };
  assert.equal(m.campaignStatus(c, NOW), "scheduled");
  assert.equal(m.campaignStatus(c, NOW + 1.5 * H), "active");
  assert.equal(m.campaignStatus(c, NOW + 3 * H), "ended");
  assert.equal(m.campaignStatus({ ...c, enabled: false }, NOW + 1.5 * H), "draft");
}

// rotation: Monday 00:00 Istanbul boundary, no repeats while the pool lasts
{
  const mon = Date.parse("2026-11-16T00:00:00+03:00");
  assert.equal(m.weekIndex(mon - 1) + 1, m.weekIndex(mon), "week flips at Monday 00:00 TR");
  assert.equal(m.nextRotationAt(NOW), mon);
  const pool = Array.from({ length: 64 }, (_, i) => `id-${String(i).padStart(2, "0")}`);
  const w0 = m.rotationPick(pool, 8, 100, "s1");
  const seen = new Set(w0.ids);
  for (let w = 101; w < 108; w += 1) for (const id of m.rotationPick(pool, 8, w, "s1").ids) {
    assert.ok(!seen.has(id), "no repeat within 8 weeks");
    seen.add(id);
  }
  assert.equal(seen.size, 64);
  assert.equal(w0.repeatFreeWeeks, 7);
  assert.deepEqual(m.rotationPick(pool, 8, 100, "s1").ids, w0.ids, "deterministic");
}

// sections resolve in admin order, empty dropped, gated by storefront campaigns
{
  const items = [
    { id: "1", category: "banner", rarity: "epic", created_at: iso(NOW - 2 * 86400000), stock_left: 5, available_until: iso(NOW + H) },
    { id: "2", category: "countries", rarity: "common", created_at: iso(NOW - 40 * 86400000), stock_left: null },
    { id: "3", category: "theme", rarity: "legendary", created_at: iso(NOW - 1 * 86400000), stock_left: null, discount_pct: 20, sale_ends_at: iso(NOW + 2 * H) },
  ];
  const sections = [
    { id: "s-new", title: "New", kind: "new", config: { days: 14 }, sort_order: 20, enabled: true },
    { id: "s-man", title: "Picks", kind: "manual", item_ids: ["2", "x", "1"], sort_order: 10, enabled: true },
    { id: "s-cat", title: "Flags", kind: "category", config: { category: "countries" }, sort_order: 30, enabled: true },
    { id: "s-best", title: "Best", kind: "bestsellers", sort_order: 40, enabled: true },
    { id: "s-lim", title: "Limited", kind: "limited", sort_order: 50, enabled: true },
    { id: "s-off", title: "Off", kind: "manual", item_ids: ["1"], sort_order: 1, enabled: false },
    { id: "s-gate", title: "Gate", kind: "manual", item_ids: ["1"], sort_order: 2, enabled: true },
  ];
  const gate = { kind: "storefront", scope: { sectionId: "s-gate" }, starts_at: iso(NOW + H), ends_at: iso(NOW + 2 * H), enabled: true };
  const out = m.resolveSections(sections, items, { now: NOW, salesByItem: new Map([["3", 4]]), campaigns: [gate] });
  assert.deepEqual(out.map((s) => s.id), ["s-man", "s-new", "s-cat", "s-best", "s-lim"]);
  assert.deepEqual(out[0].itemIds, ["2", "1"]);
  assert.deepEqual(out[1].itemIds, ["3", "1"]);
  assert.deepEqual(out[3].itemIds, ["3"]);
  assert.deepEqual(out[4].itemIds, ["1", "3"], "soonest end first");
  const later = m.resolveSections(sections, items, { now: NOW + 1.5 * H, campaigns: [gate] });
  assert.equal(later[0].id, "s-gate", "storefront campaign opens its section");
}

// bulk price
{
  const op = { type: "percent", value: -15, rounding: "50" };
  assert.deepEqual([3500, 2800, 1800].map((p) => m.applyPriceOp(p, op)), [2950, 2400, 1550], "draft numbers");
  assert.equal(m.applyPriceOp(1000, { type: "fixed", value: 750 }), 750);
  assert.equal(m.applyPriceOp(1000, { type: "delta", value: -2000 }), 0);
  assert.equal(m.applyPriceOp(1000, { type: "percent", value: -100 }), null);
  assert.equal(m.applyPriceOp(1000, { type: "nope", value: 1 }), null);
}

// reconciliation fix plans
{
  assert.deepEqual(m.planReconcileFix({ mode: "balance_to_ledger", balance: 8400, ledgerSum: 8900 }), { ok: true, balanceAfter: 8900, ledgerAmount: 0, drift: -500 });
  assert.deepEqual(m.planReconcileFix({ mode: "ledger_to_balance", balance: 8400, ledgerSum: 8900 }), { ok: true, balanceAfter: 8400, ledgerAmount: -500, drift: -500 });
  assert.equal(m.planReconcileFix({ mode: "note", balance: 1, ledgerSum: 2 }).ok, true);
  assert.equal(m.planReconcileFix({ mode: "balance_to_ledger", balance: 5, ledgerSum: 5 }).error, "NO_DRIFT");
  assert.equal(m.planReconcileFix({ mode: "balance_to_ledger", balance: 5, ledgerSum: -5 }).error, "NEGATIVE_LEDGER");
  assert.equal(m.planReconcileFix({ mode: "x", balance: 1, ledgerSum: 2 }).ok, false);
}

// ledger gap
{
  const rows = [
    { amount: -1800, balance_after: 8900, created_at: "c" },
    { amount: 120, balance_after: 10700, created_at: "b" },
    { amount: 50, balance_after: 10580, created_at: "a" },
  ];
  assert.deepEqual(m.ledgerGap(rows, 8400), { kind: "after_last", at: "c", delta: -500 });
  assert.equal(m.ledgerGap(rows, 8900), null, "chain adds up");
  const broken = [{ ...rows[0], balance_after: 8400 }, rows[1], rows[2]];
  assert.deepEqual(m.ledgerGap(broken, 8400), { kind: "between", from: "b", to: "c", delta: -500 });
  assert.equal(m.ledgerGap([{ amount: 10, balance_after: 20 }, { amount: 10, balance_after: 10 }], 20), null);
}

// reconcile schedule: daily at 04:00 Istanbul
{
  const s = { interval_hours: 24, hour_of_day: 4 };
  assert.equal(iso(m.nextReconcileAt(null, s, Date.parse("2026-11-14T02:00:00+03:00"))), iso(Date.parse("2026-11-14T04:00:00+03:00")));
  assert.equal(iso(m.nextReconcileAt(null, s, Date.parse("2026-11-14T05:00:00+03:00"))), iso(Date.parse("2026-11-15T04:00:00+03:00")));
  assert.equal(m.reconcileDue(iso(Date.parse("2026-11-13T04:01:00+03:00")), s, Date.parse("2026-11-14T04:30:00+03:00")), true);
  assert.equal(m.reconcileDue(iso(Date.parse("2026-11-14T04:01:00+03:00")), s, Date.parse("2026-11-14T09:30:00+03:00")), false);
  assert.equal(m.reconcileDue(null, s, NOW), true);
  const six = { interval_hours: 6, hour_of_day: 4 };
  assert.equal(iso(m.nextReconcileAt(null, six, Date.parse("2026-11-14T05:00:00+03:00"))), iso(Date.parse("2026-11-14T10:00:00+03:00")));
}

// payload validation
{
  assert.equal(m.validateCampaign({ name: "x", kind: "discount", startsAt: iso(NOW), endsAt: iso(NOW + H), scope: { all: true } }).error, "pct_required");
  const ok = m.validateCampaign({ name: " Kara Cuma ", kind: "discount", discountPct: 40, startsAt: iso(NOW), endsAt: iso(NOW + H), scope: { all: true } });
  assert.equal(ok.ok, true);
  assert.equal(ok.row.name, "Kara Cuma");
  assert.equal(m.validateCampaign({ name: "x", kind: "drop", startsAt: iso(NOW + H), endsAt: iso(NOW), scope: { all: true } }).error, "bad_window");
  assert.equal(m.validateCampaign({ name: "x", kind: "storefront", startsAt: iso(NOW), endsAt: iso(NOW + H), scope: {} }).error, "section_required");
  assert.equal(m.validateSection({ title: "", kind: "manual" }).error, "title_required");
  assert.equal(m.validateSection({ title: "A", kind: "manual", itemIds: ["bad", "11111111-1111-1111-1111-111111111111"] }).row.item_ids.length, 1);
  assert.equal(m.validateMerchPatch({ stockLimit: -1 }).error, "bad_stock");
  assert.deepEqual(m.validateMerchPatch({ salePct: 120 }).row, { sale_pct: 95 });
  assert.deepEqual(m.validateMerchPatch({ salePct: 0 }).row, { sale_pct: null });
}

console.log("shopMerch.selftest.cjs: ok");
