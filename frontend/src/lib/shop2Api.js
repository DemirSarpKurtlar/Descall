// Market 2.0 user API (/api/shop2, docs/shop2-api.md). Every call the user UI makes goes
// through this module, so the visual harness swaps it for a mock and the backend shape lives
// in one place. Answers are normalised by shop2Logic.js.
import { authedRequest } from "../api/authedHttp";
import { getFriendsList } from "../api/friends";
import { getMyServers, getServer, getServerMembers, getChannelMessages } from "../api/servers";
import { idempotencyKey } from "./shop2Logic.js";
import { serverMessage } from "../i18n/serverText.js";

const BASE = "/api/shop2";

/**
 * The server answers in English ({ error, errorKey?, errorVars? }, lib/apiError.js); every
 * shop2 error reaches the UI (toasts use err.message) in the viewer's language.
 */
export function localizeShop2Error(err) {
  if (err && typeof err === "object" && typeof err.message === "string" && err.status) {
    const text = serverMessage({ error: err.message, errorKey: err.errorKey, errorVars: err.errorVars });
    if (text) err.message = text;
  } else if (err instanceof TypeError) {
    // fetch() could not reach the server ("Failed to fetch").
    err.message = serverMessage({ error: "No connection. Check your internet and try again." });
  }
  return err;
}
const call = (path, opts) => authedRequest(`${BASE}${path}`, opts).catch((err) => {
  throw localizeShop2Error(err);
});
const get = (path) => call(path);
const post = (path, body = {}) => call(path, { method: "POST", body });
const enc = encodeURIComponent;

/** True when the server does not have the route yet (migration / deploy not live). */
export const isMissingRoute = (err) => err?.status === 404 || err?.status === 501;

export const shop2Api = {
  storefront: () => get("/storefront"),
  /** keepLockedItemId: undefined keeps the stored lock, null drops it. */
  refreshStorefront: (keepLockedItemId, expectedPrice) =>
    post("/storefront/refresh", {
      ...(keepLockedItemId !== undefined ? { keepLockedItemId } : {}),
      ...(Number.isFinite(expectedPrice) ? { expectedPrice } : {}),
      idempotencyKey: idempotencyKey("refresh"),
    }),
  lockSlot: (itemId) => post("/storefront/lock", { itemId: itemId ?? null }),

  sets: () => get("/sets"),
  set: (key) => get(`/sets/${enc(key)}`),
  /** equip: "all" wears every piece (server saves the previous look as an outfit). */
  buySet: (key, { pieceIds = null, holdToken, expectedPrice, equip = null } = {}) =>
    post(`/sets/${enc(key)}/buy`, {
      ...(pieceIds ? { pieceIds } : { all: true }),
      holdToken,
      ...(Number.isFinite(expectedPrice) ? { expectedPrice } : {}),
      ...(equip ? { equip } : {}),
    }),
  buyItem: (itemId, { holdToken, price, equip = false, source = "storefront" } = {}) =>
    post(`/items/${enc(itemId)}/buy`, {
      ...(Number.isFinite(price) ? { expectedPrice: price } : {}),
      source,
      ...(equip ? { equip: true } : {}),
      idempotencyKey: holdToken || idempotencyKey("item"),
    }),
  purchases: () => get("/purchases"),
  refund: (purchaseId) => post(`/purchases/${enc(purchaseId)}/refund`),

  nightMarket: () => get("/night-market"),
  flip: (cardIndex) => post("/night-market/flip", { cardIndex }),
  buyNight: (cardIndex, { holdToken, price } = {}) =>
    post("/night-market/buy", { cardIndex, ...(Number.isFinite(price) ? { expectedPrice: price } : {}), idempotencyKey: holdToken || idempotencyKey("night") }),
  keepNight: (cardIndex, keep = true) => post("/night-market/keep", { cardIndex, keep }),
  nightNotify: (on) => post("/night-market/notify", { on: Boolean(on) }),

  gifts: () => get("/gifts"),
  giftRecipients: ({ itemId, setKey } = {}) => get(`/gifts/recipients?${itemId != null ? `itemId=${enc(itemId)}` : `setKey=${enc(setKey || "")}`}`),
  giftQuote: (body) => post("/gifts/quote", body),
  sendGift: ({ toUserId, itemId, setKey, message, sendAt, hideName, hiddenItem, wrap, thankCard, nightCardIndex }) =>
    post("/gifts", {
      toUserId,
      ...(nightCardIndex != null ? { nightCardIndex } : setKey ? { setKey } : { itemId }),
      ...(message ? { message } : {}),
      ...(sendAt ? { sendAt } : {}),
      anonymous: Boolean(hideName),
      hidden: Boolean(hiddenItem),
      wrap,
      thankCard: Boolean(thankCard),
      idempotencyKey: idempotencyKey("gift"),
    }),
  recallGift: (id) => post(`/gifts/${enc(id)}/recall`),
  openGift: (id, { equip = false } = {}) => post(`/gifts/${enc(id)}/open`, equip ? { equip: true } : {}),
  thankGift: (id) => post(`/gifts/${enc(id)}/thank`),

  history: () => get("/history?limit=30"),
  undo: (id) => post(`/history/${enc(id)}/undo`),

  outfits: () => get("/outfits"),
  /** kind "previous": the look kept automatically before "Hepsini kuşan" (not a named save). */
  saveOutfit: ({ name, look, kind }) => post("/outfits", { name, ...(look ? { look } : {}), ...(kind ? { kind } : {}) }),
  applyOutfit: (id) => post(`/outfits/${enc(id)}/apply`),
  /** "Arkadaşlarına göster": DM the look link to 1-10 friends; per-recipient results. */
  shareLook: ({ setKey, itemId, toUserIds, message }) =>
    post("/share", { ...(setKey ? { setKey } : { itemId }), toUserIds, ...(message ? { message } : {}) }),
  catalog: () => get("/catalog"),

  wishlist: () => get("/wishlist"),
  toggleWishlist: (itemId, on = true) => post("/wishlist", { itemId, ...(on ? {} : { remove: true }) }),
  toggleSetWishlist: (setKey, on = true) => post("/wishlist", { setKey, ...(on ? {} : { remove: true }) }),

  // Shared app data the market reuses (friends for gifts, servers for the "Sahne" try-on).
  friends: () => getFriendsList(),
  myServers: () => getMyServers(),
  server: (id) => getServer(id),
  serverMembers: (id) => getServerMembers(id),
  channelMessages: (serverId, channelId) => getChannelMessages(serverId, channelId, { limit: 6 }),
};

export default shop2Api;
