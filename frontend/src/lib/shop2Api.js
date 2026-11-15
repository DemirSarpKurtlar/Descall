// Market 2.0 user API (/api/shop2, docs/shop2-api.md). Every call the user UI makes goes
// through this module, so the visual harness swaps it for a mock and the backend shape lives
// in one place. Answers are normalised by shop2Logic.js.
import { authedRequest } from "../api/authedHttp";
import { getFriendsList } from "../api/friends";
import { getMyServers, getServer, getServerMembers, getChannelMessages } from "../api/servers";
import { idempotencyKey } from "./shop2Logic.js";

const BASE = "/api/shop2";
const get = (path) => authedRequest(`${BASE}${path}`);
const post = (path, body = {}) => authedRequest(`${BASE}${path}`, { method: "POST", body });
const enc = encodeURIComponent;

/** True when the server does not have the route yet (migration / deploy not live). */
export const isMissingRoute = (err) => err?.status === 404 || err?.status === 501;

export const shop2Api = {
  storefront: () => get("/storefront"),
  refreshStorefront: (keepLockedItemId) => post("/storefront/refresh", { ...(keepLockedItemId != null ? { keepLockedItemId } : {}), idempotencyKey: idempotencyKey("refresh") }),
  lockSlot: (itemId) => post("/storefront/lock", { itemId }),

  sets: () => get("/sets"),
  set: (key) => get(`/sets/${enc(key)}`),
  buySet: (key, { pieceIds = null, holdToken, equip = false, title = true } = {}) =>
    post(`/sets/${enc(key)}/buy`, {
      ...(pieceIds ? { pieceIds } : { all: true }),
      holdToken,
      equip,
      title,
      idempotencyKey: idempotencyKey("set"),
    }),
  buyItem: (itemId, { holdToken, price, equip = false, source = "storefront" } = {}) =>
    post(`/items/${enc(itemId)}/buy`, { holdToken, expectedPrice: price, equip, source, idempotencyKey: idempotencyKey("item") }),
  refund: (purchaseId) => post(`/purchases/${enc(purchaseId)}/refund`),

  nightMarket: () => get("/night-market"),
  flip: (cardIndex) => post("/night-market/flip", { cardIndex }),
  buyNight: (cardIndex, { holdToken } = {}) => post("/night-market/buy", { cardIndex, holdToken, idempotencyKey: idempotencyKey("night") }),
  keepNight: (cardIndex, keep = true) => post("/night-market/keep", { cardIndex, keep }),
  nightPrefs: (prefs) => post("/night-market/prefs", prefs),

  gifts: () => get("/gifts"),
  giftRecipients: ({ itemId, setKey } = {}) => get(`/gifts/recipients?${itemId != null ? `itemId=${enc(itemId)}` : `setKey=${enc(setKey || "")}`}`),
  sendGift: ({ toUserId, itemId, setKey, message, sendAt, hideName, hiddenItem, wrap, thankCard, nightCardIndex }) =>
    post("/gifts", {
      toUserId,
      ...(setKey ? { setKey } : { itemId }),
      ...(nightCardIndex != null ? { nightCardIndex } : {}),
      message,
      ...(sendAt ? { sendAt } : {}),
      hideName: Boolean(hideName),
      hiddenItem: Boolean(hiddenItem),
      wrap,
      thankCard: Boolean(thankCard),
      idempotencyKey: idempotencyKey("gift"),
    }),
  recallGift: (id) => post(`/gifts/${enc(id)}/recall`),
  openGift: (id) => post(`/gifts/${enc(id)}/open`),
  thankGift: (id) => post(`/gifts/${enc(id)}/thank`),

  history: () => get("/history"),
  undo: (id) => post(`/history/${enc(id)}/undo`),

  outfits: () => get("/outfits"),
  saveOutfit: ({ name, items, auto = false }) => post("/outfits", { name, items, auto }),
  shareLook: ({ setKey, itemIds }) => post("/share", { setKey, itemIds }),

  wishlist: () => get("/wishlist"),
  toggleWishlist: (itemId, on = true) => post("/wishlist", { itemId, remove: !on }),

  // Shared app data the market reuses (friends for gifts, servers for the "Sahne" try-on).
  friends: () => getFriendsList(),
  myServers: () => getMyServers(),
  server: (id) => getServer(id),
  serverMembers: (id) => getServerMembers(id),
  channelMessages: (serverId, channelId) => getChannelMessages(serverId, channelId, { limit: 6 }),
};

export default shop2Api;
