// State logic for the store purchase modal (2.13.1). Pure functions, no React,
// so lib/storePurchaseState.selftest.mjs can run them under node.
// Prices, balances and the purchase/equip endpoints are not touched here: the
// modal only reads balance and price_descoin and calls ShopPanel's handlers.

/** Categories that open the purchase modal. Countries keep CountryShop's own dialog. */
export const PURCHASE_MODAL_CATEGORIES = [
  "banner",
  "avatar_effect",
  "profile_background",
  "theme",
  "name_effect",
  "chat_bubble",
  "presence_flare",
  "profile_aura",
  "typing_flare",
  "reaction_burst",
  "call_overlay",
  "profile_color",
];
const MODAL_SET = new Set(PURCHASE_MODAL_CATEGORIES);
export const usesPurchaseModal = (category) => MODAL_SET.has(category);

export const RARITY_COLORS = {
  common: "#a3b1c6",
  rare: "#60a5fa",
  epic: "#c084fc",
  legendary: "#fbbf24",
  mythic: "#f472b6",
};
export const rarityKey = (rarity) => (RARITY_COLORS[rarity] ? rarity : "common");

/** Same digits as the wallet pill and the cards (2,918), whatever the UI language. */
export const formatCoins = (n) => Math.max(0, Math.round(Number(n) || 0)).toLocaleString("en-US");

/**
 * The modal's state for one item.
 *   phase: "idle" | "buying" | "success" (success is set after handleBuy resolved true)
 * Returns { state, price, balance, after, short, pct, canBuy }.
 *   state: "buy" | "insufficient" | "owned-equipped" | "owned-stowed" | "success"
 */
export function purchaseView({ item, balance, owned, equipped, phase = "idle" }) {
  const price = Math.max(0, Number(item?.price_descoin) || 0);
  const bal = Math.max(0, Number(balance) || 0);
  if (phase === "success") {
    return { state: "success", price, balance: bal, after: bal, short: 0, pct: 100, canBuy: false };
  }
  if (owned) {
    return {
      state: equipped ? "owned-equipped" : "owned-stowed",
      price, balance: bal, after: bal, short: 0, pct: 100, canBuy: false,
    };
  }
  const short = Math.max(0, price - bal);
  if (short > 0) {
    // Never shows 100% while something is still missing.
    const pct = price > 0 ? Math.min(99, Math.max(0, Math.floor((bal / price) * 100))) : 0;
    return { state: "insufficient", price, balance: bal, after: bal - price, short, pct, canBuy: false };
  }
  return { state: "buy", price, balance: bal, after: bal - price, short: 0, pct: 100, canBuy: phase !== "buying" };
}

/**
 * What "Geri al" does after a purchase that auto-wore the item: it undoes only the
 * wear. The purchase stays (DesCoin is not refunded, the item stays in the inventory).
 *   previous set → put the previous item back on: { action: "equip", item: previous }
 *   nothing was worn → take the new item off:   { action: "unequip", item }
 *   not auto-worn / already undone → null
 */
export function undoTarget({ item, previous, autoWore, undone = false }) {
  if (!item || !autoWore || undone) return null;
  if (previous && previous.id && previous.id !== item.id) return { action: "equip", item: previous };
  return { action: "unequip", item };
}

/** Runs an undoTarget against ShopPanel's handleEquip(item, isEquipped). */
export async function applyUndo(target, handleEquip) {
  if (!target) return false;
  const res = target.action === "equip" ? await handleEquip(target.item, false) : await handleEquip(target.item, true);
  // handleEquip reports failure with `false`; keep "Geri al" available so it can be retried.
  return res !== false;
}

// Items with motion. The DB row has no motion column, so the frontend keeps the list
// (backend/lib/nameEffectCatalog.js, chatBubbleCatalog.js, glassThemeCatalog.js).
// Matches the approved mockups: presence flares, reactions, auras and call overlays are not
// badged "Hareketli" (their motion is a short one-off or ambient, not a loop).
const ANIMATED_CATEGORIES = new Set(["avatar_effect", "typing_flare"]);
const ANIMATED_SKUS = new Set([
  "name-effect-sigil-aurora", "name-effect-sigil-mercury", "name-effect-sigil-forge", "name-effect-sigil-circuit",
  "name-effect-sigil-prism", "name-effect-sigil-tide", "name-effect-sigil-core", "name-effect-sigil-scan",
  "name-effect-sigil-oil", "name-effect-sigil-pulse", "name-effect-sigil-chroma", "name-effect-sigil-comet",
  "name-effect-sigil-solar", "name-effect-sigil-rift",
  "chat-bubble-atelier-aurora", "chat-bubble-atelier-mercury", "chat-bubble-atelier-breath", "chat-bubble-atelier-circuit",
  "chat-bubble-atelier-sheen", "chat-bubble-atelier-tide", "chat-bubble-atelier-plasma", "chat-bubble-atelier-scanline",
  "chat-bubble-atelier-firefly", "chat-bubble-atelier-magma", "chat-bubble-atelier-starfall", "chat-bubble-atelier-oilslick",
  "chat-bubble-atelier-heartbeat", "chat-bubble-atelier-glitch", "chat-bubble-atelier-comet", "chat-bubble-atelier-ribbon",
  "chat-bubble-atelier-arc", "chat-bubble-atelier-biolume", "chat-bubble-atelier-solar", "chat-bubble-atelier-rift",
  "chat-bubble-holo",
  "theme-emberfall", "theme-borealis", "theme-starwell", "theme-chromeveil", "theme-iriscape",
]);
export function isAnimatedItem(item) {
  if (!item) return false;
  if (ANIMATED_SKUS.has(item.sku)) return true;
  if (ANIMATED_CATEGORIES.has(item.category)) return true;
  // Pre-sigil name effects are all animated ("Animated name effect — …").
  if (item.category === "name_effect") return !String(item.sku || "").startsWith("name-effect-sigil-");
  return false;
}

/** Turkish short date for the owned card: "12 Eki 2026". English: "Oct 12, 2026". */
const TR_MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function formatOwnedDate(iso, locale) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  const tr = String(locale || "").startsWith("tr");
  return tr
    ? `${d.getDate()} ${TR_MONTHS[d.getMonth()]} ${d.getFullYear()}`
    : `${EN_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
