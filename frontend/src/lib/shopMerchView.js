// User shop merchandising (Mağaza remake, Nov 2026). Pure helpers for the sale price,
// limited stock, countdowns and storefront sections the admin sets up. The server already
// sends `price_descoin` as the price you pay now; `list_price_descoin` is the normal price.
// Test: lib/shopMerchView.selftest.mjs

const DAY = 86_400_000;
const HOUR = 3_600_000;

/** { onSale, pct, price, list } for one catalog item. */
export function saleOf(item) {
  const price = Math.max(0, Math.round(Number(item?.price_descoin) || 0));
  const list = Math.max(price, Math.round(Number(item?.list_price_descoin ?? price) || 0));
  const pct = Math.max(0, Math.round(Number(item?.discount_pct) || 0));
  return { onSale: pct > 0 && list > price, pct, price, list };
}

/** { limited, left, low, soldOut } (low = 20 % or fewer left, or 10 units). */
export function stockOf(item) {
  const limit = item?.stock_limit == null ? null : Number(item.stock_limit);
  if (limit == null || !Number.isFinite(limit)) return { limited: false, left: null, low: false, soldOut: false };
  const left = Math.max(0, Number(item?.stock_left ?? 0) || 0);
  return { limited: true, left, limit, low: left > 0 && (left <= 10 || left / Math.max(1, limit) <= 0.2), soldOut: Boolean(item?.sold_out) || left <= 0 };
}

/** The soonest end that matters for a countdown: availability window or sale end. */
export function endOf(item) {
  const a = Date.parse(item?.available_until || "");
  const s = Date.parse(item?.sale_ends_at || "");
  const vals = [a, s].filter(Number.isFinite);
  return vals.length ? Math.min(...vals) : null;
}

/** Countdown parts, null when over. `urgent` = under 24 h. */
export function countdown(endMs, now = Date.now()) {
  if (endMs == null || !Number.isFinite(endMs)) return null;
  const ms = endMs - now;
  if (ms <= 0) return null;
  return {
    d: Math.floor(ms / DAY),
    h: Math.floor((ms % DAY) / HOUR),
    m: Math.floor((ms % HOUR) / 60_000),
    s: Math.floor((ms % 60_000) / 1000),
    urgent: ms < DAY,
  };
}

/** i18n key + vars for a countdown ("2g 4s", "3 sa 12 dk", "12:04"). */
export function countdownLabel(parts) {
  if (!parts) return null;
  if (parts.d > 0) return { key: "shopMerch.leftDays", vars: { d: parts.d, h: parts.h } };
  if (parts.h > 0) return { key: "shopMerch.leftHours", vars: { h: parts.h, m: parts.m } };
  return { key: "shopMerch.leftMinutes", vars: { m: parts.m, s: String(parts.s).padStart(2, "0") } };
}

/** Storefront sections with their items resolved (unknown ids dropped, empty sections dropped). */
export function resolveStorefront(sections, items) {
  const byId = new Map((items || []).map((it) => [String(it.id), it]));
  return (sections || [])
    .map((s) => ({ ...s, items: (s.itemIds || []).map((id) => byId.get(String(id))).filter(Boolean) }))
    .filter((s) => s.items.length);
}

/** Can the buyer press Buy: not sold out and (when the server time is known) not ended. */
export function purchasable(item, now = Date.now()) {
  if (stockOf(item).soldOut) return false;
  const end = Date.parse(item?.available_until || "");
  return !(Number.isFinite(end) && end <= now);
}

/** Shop updates feed: newest note with the items it is about (names resolved). */
export function latestUpdate(updates, items) {
  const u = (updates || [])[0];
  if (!u) return null;
  const byId = new Map((items || []).map((it) => [String(it.id), it]));
  const named = (u.itemIds || []).map((id) => byId.get(String(id))).filter(Boolean);
  if (!named.length) return null;
  return { id: u.id, kind: u.body === "price_drop" ? "price_drop" : "price_change", items: named, at: u.at };
}
