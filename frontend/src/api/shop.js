import { authedRequest } from "./authedHttp";

export const getShopCatalog = ({ category, assets } = {}) => {
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
export const purchaseShopItem = (itemId) =>
  authedRequest("/api/shop/purchase", { method: "POST", body: { itemId, themeEngine: "scenes-1" } });
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
