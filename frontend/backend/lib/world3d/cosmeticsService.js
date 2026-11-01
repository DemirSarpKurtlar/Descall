"use strict";

/**
 * 3D world cosmetics: what the "Karakterini oluştur" panel reads and saves.
 *
 *   state(userId)          catalog with server prices, owned items, saved look, balance
 *   save(userId, body)     validate the look; if it uses paid items the user does not own,
 *                          either answer 402 needs_purchase (the client shows the purchase
 *                          confirmation) or, with body.purchase, buy them first through the
 *                          atomic world_cosmetics_purchase function, then save
 *   loadWearableLook(id)   saved look limited to owned items (the /world socket on join)
 *
 * The store is injectable: cosmeticsStore.js (Supabase) in production, an in-memory store
 * with the same contract in selftests and the evidence mock server.
 */

const C = require("./cosmetics");

function storeError(err) {
  return err?.code === "WORLD_COSMETICS_UNAVAILABLE";
}

function createCosmeticsService({ store = require("./cosmeticsStore") } = {}) {
  async function ownedOf(userId) {
    return store.loadOwned(userId);
  }

  function parseStored(raw, owned) {
    if (!raw) return null;
    const v = C.validateLook(raw);
    if (!v.ok) return null;
    return C.wearable(v.look, owned);
  }

  async function state(userId) {
    let owned = new Set();
    let look = null;
    let available = true;
    try {
      owned = await ownedOf(userId);
      look = parseStored(await store.loadLook(userId), owned);
    } catch (err) {
      if (!storeError(err)) throw err;
      available = false;
    }
    const balance = await store.balance(userId);
    return {
      available,
      items: C.publicCatalog(),
      owned: [...owned],
      look,
      balance,
      colorCount: C.COLOR_COUNT,
      skinCount: C.SKIN_COUNT,
    };
  }

  async function loadWearableLook(userId) {
    try {
      const owned = await ownedOf(userId);
      return parseStored(await store.loadLook(userId), owned);
    } catch {
      return null;
    }
  }

  /** Returns { status, body } for the route. */
  async function save(userId, body = {}) {
    const v = C.validateLook(body?.look);
    if (!v.ok) return { status: 400, body: { error: "invalid_look", code: "invalid_look", detail: v.error } };
    const look = v.look;
    let owned;
    try {
      owned = await ownedOf(userId);
    } catch (err) {
      if (storeError(err)) return { status: 503, body: { error: "unavailable", code: "unavailable" } };
      throw err;
    }
    let missing = C.unownedPaid(look, owned);
    let purchase = null;
    if (missing.length) {
      const total = missing.reduce((s, x) => s + x.price, 0);
      const req = body?.purchase;
      if (!req || typeof req !== "object") {
        const balance = await store.balance(userId);
        return { status: 402, body: { error: "needs_purchase", code: "needs_purchase", items: missing, total, balance } };
      }
      const requestId = C.cleanRequestId(req.requestId);
      if (!requestId) return { status: 400, body: { error: "bad_request_id", code: "bad_request_id" } };
      const priced = C.priceRequest(req.items, req.total);
      if (!priced.ok) {
        const balance = await store.balance(userId);
        if (priced.error === "price_changed") {
          return { status: 409, body: { error: "price_changed", code: "price_changed", items: missing, total, balance } };
        }
        return { status: 400, body: { error: "bad_items", code: "bad_items" } };
      }
      const asked = new Set(priced.items.map((x) => x.id));
      if (missing.some((m) => !asked.has(m.id))) {
        const balance = await store.balance(userId);
        return { status: 409, body: { error: "needs_purchase", code: "needs_purchase", items: missing, total, balance } };
      }
      let res;
      try {
        res = await store.purchase(userId, requestId, priced.items);
      } catch (err) {
        if (storeError(err)) return { status: 503, body: { error: "unavailable", code: "unavailable" } };
        throw err;
      }
      if (!res?.ok) {
        if (res?.error === "insufficient") {
          return { status: 402, body: { error: "insufficient", code: "insufficient", balance: res.balance, total: res.total } };
        }
        if (res?.error === "wallet_frozen") return { status: 403, body: { error: "WALLET_FROZEN", code: "WALLET_FROZEN" } };
        return { status: 400, body: { error: "bad_items", code: "bad_items" } };
      }
      purchase = { charged: res.charged || [], alreadyOwned: res.alreadyOwned || [], total: res.total || 0, replayed: Boolean(res.replayed), balance: res.balance };
      owned = await ownedOf(userId);
      missing = C.unownedPaid(look, owned);
      if (missing.length) return { status: 409, body: { error: "needs_purchase", code: "needs_purchase", items: missing } };
    }
    try {
      await store.saveLook(userId, look);
    } catch (err) {
      if (storeError(err)) return { status: 503, body: { error: "unavailable", code: "unavailable" } };
      throw err;
    }
    const balance = purchase ? purchase.balance : await store.balance(userId);
    return { status: 200, body: { ok: true, look, owned: [...owned], balance, purchase } };
  }

  return { state, save, loadWearableLook };
}

let shared = null;
function service() {
  if (!shared) shared = createCosmeticsService();
  return shared;
}

module.exports = {
  createCosmeticsService,
  loadWearableLook: (userId) => service().loadWearableLook(userId),
  state: (userId) => service().state(userId),
  save: (userId, body) => service().save(userId, body),
};
