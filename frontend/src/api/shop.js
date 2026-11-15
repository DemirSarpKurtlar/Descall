import { edgeApiBase, fetchPublic } from "../lib/edgeApi";
import { authedRequest } from "./authedHttp";

/**
 * Full catalog: through the Cloudflare edge (public, identical for everyone)
 * when it is live, else the signed-in route as before.
 */
export const getShopCatalog = async ({ category, assets, fresh = false } = {}) => {
  // fresh: a live "shop:catalog:changed" (sale, stock, storefront) skips the edge cache.
  if (!category && !assets && !fresh && edgeApiBase()) {
    try {
      const res = await fetchPublic("/api/shop/catalog/public", { headers: { Accept: "application/json" } });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.items)) return data;
      }
    } catch {
      /* fall back to the signed-in route */
    }
  }
  return getShopCatalogOrigin({ category, assets });
};
const getShopCatalogOrigin = ({ category, assets } = {}) => {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (assets) params.set("assets", "1");
  const query = params.toString();
  return authedRequest(`/api/shop/catalog${query ? `?${query}` : ""}`);
};
export const getShopInventory = () => authedRequest("/api/shop/inventory");
export const getDesCoinWallet = () => authedRequest("/api/shop/wallet");
export const getDesCoinLedger = (limit = 50) => authedRequest(`/api/shop/ledger?limit=${limit}`);
export const getDesCoinDaily = () => authedRequest("/api/shop/daily");
export const claimDesCoinDaily = () =>
  authedRequest("/api/shop/daily/claim", { method: "POST", body: {} });
/** expectedPrice: the price the buyer saw; the server refuses (price_changed) if it went up. */
export const purchaseShopItem = (itemId, { useVoucher = false, expectedPrice } = {}) =>
  authedRequest("/api/shop/purchase", {
    method: "POST",
    body: {
      itemId,
      themeEngine: "scenes-1",
      ...(useVoucher ? { useVoucher: true } : {}),
      ...(Number.isFinite(expectedPrice) ? { expectedPrice } : {}),
    },
  });
/** Open free-item vouchers by category, e.g. `{ countries: 1 }` (2.13.0). */
export const getShopVouchers = () => authedRequest("/api/shop/vouchers");
export const equipShopItem = (category, itemId) =>
  authedRequest("/api/shop/equip", {
    method: "POST",
    body: { category, itemId, themeEngine: "scenes-1" },
  });

// Admin-only
export const listAllShopItems = () => authedRequest("/api/admin/shop/items");
export const giftShopItem = (userId, itemId, message) =>
  authedRequest("/api/admin/shop/gift", { method: "POST", body: { userId, itemId, message } });
export const grantDesCoin = (userId, amount, reason, message) =>
  authedRequest("/api/admin/descoin/grant", { method: "POST", body: { userId, amount, reason, message } });
