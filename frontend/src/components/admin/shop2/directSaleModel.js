// "Tüm ürünlerde satış" (Vitrin ve Setler admin): pure helpers for DirectSaleDrawer.jsx.
// "Tüm ürünler" in the user shop is browse only; the items allowed here can still be bought
// straight from it. Data: GET/PUT /api/admin/shop2/direct-sale (lib/shopDirectSale.js).
import { SHOP_CATEGORY_TABS } from "../../../lib/shopCategories.js";
import { localizeShopItem } from "../../../lib/shopItemI18n.js";

export const DS_CATEGORIES = SHOP_CATEGORY_TABS.map((c) => c.id);
export const DS_RARITIES = ["common", "rare", "epic", "legendary", "mythic"];
const RANK = Object.fromEntries(DS_RARITIES.map((r, i) => [r, i]));

/** Rows the user tab can show (same categories as the shop tabs), localized name attached. */
export function dsRows(items, locale = "tr") {
  return (Array.isArray(items) ? items : [])
    .filter((it) => it && DS_CATEGORIES.includes(it.category))
    .map((it) => {
      const L = localizeShopItem(it, locale);
      return {
        ...it,
        label: L.name || it.sku || String(it.id),
        desc: L.description || "",
        s2: String(it.sku || "").startsWith("s2-"),
        direct_sale: it.direct_sale === true,
        price: Number(it.price_descoin) || 0,
        sales7: Number(it.sales7) || 0,
        coins7: Number(it.coins7) || 0,
      };
    });
}

/** Filter + sort: allowed first inside each category order, then rarity (high first), then name. */
export function dsFilter(rows, { q = "", cat = "all", rarity = "all", state = "all", locale = "tr" } = {}) {
  const needle = String(q || "").trim().toLocaleLowerCase(locale);
  const catOrder = Object.fromEntries(DS_CATEGORIES.map((c, i) => [c, i]));
  return (rows || [])
    .filter((r) => cat === "all" || r.category === cat)
    .filter((r) => rarity === "all" || (r.rarity || "common") === rarity)
    .filter((r) => state === "all" || (state === "on" ? r.direct_sale : !r.direct_sale))
    .filter((r) => {
      if (!needle) return true;
      return [r.label, r.sku, r.set_key].some((v) => String(v || "").toLocaleLowerCase(locale).includes(needle));
    })
    .sort(
      (a, b) =>
        (catOrder[a.category] ?? 99) - (catOrder[b.category] ?? 99) ||
        Number(b.direct_sale) - Number(a.direct_sale) ||
        (RANK[b.rarity] ?? 0) - (RANK[a.rarity] ?? 0) ||
        String(a.label).localeCompare(String(b.label), locale)
    );
}

/** Summary numbers for the tiles over `rows` (already limited to the shown categories). */
export function dsStats(rows) {
  const s = { all: 0, allowed: 0, blocked: 0, s2: 0, s2Allowed: 0, sales7: 0, coins7: 0, byCat: {} };
  for (const r of rows || []) {
    s.all += 1;
    if (r.direct_sale) s.allowed += 1;
    else s.blocked += 1;
    if (r.s2) {
      s.s2 += 1;
      if (r.direct_sale) s.s2Allowed += 1;
    }
    s.sales7 += r.sales7 || 0;
    s.coins7 += r.coins7 || 0;
    const c = s.byCat[r.category] || (s.byCat[r.category] = { all: 0, allowed: 0 });
    c.all += 1;
    if (r.direct_sale) c.allowed += 1;
  }
  return s;
}

/** Of `ids`, the ones a bulk "allow" / "disallow" would really change. */
export function dsWouldChange(rows, ids, allowed) {
  const want = Boolean(allowed);
  const set = new Set((ids || []).map(String));
  return (rows || []).filter((r) => set.has(String(r.id)) && r.direct_sale !== want).map((r) => String(r.id));
}

/** Rows with `ids` set to `allowed` (optimistic update and undo). */
export function dsApply(rows, ids, allowed) {
  const set = new Set((ids || []).map(String));
  return (rows || []).map((r) => (set.has(String(r.id)) ? { ...r, direct_sale: Boolean(allowed) } : r));
}
