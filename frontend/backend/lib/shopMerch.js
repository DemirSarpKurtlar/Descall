"use strict";

/**
 * Shop merchandising rules (Mağaza remake, Nov 2026). Pure functions only, no I/O, so the
 * catalog route, the purchase route and the admin desk all decide the same way:
 *   - effective price: the best active discount (item sale window or a discount campaign)
 *   - availability: scheduled / live / expired / sold out (limited stock, time windows, drops)
 *   - storefront sections in admin order (manual, weekly rotating pool, new, bestsellers, ...)
 *   - bulk price changes with rounding
 *   - reconciliation fix plans (balance <-> ledger)
 * Test: backend/lib/shopMerch.selftest.cjs
 */

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
/** Turkey has no DST: storefront days and rotation boundaries use UTC+3. */
const TR_OFFSET_MIN = 180;

const MERCH_COLUMNS = "id, stock_limit, stock_sold, available_from, available_until, sale_pct, sale_starts_at, sale_ends_at, updated_at";

function ms(value) {
  if (value == null || value === "") return null;
  const t = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

function nowMs(now) {
  return now == null ? Date.now() : ms(now) ?? Date.now();
}

function intOrNull(value) {
  if (value == null || value === "") return null;
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? n : null;
}

function clampPct(value) {
  const n = intOrNull(value);
  if (n == null || n <= 0) return 0;
  return Math.min(95, n);
}

/** [start, end) contains now; a missing bound is open. */
function inWindow(start, end, now) {
  const t = nowMs(now);
  const s = ms(start);
  const e = ms(end);
  if (s != null && t < s) return false;
  if (e != null && t >= e) return false;
  return true;
}

/* ------------------------------------------------------------------ campaigns */

function campaignStatus(campaign, now) {
  if (!campaign) return "ended";
  if (campaign.enabled === false) return "draft";
  const t = nowMs(now);
  const s = ms(campaign.starts_at);
  const e = ms(campaign.ends_at);
  if (s != null && t < s) return "scheduled";
  if (e != null && t >= e) return "ended";
  return "active";
}

function scopeOf(campaign) {
  const s = campaign && campaign.scope;
  return s && typeof s === "object" ? s : {};
}

function campaignCoversItem(campaign, item) {
  if (!campaign || !item) return false;
  const scope = scopeOf(campaign);
  if (scope.all === true) return true;
  if (Array.isArray(scope.categories) && scope.categories.includes(item.category)) return true;
  if (Array.isArray(scope.itemIds) && scope.itemIds.map(String).includes(String(item.id))) return true;
  return false;
}

/* ------------------------------------------------------------------ price */

/** Whole DesCoin after `pct` off. */
function discounted(list, pct) {
  const base = Math.max(0, Math.round(Number(list) || 0));
  const p = clampPct(pct);
  if (!p) return base;
  // A paid item never becomes free through a discount.
  return Math.max(base > 0 ? 1 : 0, Math.round((base * (100 - p)) / 100));
}

/**
 * The price a buyer pays right now.
 * Returns { list, price, pct, source: "item" | "campaign" | null, campaignId, endsAt }.
 */
function effectivePricing(item, campaigns = [], now) {
  const list = Math.max(0, Math.round(Number(item?.price_descoin) || 0));
  let best = { pct: 0, source: null, campaignId: null, endsAt: null };
  const own = clampPct(item?.sale_pct);
  if (own && inWindow(item.sale_starts_at, item.sale_ends_at, now)) {
    best = { pct: own, source: "item", campaignId: null, endsAt: item.sale_ends_at || null };
  }
  for (const c of campaigns || []) {
    if (c?.kind !== "discount") continue;
    if (campaignStatus(c, now) !== "active") continue;
    if (!campaignCoversItem(c, item)) continue;
    const pct = clampPct(c.discount_pct);
    if (pct > best.pct) best = { pct, source: "campaign", campaignId: c.id || null, endsAt: c.ends_at || null };
  }
  return { list, price: discounted(list, best.pct), ...best };
}

/* ------------------------------------------------------------------ availability */

/** Drop campaigns that list this item (any status but draft). */
function dropsFor(item, campaigns = []) {
  return (campaigns || []).filter((c) => c?.kind === "drop" && c.enabled !== false && campaignCoversItem(c, item));
}

/**
 * Whether the item can be seen and bought now.
 * state: "scheduled" | "live" | "expired" | "soldout"
 * Returns { state, stockLeft (null = unlimited), startsAt, endsAt }.
 */
function availability(item, campaigns = [], now) {
  const t = nowMs(now);
  let startsAt = item?.available_from || null;
  let endsAt = item?.available_until || null;
  const drops = dropsFor(item, campaigns);
  if (drops.length) {
    // The item is on sale while any of its drops is open.
    const open = drops.find((c) => campaignStatus(c, t) === "active");
    const next = drops
      .filter((c) => campaignStatus(c, t) === "scheduled")
      .sort((a, b) => ms(a.starts_at) - ms(b.starts_at))[0];
    if (open) {
      if (!endsAt || ms(open.ends_at) < ms(endsAt)) endsAt = open.ends_at;
    } else if (next) {
      return { state: "scheduled", stockLeft: stockLeftOf(item), startsAt: next.starts_at, endsAt: next.ends_at };
    } else {
      return { state: "expired", stockLeft: stockLeftOf(item), startsAt, endsAt: drops[0].ends_at };
    }
  }
  const s = ms(startsAt);
  const e = ms(endsAt);
  if (s != null && t < s) return { state: "scheduled", stockLeft: stockLeftOf(item), startsAt, endsAt };
  if (e != null && t >= e) return { state: "expired", stockLeft: stockLeftOf(item), startsAt, endsAt };
  const left = stockLeftOf(item);
  if (left != null && left <= 0) return { state: "soldout", stockLeft: 0, startsAt, endsAt };
  return { state: "live", stockLeft: left, startsAt, endsAt };
}

function stockLeftOf(item) {
  const limit = intOrNull(item?.stock_limit);
  if (limit == null) return null;
  return Math.max(0, limit - Math.max(0, intOrNull(item?.stock_sold) || 0));
}

/** Shown in the user shop: live and sold-out items (sold out stays visible, disabled). */
function isListed(av) {
  return av && (av.state === "live" || av.state === "soldout");
}

/**
 * Catalog payload fields for one item. `price_descoin` becomes the effective price so every
 * client (old builds too) shows and pays the sale price; the list price rides along.
 */
function merchFields(item, campaigns = [], now) {
  const pricing = effectivePricing(item, campaigns, now);
  const av = availability(item, campaigns, now);
  return {
    price_descoin: pricing.price,
    list_price_descoin: pricing.list,
    discount_pct: pricing.pct || 0,
    sale_ends_at: pricing.pct ? pricing.endsAt : null,
    stock_limit: intOrNull(item?.stock_limit),
    stock_left: av.stockLeft,
    available_until: av.endsAt || null,
    sold_out: av.state === "soldout",
  };
}

/* ------------------------------------------------------------------ storefront */

/** Local (UTC+3) week index, weeks starting on `weekday` (1 = Monday) 00:00. */
function weekIndex(now, weekday = 1, offsetMin = TR_OFFSET_MIN) {
  const local = nowMs(now) + offsetMin * 60_000;
  // 1970-01-01 was a Thursday (day 4). Shift so the week starts on `weekday`.
  const shift = ((4 - weekday + 7) % 7) * DAY_MS;
  return Math.floor((local + shift) / WEEK_MS);
}

/** UTC ms of the next rotation boundary after now. */
function nextRotationAt(now, weekday = 1, offsetMin = TR_OFFSET_MIN) {
  const idx = weekIndex(now, weekday, offsetMin) + 1;
  const shift = ((4 - weekday + 7) % 7) * DAY_MS;
  return idx * WEEK_MS - shift - offsetMin * 60_000;
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stable shuffle of ids for a seed (mulberry32). */
function seededOrder(ids, seed) {
  let a = hashString(String(seed)) || 1;
  const rand = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...ids].sort();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Weekly pick: the pool is shuffled once per section (stable), and week w shows the w-th
 * window of `count` items, so nothing repeats for floor(pool / count) - 1 weeks.
 * Returns { ids, repeatFreeWeeks }.
 */
function rotationPick(poolIds, count, week, seed) {
  const pool = [...new Set((poolIds || []).map(String))];
  const n = Math.max(1, Math.min(pool.length, Math.round(Number(count) || 8)));
  if (!pool.length) return { ids: [], repeatFreeWeeks: 0 };
  const order = seededOrder(pool, seed);
  const start = (((week * n) % order.length) + order.length) % order.length;
  const ids = [];
  for (let i = 0; i < n; i += 1) ids.push(order[(start + i) % order.length]);
  return { ids, repeatFreeWeeks: Math.max(0, Math.floor(pool.length / n) - 1) };
}

function rotationPool(section, items) {
  const cfg = section?.config || {};
  const rarities = Array.isArray(cfg.rarities) && cfg.rarities.length ? new Set(cfg.rarities) : null;
  const categories = Array.isArray(cfg.categories) && cfg.categories.length ? new Set(cfg.categories) : null;
  return items.filter((it) => (!rarities || rarities.has(it.rarity)) && (!categories || categories.has(it.category)));
}

function sectionVisible(section, campaigns = [], now) {
  if (!section || section.enabled === false) return false;
  if (!inWindow(section.visible_from, section.visible_until, now)) return false;
  const gates = (campaigns || []).filter(
    (c) => c?.kind === "storefront" && c.enabled !== false && String(scopeOf(c).sectionId || "") === String(section.id)
  );
  if (gates.length && !gates.some((c) => campaignStatus(c, now) === "active")) return false;
  return true;
}

/**
 * Resolve storefront sections for the user shop.
 * `items` = listed catalog items (already filtered), each with id, category, rarity, created_at,
 * stock_left, available_until, discount_pct, sale_ends_at.
 * `salesByItem` = Map(itemId -> sales count over the bestseller window).
 * Returns [{ id, title, subtitle, kind, itemIds, endsAt, nextRotationAt }] in admin order,
 * empty sections dropped.
 */
function resolveSections(sections = [], items = [], { now, salesByItem = new Map(), campaigns = [] } = {}) {
  const t = nowMs(now);
  const byId = new Map(items.map((it) => [String(it.id), it]));
  const out = [];
  const ordered = [...(sections || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || String(a.created_at || "").localeCompare(String(b.created_at || "")));
  for (const s of ordered) {
    if (!sectionVisible(s, campaigns, t)) continue;
    const cfg = s.config || {};
    const limit = Math.max(1, Math.min(60, Math.round(Number(cfg.limit) || 12)));
    let ids = [];
    let nextRot = null;
    if (s.kind === "manual") {
      ids = (s.item_ids || []).map(String).filter((id) => byId.has(id));
    } else if (s.kind === "rotating") {
      const weekday = Number.isInteger(cfg.weekday) ? cfg.weekday : 1;
      const pool = rotationPool(s, items).map((it) => String(it.id));
      ids = rotationPick(pool, cfg.count || 8, weekIndex(t, weekday), s.id).ids;
      nextRot = new Date(nextRotationAt(t, weekday)).toISOString();
    } else if (s.kind === "new") {
      const days = Math.max(1, Math.round(Number(cfg.days) || 14));
      ids = items
        .filter((it) => ms(it.created_at) != null && t - ms(it.created_at) <= days * DAY_MS)
        .sort((a, b) => ms(b.created_at) - ms(a.created_at))
        .map((it) => String(it.id));
    } else if (s.kind === "bestsellers") {
      ids = items
        .filter((it) => (salesByItem.get(String(it.id)) || 0) > 0)
        .sort((a, b) => (salesByItem.get(String(b.id)) || 0) - (salesByItem.get(String(a.id)) || 0))
        .map((it) => String(it.id));
    } else if (s.kind === "limited") {
      const endOf = (it) => Math.min(ms(it.available_until) ?? Infinity, ms(it.sale_ends_at) ?? Infinity);
      ids = items
        .filter((it) => it.stock_left != null || it.available_until || it.discount_pct)
        .sort((a, b) => endOf(a) - endOf(b))
        .map((it) => String(it.id));
    } else if (s.kind === "category") {
      ids = items.filter((it) => it.category === cfg.category).map((it) => String(it.id));
    }
    ids = ids.slice(0, limit);
    if (!ids.length) continue;
    const ends = ids
      .map((id) => byId.get(id))
      .map((it) => Math.min(ms(it?.available_until) ?? Infinity, ms(it?.sale_ends_at) ?? Infinity))
      .filter(Number.isFinite);
    out.push({
      id: String(s.id),
      title: s.title,
      subtitle: s.subtitle || null,
      kind: s.kind,
      itemIds: ids,
      endsAt: ms(s.visible_until) != null ? s.visible_until : ends.length ? new Date(Math.min(...ends)).toISOString() : null,
      nextRotationAt: nextRot,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ bulk price */

const ROUNDINGS = Object.freeze({ none: 1, "10": 10, "50": 50, "100": 100 });

/** Nearest multiple, ties go down (2975 -> 2950 at 50). */
function roundTo(value, step) {
  const s = ROUNDINGS[String(step)] || 1;
  if (s <= 1) return Math.max(0, Math.round(value));
  return Math.max(0, Math.ceil(value / s - 0.5) * s);
}

/**
 * New list price for one item.
 * op = { type: "fixed" | "percent" | "delta", value, rounding }
 * Returns a whole number >= 0, or null when the op is invalid.
 */
function applyPriceOp(price, op = {}) {
  const base = Math.max(0, Math.round(Number(price) || 0));
  const v = Number(op.value);
  if (!Number.isFinite(v)) return null;
  let next;
  if (op.type === "fixed") next = v;
  else if (op.type === "percent") {
    if (v <= -100 || v > 500) return null;
    next = base * (1 + v / 100);
  } else if (op.type === "delta") next = base + v;
  else return null;
  return Math.min(10_000_000, roundTo(next, op.rounding || "none"));
}

/* ------------------------------------------------------------------ reconciliation */

const FIX_MODES = Object.freeze(["balance_to_ledger", "ledger_to_balance", "note"]);

/**
 * What a fix changes. drift = balance - ledgerSum.
 * balance_to_ledger: balance becomes ledgerSum, no ledger row.
 * ledger_to_balance: one ledger row of `drift`, balance unchanged.
 * note: nothing.
 * Returns { ok, balanceAfter, ledgerAmount, drift, error }.
 */
function planReconcileFix({ mode, balance, ledgerSum }) {
  const b = Math.round(Number(balance) || 0);
  const l = Math.round(Number(ledgerSum) || 0);
  const drift = b - l;
  if (!FIX_MODES.includes(mode)) return { ok: false, error: "BAD_MODE", drift };
  if (mode === "note") return { ok: true, balanceAfter: b, ledgerAmount: 0, drift };
  if (drift === 0) return { ok: false, error: "NO_DRIFT", drift };
  if (mode === "balance_to_ledger") {
    if (l < 0) return { ok: false, error: "NEGATIVE_LEDGER", drift };
    return { ok: true, balanceAfter: l, ledgerAmount: 0, drift };
  }
  return { ok: true, balanceAfter: b, ledgerAmount: drift, drift };
}

/** Next scheduled reconciliation (Istanbul hour_of_day, every interval_hours). */
function nextReconcileAt(lastStartedAt, settings = {}, now) {
  const interval = [6, 12, 24].includes(Number(settings.interval_hours)) ? Number(settings.interval_hours) : 24;
  const hour = Number.isInteger(Number(settings.hour_of_day)) ? Number(settings.hour_of_day) : 4;
  const t = nowMs(now);
  const offset = TR_OFFSET_MIN * 60_000;
  const local = t + offset;
  const dayStart = Math.floor(local / DAY_MS) * DAY_MS;
  // Slots of the local day: hour, hour + interval, ... (mod 24).
  const slots = [];
  for (let h = hour % interval; h < 24; h += interval) slots.push(h);
  for (let d = 0; d < 3; d += 1) {
    for (const h of slots) {
      const at = dayStart + d * DAY_MS + h * 3_600_000 - offset;
      if (at > t) return at;
    }
  }
  return t + interval * 3_600_000;
}

/** Is a scheduled run due: the last run started before the most recent slot. */
function reconcileDue(lastStartedAt, settings = {}, now) {
  const t = nowMs(now);
  const last = ms(lastStartedAt);
  if (last == null) return true;
  const interval = [6, 12, 24].includes(Number(settings.interval_hours)) ? Number(settings.interval_hours) : 24;
  // The slot before `t` is the next slot after (t - interval).
  const prevSlot = nextReconcileAt(null, settings, t - interval * 3_600_000);
  return prevSlot <= t && last < prevSlot - 5 * 60_000;
}


/**
 * Where the ledger chain stops explaining the balance (rows newest first, each with amount,
 * balance_after, created_at). Returns null when it all adds up, else
 *   { kind: "after_last", at, delta }   balance moved after the newest row with no row for it
 *   { kind: "between", from, to, delta } a row's balance_after does not follow the previous one
 */
function ledgerGap(rowsNewestFirst = [], balance) {
  const rows = [...(rowsNewestFirst || [])];
  if (!rows.length) return null;
  const newest = rows[0];
  const b = Math.round(Number(balance) || 0);
  if (Number(newest.balance_after) !== b) {
    return { kind: "after_last", at: newest.created_at, delta: b - Number(newest.balance_after) };
  }
  for (let i = 0; i < rows.length - 1; i += 1) {
    const cur = rows[i];
    const prev = rows[i + 1];
    const expected = Number(prev.balance_after) + Number(cur.amount);
    if (expected !== Number(cur.balance_after)) {
      return { kind: "between", from: prev.created_at, to: cur.created_at, delta: Number(cur.balance_after) - expected };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ admin payloads */

const CAMPAIGN_KINDS = Object.freeze(["discount", "drop", "storefront"]);
const SECTION_KINDS = Object.freeze(["manual", "rotating", "new", "bestsellers", "limited", "category"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanText(v, max) {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : "";
}

function isoOrNull(v) {
  const t = ms(v);
  return t == null ? null : new Date(t).toISOString();
}

function cleanIds(list, max = 500) {
  return [...new Set((Array.isArray(list) ? list : []).map(String).filter((id) => UUID_RE.test(id)))].slice(0, max);
}

function cleanScope(scope = {}) {
  const out = {};
  if (scope.all === true) out.all = true;
  if (Array.isArray(scope.categories)) out.categories = [...new Set(scope.categories.map(String))].slice(0, 30);
  const ids = cleanIds(scope.itemIds);
  if (ids.length) out.itemIds = ids;
  if (scope.sectionId && UUID_RE.test(String(scope.sectionId))) out.sectionId = String(scope.sectionId);
  return out;
}

/** Validate a campaign create/patch body. Returns { ok, row, error }. */
function validateCampaign(body = {}, { partial = false } = {}) {
  const row = {};
  if (!partial || body.name !== undefined) {
    const name = cleanText(body.name, 80);
    if (!name) return { ok: false, error: "name_required" };
    row.name = name;
  }
  if (!partial || body.kind !== undefined) {
    if (!CAMPAIGN_KINDS.includes(body.kind)) return { ok: false, error: "bad_kind" };
    row.kind = body.kind;
  }
  if (body.discountPct !== undefined || (!partial && row.kind === "discount")) {
    const pct = clampPct(body.discountPct);
    if ((row.kind || body.kind) === "discount" && !pct) return { ok: false, error: "pct_required" };
    row.discount_pct = pct || null;
  }
  if (!partial || body.startsAt !== undefined) row.starts_at = isoOrNull(body.startsAt);
  if (!partial || body.endsAt !== undefined) row.ends_at = isoOrNull(body.endsAt);
  if ((!partial || body.startsAt !== undefined) && !row.starts_at) return { ok: false, error: "starts_required" };
  if ((!partial || body.endsAt !== undefined) && !row.ends_at) return { ok: false, error: "ends_required" };
  if (row.starts_at && row.ends_at && ms(row.ends_at) <= ms(row.starts_at)) return { ok: false, error: "bad_window" };
  if (!partial || body.scope !== undefined) {
    row.scope = cleanScope(body.scope || {});
    const k = row.kind || body.kind;
    if (k === "storefront" && !row.scope.sectionId) return { ok: false, error: "section_required" };
    if (k !== "storefront" && !row.scope.all && !row.scope.categories?.length && !row.scope.itemIds?.length) {
      return { ok: false, error: "scope_required" };
    }
  }
  if (body.enabled !== undefined) row.enabled = Boolean(body.enabled);
  if (body.note !== undefined) row.note = cleanText(body.note, 300) || null;
  return { ok: true, row };
}

/** Validate a storefront section create/patch body. Returns { ok, row, error }. */
function validateSection(body = {}, { partial = false } = {}) {
  const row = {};
  if (!partial || body.title !== undefined) {
    const title = cleanText(body.title, 60);
    if (!title) return { ok: false, error: "title_required" };
    row.title = title;
  }
  if (body.subtitle !== undefined) row.subtitle = cleanText(body.subtitle, 120) || null;
  if (!partial || body.kind !== undefined) {
    if (!SECTION_KINDS.includes(body.kind)) return { ok: false, error: "bad_kind" };
    row.kind = body.kind;
  }
  if (body.itemIds !== undefined) row.item_ids = cleanIds(body.itemIds, 60);
  if (body.config !== undefined) {
    const c = body.config || {};
    const cfg = {};
    if (c.limit != null) cfg.limit = Math.max(1, Math.min(60, Math.round(Number(c.limit) || 12)));
    if (c.count != null) cfg.count = Math.max(1, Math.min(24, Math.round(Number(c.count) || 8)));
    if (c.days != null) cfg.days = Math.max(1, Math.min(90, Math.round(Number(c.days) || 14)));
    if (c.weekday != null) cfg.weekday = Math.max(0, Math.min(6, Math.round(Number(c.weekday) || 1)));
    if (Array.isArray(c.rarities)) cfg.rarities = c.rarities.map(String).slice(0, 5);
    if (Array.isArray(c.categories)) cfg.categories = c.categories.map(String).slice(0, 20);
    if (c.category) cfg.category = String(c.category).slice(0, 40);
    row.config = cfg;
  }
  if (body.enabled !== undefined) row.enabled = Boolean(body.enabled);
  if (body.visibleFrom !== undefined) row.visible_from = isoOrNull(body.visibleFrom);
  if (body.visibleUntil !== undefined) row.visible_until = isoOrNull(body.visibleUntil);
  if (body.sortOrder !== undefined) row.sort_order = Math.round(Number(body.sortOrder) || 0);
  return { ok: true, row };
}

/**
 * Merch patch for one item (drawer save / bulk sale). Returns { ok, row, error } with snake
 * case columns only for keys present in the body.
 */
function validateMerchPatch(body = {}) {
  const row = {};
  if (body.stockLimit !== undefined) {
    const n = intOrNull(body.stockLimit);
    if (n != null && n < 0) return { ok: false, error: "bad_stock" };
    row.stock_limit = n;
  }
  if (body.availableFrom !== undefined) row.available_from = isoOrNull(body.availableFrom);
  if (body.availableUntil !== undefined) row.available_until = isoOrNull(body.availableUntil);
  if (row.available_from && row.available_until && ms(row.available_until) <= ms(row.available_from)) {
    return { ok: false, error: "bad_window" };
  }
  if (body.salePct !== undefined) {
    const p = clampPct(body.salePct);
    row.sale_pct = p || null;
  }
  if (body.saleStartsAt !== undefined) row.sale_starts_at = isoOrNull(body.saleStartsAt);
  if (body.saleEndsAt !== undefined) row.sale_ends_at = isoOrNull(body.saleEndsAt);
  if (row.sale_starts_at && row.sale_ends_at && ms(row.sale_ends_at) <= ms(row.sale_starts_at)) {
    return { ok: false, error: "bad_sale_window" };
  }
  return { ok: true, row };
}

/** Day key (YYYY-MM-DD) in Istanbul time. */
function trDay(value) {
  const t = ms(value);
  if (t == null) return null;
  return new Date(t + TR_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}

/** Last `n` Istanbul day keys ending today, oldest first. */
function lastDays(n, now) {
  const t = nowMs(now);
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) out.push(trDay(t - i * DAY_MS));
  return out;
}

module.exports = {
  DAY_MS,
  TR_OFFSET_MIN,
  MERCH_COLUMNS,
  ROUNDINGS,
  FIX_MODES,
  inWindow,
  campaignStatus,
  campaignCoversItem,
  discounted,
  effectivePricing,
  availability,
  isListed,
  merchFields,
  weekIndex,
  nextRotationAt,
  rotationPick,
  resolveSections,
  sectionVisible,
  roundTo,
  applyPriceOp,
  planReconcileFix,
  nextReconcileAt,
  reconcileDue,
  stockLeftOf,
  ledgerGap,
  CAMPAIGN_KINDS,
  SECTION_KINDS,
  validateCampaign,
  validateSection,
  validateMerchPatch,
  cleanIds,
  trDay,
  lastDays,
};
