/**
 * Store purchase modal state logic (2.13.1).
 * Run: node frontend/src/lib/storePurchaseState.selftest.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PURCHASE_MODAL_CATEGORIES, usesPurchaseModal, purchaseView, undoTarget, applyUndo, formatCoins,
  isAnimatedItem, rarityKey, RARITY_COLORS, formatOwnedDate,
} from "./storePurchaseState.js";
import { localizeShopItem, localizedShopItemName, SHOP_ITEM_TR } from "./shopItemI18n.js";
import { purchaseCopy } from "./storePurchaseCopy.js";
import { SHOP_CATEGORY_TABS } from "./shopCategories.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), "utf8");

// Every store tab except Ülkeler opens the modal; Ülkeler keeps CountryShop's dialog.
assert.deepEqual(
  [...PURCHASE_MODAL_CATEGORIES].sort(),
  SHOP_CATEGORY_TABS.map((t) => t.id).filter((id) => id !== "countries").sort(),
);
assert.equal(usesPurchaseModal("countries"), false);
assert.equal(usesPurchaseModal("banner"), true);

// Buy: ledger Fiyat / Bakiye / Sonra.
const banner = { id: "b1", sku: "banner-galaxy-swirl", category: "banner", price_descoin: 500, rarity: "legendary" };
let v = purchaseView({ item: banner, balance: 2918 });
assert.deepEqual([v.state, v.price, v.balance, v.after, v.short, v.canBuy], ["buy", 500, 2918, 2418, 0, true]);
assert.equal(purchaseView({ item: banner, balance: 2918, phase: "buying" }).canBuy, false, "no second purchase while one is running");
assert.equal(purchaseView({ item: banner, balance: 500 }).state, "buy", "exact balance is enough");

// Insufficient: shortfall, % ready (never 100 while short), no purchase.
v = purchaseView({ item: { ...banner, price_descoin: 650 }, balance: 412 });
assert.deepEqual([v.state, v.short, v.pct, v.canBuy], ["insufficient", 238, 63, false]);
assert.equal(purchaseView({ item: { ...banner, price_descoin: 1000 }, balance: 999 }).pct, 99);
assert.equal(purchaseView({ item: { ...banner, price_descoin: 650 }, balance: 0 }).pct, 0);
// The window unlocks by itself once the balance is enough (e.g. after the daily reward).
assert.equal(purchaseView({ item: { ...banner, price_descoin: 650 }, balance: 650 }).state, "buy");

// Owned.
assert.equal(purchaseView({ item: banner, balance: 10, owned: true, equipped: true }).state, "owned-equipped");
assert.equal(purchaseView({ item: banner, balance: 10, owned: true, equipped: false }).state, "owned-stowed");
// Success wins over owned (the item is owned right after the purchase).
assert.equal(purchaseView({ item: banner, balance: 2418, owned: true, equipped: true, phase: "success" }).state, "success");

// Geri al: undoes only the auto-wear.
const prev = { id: "b0", category: "banner" };
assert.deepEqual(undoTarget({ item: banner, previous: prev, autoWore: true }), { action: "equip", item: prev });
assert.deepEqual(undoTarget({ item: banner, previous: null, autoWore: true }), { action: "unequip", item: banner });
assert.equal(undoTarget({ item: banner, previous: prev, autoWore: false }), null, "nothing to undo when it was not worn");
assert.equal(undoTarget({ item: banner, previous: prev, autoWore: true, undone: true }), null, "undo runs once");
assert.deepEqual(undoTarget({ item: banner, previous: banner, autoWore: true }), { action: "unequip", item: banner });
const calls = [];
const equip = async (item, isEquipped) => calls.push([item.id, isEquipped]);
await applyUndo(undoTarget({ item: banner, previous: prev, autoWore: true }), equip);
await applyUndo(undoTarget({ item: banner, previous: null, autoWore: true }), equip);
assert.equal(await applyUndo(null, equip), false);
assert.equal(await applyUndo(undoTarget({ item: banner, previous: prev, autoWore: true }), async () => false), false, "a failed re-wear keeps Geri al available");
assert.deepEqual(calls, [["b0", false], ["b1", true]], "re-equip previous, or take the new one off; never a refund call");

// Numbers keep the 2,918 format in both languages.
assert.equal(formatCoins(2918), "2,918");
assert.equal(formatCoins(12345678), "12,345,678");
assert.equal(formatCoins(-5), "0");

assert.equal(rarityKey("mythic"), "mythic");
assert.equal(rarityKey("weird"), "common");
assert.equal(RARITY_COLORS.legendary, "#fbbf24");
assert.equal(isAnimatedItem({ sku: "name-effect-sigil-aurora", category: "name_effect" }), true);
assert.equal(isAnimatedItem({ sku: "name-effect-sigil-damascus", category: "name_effect" }), false);
assert.equal(isAnimatedItem({ sku: "name-effect-fire", category: "name_effect" }), true);
assert.equal(isAnimatedItem({ sku: "banner-galaxy-swirl", category: "banner" }), false);
assert.equal(isAnimatedItem({ sku: "theme-borealis", category: "theme" }), true);
assert.equal(isAnimatedItem({ sku: "theme-lagoon", category: "theme" }), false);
assert.equal(formatOwnedDate("2026-10-12T15:20:00+03:00", "tr"), "12 Eki 2026");
assert.equal(formatOwnedDate("2026-10-03T11:00:00+03:00", "en"), "Oct 3, 2026");
assert.equal(formatOwnedDate(null, "tr"), "");

// Catalog localization: frontend map, English fallback, no DB change.
assert.deepEqual(localizeShopItem({ sku: "banner-galaxy-swirl", name: "Galaxy Swirl", description: "x" }, "tr").name, "Galaksi Girdabı");
assert.equal(localizeShopItem({ sku: "banner-galaxy-swirl", name: "Galaxy Swirl", description: "x" }, "en").name, "Galaxy Swirl");
assert.deepEqual(localizeShopItem({ sku: "unknown-sku", name: "New Thing", description: "Fresh." }, "tr"), { name: "New Thing", description: "Fresh." });
assert.equal(
  localizeShopItem({ sku: "banner-obsidian-rift", name: "Obsidian Rift", description: "Premium profile banner — Obsidian Rift. Crafted gradient with cinematic depth." }, "tr").description,
  "Premium profil bannerı: Obsidyen Yarık. Sinematik derinlikte işlenmiş bir geçiş.",
);
assert.equal(
  localizeShopItem({ sku: "badge-wolf", name: "Wolf Badge", description: "Premium profile badge — Wolf. Shows next to your display name." }, "tr").description,
  "Premium profil rozeti: Kurt. Görünen adının yanında durur.",
);
// A template description the map does not know stays English rather than wrong.
assert.equal(localizeShopItem({ sku: "banner-obsidian-rift", name: "Obsidian Rift", description: "Changed upstream." }, "tr").description, "Changed upstream.");
assert.equal(localizedShopItemName({ sku: "call-aurora-dome", name: "Aurora Dome" }, "tr"), "Aurora Kubbesi");
assert.ok(Object.keys(SHOP_ITEM_TR).length >= 420, "every seeded store row has a Turkish name");
for (const [sku, entry] of Object.entries(SHOP_ITEM_TR)) {
  assert.ok(Array.isArray(entry) && typeof entry[0] === "string" && entry[0].trim(), `${sku}: Turkish name`);
}
// Every seeded sku is covered (backend seeds + catalog libs).
const seeds = [
  "../../backend/scripts/seedCosmeticsCatalog.js", "../../backend/scripts/seedPremiumCategories.js",
  "../../backend/scripts/seedCatalogMega.js", "../../backend/lib/nameEffectCatalog.js",
  "../../backend/lib/chatBubbleCatalog.js", "../../backend/lib/glassThemeCatalog.js",
];
const RETIRED = /^(country-|frame-|avatar-frame-|sound-|title-|profile-title-)/;
const missing = new Set();
for (const rel of seeds) {
  let src = "";
  try { src = read(rel); } catch { continue; }
  for (const m of src.matchAll(/sku:\s*["'`]([a-z0-9-]+)["'`]/g)) {
    if (!RETIRED.test(m[1]) && !SHOP_ITEM_TR[m[1]] && !m[1].includes("${")) missing.add(m[1]);
  }
}
assert.deepEqual([...missing], [], `skus without a Turkish entry: ${[...missing].join(", ")}`);

// Copy: every modal category has the drafted Turkish eyebrow, label, noun, footnote.
const tr = purchaseCopy("tr");
const en = purchaseCopy("en");
for (const cat of PURCHASE_MODAL_CATEGORIES) {
  for (const c of [tr, en]) {
    const k = c.cat[cat];
    assert.ok(k && k.eyebrow && k.label && k.noun && k.foot && typeof k.meta === "function", `${c.locale} copy for ${cat}`);
  }
}
assert.equal(tr.cat.banner.eyebrow, "PROFİL BANNERI");
assert.equal(tr.looks(tr.cat.name_effect.label), "İSMİNDE BÖYLE GÖRÜNÜR");
assert.equal(tr.buyFor(formatCoins(500)), "500 DesCoin ile satın al");
assert.equal(tr.wearSub("Zümrüt Orman"), "Şu an takılı olan Zümrüt Orman çıkarılır, envanterinde kalır");
assert.equal(tr.doneSub("Zümrüt Orman", true), "Profiline takıldı · Zümrüt Orman envanterine geri döndü");

// Wiring: ShopPanel keeps the existing purchase/equip handlers and endpoints.
const panel = read("../components/settings/ShopPanel.jsx");
const modal = read("../components/shop/purchase/StorePurchaseModal.jsx");
assert.match(panel, /onBuy=\{handleBuy\}/, "the modal buys through ShopPanel.handleBuy");
assert.match(panel, /onEquip=\{handleEquip\}/, "the modal equips through ShopPanel.handleEquip");
assert.match(panel, /usesPurchaseModal\(/);
assert.doesNotMatch(modal, /purchaseShopItem|equipShopItem|authedRequest|fetch\(/, "the modal never calls the shop API itself");
assert.match(modal, /createPortal\(node, document\.body\)|<OverlayPortal>\{node\}<\/OverlayPortal>/, "the modal portals into <body>");
assert.match(modal, /addEventListener\("keydown", onKey, true\)/, "Escape is handled in the capture phase");
const css = read("../styles/store-purchase-modal.css");
assert.match(css, /--us-avail-h/, "the modal is sized from the usable viewport");
assert.match(css, /prefers-reduced-transparency/);
assert.match(css, /\.spm-root \.spm-scrim \{[^}]*backdrop-filter: blur/, "full-window frosted scrim");
assert.match(css, /--heavy: rgba\(19,21,32,\.93\)/, "heavy material, never see-through");
// Sapphire Pavilion reads on dark: no near-black faces left in the conic cut.
const sigil = read("../styles/name-effects-sigil.css");
const sapStart = sigil.indexOf("background-image", sigil.indexOf(".effect-sigil-sapphire {"));
const sapphire = sigil.slice(sapStart, sigil.indexOf("}", sapStart));
for (const dark of ["#082f49", "#0c4a6e", "#075985", "#0369a1"]) assert.ok(!sapphire.includes(dark), `sapphire still uses ${dark}`);

console.log("storePurchaseState.selftest.mjs: ok");
