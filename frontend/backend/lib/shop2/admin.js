"use strict";

/**
 * Market 2.0 admin services (routes/adminShop2.js): dashboard + live sales, sets (CRUD,
 * schedule, stock, publish with undo, recall with 30-minute undo), user storefront preview with
 * "why", A/B price tests, set builder helpers (owners per piece, price ladder, who pays what,
 * forecast, palette match, pre-publish checklist). Rule versions, night markets, limits and
 * the timeline are in lib/shop2/adminOps.js.
 */

const db = require("./db");
const time = require("./time");
const catalog = require("./catalog");
const config = require("./config");
const people = require("./people");
const events = require("./events");
const sets = require("./sets");
const pricing = require("./pricing");
const { setLifecycle } = require("./timeline");
const { paletteScore, colorsIn } = require("./simulate");
const { SET_PIECE_CATEGORIES, SET_KEY_RE, THEME_BY_KEY } = require("./themes");
const { shopError } = require("./storefrontService");
const descoin = require("../descoin");
const shop = require("../shop");

const RECALL_UNDO_MS = 30 * time.MIN_MS;
const PUBLISH_UNDO_MS = 10_000;
const LOCALES = ["tr", "en", "de", "es", "fr", "pt-BR", "ru"];

function bad(code, status = 400) {
  return shopError(code, status);
}

async function paidPurchases(sinceMs, untilMs = null) {
  await db.ready();
  let q = db.from("shop2_purchases").select("*").gte("created_at", new Date(sinceMs).toISOString());
  if (untilMs != null) q = q.lt("created_at", new Date(untilMs).toISOString());
  return db.rows(q).catch(() => []);
}

/* ---------------------------------------------------------------- dashboard */

function hourSeries(list, dayStart) {
  const rev = new Array(24).fill(0);
  const n = new Array(24).fill(0);
  for (const p of list) {
    if (p.status === "refunded") continue;
    const h = Math.floor((time.ms(p.created_at) - dayStart) / time.HOUR_MS);
    if (h < 0 || h > 23) continue;
    rev[h] += Number(p.amount) || 0;
    n[h] += 1;
  }
  return { revenue: rev, count: n };
}

function totalsOf(list) {
  const paid = list.filter((p) => p.status !== "refunded");
  const by = (k) => paid.filter((p) => p.kind === k);
  return {
    revenue: paid.reduce((a, p) => a + (Number(p.amount) || 0), 0),
    sales: paid.length,
    setSales: by("set").length,
    pieceSales: by("piece").length + by("pieces").length,
    itemSales: by("item").length,
    nightSales: by("night").length,
    refunds: list.filter((p) => p.status === "refunded").length,
    ownedDeducted: paid.reduce((a, p) => a + (Number(p.owned_deducted) || 0), 0),
    buyers: new Set(paid.map((p) => p.user_id)).size,
  };
}

async function namesFor(userIds) {
  const m = await people.getUsers(userIds).catch(() => new Map());
  return (id) => people.publicUser(m.get(String(id))) || { id, username: null };
}

async function saleRows(list, cat, limit = 20) {
  const sorted = [...list].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, limit);
  const who = await namesFor(sorted.flatMap((p) => [p.user_id, p.recipient_id]));
  return sorted.map((p) => ({
    id: p.id,
    at: p.created_at,
    kind: p.kind,
    status: p.status,
    user: who(p.user_id),
    recipient: p.recipient_id ? who(p.recipient_id) : null,
    setKey: p.set_key || null,
    items: (p.item_ids || []).map((id) => {
      const it = cat.byId.get(String(id));
      return it ? { id: it.id, sku: it.sku, name: it.name, i18n: it.i18n, category: it.category } : { id };
    }),
    amount: Number(p.amount) || 0,
    listAmount: Number(p.list_amount) || 0,
    ownedDeducted: Number(p.owned_deducted) || 0,
    source: p.source || null,
    abArm: p.ab_arm || null,
  }));
}

async function countRows(table, build) {
  try {
    const { count, error } = await build(db.from(table).select("*", { count: "exact", head: true }));
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

async function dashboard({ now = Date.now() } = {}) {
  const today = time.dayKey(now);
  const t0 = time.dayStartMs(today);
  const y0 = t0 - time.DAY_MS;
  const [list, cat, allSets, limits, versions] = await Promise.all([paidPurchases(y0 - 6 * time.DAY_MS), catalog.getCatalog(), catalog.getSets(), config.getLimits(), config.listVersions()]);
  const todayList = list.filter((p) => time.ms(p.created_at) >= t0);
  const yList = list.filter((p) => time.ms(p.created_at) >= y0 && time.ms(p.created_at) < t0);
  const todayIso = time.iso(t0);
  const [storefronts, refreshes, giftsToday, blockedGifts, openFlags] = await Promise.all([
    countRows("shop2_storefronts", (q) => q.eq("day", today)),
    db.rows(db.from("shop2_storefronts").select("user_id, refresh_paid, refreshed_at").eq("day", today).gte("refreshed_at", todayIso)).catch(() => []),
    db.rows(db.from("shop2_gifts").select("id, status, amount").gte("created_at", todayIso)).catch(() => []),
    countRows("shop2_gifts", (q) => q.eq("status", "blocked").gte("created_at", todayIso)),
    countRows("shop2_gift_flags", (q) => q.eq("status", "open")),
  ]);
  const t = totalsOf(todayList);
  const y = totalsOf(yList);
  const storefrontBuys = todayList.filter((p) => p.status !== "refunded" && p.source === "storefront");
  const sfBuyers = new Set(storefrontBuys.map((p) => p.user_id));
  const setBuyers = new Set(todayList.filter((p) => p.status !== "refunded" && ["set", "piece", "pieces"].includes(p.kind)).map((p) => p.user_id));
  const toSet = [...sfBuyers].filter((u) => setBuyers.has(u)).length;
  const active = config.activeAt(versions, now);
  const prev = versions.filter((v) => v.version < active.version).pop() || config.builtIn();
  const scheduled = versions.filter((v) => v.status === "scheduled" && time.ms(v.applyAt) > now).sort((a, b) => time.ms(a.applyAt) - time.ms(b.applyAt))[0] || null;
  const night = await require("./night").current(now);
  const setRows = await setsTable(allSets, list, { now });
  return {
    serverTime: time.iso(now),
    resetsAt: time.iso(time.nextMidnightMs(now)),
    tiles: {
      revenueToday: t.revenue,
      revenueYesterday: y.revenue,
      salesToday: t.sales,
      salesYesterday: y.sales,
      setSalesToday: t.setSales,
      pieceSalesToday: t.pieceSales,
      itemSalesToday: t.itemSales,
      nightSalesToday: t.nightSales,
      refundsToday: t.refunds,
      buyersToday: t.buyers,
      ownedDeductedToday: t.ownedDeducted,
      storefrontsToday: storefronts,
      storefrontConversionPct: storefronts ? Math.round((sfBuyers.size / storefronts) * 1000) / 10 : null,
      storefrontToSetPct: sfBuyers.size ? Math.round((toSet / sfBuyers.size) * 1000) / 10 : null,
      refreshesToday: refreshes.length,
      refreshRevenueToday: refreshes.reduce((a, r) => a + (Number(r.refresh_paid) || 0), 0),
      giftsToday: giftsToday.filter((g) => !["blocked", "recalled"].includes(g.status)).length,
      blockedGiftsToday: blockedGifts,
      openGiftFlags: openFlags,
      liveViewers: events.liveViewers(now),
    },
    series: { today: hourSeries(todayList, t0), yesterday: hourSeries(yList, y0) },
    recentSales: await saleRows(todayList.length ? todayList : list, cat, 20),
    sets: setRows,
    rules: { active: { version: active.version, note: active.note, appliedAt: active.appliedAt, builtIn: active.builtIn }, changesVsPrevious: require("./rules").diff(prev.rules, active.rules).length, scheduled: scheduled ? { version: scheduled.version, applyAt: scheduled.applyAt } : null },
    limits: {
      refresh: limits.refresh,
      gifts: { perDay: limits.gifts.perDay, receivePerDay: limits.gifts.receivePerDay, minAccountDaysSend: limits.gifts.minAccountDaysSend, frozen: limits.gifts.frozen, enabled: limits.gifts.enabled },
      nightMarket: { weekdays: limits.nightMarket.weekdays, startHour: limits.nightMarket.startHour, durationHours: limits.nightMarket.durationHours, cards: limits.nightMarket.cards },
      usage: { refreshesToday: refreshes.length, giftsToday: giftsToday.length, blockedGiftsToday: blockedGifts },
    },
    nightMarket: { open: night.open ? { id: night.open.id, startsAt: night.open.startsAt, endsAt: night.open.endsAt } : null, next: night.next ? { id: night.next.id, startsAt: night.next.startsAt, endsAt: night.next.endsAt } : null },
    pool: { items: cat.items.filter(catalog.sellable).length, legacyPool: cat.legacyPool },
    migrated: db.migrated(),
  };
}

async function liveSales({ since = null, now = Date.now() } = {}) {
  const t0 = time.dayStartMs(time.dayKey(now));
  const sinceMs = time.ms(since) ?? t0;
  const [list, cat] = await Promise.all([paidPurchases(Math.min(sinceMs, t0 - time.DAY_MS)), catalog.getCatalog()]);
  const fresh = list.filter((p) => time.ms(p.created_at) > sinceMs);
  return {
    serverTime: time.iso(now),
    sales: await saleRows(fresh, cat, 100),
    series: { today: hourSeries(list.filter((p) => time.ms(p.created_at) >= t0), t0), yesterday: hourSeries(list.filter((p) => time.ms(p.created_at) < t0 && time.ms(p.created_at) >= t0 - time.DAY_MS), t0 - time.DAY_MS) },
    totals: totalsOf(list.filter((p) => time.ms(p.created_at) >= t0)),
    liveViewers: events.liveViewers(now),
  };
}

/* ---------------------------------------------------------------- sets */

function setPurchases(list, set) {
  const ids = new Set(set.items.map((it) => String(it.id)));
  return list.filter((p) => p.set_key === set.key || (p.item_ids || []).some((id) => ids.has(String(id))));
}

function dailyCounts(list, days, now) {
  const keys = time.dayRange(time.addDays(time.dayKey(now), -(days - 1)), days);
  const idx = new Map(keys.map((k, i) => [k, i]));
  const out = keys.map(() => 0);
  for (const p of list) {
    if (p.status === "refunded") continue;
    const i = idx.get(time.dayKey(p.created_at));
    if (i != null) out[i] += 1;
  }
  return { days: keys, counts: out };
}

function adminSetRow(set, list, now) {
  const mine = setPurchases(list, set).filter((p) => p.status !== "refunded");
  const sum = set.items.reduce((a, it) => a + it.price, 0);
  const setPrice = pricing.setPriceOf(sum, set.discountPct);
  const v = dailyCounts(mine, 7, now);
  const last24 = mine.filter((p) => now - time.ms(p.created_at) <= time.DAY_MS).length;
  return {
    key: set.key,
    name: set.name,
    palette: set.palette,
    state: setLifecycle(set, now),
    status: set.status,
    source: set.source,
    startsAt: set.startsAt,
    endsAt: set.endsAt,
    discountPct: set.discountPct,
    sum,
    setPrice,
    pieceCount: set.items.length,
    missingCategories: SET_PIECE_CATEGORIES.filter((c) => !set.items.some((it) => it.category === c)),
    stockLimit: set.stockLimit,
    stockSold: set.stockSold,
    stockLeft: set.stockLimit == null ? null : Math.max(0, set.stockLimit - set.stockSold),
    sold7d: mine.length,
    setSales7d: mine.filter((p) => p.kind === "set").length,
    pieceSales7d: mine.filter((p) => p.kind !== "set").length,
    revenue7d: mine.reduce((a, p) => a + (Number(p.amount) || 0), 0),
    velocity: v,
    perHourLast24h: Math.round((last24 / 24) * 100) / 100,
    recall: set.recall ? { ...set.recall, undoable: Boolean(set.recall.undoUntil && time.ms(set.recall.undoUntil) > now) } : null,
    version: set.version,
    updatedAt: set.updatedAt,
  };
}

async function setsTable(allSets, list = null, { now = Date.now() } = {}) {
  const purchasesList = list || (await paidPurchases(now - 8 * time.DAY_MS));
  return allSets.map((s) => adminSetRow(s, purchasesList, now));
}

async function listSets({ now = Date.now() } = {}) {
  return { sets: await setsTable(await catalog.getSets(), null, { now }) };
}

async function ownersPerItem(itemIds) {
  const out = {};
  await Promise.all(
    itemIds.map(async (id) => {
      try {
        const { count } = await db.real().from("user_inventory").select("id", { count: "exact", head: true }).eq("item_id", id);
        out[String(id)] = count ?? 0;
      } catch {
        out[String(id)] = null;
      }
    })
  );
  return out;
}

/** Ownership segments of the set among users who own at least one piece. */
async function ownershipSegments(set) {
  const ids = set.items.map((it) => String(it.id));
  if (!ids.length) return [];
  const inv = await db.rows(db.real().from("user_inventory").select("user_id, item_id").in("item_id", ids)).catch(() => []);
  const byUser = new Map();
  for (const r of inv) {
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, []);
    byUser.get(r.user_id).push(String(r.item_id));
  }
  const buckets = [
    { key: "none", min: 0, max: 0 },
    { key: "few", min: 1, max: 2 },
    { key: "half", min: 3, max: 5 },
    { key: "most", min: 6, max: ids.length - 1 },
  ];
  return buckets.map((b) => {
    const members = [...byUser.values()].filter((list) => list.length >= b.min && list.length <= b.max);
    const example = members[0] || ids.slice(0, b.min);
    return { key: b.key, users: b.key === "none" ? null : members.length, ownedIds: example };
  });
}

function checklist(set, { limits, clashes = [], cat }) {
  const sum = set.items.reduce((a, it) => a + it.price, 0);
  const setPrice = pricing.setPriceOf(sum, set.discountPct);
  const ladder = pricing.priceLadder({ pieces: set.items, setPrice });
  const missing = SET_PIECE_CATEGORIES.filter((c) => !set.items.some((it) => it.category === c));
  const colorsOk = set.items.every((it) => {
    const cols = colorsIn(it.asset || it.preview || "");
    if (!cols.length) return true;
    const s = paletteScore(set.palette, cols);
    return s == null || s >= 45;
  });
  const names = LOCALES.every((l) => set.name && set.name[l]);
  const itemNames = set.items.every((it) => !it.i18n?.name || LOCALES.every((l) => it.i18n.name[l]));
  const bannerItem = set.items.find((it) => it.category === "banner");
  const retired = set.items.filter((it) => !catalog.sellable(it)).map((it) => it.id);
  return [
    { key: "pieces", ok: missing.length === 0, vars: { missing } },
    { key: "palette", ok: colorsOk },
    { key: "price_band", ok: set.discountPct >= limits.purchases.setDiscountMin && set.discountPct <= limits.purchases.setDiscountMax, vars: { pct: set.discountPct, min: limits.purchases.setDiscountMin, max: limits.purchases.setDiscountMax } },
    { key: "above_singles", ok: ladder.farAboveSingles, vars: { setPrice, singleMax: ladder.singleMax } },
    { key: "schedule", ok: Boolean(set.startsAt) || set.status === "live", vars: { startsAt: set.startsAt, endsAt: set.endsAt } },
    { key: "clash", ok: !clashes.some((c) => c.refs.includes(`set:${set.key}`) && c.severity === "warn"), vars: { clashes: clashes.filter((c) => c.refs.includes(`set:${set.key}`)).map((c) => c.code) } },
    { key: "phone_crop", ok: Boolean(bannerItem && (bannerItem.asset || bannerItem.preview)), vars: { hint: "banner focal art must stay right of centre (3:1 .. 3.6:1)" } },
    { key: "translations", ok: names && itemNames },
    { key: "sellable", ok: retired.length === 0, vars: { retired } },
    { key: "catalog", ok: Boolean(cat) },
  ];
}

/** Pool items ranked by palette match for the set builder ("Uyanları öner"). */
function paletteSuggestions(set, cat, { category = null, limit = 12 } = {}) {
  const inSet = new Set(set.items.map((it) => String(it.id)));
  const out = [];
  for (const it of cat.items) {
    if (!catalog.sellable(it) || inSet.has(String(it.id))) continue;
    if (category && it.category !== category) continue;
    const cols = colorsIn(it.asset || it.preview || "");
    const theme = it.setKey ? THEME_BY_KEY.get(it.setKey)?.palette : null;
    const score = paletteScore(set.palette, cols.length ? cols : theme || []);
    if (score == null) continue;
    out.push({ item: catalog.publicItem(it), score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

async function setDetail(key, { now = Date.now(), base = "" } = {}) {
  const [allSets, cat, limits] = await Promise.all([catalog.getSets(), catalog.getCatalog(), config.getLimits()]);
  const set = allSets.find((s) => s.key === key);
  if (!set) return null;
  const list = await paidPurchases(now - 31 * time.DAY_MS);
  const row = adminSetRow(set, list, now);
  const owners = await ownersPerItem(set.items.map((it) => it.id));
  const sum = row.sum;
  const quoteFor = (ownedIds) => pricing.setQuote({ pieces: set.items.map((it) => ({ id: it.id, price: it.price })), ownedIds, discountPct: set.discountPct, onSale: true, now });
  const segments = pricing.payerSegments(quoteFor, await ownershipSegments(set));
  const history = await similarSetHistory(allSets, list, set.key);
  const suggestion = pricing.suggestDiscount(history, { min: limits.purchases.setDiscountMin, max: limits.purchases.setDiscountMax });
  const timeline = await require("./adminOps").timeline({ from: time.dayKey(now), days: 14, now, lite: true });
  const mine = setPurchases(list, set).filter((p) => p.status !== "refunded");
  const perDay = mine.length / 7;
  const setPerDay = mine.filter((p) => p.kind === "set" && now - time.ms(p.created_at) <= 7 * time.DAY_MS).length / 7;
  const stockLeft = row.stockLeft;
  const tests = (await db.rows(db.from("shop2_ab_tests").select("*").eq("set_key", key)).catch(() => [])).map(publicTest);
  const points = await sets.pricePoints(key, now - 40 * time.DAY_MS);
  return {
    ...row,
    pieces: set.pieces.map((p) => ({
      category: p.category,
      item: p.item ? catalog.publicItem(p.item, base) : null,
      price: p.item ? p.item.price : null,
      owners: p.item ? owners[String(p.item.id)] ?? null : null,
      paletteScore: p.item ? paletteScore(set.palette, colorsIn(p.item.asset || p.item.preview || "")) : null,
    })),
    ladder: pricing.priceLadder({ pieces: set.items, setPrice: row.setPrice }),
    suggestion,
    payers: segments,
    forecast: {
      salesPerDay: Math.round(perDay * 100) / 100,
      setSalesPerDay: Math.round(setPerDay * 100) / 100,
      stockOutAt: stockLeft != null && setPerDay > 0 ? time.iso(now + (stockLeft / setPerDay) * time.DAY_MS) : null,
      revenue7dProjected: Math.round((row.revenue7d / 7) * 7),
    },
    checklist: checklist(set, { limits, clashes: timeline.clashes, cat }),
    suggestions: paletteSuggestions(set, cat),
    salesSeries30d: dailyCounts(mine, 30, now),
    priceHistory30d: pricing.priceHistory(points.map((p) => ({ at: p.at, price: p.price })), { now, days: 30, current: row.setPrice }).days,
    abTests: tests,
    versions: await setVersions(key),
    note: set.note || null,
  };
}

async function similarSetHistory(allSets, list, exceptKey) {
  const out = [];
  for (const s of allSets) {
    if (s.key === exceptKey) continue;
    const mine = setPurchases(list, s).filter((p) => p.kind === "set" && p.status !== "refunded");
    const views = events.setViewCount(s.key);
    const conv = mine.length / Math.max(1, views || 50);
    out.push({ key: s.key, discountPct: s.discountPct, conversion: conv });
  }
  return out;
}

async function setVersions(key) {
  const row = await db.one(db.from("shop2_sets").select("history").eq("set_key", key).maybeSingle()).catch(() => null);
  return Array.isArray(row?.history) ? row.history.slice(-10).reverse() : [];
}

function cleanName(name, fallback) {
  const out = { ...(fallback || {}) };
  if (name && typeof name === "object") for (const l of LOCALES) if (typeof name[l] === "string" && name[l].trim()) out[l] = name[l].trim().slice(0, 60);
  if (typeof name === "string" && name.trim()) for (const l of LOCALES) out[l] = out[l] || name.trim().slice(0, 60);
  return out;
}

function cleanPalette(p, fallback) {
  if (!Array.isArray(p)) return fallback || [];
  const list = p.map((x) => String(x).trim().toLowerCase()).filter((x) => /^#[0-9a-f]{6}$/.test(x)).slice(0, 6);
  return list.length ? list : fallback || [];
}

function snapshot(row) {
  const { history, ...rest } = row || {};
  void history;
  return rest;
}

/** Validated DB row for a set from a patch over the current state. */
async function buildSetRow(key, patch, current, actorId, now) {
  const limits = await config.getLimits();
  const cat = await catalog.getCatalog();
  const base = current || catalog.themeDefaults(key);
  const row = {
    set_key: key,
    name: cleanName(patch.name, base.name),
    palette: cleanPalette(patch.palette, base.palette),
    discount_pct: patch.discountPct != null ? pricing.clampDiscount(patch.discountPct, limits.purchases.setDiscountMin, limits.purchases.setDiscountMax) : base.discountPct,
    status: base.source === "default" && !current?.source ? "draft" : base.status,
    starts_at: patch.startsAt !== undefined ? (patch.startsAt ? time.iso(time.ms(patch.startsAt)) : null) : base.startsAt,
    ends_at: patch.endsAt !== undefined ? (patch.endsAt ? time.iso(time.ms(patch.endsAt)) : null) : base.endsAt,
    stock_limit: patch.stockLimit !== undefined ? (patch.stockLimit == null ? null : Math.max(0, Math.round(Number(patch.stockLimit) || 0))) : base.stockLimit,
    stock_sold: patch.stockSold !== undefined ? Math.max(0, Math.round(Number(patch.stockSold) || 0)) : base.stockSold || 0,
    piece_ids: patch.pieceIds !== undefined ? (Array.isArray(patch.pieceIds) ? patch.pieceIds.map(String).filter((id) => cat.byId.has(id)).slice(0, 12) : null) : base.pieceIds || null,
    note: patch.note !== undefined ? (patch.note ? String(patch.note).slice(0, 300) : null) : base.note || null,
    updated_at: time.iso(now),
    updated_by: actorId || null,
  };
  if ((patch.startsAt !== undefined && patch.startsAt && time.ms(patch.startsAt) == null) || (patch.endsAt && time.ms(patch.endsAt) == null)) throw bad("bad_time");
  if (row.starts_at && row.ends_at && time.ms(row.ends_at) <= time.ms(row.starts_at)) throw bad("bad_window");
  return row;
}

async function readSetRow(key) {
  await db.ready();
  return db.one(db.from("shop2_sets").select("*").eq("set_key", key).maybeSingle());
}

async function writeSetRow(key, row, { reason = null, actorId = null, now = Date.now() } = {}) {
  const prev = await readSetRow(key);
  const history = Array.isArray(prev?.history) ? prev.history.slice(-19) : [];
  if (prev) history.push({ version: Number(prev.version) || 1, at: prev.updated_at || prev.created_at, by: prev.updated_by || null, reason: reason || null, row: snapshot(prev) });
  const full = { ...row, version: (Number(prev?.version) || 0) + 1, history, created_at: prev?.created_at || time.iso(now), created_by: prev?.created_by || actorId || null };
  const saved = await db.one(db.from("shop2_sets").upsert(full, { onConflict: "set_key" }).select("*").maybeSingle());
  catalog.invalidate();
  const oldPrice = prev ? await priceOfRow(prev) : null;
  const newPrice = await priceOfRow(full);
  if (newPrice != null && newPrice !== oldPrice) await sets.recordPrice(key, newPrice, { at: now, reason: reason || "update" });
  return saved || full;
}

async function priceOfRow(row) {
  const set = await catalog.getSets().then((all) => all.find((s) => s.key === row.set_key));
  if (!set) return null;
  const items = row.piece_ids && row.piece_ids.length ? (await catalog.getCatalog()).items.filter((it) => row.piece_ids.includes(String(it.id))) : set.items;
  const sum = items.reduce((a, it) => a + it.price, 0);
  return pricing.setPriceOf(sum, Number(row.discount_pct ?? set.discountPct));
}

async function createSet(body, { actorId, now = Date.now() } = {}) {
  const key = String(body?.key || "").trim().toLowerCase();
  if (!SET_KEY_RE.test(key)) throw bad("bad_set_key");
  if (await readSetRow(key)) throw bad("set_exists", 409);
  const row = await buildSetRow(key, body || {}, null, actorId, now);
  row.status = "draft";
  return writeSetRow(key, row, { reason: "create", actorId, now });
}

async function currentSet(key) {
  const set = await catalog.getSet(key);
  if (!set) throw bad("not_found", 404);
  return set;
}

async function updateSet(key, patch, { actorId, reason = null, now = Date.now() } = {}) {
  const set = await currentSet(key);
  const row = await buildSetRow(key, patch || {}, set, actorId, now);
  row.status = set.source === "default" ? "live" : set.status;
  if (patch?.status && ["draft", "archived"].includes(patch.status)) row.status = patch.status;
  return writeSetRow(key, row, { reason, actorId, now });
}

/** Publish now or at `at` (scheduled). A publish can be undone for 10 seconds. */
async function publish(key, { at = null, actorId, now = Date.now() } = {}) {
  const set = await currentSet(key);
  if (set.status === "recalled") throw bad("set_recalled", 409);
  const startMs = at ? time.ms(at) : now;
  if (startMs == null) throw bad("bad_time");
  const row = await buildSetRow(key, { startsAt: time.iso(startMs) }, set, actorId, now);
  row.status = startMs > now ? "scheduled" : "live";
  row.undo = { action: "publish", prevStatus: set.status, prevStartsAt: set.startsAt, until: time.iso(now + PUBLISH_UNDO_MS) };
  const saved = await writeSetRow(key, row, { reason: "publish", actorId, now });
  if (startMs > now) await require("./adminOps").enqueue("set_publish", key, { at: time.iso(startMs) }, { runAt: startMs, actorId });
  else events.toAll("shop2:storefront", { reason: "set_published", setKey: key });
  return { set: saved, undoUntil: row.undo.until };
}

async function undoPublish(key, { actorId, now = Date.now() } = {}) {
  const prev = await readSetRow(key);
  const u = prev?.undo;
  if (!u || u.action !== "publish" || time.ms(u.until) < now) throw bad("undo_expired", 409);
  const row = { ...snapshot(prev), status: u.prevStatus === "live" ? "live" : u.prevStatus || "draft", starts_at: u.prevStartsAt || null, undo: null, updated_at: time.iso(now), updated_by: actorId || null };
  delete row.version;
  const saved = await writeSetRow(key, row, { reason: "publish_undo", actorId, now });
  await require("./adminOps").cancelQueued("set_publish", key);
  return { set: saved };
}

/** What a recall would touch (live numbers for the dialog). */
async function recallPreview(key, { option = "keep", now = Date.now() } = {}) {
  const set = await currentSet(key);
  const all = await db.rows(db.from("shop2_purchases").select("*").eq("status", "paid")).catch(() => []);
  const mine = setPurchases(all, set);
  const buyers = new Set(mine.map((p) => p.user_id));
  const ids = new Set(set.items.map((it) => String(it.id)));
  const giftsPending = (await db.rows(db.from("shop2_gifts").select("*").in("status", ["scheduled", "delivered"])).catch(() => [])).filter((g) => g.set_key === key || (g.item_ids || []).some((id) => ids.has(String(id))));
  const wishers = (await db.rows(db.from("shop2_wishlist").select("user_id, item_id")).catch(() => [])).filter((w) => w.item_id === `set:${key}` || ids.has(String(w.item_id)));
  return {
    key,
    option,
    buyers: buyers.size,
    purchases: mine.length,
    refundTotal: option === "refund" ? mine.reduce((a, p) => a + (Number(p.amount) || 0), 0) : 0,
    giftsPending: giftsPending.length,
    giftsPendingAmount: giftsPending.reduce((a, g) => a + (Number(g.amount) || 0), 0),
    inWishlists: new Set(wishers.map((w) => w.user_id)).size,
    notify: buyers.size,
    undoMinutes: RECALL_UNDO_MS / time.MIN_MS,
    state: setLifecycle(set, now),
  };
}

async function recall(key, { reason, option = "keep", replace = null, actorId, now = Date.now() } = {}) {
  const why = typeof reason === "string" ? reason.trim() : "";
  if (why.length < 3) throw bad("reason_required");
  if (!["keep", "refund", "replace"].includes(option)) throw bad("bad_option");
  const set = await currentSet(key);
  if (set.status === "recalled") throw bad("set_recalled", 409);
  if (option === "replace") {
    const cat = await catalog.getCatalog();
    if (!replace || !set.items.some((it) => String(it.id) === String(replace.fromItemId)) || !cat.byId.has(String(replace.toItemId))) throw bad("bad_replace");
  }
  const preview = await recallPreview(key, { option, now });
  const row = await buildSetRow(key, {}, set, actorId, now);
  row.status = "recalled";
  row.recall = { option, reason: why.slice(0, 300), by: actorId || null, at: time.iso(now), undoUntil: time.iso(now + RECALL_UNDO_MS), prevStatus: set.status === "recalled" ? "live" : set.source === "default" ? "live" : set.status, replace: option === "replace" ? { fromItemId: String(replace.fromItemId), toItemId: String(replace.toItemId) } : null, preview, finalized: false };
  const saved = await writeSetRow(key, row, { reason: `recall:${option}`, actorId, now });
  await require("./adminOps").enqueue("recall_finalize", key, { option }, { runAt: now + RECALL_UNDO_MS, actorId });
  events.toAll("shop2:storefront", { reason: "set_recalled", setKey: key });
  return { set: saved, preview, undoUntil: row.recall.undoUntil };
}

async function undoRecall(key, { actorId, now = Date.now() } = {}) {
  const prev = await readSetRow(key);
  const r = prev?.recall;
  if (!r || r.finalized || time.ms(r.undoUntil) < now) throw bad("undo_expired", 409);
  const row = { ...snapshot(prev), status: r.prevStatus || "live", recall: { ...r, undoneAt: time.iso(now), undoneBy: actorId || null }, updated_at: time.iso(now), updated_by: actorId || null };
  delete row.version;
  row.recall = null;
  const saved = await writeSetRow(key, row, { reason: "recall_undo", actorId, now });
  await require("./adminOps").cancelQueued("recall_finalize", key);
  events.toAll("shop2:storefront", { reason: "set_restored", setKey: key });
  return { set: saved };
}

/** After the undo window: refunds / replacement / pending gift recalls, then notify buyers. */
async function finalizeRecall(key, { now = Date.now() } = {}) {
  const prev = await readSetRow(key);
  const r = prev?.recall;
  if (!prev || prev.status !== "recalled" || !r || r.finalized) return { skipped: true };
  const set = await catalog.getSet(key);
  const ids = new Set((set?.items || []).map((it) => String(it.id)));
  const all = await db.rows(db.from("shop2_purchases").select("*").eq("status", "paid")).catch(() => []);
  const mine = set ? setPurchases(all, set) : [];
  const buyers = new Set(mine.map((p) => p.user_id));
  let refunded = 0;
  let replaced = 0;
  if (r.option === "refund") {
    for (const p of mine) {
      await descoin.runSerialized(p.user_id, async () => {
        const [claimed] = await db.rows(db.from("shop2_purchases").update({ status: "refunded", refunded_at: time.iso(now) }).eq("id", p.id).eq("status", "paid").select("*"));
        if (!claimed) return;
        for (const itemId of p.item_ids || []) {
          const it = set.items.find((x) => String(x.id) === String(itemId));
          if (it) await shop.equipItem(p.user_id, it.category, null).catch(() => {});
          await db.rows(db.real().from("user_inventory").delete().eq("user_id", p.user_id).eq("item_id", itemId).select("id")).catch(() => []);
        }
        if (Number(p.amount) > 0) await descoin.credit(p.user_id, Number(p.amount), "shop_refund", { shop2: "set_recall", setKey: key, purchaseId: p.id });
        refunded += Number(p.amount) || 0;
      });
    }
  } else if (r.option === "replace" && r.replace) {
    const owners = await db.rows(db.real().from("user_inventory").select("user_id").eq("item_id", r.replace.fromItemId)).catch(() => []);
    const toItem = (await catalog.getCatalog()).byId.get(String(r.replace.toItemId));
    for (const o of owners) {
      const look = await people.equippedSnapshot(o.user_id).catch(() => ({}));
      await shop.grantItem(o.user_id, r.replace.toItemId, { acquiredVia: "gift", giftedBy: null, giftMessage: null }).catch(() => null);
      if (toItem && Object.values(look).some((v) => String(v) === String(r.replace.fromItemId))) await shop.equipItem(o.user_id, toItem.category, toItem.id).catch(() => {});
      replaced += 1;
    }
  }
  // Pending gifts of a recalled set go back to their senders (unless the owner keeps items).
  const pending = (await db.rows(db.from("shop2_gifts").select("*").in("status", ["scheduled", "delivered"])).catch(() => [])).filter((g) => g.set_key === key || (g.item_ids || []).some((id) => ids.has(String(id))));
  let giftsRecalled = 0;
  if (r.option !== "keep") {
    for (const g of pending) {
      try {
        await require("./gifts").recall(g.from_user, g.id, { now });
        giftsRecalled += 1;
      } catch {
        /* already opened */
      }
    }
  }
  for (const u of buyers) events.toUser(u, "shop2:storefront", { reason: "set_recalled", setKey: key, option: r.option });
  const done = { ...r, finalized: true, finalizedAt: time.iso(now), result: { refunded, replaced, giftsRecalled, notified: buyers.size } };
  await db.rows(db.from("shop2_sets").update({ recall: done }).eq("set_key", key).select("set_key"));
  catalog.invalidate();
  return done.result;
}

/** Shift a set's window by whole days (timeline "one-click date shift"). */
async function shiftSet(key, days, opts) {
  const set = await currentSet(key);
  const d = Math.round(Number(days) || 0);
  if (!d) throw bad("bad_request");
  const s = set.startsAt ? time.iso(time.ms(set.startsAt) + d * time.DAY_MS) : null;
  const e = set.endsAt ? time.iso(time.ms(set.endsAt) + d * time.DAY_MS) : null;
  return updateSet(key, { startsAt: s, endsAt: e }, { ...opts, reason: `shift:${d}` });
}

async function restoreVersion(key, version, opts = {}) {
  const prev = await readSetRow(key);
  const h = (prev?.history || []).find((x) => Number(x.version) === Number(version));
  if (!h) throw bad("not_found", 404);
  const row = { ...h.row, updated_at: time.iso(opts.now || Date.now()), updated_by: opts.actorId || null };
  delete row.version;
  delete row.history;
  return writeSetRow(key, row, { reason: `restore:${version}`, actorId: opts.actorId, now: opts.now || Date.now() });
}

async function deleteDraft(key) {
  const prev = await readSetRow(key);
  if (!prev) throw bad("not_found", 404);
  if (prev.status !== "draft") throw bad("not_draft", 409);
  await db.rows(db.from("shop2_sets").delete().eq("set_key", key).select("set_key"));
  catalog.invalidate();
  return { ok: true };
}

/* ---------------------------------------------------------------- A/B tests */

function publicTest(t) {
  return { id: t.id, setKey: t.set_key, discountA: Number(t.discount_a), discountB: Number(t.discount_b), split: Number(t.split), status: t.status, startsAt: t.starts_at, endsAt: t.ends_at, createdAt: t.created_at, createdBy: t.created_by || null, stoppedAt: t.stopped_at || null, winner: t.winner || null };
}

async function abResults(test) {
  const [exp, buys] = await Promise.all([
    db.rows(db.from("shop2_ab_exposures").select("arm").eq("test_id", test.id)).catch(() => []),
    db.rows(db.from("shop2_purchases").select("*").eq("ab_test_id", test.id)).catch(() => []),
  ]);
  const arm = (a) => {
    const e = exp.filter((x) => x.arm === a).length;
    const b = buys.filter((x) => x.ab_arm === a && x.status !== "refunded");
    const revenue = b.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    return { exposures: e, buyers: new Set(b.map((p) => p.user_id)).size, purchases: b.length, revenue, conversionPct: e ? Math.round((new Set(b.map((p) => p.user_id)).size / e) * 1000) / 10 : 0, revenuePerExposure: e ? Math.round(revenue / e) : 0 };
  };
  const A = arm("A");
  const B = arm("B");
  const lead = A.revenuePerExposure === B.revenuePerExposure ? null : A.revenuePerExposure > B.revenuePerExposure ? "A" : "B";
  return { A, B, lead, enoughData: A.exposures >= 100 && B.exposures >= 100 };
}

async function listAbTests() {
  await db.ready();
  const list = await db.rows(db.from("shop2_ab_tests").select("*").order("created_at", { ascending: false })).catch(() => []);
  const out = [];
  for (const t of list) out.push({ ...publicTest(t), results: await abResults(t) });
  return { tests: out };
}

async function createAbTest(body, { actorId, now = Date.now() } = {}) {
  const limits = await config.getLimits();
  const set = await currentSet(String(body?.setKey || ""));
  const running = (await db.rows(db.from("shop2_ab_tests").select("*").eq("set_key", set.key).eq("status", "running")).catch(() => [])).length;
  if (running) throw bad("ab_running", 409);
  const clamp = (v) => pricing.clampDiscount(v, limits.purchases.setDiscountMin, limits.purchases.setDiscountMax);
  const row = {
    set_key: set.key,
    discount_a: clamp(body?.discountA ?? set.discountPct),
    discount_b: clamp(body?.discountB),
    split: Math.min(90, Math.max(10, Math.round(Number(body?.split) || 50))),
    status: "running",
    starts_at: body?.startsAt ? time.iso(time.ms(body.startsAt)) : time.iso(now),
    ends_at: body?.endsAt ? time.iso(time.ms(body.endsAt)) : time.iso(now + 7 * time.DAY_MS),
    created_by: actorId || null,
    created_at: time.iso(now),
  };
  if (row.discount_a === row.discount_b) throw bad("ab_same_price");
  const saved = await db.one(db.from("shop2_ab_tests").insert(row).select("*").single());
  return publicTest(saved || row);
}

async function stopAbTest(id, { winner = null, now = Date.now(), actorId } = {}) {
  const [t] = await db.rows(db.from("shop2_ab_tests").update({ status: "stopped", stopped_at: time.iso(now), winner: ["A", "B"].includes(winner) ? winner : null }).eq("id", id).select("*"));
  if (!t) throw bad("not_found", 404);
  if (winner === "A" || winner === "B") await updateSet(t.set_key, { discountPct: winner === "A" ? t.discount_a : t.discount_b }, { actorId, reason: `ab_winner:${winner}`, now });
  return publicTest(t);
}

/* ---------------------------------------------------------------- user storefront drawer */

async function userStorefront(userId, which = "today", { now = Date.now(), base = "" } = {}) {
  const sfs = require("./storefrontService");
  const user = await people.getUser(userId);
  if (!user) return null;
  const pv = await sfs.preview(userId, which === "tomorrow" ? "tomorrow" : "today", { now });
  const cat = pv.facts.catalog;
  const slots = (pv.storefront.slots || []).map((s) => {
    const it = cat.byId.get(String(s.itemId));
    return { slot: s.slot, item: it ? catalog.publicItem(it, base) : null, price: it?.price ?? null, locked: Boolean(s.locked), owned: pv.facts.owned.has(String(s.itemId)), reasons: s.reasons || [], why: s.why || require("./storefront").whyText(s.reasons || []) };
  });
  const limits = await config.getLimits();
  const ctx = await sets.contextFor(userId, now);
  const setQuotes = ctx.sets.filter((s) => sets.onSale(s)).map((s) => {
    const q = sets.quoteFor(s, { userId, owned: ctx.owned, lock: ctx.locks.get(s.key), tests: ctx.tests, limits: ctx.limits, now });
    return { key: s.key, name: s.name, setPrice: q.setPrice, yourPrice: q.yourPrice, owned: q.ownedCount, total: q.total, ownedDeducted: q.ownedDeducted, partialPriceUntil: q.partialPriceUntil, abArm: q.abArm };
  });
  const row = await sfs.readRow(userId, time.dayKey(now)).catch(() => null);
  const refresh = await sfs.refreshQuote(userId, row, limits);
  const recent = await sfs.recentRows(userId, time.dayKey(now), 7);
  const purchases = await paidPurchases(now - 8 * time.DAY_MS);
  const boughtIds = new Set(purchases.filter((p) => p.user_id === userId && p.status !== "refunded").flatMap((p) => (p.item_ids || []).map(String)));
  const last7 = recent.map((r) => ({ day: r.day, ruleVersion: r.rule_version, refreshes: Number(r.refresh_count) || 0, slots: (r.slots || []).map((s) => ({ slot: s.slot, itemId: s.itemId, item: cat.byId.has(String(s.itemId)) ? catalog.publicItem(cat.byId.get(String(s.itemId)), base) : null, purchased: boughtIds.has(String(s.itemId)) })) }));
  const gifts = await db.rows(db.from("shop2_gifts").select("id, from_user, to_user, status, created_at").gte("created_at", time.iso(time.dayStartMs(time.dayKey(now))))).catch(() => []);
  const nightNow = await require("./night").current(now);
  let nightInfo = { open: false, next: nightNow.next ? nightNow.next.startsAt : null };
  if (nightNow.open) {
    const flips = await db.rows(db.from("shop2_night_flips").select("*").eq("night_id", String(nightNow.open.id)).eq("user_id", userId)).catch(() => []);
    nightInfo = { open: true, id: nightNow.open.id, flipsUsed: flips.length, flips: nightNow.open.flips, bought: flips.filter((f) => f.bought_at).length };
  }
  const shownDays = last7.length;
  const shownCount = last7.reduce((a, d) => a + d.slots.length, 0);
  return {
    user: people.publicUser(user),
    which: which === "tomorrow" ? "tomorrow" : "today",
    day: pv.day,
    stored: pv.stored,
    seed: pv.storefront.seed,
    ruleVersion: pv.storefront.ruleVersion,
    refreshCount: pv.storefront.refreshCount || 0,
    slots,
    excluded: pv.storefront.excluded || {},
    relaxed: pv.storefront.relaxed || [],
    epicFloorApplied: Boolean(pv.storefront.epicFloorApplied),
    newAccount: pv.facts.newAccount,
    ownedCount: pv.facts.owned.size,
    wishlistCount: pv.facts.wishlist.size,
    sets: setQuotes,
    refresh: { ...refresh },
    gifts: { sentToday: gifts.filter((g) => g.from_user === userId && g.status !== "blocked").length, receivedToday: gifts.filter((g) => g.to_user === userId && g.status !== "blocked").length, blockedToday: gifts.filter((g) => g.from_user === userId && g.status === "blocked").length, limitPerDay: limits.gifts.perDay },
    nightMarket: nightInfo,
    last7,
    last7Summary: { days: shownDays, shown: shownCount, purchased: last7.reduce((a, d) => a + d.slots.filter((s) => s.purchased).length, 0), refreshes: last7.reduce((a, d) => a + d.refreshes, 0) },
  };
}

async function searchUsers(q, limit = 20) {
  const s = String(q || "").trim();
  if (s.length < 2) return [];
  const { data } = await db.real().from("users").select("id, username, display_name, avatar_url").ilike("username", `%${s.replace(/[%_\\]/g, "\\$&")}%`).limit(limit);
  return (data || []).map(people.publicUser);
}

module.exports = {
  RECALL_UNDO_MS,
  PUBLISH_UNDO_MS,
  dashboard,
  liveSales,
  listSets,
  setDetail,
  createSet,
  updateSet,
  publish,
  undoPublish,
  recallPreview,
  recall,
  undoRecall,
  finalizeRecall,
  shiftSet,
  restoreVersion,
  deleteDraft,
  paletteSuggestions,
  listAbTests,
  createAbTest,
  stopAbTest,
  abResults,
  userStorefront,
  searchUsers,
  paidPurchases,
};
