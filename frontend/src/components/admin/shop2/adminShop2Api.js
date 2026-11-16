/**
 * Vitrin ve Setler: every call to the Market 2.0 admin API (backend routes/adminShop2.js at
 * /api/admin/shop2, contract in docs/shop2-api.md) and the shapes the page draws. All data
 * access of the page lives here; the components never see raw server rows, so a contract
 * change is fixed in one file.
 *
 * Writes go through adminFetch, which asks for the step-up code on STEP_UP_REQUIRED
 * (2FA re-verify) and retries once; the server writes the audit row (shop2_*).
 * Reads of the live catalog use the user route /api/shop2/catalog (same session).
 */
import { adminFetch } from "../../../api/adminHttp";
import { authedRequest } from "../../../api/authedHttp";
import { API_BASE_URL } from "../../../config/api";
import { RARITIES, SET_SLOTS, addDays, istDay, istMidnight, normalizeWeights, nextReset, round10, setPricing } from "./shop2Model.js";

const BASE = "/shop2";
const enc = encodeURIComponent;
const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const json = (method, body) => ({ method, body: JSON.stringify(body || {}) });
const qs = (params) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) if (v != null && v !== "") s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : "";
};
const H = 3600000;
const DAY = 86400000;

/* ------------------------------------------------------------------ session caches */

let LOCALE = "tr";
let catalogCache = null; // { at, items }
let rulesCache = null; // last mapped rules (bands for slot conversion)
let limitsCache = null; // last raw limits

/** The page tells the adapters which language to pick from `{ tr, en, … }` names. */
export function setApiLocale(l) {
  LOCALE = l || "tr";
}

const API_ORIGIN = String(API_BASE_URL || "").replace(/\/api\/?$/, "");
function absUrl(u) {
  if (!u || typeof u !== "string") return u || null;
  return u.startsWith("/api/") ? `${API_ORIGIN}${u}` : u;
}
function pickName(n) {
  if (n && typeof n === "object") return n[LOCALE] || n.en || n.tr || Object.values(n)[0] || "";
  return String(n || "");
}
function slug(text) {
  const map = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };
  const s = String(text || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşüâîû]/g, (c) => map[c] || c)
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 34);
  return s.length >= 2 ? s : `set-${Date.now().toString(36)}`;
}

/* ------------------------------------------------------------------ items and sets */

export function normItem(it) {
  if (!it || typeof it !== "object") return null;
  const i18nName = it.i18n?.name && typeof it.i18n.name === "object" ? it.i18n.name : null;
  return {
    ...it,
    id: it.id ?? it.itemId ?? it.sku,
    category: it.category || "",
    rarity: it.rarity || "common",
    price_descoin: num(it.price_descoin ?? it.price),
    name: i18nName || it.name || it.sku || "",
    asset_url: absUrl(it.asset_url ?? it.assetUrl ?? null),
    preview_url: absUrl(it.preview_url ?? it.previewUrl ?? null),
    set_key: it.set_key ?? it.setKey ?? null,
    effect_key: it.effect_key ?? it.effectKey ?? null,
    theme_key: it.theme_key ?? it.themeKey ?? null,
  };
}

const STATUS_OF_STATE = { live: "live", last24h: "live", soldout: "live", scheduled: "scheduled", ended: "ended", recalled: "recalled", draft: "draft", archived: "archived" };

function piecesFrom(list) {
  const out = {};
  for (const p of arr(list)) {
    const it = normItem(p?.item || p);
    const cat = p?.category || it?.category;
    if (it && SET_SLOTS.includes(cat)) out[cat] = { ...it, owners: p?.owners ?? null, serverScore: p?.paletteScore ?? null };
  }
  return out;
}

/** adminSetRow (+ detail) → page set. */
export function normSet(r, extraPieces = null) {
  if (!r || typeof r !== "object") return null;
  const pieces = r.pieces ? piecesFrom(r.pieces) : extraPieces || {};
  const list = SET_SLOTS.map((s) => pieces[s]).filter(Boolean);
  const sum = num(r.sum) || list.reduce((a, it) => a + it.price_descoin, 0);
  const discountPct = num(r.discountPct, 25);
  const price = num(r.setPrice) || round10(sum * (1 - discountPct / 100));
  const state = r.state || r.status || "draft";
  const recall = r.recall || null;
  const total = r.stockLimit ?? r.stock?.total ?? null;
  const vel = r.velocity?.counts || (Array.isArray(r.velocity) ? r.velocity : []);
  return {
    key: r.key || r.set_key,
    name: pickName(r.name),
    nameI18n: r.name && typeof r.name === "object" ? r.name : null,
    state,
    status: STATUS_OF_STATE[state] || r.status || "draft",
    source: r.source || null,
    palette: arr(r.palette),
    pieces,
    sum,
    price,
    discountPct,
    stock: { total, left: r.stockLeft ?? (total == null ? null : Math.max(0, total - num(r.stockSold))) },
    stockSold: num(r.stockSold),
    startsAt: r.startsAt || null,
    endsAt: r.endsAt || null,
    recalledAt: recall?.at || null,
    undoUntil: recall?.undoUntil && recall?.undoable !== false ? recall.undoUntil : null,
    recallOption: recall?.option || null,
    revenue7d: num(r.revenue7d),
    sold7d: num(r.sold7d),
    setSales7d: num(r.setSales7d),
    pieceSales7d: num(r.pieceSales7d),
    conversionPct: r.conversionPct ?? null,
    velocity: vel,
    perHourLast24h: r.perHourLast24h ?? null,
    missingCategories: arr(r.missingCategories),
    partialSale: true,
    giftable: true,
    translations: { ready: r.name && typeof r.name === "object" ? Object.values(r.name).filter((v) => String(v || "").trim()).length : 7, total: 7 },
    ownerShares: {},
    abTest: null,
    version: r.version ?? null,
    updatedAt: r.updatedAt || null,
  };
}

async function liveCatalog({ fresh = false } = {}) {
  if (!fresh && catalogCache && Date.now() - catalogCache.at < 60000) return catalogCache.items;
  const r = await authedRequest(`/shop2/catalog`);
  const items = arr(r?.items).map(normItem).filter(Boolean);
  catalogCache = { at: Date.now(), items, legacyPool: Boolean(r?.legacyPool) };
  return items;
}

function piecesByCatalog(items, key) {
  const out = {};
  for (const it of items) if (it.set_key === key && SET_SLOTS.includes(it.category) && !out[it.category]) out[it.category] = it;
  return out;
}

/* ------------------------------------------------------------------ dashboard */

const KIND_OF_SALE = (s) => (s?.recipient || s?.gift ? "gift" : ["set", "piece", "pieces"].includes(s?.kind) ? "set" : "item");

function cumulative(values, upTo) {
  let acc = 0;
  return values.slice(0, upTo + 1).map((v) => (acc += num(v)));
}

async function dashboardFor(range) {
  const now = Date.now();
  const [d, live] = await Promise.all([adminFetch(`${BASE}/dashboard`), adminFetch(`${BASE}/sales/live${qs({ since: new Date(istMidnight(istDay(now))).toISOString() })}`).catch(() => null)]);
  const T = d?.tiles || {};
  const hour = new Date(now + 3 * H).getUTCHours();
  const today = d?.series?.today || { revenue: [], count: [] };
  const yest = d?.series?.yesterday || { revenue: [], count: [] };
  const sales = arr(live?.sales || d?.recentSales);
  const setNames = Object.fromEntries(arr(d?.sets).map((s) => [s.key, pickName(s.name)]));

  // Revenue per hour split by kind (exact while the list holds the whole day).
  const split = { storefront: new Array(24).fill(0), sets: new Array(24).fill(0), gifts: new Array(24).fill(0) };
  for (const s of sales) {
    if (s.status === "refunded") continue;
    const h = new Date(Date.parse(s.at) + 3 * H).getUTCHours();
    const k = KIND_OF_SALE(s);
    split[k === "set" ? "sets" : k === "gift" ? "gifts" : "storefront"][h] += num(s.amount);
  }
  const listTotal = split.storefront.reduce((a, b) => a + b, 0) + split.sets.reduce((a, b) => a + b, 0) + split.gifts.reduce((a, b) => a + b, 0);
  if (sales.length >= 100 && listTotal > 0) {
    // Partial list: scale each hour's split to the exact hourly revenue.
    for (let h = 0; h < 24; h += 1) {
      const part = split.storefront[h] + split.sets[h] + split.gifts[h];
      const real = num(today.revenue[h]);
      if (part > 0) for (const k of Object.keys(split)) split[k][h] = Math.round((split[k][h] / part) * real);
      else split.storefront[h] = real;
    }
  }
  const upToNow = (vals) => vals.map((v, i) => (i <= hour ? v : null));
  const fromSets = split.sets.reduce((a, b) => a + b, 0);
  const revenueToday = num(T.revenueToday);
  const ySoFar = arr(yest.revenue).slice(0, hour + 1).reduce((a, b) => a + num(b), 0);

  let chart;
  if (range === "today") {
    chart = {
      labels: Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")),
      slots: 24,
      series: [
        { key: "storefront", values: upToNow(split.storefront) },
        { key: "sets", values: upToNow(split.sets) },
        { key: "gifts", values: upToNow(split.gifts) },
        { key: "yesterday", values: arr(yest.revenue).map(num) },
      ],
      thisHour: num(today.count?.[hour]),
    };
  } else {
    const days = range === "30d" ? 30 : 7;
    const from = addDays(istDay(now), -(days - 1));
    const tl = await adminFetch(`${BASE}/timeline${qs({ from, days })}`).catch(() => null);
    const rev = arr(tl?.lanes?.revenue);
    chart = {
      labels: rev.map((r) => String(Number(String(r.day).slice(8)))),
      slots: rev.length || days,
      series: [{ key: "total", values: rev.map((r) => num(r.revenue)) }],
      thisHour: num(today.count?.[hour]),
    };
  }

  const last = sales[0] || null;
  const lastSale = last
    ? {
        at: last.at,
        kind: KIND_OF_SALE(last),
        username: last.user?.username || null,
        setName: last.setKey ? setNames[last.setKey] || last.setKey : null,
        item: last.items?.[0] ? normItem(last.items[0]) : null,
        price: num(last.listAmount) || num(last.amount),
        paid: num(last.amount),
        ownedPieces: num(last.ownedDeducted) > 0 && last.setKey ? Math.max(0, SET_SLOTS.length - arr(last.items).length) : 0,
      }
    : null;

  const sets = arr(d?.sets).map((s) => normSet(s));
  const top7 = [...sets].filter((s) => s.revenue7d > 0).sort((a, b) => b.revenue7d - a.revenue7d).slice(0, 5).map((s) => ({ key: s.key, name: s.name, palette: s.palette, revenue: s.revenue7d }));

  return {
    serverTime: d?.serverTime,
    resetsAt: d?.resetsAt || new Date(nextReset(now)).toISOString(),
    liveInShop: T.liveViewers ?? live?.liveViewers ?? null,
    migrated: d?.migrated !== false,
    tiles: {
      views: { value: num(T.storefrontsToday), deltaPct: null, spark: null },
      storefrontBuys: { value: num(T.itemSalesToday), conversionPct: T.storefrontConversionPct ?? 0, spark: upToNow(arr(today.count).map(num)).filter((v) => v != null) },
      setSales: { value: num(T.setSalesToday), pieces: num(T.pieceSalesToday), spark: null },
      revenue: { value: revenueToday, deltaPct: ySoFar > 0 ? Math.round(((revenueToday - ySoFar) / ySoFar) * 1000) / 10 : null, fromSetsPct: revenueToday > 0 ? Math.round((fromSets / revenueToday) * 1000) / 10 : 0, spark: cumulative(arr(today.revenue), hour) },
      nightMarket: {
        open: Boolean(d?.nightMarket?.open),
        opensAt: d?.nightMarket?.open?.startsAt || d?.nightMarket?.next?.startsAt || null,
        closesAt: d?.nightMarket?.open?.endsAt || null,
        cards: d?.limits?.nightMarket?.cards ?? null,
      },
      gifts: { value: num(T.giftsToday), blocked: num(T.blockedGiftsToday), flags: num(T.openGiftFlags) },
    },
    sales: chart,
    lastSale,
    topSellers: { "7d": top7 },
    toSet: { pct: T.storefrontToSetPct ?? 0, delta: null },
    refreshes: { today: num(T.refreshesToday), revenue: num(T.refreshRevenueToday) },
    pool: d?.pool || null,
    rulesInfo: d?.rules || null,
    sets,
  };
}

/* ------------------------------------------------------------------ rules */

const TOGGLE_TO_SERVER = (t) => ({
  epicFloor: Boolean(t.minEpic),
  noRepeatDays: t.noRepeat ? Math.max(1, num(t.noRepeatDays, 7)) : 0,
  includeSetPieces: Boolean(t.featureSetPieces),
  lockEnabled: Boolean(t.lockSurvives),
});

export function rulesFromServer(r) {
  if (!r) return null;
  const w = r.weights?.rarity || {};
  const tg = r.toggles || {};
  return {
    weights: normalizeWeights(Object.fromEntries(RARITIES.map((k) => [k, num(w[k]) * 100]))),
    bands: arr(r.bands).map((b) => [num(b.min), b.max == null || num(b.max) >= 100000 ? null : num(b.max)]),
    toggles: {
      hideOwned: true,
      noRepeat: num(tg.noRepeatDays, 7) > 0,
      noRepeatDays: num(tg.noRepeatDays, 7) || 7,
      minEpic: tg.epicFloor !== false,
      lockSurvives: tg.lockEnabled !== false,
      featureSetPieces: tg.includeSetPieces !== false,
    },
    newAccount: { days: num(tg.newAccountDays, 3), slotCap: num(tg.newAccountMaxPrice, 600) },
  };
}

export function rulesToServer(d) {
  return {
    weights: { rarity: Object.fromEntries(RARITIES.map((k) => [k, Math.round((num(d.weights?.[k]) / 100) * 1000) / 1000])) },
    bands: arr(d.bands).map((b, i) => ({ slot: i + 1, min: num(b[0]), max: b[1] == null ? 100000 : num(b[1]) })),
    toggles: { ...TOGGLE_TO_SERVER(d.toggles || {}), newAccountDays: num(d.newAccount?.days, 3), newAccountMaxPrice: num(d.newAccount?.slotCap, 600) },
  };
}

async function rulesFor() {
  const r = await adminFetch(`${BASE}/rules`);
  const versions = arr(r?.versions);
  const activeV = num(r?.active);
  const live = { version: activeV, ...rulesFromServer(r?.activeRules) };
  const draftRow = versions.filter((v) => v.status === "draft" && v.version > activeV).sort((a, b) => b.version - a.version)[0];
  let draft = null;
  if (draftRow) {
    const dv = await adminFetch(`${BASE}/rules/${draftRow.version}`).catch(() => null);
    if (dv?.rules) draft = { version: draftRow.version, ...rulesFromServer(dv.rules) };
  }
  const sched = versions.find((v) => v.status === "scheduled" && Date.parse(v.applyAt || "") > Date.now());
  const items = await liveCatalog().catch(() => []);
  const byCategory = {};
  const byRarity = {};
  let setOnly = 0;
  for (const it of items) {
    byCategory[it.category] = (byCategory[it.category] || 0) + 1;
    byRarity[it.rarity] = (byRarity[it.rarity] || 0) + 1;
    if (it.set_key) setOnly += 1;
  }
  const out = {
    live,
    draft,
    versions: versions.map((v) => ({ version: v.version, at: v.appliedAt || v.applyAt || v.createdAt, by: v.createdBy || null, note: v.note || "", status: v.status, builtIn: Boolean(v.builtIn), changeCount: v.changeCount })),
    scheduled: sched ? { version: sched.version, at: sched.applyAt } : null,
    pool: { total: items.length, byCategory, byRarity, setOnly, retired: null, legacyPool: Boolean(catalogCache?.legacyPool) },
  };
  rulesCache = out;
  return out;
}

/* ------------------------------------------------------------------ timeline */

const CLASH_KIND = {
  two_sets_same_day: "sameDay",
  legendary_density: "legendary",
  too_many_live_sets: "crowded",
  rule_switch_during_night: "ruleNight",
  night_on_launch_day: "nightLaunch",
  launch_during_event: "eventLaunch",
};
const QUEUE_KIND = { rule_apply: "rules", set_publish: "set", recall_finalize: "recall" };

async function timelineFor(from, days) {
  const r = await adminFetch(`${BASE}/timeline${qs({ from, days })}`);
  const lanes = r?.lanes || {};
  const ruleRows = arr(lanes.rules)
    .filter((v) => v.applyAt)
    .sort((a, b) => Date.parse(a.applyAt) - Date.parse(b.applyAt));
  const rulesCur = rulesCache?.live?.version ?? 0;
  const dayList = Array.from({ length: days }, (_, i) => addDays(from, i));
  const rules = dayList.map((day) => {
    const t = istMidnight(day) + H;
    const hit = ruleRows.filter((v) => Date.parse(v.applyAt) <= t && v.status !== "draft" && v.status !== "cancelled").pop();
    return { day, version: hit ? hit.version : rulesCur, scheduled: hit ? hit.status === "scheduled" : false };
  });
  const items = await liveCatalog().catch(() => []);
  const sets = arr(lanes.sets).map((s) =>
    normSet(
      { ...s, stockLeft: s.stockLimit == null ? null : Math.max(0, num(s.stockLimit) - num(s.stockSold)) },
      piecesByCatalog(items, s.key)
    )
  );
  const bands = rulesCache?.live?.bands || [];
  return {
    from: r?.from || from,
    days: r?.days || days,
    rules,
    sets,
    nights: arr(lanes.nights).map((n) => ({ id: n.id, at: n.startsAt, endsAt: n.endsAt, skipped: n.status === "skipped" || n.status === "cancelled", auto: n.auto })),
    events: arr(lanes.events).map((e) => ({ id: e.id, kind: e.kind || "event", label: e.title, startsAt: e.startsAt, endsAt: e.endsAt || new Date(Date.parse(e.startsAt) + DAY).toISOString() })),
    revenue: arr(lanes.revenue).map((x) => ({ day: x.day, value: num(x.revenue), sales: num(x.sales) })),
    clashes: arr(r?.clashes)
      .filter((c) => c.severity !== "info" || CLASH_KIND[c.code])
      .map((c) => ({ day: c.day, kind: CLASH_KIND[c.code] || "crowded", severity: c.severity, keys: arr(c.refs).filter((x) => String(x).startsWith("set:")).map((x) => String(x).slice(4)) })),
    queue: arr(r?.queue).map(queueRow),
    slotConversion: arr(r?.slotConversion).map((s, i) => ({ ...s, band: bands[i] || null })),
    toSet: { pct: r?.storefrontToSetPct ?? 0, delta: null },
    liveViewers: r?.liveViewers ?? null,
  };
}

function queueRow(q) {
  return { id: q.id, kind: QUEUE_KIND[q.kind] || q.kind, at: q.runAt, ref: q.kind === "rule_apply" ? null : `set:${q.ref}`, vars: { ref: q.ref }, detail: q.kind === "rule_apply" ? `v${q.ref}` : String(q.ref || ""), cancelable: true };
}

/* ------------------------------------------------------------------ user storefront */

function whyFrom(reasons) {
  return arr(reasons).map((r) => {
    switch (r.code) {
      case "locked":
        return { key: "adminShop2.us.why.locked" };
      case "band":
        return { key: "adminShop2.us.why.band", vars: { n: r.slot, a: r.min, b: r.max } };
      case "band_relaxed":
        return { key: "adminShop2.us.why.bandRelaxed", vars: { a: r.min, b: r.max } };
      case "epic_floor":
        return { key: "adminShop2.us.why.epicFloor" };
      case "rarity":
        return { key: "adminShop2.us.why.rarity", vars: { r: r.rarity, w: r.weight } };
      case "never_shown":
        return { key: "adminShop2.us.why.never" };
      case "unseen":
        return { key: "adminShop2.us.why.lastSeen", vars: { n: r.days } };
      case "new_item":
        return { key: "adminShop2.us.why.newItem" };
      case "wishlist":
        return { key: "adminShop2.us.why.wishlist" };
      case "set_progress":
        return { key: "adminShop2.us.why.setProgress", vars: { set: r.setKey } };
      case "set_piece":
        return { key: "adminShop2.us.why.setPiece", vars: { set: r.setKey } };
      case "repeat_relaxed":
        return { key: "adminShop2.us.why.repeatRelaxed" };
      case "chance":
        return { key: "adminShop2.us.why.chance", vars: { pct: r.pct } };
      default:
        return null;
    }
  }).filter(Boolean);
}

async function userStorefrontFor(userId, day) {
  const which = day === "tomorrow" ? "tomorrow" : "today";
  const r = await adminFetch(`${BASE}/users/${enc(userId)}/storefront${qs({ day: which })}`);
  const ex = r?.excluded || {};
  const pool = catalogCache?.items?.length ?? null;
  const exSum = Object.values(ex).reduce((a, b) => a + num(b), 0);
  const L = limitsCache?.limits || {};
  return {
    user: { id: r?.user?.id || userId, username: r?.user?.username || "", displayName: r?.user?.displayName || r?.user?.display_name || null, avatarUrl: r?.user?.avatarUrl || r?.user?.avatar_url || null },
    newAccount: Boolean(r?.newAccount),
    ownedCount: num(r?.ownedCount),
    wishlistCount: num(r?.wishlistCount),
    day: r?.day,
    resetsAt: new Date(nextReset(Date.now())).toISOString(),
    seed: r?.seed || "",
    ruleVersion: r?.ruleVersion ?? "",
    slots: arr(r?.slots).map((s) => ({ slot: s.slot, item: normItem(s.item), locked: Boolean(s.locked), owned: Boolean(s.owned), why: whyFrom(s.reasons) })),
    excluded: { owned: num(ex.owned), recent: num(ex.repeat), recentDays: rulesCache?.live?.toggles?.noRepeatDays ?? 7, region: num(ex.category_off) + num(ex.rarity_off), newAccountCap: num(ex.new_account), pool, candidates: pool != null ? Math.max(0, pool - exSum) : null },
    relaxed: arr(r?.relaxed),
    sets: arr(r?.sets).map((s) => ({ key: s.key, name: pickName(s.name), setPrice: num(s.setPrice), yourPrice: s.yourPrice, ownedPieces: num(s.owned), total: num(s.total) })),
    refresh: { used: Boolean(r?.refresh?.used), at: r?.refresh?.usedAt || null, free: Boolean(r?.refresh?.free), price: num(r?.refresh?.price, 150) },
    gifts: { sent: num(r?.gifts?.sentToday), cap: r?.gifts?.limitPerDay ?? L.gifts?.perDay ?? null, received: num(r?.gifts?.receivedToday), receiveCap: L.gifts?.receivePerDay ?? null, blocked: num(r?.gifts?.blockedToday) },
    nightMarket: r?.nightMarket || null,
    history: arr(r?.last7).map((d) => ({ day: d.day, refreshes: num(d.refreshes), items: arr(d.slots).map((s) => ({ item: normItem(s.item), bought: Boolean(s.purchased) })) })),
    totals: { impressions: num(r?.last7Summary?.shown), buys: num(r?.last7Summary?.purchased), refreshes: num(r?.last7Summary?.refreshes) },
  };
}

/* ------------------------------------------------------------------ night market */

const toMonFirst = (js) => (Number(js) + 6) % 7;
const toJs = (mon) => (Number(mon) + 1) % 7;
const hh = (h) => `${String(Math.floor(h) % 24).padStart(2, "0")}:${h % 1 ? "30" : "00"}`;

async function nightFor() {
  const [r, preview] = await Promise.all([adminFetch(`${BASE}/night-markets${qs({ days: 31 })}`), adminFetch(`${BASE}/night-markets/preview`, json("POST", {})).catch(() => null)]);
  const d = r?.defaults || {};
  const upcoming = arr(r?.upcoming);
  const start = num(d.startHour, 22);
  const end = start + num(d.durationHours, 4);
  const manualDates = upcoming.filter((n) => !n.auto && n.status !== "skipped" && n.status !== "cancelled").map((n) => istDay(Date.parse(n.startsAt)));
  const skipDates = upcoming.filter((n) => n.status === "skipped").map((n) => istDay(Date.parse(n.startsAt)));
  const next = upcoming.filter((n) => n.status !== "skipped" && n.status !== "cancelled" && Date.parse(n.endsAt) > Date.now()).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0];
  return {
    raw: r,
    schedule: {
      mode: d.enabled === false ? "manual" : "calendar",
      weekdays: arr(d.weekdays).map(toMonFirst).sort(),
      dates: manualDates,
      skipDates,
      openFrom: hh(start),
      openTo: hh(end),
      cards: num(d.cards, 6),
      flips: num(d.flips, 3),
      keepMax: num(d.keepMax, 2),
      discountMin: num(d.discountMin, 15),
      discountMax: num(d.discountMax, 60),
      skew: num(d.skew, 2.2),
      eligibility: { minAccountDays: num(upcoming.find((n) => n.eligibility?.minAccountDays)?.eligibility?.minAccountDays, 0), premiumOnly: Boolean(upcoming.find((n) => n.eligibility?.premiumOnly)) },
    },
    open: r?.open ? { id: r.open.id, closesAt: r.open.endsAt, undoable: r.open.undoable } : null,
    next: next ? { id: next.id, at: next.startsAt } : null,
    upcoming,
    distribution: arr(r?.distribution),
    eligibleCount: r?.eligibleUsers ?? preview?.eligibleUsers ?? null,
    forecast: r?.forecast || null,
    past: arr(r?.past).map((p) => ({ id: p.id, day: istDay(Date.parse(p.startsAt)), participants: num(p.report?.participants), flips: num(p.report?.flips), buyPct: num(p.report?.conversionPct), revenue: num(p.report?.revenue), avgDiscount: p.report?.avgDiscountPct ?? null })),
    preview: preview ? { cards: arr(preview.cards).map((c) => ({ item: normItem(c.item), discount: num(c.discountPct), price: num(c.price), listPrice: num(c.listPrice) })) } : null,
  };
}

/** Save the night market plan: defaults (limits.nightMarket) + manual nights + skips. */
async function saveNightPlan(s, saved, reason, raw) {
  const [fh, fm] = String(s.openFrom || "22:00").split(":").map(Number);
  const [th, tm] = String(s.openTo || "02:00").split(":").map(Number);
  const startHour = fh + (fm || 0) / 60;
  let dur = th + (tm || 0) / 60 - startHour;
  if (dur <= 0) dur += 24;
  const nightMarket = {
    enabled: s.mode === "calendar",
    weekdays: arr(s.weekdays).map(toJs),
    startHour: Math.floor(startHour),
    durationHours: Math.round(dur),
    cards: num(s.cards, 6),
    flips: num(s.flips, 3),
    keepMax: num(s.keepMax, 2),
    discountMin: num(s.discountMin),
    discountMax: num(s.discountMax),
    skew: num(s.skew, 2.2),
  };
  await adminFetch(`${BASE}/limits`, json("PUT", { limits: { nightMarket }, reason }));
  const eligibility = { minAccountDays: num(s.eligibility?.minAccountDays) || undefined, premiumOnly: Boolean(s.eligibility?.premiumOnly) || undefined };
  const at = (day) => new Date(istMidnight(day) + Math.floor(startHour) * H).toISOString();
  // New manual / random nights.
  for (const day of arr(s.dates).filter((x) => !arr(saved.dates).includes(x))) {
    const body = s.mode === "random" ? { mode: "random", windowStart: new Date(istMidnight(day) + 18 * H).toISOString(), windowEnd: new Date(istMidnight(day) + 30 * H).toISOString(), durationHours: Math.round(dur) } : { startsAt: at(day), durationHours: Math.round(dur), mode: "manual" };
    await adminFetch(`${BASE}/night-markets`, json("POST", { ...body, cards: nightMarket.cards, flips: nightMarket.flips, discountMin: nightMarket.discountMin, discountMax: nightMarket.discountMax, skew: nightMarket.skew, eligibility, note: reason }));
  }
  // Removed manual nights.
  for (const day of arr(saved.dates).filter((x) => !arr(s.dates).includes(x))) {
    const row = arr(raw?.upcoming).find((n) => !n.auto && istDay(Date.parse(n.startsAt)) === day);
    if (row) await adminFetch(`${BASE}/night-markets/${enc(row.id)}`, json("DELETE", {}));
  }
  // Skipped default nights.
  for (const day of arr(s.skipDates).filter((x) => !arr(saved.skipDates).includes(x))) {
    await adminFetch(`${BASE}/night-markets/${enc(`auto-${day}`)}/skip`, json("POST", { reason }));
  }
}

/* ------------------------------------------------------------------ limits */

function limitsFor(r) {
  limitsCache = r;
  const L = r?.limits || {};
  return {
    gift: { ...(L.gifts || {}) },
    refresh: { ...(L.refresh || {}) },
    purchases: { ...(L.purchases || {}) },
    nightMarket: { ...(L.nightMarket || {}) },
    version: r?.version ?? 1,
    updatedAt: r?.updatedAt || null,
    updatedBy: r?.updatedBy || null,
    undoUntil: r?.undo?.until || null,
    stats: {
      refreshToday: num(r?.usage?.refreshesToday),
      refreshRevenue: num(r?.usage?.refreshRevenueToday),
      giftsToday: num(r?.usage?.giftsToday),
      giftBlockedToday: num(r?.usage?.blockedToday),
      blockedByCode: r?.usage?.blockedByCode || {},
      openFlags: num(r?.openFlags),
    },
    blockedMessages: arr(r?.blockedMessages),
  };
}

/* ------------------------------------------------------------------ audit */

const UNDO_WINDOW = { set_recall: 30, limits_update: 10, night_open_now: 5, set_publish: 1 / 6 };

function auditRow(e) {
  const action = String(e.action || "").replace(/^shop2_/, "");
  const meta = e.meta || {};
  const win = UNDO_WINDOW[action];
  return {
    id: e.id,
    at: e.at,
    actor: e.actorUsername || null,
    action,
    reason: meta.reason || meta.note || null,
    target: e.target || null,
    setKey: action.startsWith("set_") || action.startsWith("ab_") ? e.target : null,
    targetUserId: action === "free_refresh" || action === "storefront_regenerate" ? e.target : null,
    vars: { v: meta.version ?? e.target ?? "" },
    undoable: Boolean(win),
    undoUntil: win ? new Date(Date.parse(e.at) + win * 60000).toISOString() : null,
    meta,
  };
}

/* ------------------------------------------------------------------ API */

export const shop2Api = {
  dashboard: (range = "today") => dashboardFor(range),

  sets: async () => {
    const [r, items] = await Promise.all([adminFetch(`${BASE}/sets`), liveCatalog().catch(() => [])]);
    return arr(r?.sets).map((s) => normSet(s, piecesByCatalog(items, s.key))).filter(Boolean);
  },
  set: async (key) => {
    const r = await adminFetch(`${BASE}/sets/${enc(key)}`);
    const set = normSet(r);
    for (const s of SET_SLOTS) if (set.pieces[s]) set.ownerShares[set.pieces[s].id] = set.pieces[s].owners;
    const running = arr(r?.abTests).find((x) => x.status === "running" || x.status === "active");
    if (running) set.abTest = { enabled: true, id: running.id, priceB: round10(set.sum * (1 - num(running.discountB) / 100)), hours: Math.max(1, Math.round((Date.parse(running.endsAt) - Date.parse(running.startsAt)) / H)) || 48, results: running.results || null };
    set.suggestPct = r?.suggestion?.pct ?? null;
    set.payers = arr(r?.payers);
    set.serverForecast = r?.forecast || null;
    set.serverChecklist = arr(r?.checklist);
    set.priceHistory30d = arr(r?.priceHistory30d);
    set.versions = arr(r?.versions);
    return { set, sampleUsers: [] };
  },
  /** body: bodyOf() from the builder. Creates the draft when the set has no key yet. */
  createSet: async (body) => {
    const key = body.key || slug(body.name);
    const r = await adminFetch(`${BASE}/sets`, json("POST", { key, ...toSetPatch(body) }));
    return { key: r?.set?.set_key || key };
  },
  saveSet: async (key, body, { reason } = {}) => {
    await adminFetch(`${BASE}/sets/${enc(key)}`, json("PATCH", { ...toSetPatch(body), reason: reason || undefined }));
    await syncAbTest(key, body);
  },
  /** Timeline edge drag / bar menu: one field. */
  patchSet: (key, patch, reason) => adminFetch(`${BASE}/sets/${enc(key)}`, json("PATCH", { ...patch, reason: reason || undefined })),
  publishSet: (key, { at = null } = {}) => adminFetch(`${BASE}/sets/${enc(key)}/publish`, json("POST", { at })),
  unpublishSet: (key) => adminFetch(`${BASE}/sets/${enc(key)}/publish/undo`, json("POST", {})),
  duplicateSet: async (set) => {
    const key = `${String(set.key || slug(set.name)).slice(0, 30)}-${Date.now().toString(36).slice(-5)}`;
    await adminFetch(`${BASE}/sets`, json("POST", { key, ...toSetPatch({ ...set, pieces: set.pieces, startsAt: null, endsAt: null }) }));
    return { key };
  },
  shiftSet: (key, days) => adminFetch(`${BASE}/sets/${enc(key)}/shift`, json("POST", { days })),
  addStock: (set, add, reason = "") => adminFetch(`${BASE}/sets/${enc(set.key)}`, json("PATCH", { stockLimit: num(set.stock?.total) + add, reason: reason || "stock +100" })),
  extendSet: (set, hours, reason = "") => adminFetch(`${BASE}/sets/${enc(set.key)}`, json("PATCH", { endsAt: new Date((Date.parse(set.endsAt || "") || Date.now()) + hours * H).toISOString(), reason: reason || "extend" })),

  /** Recall preview: collected (refund option), buyers, purchases, wishlists, pending gifts. */
  recallImpact: async (key) => {
    const [keep, refund] = await Promise.all([adminFetch(`${BASE}/sets/${enc(key)}/recall-preview${qs({ option: "keep" })}`), adminFetch(`${BASE}/sets/${enc(key)}/recall-preview${qs({ option: "refund" })}`).catch(() => null)]);
    return {
      purchases: num(keep?.purchases),
      buyers: num(keep?.buyers),
      revenue: num(refund?.refundTotal),
      inWishlists: num(keep?.inWishlists),
      giftsPending: num(keep?.giftsPending),
      giftsPendingAmount: num(keep?.giftsPendingAmount),
      notify: num(keep?.notify),
      undoMinutes: num(keep?.undoMinutes, 30),
    };
  },
  recallSet: (key, { mode, reason, swapFrom, swapTo }) =>
    adminFetch(`${BASE}/sets/${enc(key)}/recall`, json("POST", { reason, option: mode === "swap" ? "replace" : mode, replace: mode === "swap" ? { fromItemId: swapFrom, toItemId: swapTo } : undefined })),
  undoRecall: (key) => adminFetch(`${BASE}/sets/${enc(key)}/recall/undo`, json("POST", {})),

  /** Rack: the live catalog (set-piece categories) with palettes of their own set for the score. */
  catalog: async ({ setKey = null, palettes = {} } = {}) => {
    const items = (await liveCatalog()).filter((it) => SET_SLOTS.includes(it.category));
    let scores = {};
    if (setKey) {
      const lists = await Promise.all(SET_SLOTS.map((c) => adminFetch(`${BASE}/sets/${enc(setKey)}/suggestions${qs({ category: c })}`).catch(() => null)));
      for (const l of lists) for (const s of arr(l?.suggestions)) scores[String(s.item?.id)] = s.score;
    }
    const out = items.map((it) => ({ ...it, palette: it.set_key && palettes[it.set_key] ? palettes[it.set_key] : it.palette, serverScore: scores[String(it.id)] ?? null }));
    return { items: out, total: out.length };
  },
  catalogByCategory: async (category) => (await liveCatalog()).filter((it) => it.category === category),

  rules: () => rulesFor(),
  simulate: async (draft, sample = 10000) => {
    const r = await adminFetch(`${BASE}/rules/simulate`, json("POST", { rules: rulesToServer(draft), sample }));
    const share = r?.rarityShare || {};
    const pct = (v) => (v == null ? 0 : v <= 1 ? Math.round(v * 1000) / 10 : num(v));
    return {
      sample: num(r?.sample, sample),
      empty: num(r?.emptyStorefronts),
      withEpicPct: num(r?.withEpicPct),
      epicForcedPct: num(r?.epicFloorForcedPct),
      avgValue: num(r?.avgStorefrontValue),
      avgValueDelta: r?.delta?.avgStorefrontValue ?? null,
      neverShown: num(r?.neverShownCount),
      neverShownDelta: r?.delta?.neverShownCount ?? null,
      rarity: Object.fromEntries(RARITIES.map((k) => [k, { target: num(draft?.weights?.[k]), actual: pct(share[k]) }])),
      slots: arr(r?.avgSlotPrice).map((p) => ({ avgPrice: p })),
      changes: arr(r?.changes),
    };
  },
  /** Draft → new rule version (note = reason) → scheduled for the next 00:00 Istanbul. */
  applyRules: async ({ draft, reason, basedOn }) => {
    const v = await adminFetch(`${BASE}/rules`, json("POST", { rules: rulesToServer(draft), note: reason, basedOn }));
    const version = typeof v?.version === "object" ? v.version.version : v?.version;
    await adminFetch(`${BASE}/rules/${enc(version)}/schedule`, json("POST", {}));
    return { version };
  },
  revertRules: (version, reason) => adminFetch(`${BASE}/rules/${enc(version)}/activate`, json("POST", { reason })),
  cancelRules: (version) => adminFetch(`${BASE}/rules/${enc(version)}/cancel`, json("POST", {})),

  userStorefront: (userId, day = "today") => userStorefrontFor(userId, day),
  regenerate: (userId, reason) => adminFetch(`${BASE}/users/${enc(userId)}/storefront/regenerate`, json("POST", { reason })),
  grantRefresh: (userId, reason) => adminFetch(`${BASE}/users/${enc(userId)}/storefront/free-refresh`, json("POST", { reason })),
  searchUsers: async (q) => {
    const r = await adminFetch(`${BASE}/users${qs({ q })}`);
    return { users: arr(r?.users).map((u) => ({ id: u.id, username: u.username, displayName: u.displayName || u.display_name || null, avatarUrl: u.avatarUrl || u.avatar_url || null })) };
  },

  nightMarket: () => nightFor(),
  nightPreview: async (body) => {
    const r = await adminFetch(`${BASE}/night-markets/preview`, json("POST", body || {}));
    return { cards: arr(r?.cards).map((c) => ({ item: normItem(c.item), discount: num(c.discountPct), price: num(c.price), listPrice: num(c.listPrice) })), eligibleUsers: r?.eligibleUsers ?? null, distribution: arr(r?.distribution) };
  },
  saveNightMarket: (schedule, saved, reason, raw) => saveNightPlan(schedule, saved, reason, raw),
  openNightNow: async (reason, minutes) => {
    const r = await adminFetch(`${BASE}/night-markets/open-now`, json("POST", { reason, durationHours: Math.max(1, Math.round(minutes / 60)) }));
    return { id: r?.night?.id, undoUntil: r?.undoUntil };
  },
  undoNightOpen: (id) => adminFetch(`${BASE}/night-markets/${enc(id)}/undo`, json("POST", {})),
  /** Skip every planned night of the current Istanbul week (Mon–Sun). */
  skipWeek: async (reason, upcoming) => {
    const today = istDay(Date.now());
    const wd = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
    const end = addDays(today, 7 - wd);
    const ids = arr(upcoming).filter((n) => n.status !== "skipped" && istDay(Date.parse(n.startsAt)) < end).map((n) => n.id);
    for (const id of ids) await adminFetch(`${BASE}/night-markets/${enc(id)}/skip`, json("POST", { reason }));
    return { skipped: ids.length };
  },

  limits: async () => limitsFor(await adminFetch(`${BASE}/limits`)),
  /** patch: { gifts?, refresh?, purchases? } (server names). */
  saveLimits: (patch, reason) => adminFetch(`${BASE}/limits`, json("PUT", { limits: patch, reason })),
  undoLimits: () => adminFetch(`${BASE}/limits/undo`, json("POST", {})),
  limitsImpact: (gifts) => adminFetch(`${BASE}/limits/impact`, json("POST", { gifts })),
  freezeGifts: (frozen, reason) => adminFetch(`${BASE}/gifts/freeze`, json("POST", { frozen, reason })),
  giftFlags: async () => arr((await adminFetch(`${BASE}/gifts/flags`))?.flags),
  resolveFlag: (id, action, reason) => adminFetch(`${BASE}/gifts/flags/${enc(id)}/resolve`, json("POST", { action, reason })),

  timeline: (from, days = 14) => timelineFor(from, days),
  cancelQueued: (id) => adminFetch(`${BASE}/queue/${enc(id)}/cancel`, json("POST", {})),

  audit: async ({ before, limit = 60 } = {}) => {
    const r = await adminFetch(`${BASE}/audit${qs({ before, limit })}`);
    const entries = arr(r?.entries).map(auditRow);
    return { entries, nextCursor: entries.length >= limit ? entries[entries.length - 1].at : null };
  },
  /** Undo what an audit row did, while its window is open (recall 30 min, limits 10, night 5). */
  undoAudit: async (e) => {
    if (e.action === "set_recall") return adminFetch(`${BASE}/sets/${enc(e.target)}/recall/undo`, json("POST", {}));
    if (e.action === "limits_update") return adminFetch(`${BASE}/limits/undo`, json("POST", {}));
    if (e.action === "night_open_now") return adminFetch(`${BASE}/night-markets/${enc(e.target)}/undo`, json("POST", {}));
    if (e.action === "set_publish") return adminFetch(`${BASE}/sets/${enc(e.target)}/publish/undo`, json("POST", {}));
    const err = new Error("undo_unsupported");
    err.code = "undo_unsupported";
    throw err;
  },
};

/** Builder body → server set patch (price is a discount on the sum of pieces). */
export function toSetPatch(b) {
  const pieces = SET_SLOTS.map((s) => b.pieces?.[s]).filter(Boolean);
  const pr = setPricing(pieces, b.price);
  const out = {
    name: b.nameI18n ? { ...b.nameI18n, [LOCALE]: b.name } : b.name,
    palette: arr(b.palette).filter((c) => /^#[0-9a-f]{6}$/i.test(c)).map((c) => c.toLowerCase()),
    pieceIds: pieces.map((p) => String(p.id)),
    startsAt: b.startsAt || null,
    endsAt: b.endsAt || null,
    stockLimit: b.stock?.total ?? null,
  };
  if (pr.sum > 0 && b.price > 0) out.discountPct = Math.round(pr.discountPct);
  return out;
}

async function syncAbTest(key, body) {
  const ab = body.abTest;
  const pieces = SET_SLOTS.map((s) => body.pieces?.[s]).filter(Boolean);
  const sum = pieces.reduce((a, p) => a + num(p.price_descoin), 0);
  if (ab?.enabled && !ab.id && sum > 0) {
    const discountA = Math.round((1 - num(body.price) / sum) * 100);
    const discountB = Math.round((1 - num(ab.priceB) / sum) * 100);
    await adminFetch(`${BASE}/ab-tests`, json("POST", { setKey: key, discountA, discountB, split: 50, endsAt: new Date(Date.now() + num(ab.hours, 48) * H).toISOString() }));
  } else if (!ab?.enabled && body.abTestId) {
    await adminFetch(`${BASE}/ab-tests/${enc(body.abTestId)}/stop`, json("POST", {}));
  }
}

/* ------------------------------------------------------------------ errors */

const CODES = [
  "reason_required", "bad_set_key", "set_exists", "bad_time", "bad_window", "bad_option", "bad_replace", "set_recalled", "not_draft",
  "ab_running", "ab_same_price", "not_scheduled", "night_open", "night_started", "title_required", "undo_expired", "undo_unsupported", "not_found", "rate_limited",
];
const UPPER = { STEP_UP_REQUIRED: "stepUp", ADMIN_PERMISSION_DENIED: "permission", ADMIN_2FA_REQUIRED: "stepUp" };

export function errKey(e) {
  if (e?.code && UPPER[e.code]) return `adminShop2.err.${UPPER[e.code]}`;
  if (e?.code && CODES.includes(e.code)) return `adminShop2.err.${e.code}`;
  if (e?.status === 404 && !e?.code) return "adminShop2.err.notReady";
  if (e?.status === 403) return "adminShop2.err.permission";
  return "adminShop2.err.generic";
}
export const ERR_CODES = CODES;
