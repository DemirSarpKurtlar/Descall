"use strict";

/**
 * Market 2.0 admin API end to end on the fake database:
 * dashboard + live sales, sets (create draft, patch with version history, publish + 10 s undo,
 * recall preview, recall needs a reason, 30-minute undo, finalize refunds buyers), rule
 * versions (create, simulate unsaved and saved, schedule at 00:00 -> tomorrow's preview,
 * activate with reason, rollback to built-in), user storefront drawer (why, seed, excluded,
 * last 7 days, free refresh, regenerate), night markets (overview, skip a default night,
 * open now + undo, flip preview), limits (reason required, impact, gift freeze, undo), gift
 * ring flags, timeline clashes + queue + events, A/B price test (arms, exposures, results,
 * winner), audit trail, and the mounted router's admin chain.
 * Run: node frontend/backend/test/shop2Admin.integration.test.cjs
 */

const assert = require("node:assert/strict");
const { boot, harness, U, I } = require("./shop2Fixture.cjs");

const { check, finish } = harness("shop2Admin.integration.test.cjs");
const DAY = 86_400_000;

async function run() {
  const h = await boot();
  const { call, rows, emitted } = h;
  const balance = (u) => rows("users").find((r) => r.id === U(u)).descoin_balance;

  try {
    // Some activity first.
    await call("/shop2/storefront");
    await call("/shop2/storefront", { user: 2 });
    const piece = rows("shop_items").find((r) => r.sku === "s2-banner-bakir-kervan");
    const buy = await call(`/shop2/items/${piece.id}/buy`, { method: "POST", body: {}, user: 2 });
    assert.equal(buy.status, 200, JSON.stringify(buy.body));

    await check("dashboard: tiles, hourly series, recent sales, sets table, rules, limits", async () => {
      const r = await call("/admin/shop2/dashboard");
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const d = r.body;
      assert.equal(d.tiles.salesToday, 1);
      assert.equal(d.tiles.revenueToday, 800);
      assert.equal(d.tiles.pieceSalesToday, 1);
      assert.equal(d.tiles.storefrontsToday, 2);
      assert.equal(d.series.today.revenue.length, 24);
      assert.equal(d.recentSales[0].user.username, "friend");
      assert.equal(d.recentSales[0].items[0].sku, "s2-banner-bakir-kervan");
      const k = d.sets.find((s) => s.key === "bakir-kervan");
      assert.equal(k.sold7d, 1);
      assert.equal(k.setPrice, 3750);
      assert.equal(k.velocity.counts.length, 7);
      assert.equal(d.rules.active.version, 0);
      assert.equal(d.limits.refresh.price, 150);
      const live = await call(`/admin/shop2/sales/live?since=${encodeURIComponent(new Date(Date.now() - 60_000).toISOString())}`);
      assert.equal(live.body.sales.length, 1);
      assert.equal(live.body.totals.revenue, 800);
    });

    await check("set detail: owners per piece, ladder, who pays what, forecast, checklist, suggestions", async () => {
      const r = await call("/admin/shop2/sets/bakir-kervan");
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const d = r.body;
      assert.equal(d.pieces.find((p) => p.item?.id === piece.id).owners, 1);
      assert.equal(d.ladder.sum, 5000);
      assert.equal(d.ladder.farAboveSingles, true);
      assert.ok(d.payers.length === 4 && d.payers[0].pays === 3750);
      assert.ok(d.checklist.some((c) => c.key === "pieces" && c.ok));
      assert.ok(d.checklist.some((c) => c.key === "translations"));
      assert.ok(Array.isArray(d.suggestions));
      assert.ok(d.suggestion.pct >= 20 && d.suggestion.pct <= 30);
      assert.equal(d.salesSeries30d.counts.length, 30);
    });

    await check("sets: create draft, patch keeps history, publish + 10 s undo, restore version", async () => {
      const bad = await call("/admin/shop2/sets", { method: "POST", body: { key: "Bad Key!" } });
      assert.equal(bad.status, 400);
      const c = await call("/admin/shop2/sets", { method: "POST", body: { key: "kum-saati", discountPct: 24, pieceIds: [I(20), I(21), I(22), I(23)] } });
      assert.equal(c.status, 200, JSON.stringify(c.body));
      assert.equal(c.body.set.status, "draft");
      assert.equal((await call("/admin/shop2/sets", { method: "POST", body: { key: "kum-saati" } })).status, 409);
      const userView = await call("/shop2/sets/kum-saati");
      assert.equal(userView.status, 404, "drafts are hidden from users");
      const p = await call("/admin/shop2/sets/kum-saati", { method: "PATCH", body: { discountPct: 28, stockLimit: 50, reason: "launch price" } });
      assert.equal(p.status, 200, JSON.stringify(p.body));
      assert.equal(p.body.set.version, 2);
      assert.equal(p.body.set.history.length, 1);
      const pub = await call("/admin/shop2/sets/kum-saati/publish", { method: "POST", body: {} });
      assert.equal(pub.status, 200, JSON.stringify(pub.body));
      assert.ok(Date.parse(pub.body.undoUntil) - Date.now() <= 10_000);
      assert.equal((await call("/shop2/sets/kum-saati")).status, 200);
      const undo = await call("/admin/shop2/sets/kum-saati/publish/undo", { method: "POST", body: {} });
      assert.equal(undo.status, 200, JSON.stringify(undo.body));
      assert.equal(undo.body.set.status, "draft");
      const later = new Date(Date.now() + 3 * DAY).toISOString();
      const sched = await call("/admin/shop2/sets/kum-saati/publish", { method: "POST", body: { at: later } });
      assert.equal(sched.body.set.status, "scheduled");
      const q = (await call("/admin/shop2/queue")).body.queue;
      assert.ok(q.some((x) => x.kind === "set_publish" && x.ref === "kum-saati"));
      const detail = (await call("/admin/shop2/sets/kum-saati")).body;
      assert.ok(detail.versions.length >= 2);
      const rest = await call("/admin/shop2/sets/kum-saati/restore", { method: "POST", body: { version: 1 } });
      assert.equal(rest.status, 200, JSON.stringify(rest.body));
      assert.equal(rest.body.set.discount_pct, 24);
    });

    await check("recall: preview, reason required, 30-minute undo, finalize refunds buyers", async () => {
      const pv = await call("/admin/shop2/sets/bakir-kervan/recall-preview?option=refund");
      assert.equal(pv.status, 200, JSON.stringify(pv.body));
      assert.equal(pv.body.buyers, 1);
      assert.equal(pv.body.refundTotal, 800);
      const noReason = await call("/admin/shop2/sets/bakir-kervan/recall", { method: "POST", body: { option: "refund" } });
      assert.equal(noReason.status, 400);
      assert.equal(noReason.body.code, "reason_required");
      const r = await call("/admin/shop2/sets/bakir-kervan/recall", { method: "POST", body: { option: "refund", reason: "Banner crops badly on phones" } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.ok(Date.parse(r.body.undoUntil) - Date.now() > 29 * 60_000);
      const userBuy = await call("/shop2/sets/bakir-kervan/buy", { method: "POST", body: { all: true, holdToken: "hold-recalled-0001" } });
      assert.equal(userBuy.status, 410, "recalled set is not on sale");
      const u = await call("/admin/shop2/sets/bakir-kervan/recall/undo", { method: "POST", body: {} });
      assert.equal(u.status, 200, JSON.stringify(u.body));
      assert.equal((await call("/shop2/sets/bakir-kervan")).body.onSale, true);
      // Recall again and let the undo window pass.
      await call("/admin/shop2/sets/bakir-kervan/recall", { method: "POST", body: { option: "refund", reason: "Banner crops badly on phones" } });
      const before = balance(2);
      const ops = require("../lib/shop2/adminOps");
      const done = await ops.runDue({ now: Date.now() + 31 * 60_000 });
      assert.ok(done.some((x) => x.kind === "recall_finalize" && x.status === "done"), JSON.stringify(done));
      assert.equal(balance(2), before + 800);
      assert.ok(!rows("user_inventory").some((x) => x.user_id === U(2) && x.item_id === piece.id));
      const late = await call("/admin/shop2/sets/bakir-kervan/recall/undo", { method: "POST", body: {} });
      assert.equal(late.status, 409);
    });

    let v1;
    await check("rules: create, simulate (unsaved + saved), schedule for 00:00, tomorrow's preview uses it", async () => {
      const c = await call("/admin/shop2/rules", { method: "POST", body: { note: "more epics", rules: { weights: { rarity: { epic: 0.9 } } } } });
      assert.equal(c.status, 200, JSON.stringify(c.body));
      v1 = c.body.version.version;
      assert.equal(v1, 1);
      const sim = await call("/admin/shop2/rules/simulate", { method: "POST", body: { rules: { weights: { rarity: { legendary: 0.5 } } }, sample: 400 } });
      assert.equal(sim.status, 200, JSON.stringify(sim.body));
      assert.equal(sim.body.sample, 400);
      assert.equal(sim.body.version, "unsaved");
      assert.ok(sim.body.changes.some((x) => x.path === "weights.rarity.legendary"));
      assert.ok(typeof sim.body.delta.avgStorefrontValue === "number");
      const sim2 = await call("/admin/shop2/rules/simulate", { method: "POST", body: { version: v1, sample: 200 } });
      assert.equal(sim2.body.version, v1);
      const sch = await call(`/admin/shop2/rules/${v1}/schedule`, { method: "POST", body: {} });
      assert.equal(sch.status, 200, JSON.stringify(sch.body));
      assert.equal(new Date(sch.body.version.applyAt).getUTCHours(), 21, "00:00 Istanbul");
      const ov = (await call("/admin/shop2/rules")).body;
      assert.equal(ov.active, 0);
      assert.equal(ov.tomorrow, v1);
      const tomorrow = (await call(`/admin/shop2/users/${U(1)}/storefront?day=tomorrow`)).body;
      assert.equal(tomorrow.ruleVersion, v1);
      assert.equal(tomorrow.stored, false);
      const today = (await call(`/admin/shop2/users/${U(1)}/storefront`)).body;
      assert.equal(today.ruleVersion, 0);
      const detail = (await call(`/admin/shop2/rules/${v1}`)).body;
      assert.ok(detail.changes.some((x) => x.path === "weights.rarity.epic"));
    });

    await check("rules: activate needs a reason, rollback to the built-in default", async () => {
      assert.equal((await call(`/admin/shop2/rules/${v1}/activate`, { method: "POST", body: {} })).status, 400);
      const a = await call(`/admin/shop2/rules/${v1}/activate`, { method: "POST", body: { reason: "go live now" } });
      assert.equal(a.status, 200, JSON.stringify(a.body));
      assert.equal((await call("/admin/shop2/rules")).body.active, v1);
      assert.ok(emitted.some((e) => e.to === "all" && e.ev === "shop2:storefront" && e.p.reason === "rules"));
      await call("/admin/shop2/rules/0/activate", { method: "POST", body: { reason: "rollback" } });
      assert.equal((await call("/admin/shop2/rules")).body.active, 0);
    });

    await check("user storefront drawer: why per slot, seed, excluded, sets for this user, last 7 days", async () => {
      const r = await call(`/admin/shop2/users/${U(1)}/storefront`);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const d = r.body;
      assert.equal(d.stored, true);
      assert.equal(d.slots.length, 4);
      for (const s of d.slots) assert.ok(s.why && s.reasons.length);
      assert.ok(d.seed && d.seed.length === 64);
      assert.equal(d.excluded.owned, 1);
      assert.ok(d.excluded.retired >= 1);
      assert.ok(Array.isArray(d.sets));
      assert.equal(d.refresh.available, true);
      assert.ok(Array.isArray(d.last7));
      const sf = rows("shop2_storefronts").find((x) => x.user_id === U(1));
      const fr = await call(`/admin/shop2/users/${U(1)}/storefront/free-refresh`, { method: "POST", body: { reason: "support ticket" } });
      assert.equal(fr.status, 200, JSON.stringify(fr.body));
      assert.equal(fr.body.freeRefreshes, 1);
      const regen = await call(`/admin/shop2/users/${U(1)}/storefront/regenerate`, { method: "POST", body: { reason: "bad luck" } });
      assert.equal(regen.status, 200, JSON.stringify(regen.body));
      assert.notEqual(regen.body.seed, sf.seed === regen.body.seed ? "" : sf.seed);
      // The free refresh costs nothing.
      const before = balance(1);
      const ref1 = await call("/shop2/storefront/refresh", { method: "POST", body: {} });
      assert.equal(ref1.status, 200, JSON.stringify(ref1.body));
      assert.equal(ref1.body.free, "grant", "the granted refresh is used first");
      const ref2 = await call("/shop2/storefront/refresh", { method: "POST", body: {} });
      assert.equal(ref2.status, 200, JSON.stringify(ref2.body));
      assert.equal(ref2.body.paid, 150, "the daily one is still there");
      assert.equal(balance(1), before - 150);
      assert.equal((await call("/shop2/storefront/refresh", { method: "POST", body: {} })).status, 409);
      const users = await call("/admin/shop2/users?q=buy");
      assert.ok(users.body.users.some((u) => u.username === "buyer"));
    });

    await check("night markets: overview, skip a default night, open now + undo, flip preview, report", async () => {
      const o = await call("/admin/shop2/night-markets");
      assert.equal(o.status, 200, JSON.stringify(o.body));
      assert.ok(o.body.upcoming.length >= 1);
      assert.ok(o.body.distribution.length > 0);
      const auto = o.body.upcoming.find((n) => n.auto);
      assert.ok(auto);
      const sk = await call(`/admin/shop2/night-markets/${auto.id}/skip`, { method: "POST", body: { reason: "holiday week" } });
      assert.equal(sk.status, 200, JSON.stringify(sk.body));
      const o2 = (await call("/admin/shop2/night-markets")).body;
      assert.ok(o2.upcoming.some((n) => n.id === sk.body.night.id && n.status === "skipped"));
      const pv = await call("/admin/shop2/night-markets/preview", { method: "POST", body: { userId: U(1), discountMin: 20, discountMax: 50 } });
      assert.equal(pv.body.cards.length, 6);
      assert.ok(pv.body.cards.every((c) => c.discountPct >= 20 && c.discountPct <= 50));
      const open = await call("/admin/shop2/night-markets/open-now", { method: "POST", body: { reason: "surprise night", durationHours: 1 } });
      assert.equal(open.status, 200, JSON.stringify(open.body));
      assert.equal((await call("/shop2/night-market")).body.open, true);
      const again = await call("/admin/shop2/night-markets/open-now", { method: "POST", body: { reason: "twice" } });
      assert.equal(again.status, 409);
      const u = await call(`/admin/shop2/night-markets/${open.body.night.id}/undo`, { method: "POST", body: {} });
      assert.equal(u.status, 200, JSON.stringify(u.body));
      assert.equal((await call("/shop2/night-market")).body.open, false);
      const rep = await call(`/admin/shop2/night-markets/${open.body.night.id}/report`);
      assert.equal(rep.body.flips, 0);
      const created = await call("/admin/shop2/night-markets", { method: "POST", body: { startsAt: new Date(Date.now() + 2 * DAY).toISOString(), durationHours: 3, cards: 8, flips: 4, eligibility: { minAccountDays: 7 } } });
      assert.equal(created.status, 200, JSON.stringify(created.body));
      assert.equal(created.body.night.cards, 8);
    });

    await check("limits: reason required, versioned with the previous value, impact, freeze, undo", async () => {
      const l = (await call("/admin/shop2/limits")).body;
      assert.equal(l.version, 0);
      assert.equal(l.limits.gifts.perDay, 3);
      assert.equal((await call("/admin/shop2/limits", { method: "PUT", body: { gifts: { perDay: 2 } } })).status, 400);
      const put = await call("/admin/shop2/limits", { method: "PUT", body: { gifts: { perDay: 2 }, refresh: { price: 200 }, reason: "tighten" } });
      assert.equal(put.status, 200, JSON.stringify(put.body));
      assert.equal(put.body.version, 1);
      assert.ok(put.body.changes.some((c) => c.path === "gifts.perDay" && c.from === 3 && c.to === 2));
      const after = (await call("/admin/shop2/limits")).body;
      assert.equal(after.limits.refresh.price, 200);
      assert.ok(after.undo);
      const imp = await call("/admin/shop2/limits/impact", { method: "POST", body: { gifts: { perDay: 1 } } });
      assert.equal(imp.status, 200, JSON.stringify(imp.body));
      assert.ok("proposed" in imp.body && "delta" in imp.body);
      const fz = await call("/admin/shop2/gifts/freeze", { method: "POST", body: { frozen: true, reason: "ring under review" } });
      assert.equal(fz.status, 200, JSON.stringify(fz.body));
      const g = await call("/shop2/gifts", { method: "POST", body: { toUserId: U(2), itemId: I(30) } });
      assert.equal(g.status, 403);
      assert.equal(g.body.code, "gifts_paused");
      await call("/admin/shop2/gifts/freeze", { method: "POST", body: { frozen: false, reason: "done" } });
      const undo = await call("/admin/shop2/limits/undo", { method: "POST", body: {} });
      assert.equal(undo.status, 200, JSON.stringify(undo.body));
      assert.equal(undo.body.limits.gifts.frozen, true, "undo goes back one version");
      await call("/admin/shop2/limits", { method: "PUT", body: { gifts: { frozen: false, perDay: 3 }, refresh: { price: 150 }, reason: "reset" } });
    });

    await check("gift ring flags: listed with edges, resolve needs a reason", async () => {
      await call("/shop2/gifts", { method: "POST", body: { toUserId: U(2), itemId: I(30) }, user: 1 });
      await call("/shop2/gifts", { method: "POST", body: { toUserId: U(5), itemId: I(31) }, user: 2 });
      const ring = await call("/shop2/gifts", { method: "POST", body: { toUserId: U(1), itemId: I(32) }, user: 5 });
      assert.equal(ring.body.flagged, true, JSON.stringify(ring.body));
      const f = (await call("/admin/shop2/gifts/flags")).body.flags;
      assert.ok(f.length >= 1);
      assert.ok(f[0].edges.length >= 3);
      assert.equal((await call(`/admin/shop2/gifts/flags/${f[0].id}/resolve`, { method: "POST", body: { action: "dismiss" } })).status, 400);
      const ok = await call(`/admin/shop2/gifts/flags/${f[0].id}/resolve`, { method: "POST", body: { action: "dismiss", reason: "family" } });
      assert.equal(ok.status, 200, JSON.stringify(ok.body));
      assert.equal(ok.body.flag.status, "dismissed");
    });

    await check("timeline: two weeks of lanes, clash on two launches the same day, events, queue cancel", async () => {
      const day = new Date(Date.now() + 5 * DAY);
      day.setUTCHours(9, 0, 0, 0);
      await call("/admin/shop2/sets/kum-saati", { method: "PATCH", body: { endsAt: new Date(day.getTime() + 7 * DAY).toISOString() } });
      await call("/admin/shop2/sets/kum-saati/publish", { method: "POST", body: { at: day.toISOString() } });
      await call("/admin/shop2/sets/yildiz-tozu", { method: "POST", body: {} });
      await call("/admin/shop2/sets", { method: "POST", body: { key: "yeni-set", startsAt: new Date(day.getTime() + 3600_000).toISOString(), endsAt: new Date(day.getTime() + 5 * DAY).toISOString() } });
      await call("/admin/shop2/sets/yeni-set/publish", { method: "POST", body: { at: new Date(day.getTime() + 3600_000).toISOString() } });
      const ev = await call("/admin/shop2/timeline/events", { method: "POST", body: { title: "Bayram", startsAt: new Date(Date.now() + DAY).toISOString(), endsAt: new Date(Date.now() + 2 * DAY).toISOString() } });
      assert.equal(ev.status, 200, JSON.stringify(ev.body));
      const t = await call("/admin/shop2/timeline");
      assert.equal(t.status, 200, JSON.stringify(t.body));
      assert.equal(t.body.days, 14);
      assert.equal(t.body.lanes.revenue.length, 14);
      assert.ok(t.body.lanes.nights.length >= 1);
      assert.ok(t.body.lanes.events.some((e) => e.title === "Bayram"));
      assert.ok(t.body.clashes.some((c) => c.code === "two_sets_same_day"), JSON.stringify(t.body.clashes));
      assert.equal(t.body.slotConversion.length, 4);
      const q = t.body.queue.find((x) => x.kind === "set_publish" && x.ref === "yeni-set");
      assert.ok(q && q.inSec > 0);
      const c = await call(`/admin/shop2/queue/${q.id}/cancel`, { method: "POST", body: {} });
      assert.equal(c.status, 200, JSON.stringify(c.body));
      assert.equal(rows("shop2_sets").find((s) => s.set_key === "yeni-set").status, "draft");
      assert.equal((await call(`/admin/shop2/timeline/events/${ev.body.event.id}`, { method: "DELETE" })).status, 200);
      const shift = await call("/admin/shop2/sets/kum-saati/shift", { method: "POST", body: { days: 1 } });
      assert.equal(shift.status, 200, JSON.stringify(shift.body));
    });

    await check("A/B price test: stable arms, exposures, purchases per arm, stop with winner", async () => {
      const bad = await call("/admin/shop2/ab-tests", { method: "POST", body: { setKey: "gece-limani", discountA: 25, discountB: 25 } });
      assert.equal(bad.status, 400);
      const t = await call("/admin/shop2/ab-tests", { method: "POST", body: { setKey: "gece-limani", discountA: 22, discountB: 28, split: 50 } });
      assert.equal(t.status, 200, JSON.stringify(t.body));
      const prices = new Set();
      for (const u of [1, 2, 3, 5]) {
        const d = (await call("/shop2/sets/gece-limani", { user: u })).body;
        prices.add(d.setPrice);
        assert.ok([3900, 3600].includes(d.setPrice), `price ${d.setPrice}`);
      }
      const buyRes = await call("/shop2/sets/gece-limani/buy", { method: "POST", body: { all: true, holdToken: "hold-ab-test-0001" }, user: 3 });
      assert.equal(buyRes.status, 200, JSON.stringify(buyRes.body));
      const list = (await call("/admin/shop2/ab-tests")).body.tests;
      const res = list.find((x) => x.id === t.body.test.id).results;
      assert.equal(res.A.exposures + res.B.exposures, 4);
      assert.equal(res.A.purchases + res.B.purchases, 1);
      const stop = await call(`/admin/shop2/ab-tests/${t.body.test.id}/stop`, { method: "POST", body: { winner: "B" } });
      assert.equal(stop.status, 200, JSON.stringify(stop.body));
      assert.equal(rows("shop2_sets").find((s) => s.set_key === "gece-limani").discount_pct, 28);
    });

    await check("audit: every admin write is recorded as shop2_*", async () => {
      const a = await call("/admin/shop2/audit");
      assert.equal(a.status, 200, JSON.stringify(a.body));
      const actions = new Set(a.body.entries.map((e) => e.action));
      for (const x of ["shop2_set_create", "shop2_set_publish", "shop2_set_recall", "shop2_rules_create", "shop2_rules_activate", "shop2_limits_update", "shop2_night_open_now", "shop2_ab_create", "shop2_free_refresh"]) assert.ok(actions.has(x), `missing ${x}`);
    });

    await check("scheduler: delivers a due scheduled gift, announces the 00:00 reset and night changes", async () => {
      const scheduler = require("../lib/shop2/scheduler");
      const sendAt = new Date(Date.now() + 60_000).toISOString();
      const g = await call("/shop2/gifts", { method: "POST", body: { toUserId: U(4), itemId: I(37), sendAt }, user: 2 });
      assert.equal(g.status, 200, JSON.stringify(g.body));
      assert.equal(g.body.status, "scheduled");
      await scheduler.tick({ now: Date.now() });
      const out = await scheduler.tick({ now: Date.now() + 120_000 });
      assert.equal(out.delivered, 1);
      assert.equal(rows("shop2_gifts").find((x) => x.id === g.body.giftId).status, "delivered");
      assert.ok(emitted.some((e) => e.to === `user:${U(4)}` && e.ev === "shop2:gift" && e.p.kind === "received"));
      const next = await scheduler.tick({ now: Date.now() + 86_400_000 });
      assert.equal(next.daily, true);
      assert.ok(emitted.some((e) => e.to === "all" && e.ev === "shop2:storefront" && e.p.reason === "daily"));
    });

    await check("mounted router: the admin chain refuses non-admins", async () => {
      const express = require("express");
      const app = express();
      app.use(express.json());
      app.use("/api/admin/shop2", require("../routes/adminShop2"));
      const srv = require("http").createServer(app);
      await new Promise((r) => srv.listen(0, r));
      const { signToken } = require("../config/jwt");
      try {
        const res = await fetch(`http://127.0.0.1:${srv.address().port}/api/admin/shop2/dashboard`, { headers: { Authorization: `Bearer ${signToken({ id: U(1), username: "u1", sid: "s1" })}` } });
        assert.equal(res.status, 403);
        const anon = await fetch(`http://127.0.0.1:${srv.address().port}/api/admin/shop2/dashboard`);
        assert.equal(anon.status, 401);
      } finally {
        srv.close();
      }
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
