/**
 * Yönetici Paneli › Mağaza (owner pick: Draft A control desk + Draft B operation tabs).
 * Pure helpers only (no React, no fetch) so shopDesk.selftest.mjs runs them under node.
 * Price math mirrors backend/lib/shopMerch.js; the server is the source of truth.
 */

export const TABS = Object.freeze(["catalog", "storefront", "ops", "gifts", "reconcile", "analytics", "categories"]);

/** Sellable categories in the order the shop shows them (label: shopDesk.cat.<id>). */
export const CATEGORIES = Object.freeze([
  "banner",
  "theme",
  "countries",
  "name_effect",
  "avatar_effect",
  "chat_bubble",
  "presence_flare",
  "profile_aura",
  "typing_flare",
  "reaction_burst",
  "call_overlay",
  "profile_color",
  "sound_pack",
]);
export const RARITIES = Object.freeze(["common", "rare", "epic", "legendary", "mythic"]);
export const STATUS_FILTERS = Object.freeze(["all", "active", "inactive", "scheduled", "expired", "soldout", "limited", "retired"]);
export const SORTS = Object.freeze(["best7", "newest", "price_desc", "price_asc", "name"]);
export const CHIP_COUNT = 5;
export const PAGE_SIZE = 10;
export const AMOUNT_PRESETS = Object.freeze([100, 500, 1000, 5000, 10000]);
export const ROUNDINGS = Object.freeze(["none", "10", "50", "100"]);
export const PRICE_MODES = Object.freeze(["fixed", "percent", "delta", "sale"]);
export const FIX_MODES = Object.freeze(["balance_to_ledger", "ledger_to_balance", "note"]);
export const IMAGE_CATEGORIES = new Set(["banner", "profile_background"]);
export const EFFECT_CATEGORIES = new Set([
  "name_effect",
  "avatar_effect",
  "chat_bubble",
  "presence_flare",
  "profile_aura",
  "typing_flare",
  "reaction_burst",
  "call_overlay",
  "profile_color",
]);

const DAY = 86_400_000;
const TR_OFFSET = 180 * 60_000;

/* ------------------------------------------------------------------ numbers */

export function num(value, locale = "tr") {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  try {
    return new Intl.NumberFormat(locale).format(Math.round(n));
  } catch {
    return String(Math.round(n));
  }
}

/** 3.940.000 -> "3,94 Mn" (tr) / "3.94M" (en). */
export function compact(value, locale = "tr") {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  if (Math.abs(n) < 100_000) return num(n, locale);
  try {
    return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: Math.abs(n) >= 10_000_000 ? 1 : 2 }).format(n);
  } catch {
    return num(n, locale);
  }
}

/** Week over week change in whole percent, null when there is no base. */
export function pctChange(now, prev) {
  const a = Number(now) || 0;
  const b = Number(prev) || 0;
  if (!b) return null;
  return Math.round(((a - b) / b) * 100);
}

export function signed(n, locale = "tr") {
  const v = Math.round(Number(n) || 0);
  return `${v > 0 ? "+" : v < 0 ? "-" : ""}${num(Math.abs(v), locale)}`;
}

/* ------------------------------------------------------------------ item state */

/**
 * One status per row for the Durum filter and pill:
 * retired | inactive | scheduled | expired | soldout | active
 */
export function itemStatus(item) {
  if (!item) return "inactive";
  if (item.retired) return "retired";
  if (!item.active) return "inactive";
  const s = item.availability?.state;
  if (s === "scheduled" || s === "expired" || s === "soldout") return s;
  return "active";
}

export function isLimited(item) {
  const av = item?.availability;
  return Boolean(av && (av.stockLeft != null || av.endsAt));
}

export function onSale(item) {
  return Number(item?.pricing?.pct) > 0;
}

/** { limit, sold, left, pct } for limited stock, null when unlimited. */
export function stockInfo(item) {
  const limit = item?.stock_limit == null ? null : Number(item.stock_limit);
  if (limit == null || !Number.isFinite(limit)) return null;
  const sold = Math.max(0, Number(item.stock_sold) || 0);
  return { limit, sold, left: Math.max(0, limit - sold), pct: limit ? Math.min(100, Math.round((sold / limit) * 100)) : 100 };
}

/** Remaining time split for "2g 4s kaldı". Null when over or no end. */
export function timeLeft(endsAt, now = Date.now()) {
  const end = Date.parse(endsAt || "");
  if (!Number.isFinite(end)) return null;
  const ms = end - now;
  if (ms <= 0) return null;
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return { d, h, m, ms };
}

/** Share of a time window already used (0..100), for the countdown bar. */
export function windowPct(startsAt, endsAt, now = Date.now()) {
  const s = Date.parse(startsAt || "");
  const e = Date.parse(endsAt || "");
  if (!Number.isFinite(e)) return 0;
  const start = Number.isFinite(s) ? s : e - 7 * DAY;
  if (e <= start) return 100;
  return Math.max(0, Math.min(100, Math.round(((now - start) / (e - start)) * 100)));
}

/* ------------------------------------------------------------------ list */

function norm(s) {
  return String(s || "").toLocaleLowerCase("tr").replace(/ı/g, "i").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function categoryCounts(items) {
  const map = new Map();
  for (const it of items || []) {
    if (it.retired) continue;
    map.set(it.category, (map.get(it.category) || 0) + 1);
  }
  return map;
}

/** Chips shown inline (biggest first after Tümü) and the rest behind "+N kategori". */
export function splitChips(counts, max = CHIP_COUNT) {
  const order = CATEGORIES.filter((c) => counts.get(c));
  const byCount = [...order].sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0) || order.indexOf(a) - order.indexOf(b));
  const inline = byCount.slice(0, max);
  return { inline: order.filter((c) => inline.includes(c)), more: order.filter((c) => !inline.includes(c)) };
}

export function filterItems(items, { q = "", category = "all", status = "all", rarity = "all", sale = false } = {}) {
  const needle = norm(q.trim());
  return (items || []).filter((it) => {
    if (category !== "all" && it.category !== category) return false;
    const st = itemStatus(it);
    if (status === "all" && st === "retired") return false;
    if (status === "limited" ? !isLimited(it) || st === "retired" : status !== "all" && st !== status) return false;
    if (rarity !== "all" && (it.rarity || "common") !== rarity) return false;
    if (sale && !onSale(it)) return false;
    if (needle) {
      const hay = norm(`${it.name} ${it.sku} ${it.effect_key || ""} ${it.theme_key || ""} ${it.country_code || ""}`);
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

export function sortItems(items, sort = "best7") {
  const list = [...(items || [])];
  const sales = (it) => Number(it?.sales?.n7) || 0;
  const price = (it) => Number(it?.pricing?.price ?? it?.price_descoin) || 0;
  const created = (it) => Date.parse(it?.created_at || "") || 0;
  const cmp = {
    best7: (a, b) => sales(b) - sales(a) || (a.sort_order || 0) - (b.sort_order || 0),
    newest: (a, b) => created(b) - created(a),
    price_desc: (a, b) => price(b) - price(a),
    price_asc: (a, b) => price(a) - price(b),
    name: (a, b) => String(a.name).localeCompare(String(b.name), "tr"),
  }[sort] || (() => 0);
  return list.sort(cmp);
}

/** [1, 2, 3, "…", 97] around the current page. */
export function pageList(total, page) {
  const n = Math.max(1, total);
  const p = Math.min(Math.max(1, page), n);
  if (n <= 7) return Array.from({ length: n }, (_, i) => i + 1);
  const set = new Set([1, 2, 3, n, p - 1, p, p + 1].filter((x) => x >= 1 && x <= n));
  const out = [];
  let prev = 0;
  for (const x of [...set].sort((a, b) => a - b)) {
    if (x - prev > 1) out.push("…");
    out.push(x);
    prev = x;
  }
  return out;
}

export function pageSlice(list, page, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil((list?.length || 0) / size));
  const p = Math.min(Math.max(1, page), pages);
  const from = (p - 1) * size;
  return { rows: (list || []).slice(from, from + size), page: p, pages, from: list?.length ? from + 1 : 0, to: Math.min(list?.length || 0, from + size) };
}

/* ------------------------------------------------------------------ price ops (mirror) */

const ROUND_STEP = { none: 1, "10": 10, "50": 50, "100": 100 };

export function roundTo(value, step) {
  const s = ROUND_STEP[String(step)] || 1;
  if (s <= 1) return Math.max(0, Math.round(value));
  return Math.max(0, Math.ceil(value / s - 0.5) * s);
}

/** Same rule as backend applyPriceOp: { type: fixed | percent | delta, value, rounding }. */
export function applyPriceOp(price, op = {}) {
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

export function discounted(list, pct) {
  const base = Math.max(0, Math.round(Number(list) || 0));
  const p = Math.max(0, Math.min(95, Math.round(Number(pct) || 0)));
  if (!p) return base;
  return Math.max(base > 0 ? 1 : 0, Math.round((base * (100 - p)) / 100));
}

/** "-%15", "-15", "15" -> -15 / 15 (percent field accepts a sign and % in any order). */
export function parseSignedNumber(raw) {
  const s = String(raw ?? "").replace(/\s/g, "");
  if (!s) return null;
  const neg = /^-|^%-|-%/.test(s) || s.startsWith("−");
  const digits = s.replace(/[^\d.,]/g, "").replace(",", ".");
  if (!digits) return null;
  const n = Number(digits);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/** Preview rows for the bulk price dialog. */
export function bulkPreview(items, mode, { value, rounding = "none", pct } = {}) {
  return (items || []).map((it) => {
    const now = Math.round(Number(it.price_descoin) || 0);
    let next = null;
    if (mode === "sale") next = discounted(now, pct);
    else next = applyPriceOp(now, { type: mode, value, rounding });
    return { id: it.id, name: it.name, now, next, up: next != null && next > now, same: next === now };
  });
}

/* ------------------------------------------------------------------ calendar */

/**
 * Columns for the campaign gantt: `weeks` week starts (local Monday) beginning the week
 * before `now`. Returns { start, end, cols: [{ at, label day/month }] }.
 */
export function calendarRange(now = Date.now(), weeks = 7, mode = "weeks") {
  const local = now + TR_OFFSET;
  const today = Math.floor(local / DAY) * DAY - TR_OFFSET;
  if (mode === "week") {
    const start = today - DAY;
    return { start, end: start + 7 * DAY, cols: Array.from({ length: 7 }, (_, i) => ({ at: start + i * DAY })) };
  }
  const start = today - 4 * DAY;
  return { start, end: start + weeks * 7 * DAY, cols: Array.from({ length: weeks }, (_, i) => ({ at: start + i * 7 * DAY })) };
}

/** Bar geometry in percent of the range, clipped. Null when fully outside. */
export function barGeometry(startsAt, endsAt, range) {
  const s = Date.parse(startsAt || "");
  const e = Date.parse(endsAt || "");
  if (!Number.isFinite(s) || !Number.isFinite(e) || !range) return null;
  const span = range.end - range.start;
  if (e <= range.start || s >= range.end) return null;
  const left = Math.max(0, ((s - range.start) / span) * 100);
  const right = Math.min(100, ((e - range.start) / span) * 100);
  return { left, width: Math.max(1.5, right - left), clippedStart: s < range.start, clippedEnd: e > range.end };
}

export function nowLinePct(range, now = Date.now()) {
  if (!range) return null;
  const p = ((now - range.start) / (range.end - range.start)) * 100;
  return p < 0 || p > 100 ? null : p;
}

/* ------------------------------------------------------------------ reconciliation */

/** Bars for the last 14 runs (oldest first): { value, error, at }. */
export function runBars(history, n = 14) {
  return [...(history || [])]
    .slice(0, n)
    .reverse()
    .map((r) => ({ value: r.error ? null : Number(r.mismatch_count) || 0, error: Boolean(r.error), at: r.started_at, id: r.id }));
}

/** Run duration in whole seconds, null when unknown. */
export function runSeconds(run) {
  const a = Date.parse(run?.started_at || "");
  const b = Date.parse(run?.finished_at || "");
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.max(1, Math.round((b - a) / 1000));
}

/** What the primary button of the fix dialog does and shows. */
export function fixPlan(mode, { balance, ledgerSum }) {
  const b = Math.round(Number(balance) || 0);
  const l = Math.round(Number(ledgerSum) || 0);
  const drift = b - l;
  if (mode === "balance_to_ledger") return { drift, balanceAfter: l, ledgerAmount: 0, ok: drift !== 0 && l >= 0 };
  if (mode === "ledger_to_balance") return { drift, balanceAfter: b, ledgerAmount: drift, ok: drift !== 0 };
  return { drift, balanceAfter: b, ledgerAmount: 0, ok: true };
}

export function accountDays(createdAt, now = Date.now()) {
  const t = Date.parse(createdAt || "");
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / DAY));
}

/* ------------------------------------------------------------------ misc */

export function sparkPath(values, w = 72, h = 22) {
  const vals = (values || []).map((v) => Number(v) || 0);
  if (vals.length < 2) return "";
  const max = Math.max(1, ...vals);
  const step = w / (vals.length - 1);
  return vals.map((v, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)} ${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`).join(" ");
}

export function barHeights(values, minPct = 4) {
  const vals = (values || []).map((v) => (v == null ? 0 : Number(v) || 0));
  const max = Math.max(1, ...vals);
  return vals.map((v) => (v ? Math.max(minPct, Math.round((v / max) * 100)) : 0));
}

function csvCell(v) {
  const s = v == null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header, rows) {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}

/** Catalog rows for the CSV button. */
export function catalogCsv(items) {
  return toCsv(
    ["id", "sku", "name", "category", "rarity", "list_price", "price_now", "discount_pct", "active", "status", "stock_limit", "stock_sold", "sales_7d", "available_until"],
    (items || []).map((it) => [
      it.id,
      it.sku,
      it.name,
      it.category,
      it.rarity || "common",
      it.price_descoin,
      it.pricing?.price ?? it.price_descoin,
      it.pricing?.pct || 0,
      it.active ? 1 : 0,
      itemStatus(it),
      it.stock_limit ?? "",
      it.stock_sold ?? "",
      it.sales?.n7 ?? 0,
      it.availability?.endsAt || "",
    ])
  );
}

export function reconcileCsv(mismatches) {
  return toCsv(
    ["user_id", "username", "balance", "ledger_sum", "drift", "ledger_rows", "last_balance_after", "frozen"],
    (mismatches || []).map((m) => [m.user_id, m.user?.username || "", m.balance, m.ledger_sum, m.drift, m.ledger_rows, m.last_balance_after ?? "", m.user?.descoin_frozen ? 1 : 0])
  );
}

/** Sales speed label data: per hour when at least one an hour, else per day. */
export function salesSpeed(n7) {
  const n = Number(n7) || 0;
  const perHour = n / (7 * 24);
  if (perHour >= 1) return { unit: "hour", value: Math.round(perHour) };
  return { unit: "day", value: Math.round((n / 7) * 10) / 10 };
}

/** Datetime-local input value (local time) <-> ISO. */
export function toLocalInput(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value) {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** Validation for the campaign dialog (mirrors backend validateCampaign). Returns an error key or "". */
export function campaignError(form) {
  if (!String(form.name || "").trim()) return "name";
  if (form.kind === "discount" && !(Number(form.pct) >= 1 && Number(form.pct) <= 95)) return "pct";
  const s = Date.parse(form.startsAt || "");
  const e = Date.parse(form.endsAt || "");
  if (!Number.isFinite(s) || !Number.isFinite(e)) return "dates";
  if (e <= s) return "window";
  if (form.kind === "storefront" && !form.sectionId) return "section";
  if (form.kind !== "storefront" && form.scope === "items" && !(form.itemIds || []).length) return "items";
  if (form.kind !== "storefront" && form.scope === "categories" && !(form.categories || []).length) return "categories";
  return "";
}

export function campaignBody(form) {
  const scope =
    form.kind === "storefront"
      ? { sectionId: form.sectionId }
      : form.scope === "all"
        ? { all: true }
        : form.scope === "categories"
          ? { categories: form.categories || [] }
          : { itemIds: form.itemIds || [] };
  const body = {
    name: String(form.name || "").trim(),
    kind: form.kind,
    startsAt: fromLocalInput(form.startsAt),
    endsAt: fromLocalInput(form.endsAt),
    scope,
    enabled: form.enabled !== false,
    note: form.note || null,
  };
  if (form.kind === "discount") body.discountPct = Math.round(Number(form.pct));
  if (form.kind === "drop" && Number(form.stockPerItem) > 0) body.stockPerItem = Math.round(Number(form.stockPerItem));
  return body;
}

/** One-line scope description data for calendar rows. */
export function campaignScopeInfo(c, itemsById) {
  const s = c?.scope || {};
  if (s.all) return { kind: "all" };
  if (s.sectionId) return { kind: "section", id: s.sectionId };
  if (s.categories?.length) return { kind: "categories", list: s.categories };
  if (s.itemIds?.length) return { kind: "items", n: s.itemIds.length, first: itemsById?.get?.(s.itemIds[0])?.name || null };
  return { kind: "none" };
}

/** Move an id inside a list (drag to reorder). */
export function moveId(ids, from, to) {
  const list = [...ids];
  const i = list.indexOf(from);
  const j = list.indexOf(to);
  if (i < 0 || j < 0 || i === j) return list;
  list.splice(i, 1);
  list.splice(j, 0, from);
  return list;
}

/** Ctrl K search over items, campaigns and sections (users come from the server). */
export function searchLocal({ items = [], campaigns = [], sections = [] }, q, max = 6) {
  const needle = norm(String(q || "").trim());
  if (!needle) return { items: [], campaigns: [] };
  const hit = (s) => norm(s).includes(needle);
  return {
    items: items.filter((it) => !it.retired && hit(`${it.name} ${it.sku} ${it.effect_key || ""}`)).slice(0, max),
    campaigns: [...campaigns.map((c) => ({ ...c, type: "campaign" })), ...sections.map((s) => ({ ...s, name: s.title, type: "section" }))]
      .filter((c) => hit(c.name))
      .slice(0, 4),
  };
}
