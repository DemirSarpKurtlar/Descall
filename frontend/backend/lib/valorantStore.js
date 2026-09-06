/**
 * Valorant wallet / inventory / loadout / daily store (Adım 6).
 * Thin PD proxy — never logs tokens or passwords.
 *
 * Live data: access + entitlement (Electron headers preferred).
 * Ops gate: RIOT_API_KEY must be set on Render (same checklist as Adım 5).
 * The key itself is not sent to pd.*; player tokens drive store/personalization.
 */

const {
  fetchClientVersion,
  pdBase,
  riotHeaders,
  shardForRegion,
} = require("./valorantParty");
const { toHenrikRegion } = require("./riotLink");

/** Well-known currency UUIDs */
const CURRENCY = {
  vp: "85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741",
  radianite: "e59aa87c-4cbf-517a-5983-6e81511be9b7",
  kingdom: "f08d4ae3-939c-4576-ab26-09ce1f23bb37",
};

/** Entitlement item-type UUIDs */
const ITEM_TYPE = {
  agents: "01bb38e1-da47-4e6a-9b3d-945fe4655707",
  contracts: "f85cb6f7-33e5-4dc8-b609-ec7212301948",
  sprays: "d5f120f8-ff8c-4aac-92ea-f2b5acbe9475",
  buddies: "dd3bf334-87f3-40bd-b043-682a57a8dc3a",
  cards: "3f296c07-64c3-494c-923b-fe692a4fa1bd",
  skins: "e7c63390-eda7-46e0-bb7a-a6abdacd2433",
  skinVariants: "3ad1b2b2-acdb-4524-852f-954a76ddae0a",
  titles: "de7caa6b-adf7-4588-bbd1-143831e786c6",
};

function riotApiKeyConfigured() {
  return Boolean(String(process.env.RIOT_API_KEY || "").trim());
}

function notConfiguredPayload(extra = {}) {
  return {
    configured: false,
    envNeeded: ["RIOT_API_KEY"],
    implemented: true,
    adim: 6,
    ok: false,
    code: "RIOT_API_KEY_MISSING",
    note: "Set RIOT_API_KEY on Render, then redeploy. Live store/loadout still need X-Riot-Access-Token + X-Riot-Entitlement (desktop Riot Client).",
    wallet: null,
    skins: [],
    loadout: null,
    offers: [],
    bundles: [],
    ...extra,
  };
}

function storeCapabilities() {
  const configured = riotApiKeyConfigured();
  return {
    implemented: true,
    adim: 6,
    configured,
    envNeeded: configured ? [] : ["RIOT_API_KEY"],
    features: {
      wallet: true,
      ownedSkins: true,
      loadoutGet: true,
      loadoutEquip: true,
      dailyStore: true,
      bundles: true,
    },
    uiOwner: "dima",
    clientHooks: ["useValorantStore", "useValorantLoadout"],
    endpoints: {
      status: "GET /api/valorant/store/status",
      wallet: "GET /api/valorant/wallet",
      skins: "GET /api/valorant/inventory/skins",
      loadout: "GET /api/valorant/loadout",
      equip: "PUT /api/valorant/loadout",
      offers: "GET /api/valorant/store/offers",
      storefrontAlias: "GET /api/valorant/store/storefront",
    },
    note: configured
      ? "Wallet/inventory/loadout/daily store via PD — send live Riot tokens as headers (Electron safeStorage)."
      : "RIOT_API_KEY missing on Render — store/loadout endpoints return configured:false (no crash).",
  };
}

let cachedWeapons = { map: null, at: 0 };
let cachedSkins = { map: null, at: 0 };
let cachedBundles = { map: null, at: 0 };
let cachedCards = { map: null, at: 0 };
let cachedTitles = { map: null, at: 0 };
let cachedSprays = { map: null, at: 0 };
let cachedBuddies = { map: null, at: 0 };

async function fetchValorantApiMap(url, cache, shape) {
  const now = Date.now();
  if (cache.map && now - cache.at < 6 * 60 * 60 * 1000) {
    return cache.map;
  }
  try {
    const res = await fetch(url);
    const body = await res.json().catch(() => ({}));
    const list = Array.isArray(body?.data) ? body.data : [];
    const map = {};
    for (const row of list) {
      if (!row?.uuid) continue;
      map[row.uuid] = shape(row);
    }
    cache.map = map;
    cache.at = now;
    return map;
  } catch {
    return cache.map || {};
  }
}

async function loadSkinDefs() {
  return fetchValorantApiMap(
    "https://valorant-api.com/v1/weapons/skins",
    cachedSkins,
    (row) => ({
      uuid: row.uuid,
      displayName: row.displayName || null,
      displayIcon: row.displayIcon || row.levels?.[0]?.displayIcon || null,
      themeUuid: row.themeUuid || null,
      contentTierUuid: row.contentTierUuid || null,
      weaponUuid: null,
    })
  );
}

async function loadWeaponDefs() {
  return fetchValorantApiMap(
    "https://valorant-api.com/v1/weapons",
    cachedWeapons,
    (row) => ({
      uuid: row.uuid,
      displayName: row.displayName || null,
      category: row.category || null,
      defaultSkinUuid: row.defaultSkinUuid || null,
      skins: Array.isArray(row.skins)
        ? row.skins.map((s) => s.uuid).filter(Boolean)
        : [],
    })
  );
}

async function loadBundleDefs() {
  return fetchValorantApiMap(
    "https://valorant-api.com/v1/bundles",
    cachedBundles,
    (row) => ({
      uuid: row.uuid,
      displayName: row.displayName || null,
      displayIcon: row.displayIcon || null,
    })
  );
}

async function loadCardDefs() {
  return fetchValorantApiMap(
    "https://valorant-api.com/v1/playercards",
    cachedCards,
    (row) => ({
      uuid: row.uuid,
      displayName: row.displayName || null,
      displayIcon: row.displayIcon || row.smallArt || null,
    })
  );
}

async function loadTitleDefs() {
  return fetchValorantApiMap(
    "https://valorant-api.com/v1/playertitles",
    cachedTitles,
    (row) => ({
      uuid: row.uuid,
      displayName: row.displayName || row.titleText || null,
    })
  );
}

async function loadSprayDefs() {
  return fetchValorantApiMap(
    "https://valorant-api.com/v1/sprays",
    cachedSprays,
    (row) => ({
      uuid: row.uuid,
      displayName: row.displayName || null,
      displayIcon: row.displayIcon || row.fullTransparentIcon || null,
    })
  );
}

async function loadBuddyDefs() {
  return fetchValorantApiMap(
    "https://valorant-api.com/v1/buddies",
    cachedBuddies,
    (row) => ({
      uuid: row.uuid,
      displayName: row.displayName || null,
      displayIcon: row.displayIcon || null,
    })
  );
}

async function pdRequest({
  method = "GET",
  path,
  region,
  accessToken,
  entitlementToken,
  body = undefined,
}) {
  const clientVersion = await fetchClientVersion();
  const url = `${pdBase(region)}${path}`;
  const res = await fetch(url, {
    method,
    headers: riotHeaders({ accessToken, entitlementToken, clientVersion }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(
      json?.errorCode ||
        json?.message ||
        json?.httpStatus ||
        `Riot store request failed (${res.status})`
    );
    err.status = res.status === 401 || res.status === 403 ? 401 : res.status || 502;
    err.code = res.status === 401 || res.status === 403 ? "TOKENS_INVALID" : "RIOT_STORE_ERROR";
    err.riot = json;
    throw err;
  }
  return json;
}

function requireLiveSession({ accessToken, entitlementToken, puuid }) {
  if (!accessToken || !entitlementToken) {
    const err = new Error(
      "Live Riot entitlement + access tokens required. Use desktop Riot Client connect."
    );
    err.status = 401;
    err.code = "TOKENS_REQUIRED";
    throw err;
  }
  if (!puuid) {
    const err = new Error("Missing Riot puuid");
    err.status = 400;
    err.code = "PUUID_REQUIRED";
    throw err;
  }
}

function shapeWallet(balances = {}) {
  const b = balances && typeof balances === "object" ? balances : {};
  return {
    vp: Number(b[CURRENCY.vp]) || 0,
    radianite: Number(b[CURRENCY.radianite]) || 0,
    kingdom: Number(b[CURRENCY.kingdom]) || 0,
    raw: b,
  };
}

function costFromMap(cost) {
  if (!cost || typeof cost !== "object") return { amount: null, currency: null };
  if (CURRENCY.vp in cost) return { amount: Number(cost[CURRENCY.vp]) || 0, currency: "vp" };
  if (CURRENCY.radianite in cost) {
    return { amount: Number(cost[CURRENCY.radianite]) || 0, currency: "radianite" };
  }
  if (CURRENCY.kingdom in cost) {
    return { amount: Number(cost[CURRENCY.kingdom]) || 0, currency: "kingdom" };
  }
  const first = Object.entries(cost)[0];
  if (!first) return { amount: null, currency: null };
  return { amount: Number(first[1]) || 0, currency: first[0] };
}

/**
 * Resolve weapon uuid for a skin uuid (best-effort from weapons catalog).
 */
function weaponForSkin(skinUuid, weapons) {
  if (!skinUuid || !weapons) return null;
  for (const w of Object.values(weapons)) {
    if (w.defaultSkinUuid === skinUuid) return w.uuid;
    if (Array.isArray(w.skins) && w.skins.includes(skinUuid)) return w.uuid;
  }
  return null;
}

async function getWallet({ accessToken, entitlementToken, region, puuid }) {
  if (!riotApiKeyConfigured()) return notConfiguredPayload();
  requireLiveSession({ accessToken, entitlementToken, puuid });
  const affinity = toHenrikRegion(region || "eu");
  const raw = await pdRequest({
    method: "GET",
    path: `/store/v1/wallet/${encodeURIComponent(puuid)}`,
    region: affinity,
    accessToken,
    entitlementToken,
  });
  const wallet = shapeWallet(raw?.Balances);
  return {
    ok: true,
    configured: true,
    envNeeded: [],
    adim: 6,
    region: affinity,
    shard: shardForRegion(affinity),
    puuid,
    wallet,
  };
}

async function getOwnedSkins({ accessToken, entitlementToken, region, puuid }) {
  if (!riotApiKeyConfigured()) return notConfiguredPayload({ skins: [] });
  requireLiveSession({ accessToken, entitlementToken, puuid });
  const affinity = toHenrikRegion(region || "eu");
  const raw = await pdRequest({
    method: "GET",
    path: `/store/v1/entitlements/${encodeURIComponent(puuid)}/${ITEM_TYPE.skins}`,
    region: affinity,
    accessToken,
    entitlementToken,
  });
  const [skinDefs, weapons] = await Promise.all([loadSkinDefs(), loadWeaponDefs()]);
  const entitlements = Array.isArray(raw?.Entitlements) ? raw.Entitlements : [];
  const skins = entitlements
    .map((row) => {
      const itemId = row.ItemID || row.ItemId || null;
      if (!itemId) return null;
      const def = skinDefs[itemId] || null;
      return {
        itemId,
        instanceId: row.InstanceID || row.InstanceId || null,
        typeId: row.TypeID || ITEM_TYPE.skins,
        displayName: def?.displayName || null,
        displayIcon: def?.displayIcon || null,
        contentTierUuid: def?.contentTierUuid || null,
        weaponUuid: weaponForSkin(itemId, weapons),
      };
    })
    .filter(Boolean);

  return {
    ok: true,
    configured: true,
    envNeeded: [],
    adim: 6,
    region: affinity,
    shard: shardForRegion(affinity),
    puuid,
    count: skins.length,
    skins,
  };
}

function shapeLoadout(raw, catalogs = {}) {
  if (!raw) return null;
  const {
    skins = {},
    weapons = {},
    cards = {},
    titles = {},
    sprays = {},
    buddies = {},
  } = catalogs;

  const guns = (Array.isArray(raw.Guns) ? raw.Guns : []).map((g) => {
    const skinId = g.SkinID || null;
    const skin = skinId ? skins[skinId] : null;
    const weaponId = g.ID || null;
    const weapon = weaponId ? weapons[weaponId] : null;
    const buddyId = g.CharmID || null;
    return {
      weaponId,
      weaponName: weapon?.displayName || null,
      skinId,
      skinName: skin?.displayName || null,
      skinIcon: skin?.displayIcon || null,
      skinLevelId: g.SkinLevelID || null,
      chromaId: g.ChromaID || null,
      buddyId,
      buddyName: buddyId ? buddies[buddyId]?.displayName || null : null,
      buddyLevelId: g.CharmLevelID || null,
      buddyInstanceId: g.CharmInstanceID || null,
    };
  });

  const sprayRows = (Array.isArray(raw.Sprays) ? raw.Sprays : []).map((s) => {
    const sprayId = s.SprayID || null;
    return {
      slotId: s.EquipSlotID || null,
      sprayId,
      sprayName: sprayId ? sprays[sprayId]?.displayName || null : null,
      sprayIcon: sprayId ? sprays[sprayId]?.displayIcon || null : null,
    };
  });

  const identity = raw.Identity || {};
  const cardId = identity.PlayerCardID || null;
  const titleId = identity.PlayerTitleID || null;

  return {
    subject: raw.Subject || null,
    version: raw.Version ?? null,
    incognito: Boolean(raw.Incognito),
    guns,
    sprays: sprayRows,
    identity: {
      cardId,
      cardName: cardId ? cards[cardId]?.displayName || null : null,
      cardIcon: cardId ? cards[cardId]?.displayIcon || null : null,
      titleId,
      titleName: titleId ? titles[titleId]?.displayName || null : null,
      accountLevel: identity.AccountLevel ?? null,
      preferredLevelBorderId: identity.PreferredLevelBorderID || null,
      hideAccountLevel: Boolean(identity.HideAccountLevel),
    },
    raw,
  };
}

async function loadLoadoutCatalogs() {
  const [skins, weapons, cards, titles, sprays, buddies] = await Promise.all([
    loadSkinDefs(),
    loadWeaponDefs(),
    loadCardDefs(),
    loadTitleDefs(),
    loadSprayDefs(),
    loadBuddyDefs(),
  ]);
  return { skins, weapons, cards, titles, sprays, buddies };
}

async function getLoadout({ accessToken, entitlementToken, region, puuid }) {
  if (!riotApiKeyConfigured()) return notConfiguredPayload({ loadout: null });
  requireLiveSession({ accessToken, entitlementToken, puuid });
  const affinity = toHenrikRegion(region || "eu");
  const raw = await pdRequest({
    method: "GET",
    path: `/personalization/v2/players/${encodeURIComponent(puuid)}/playerloadout`,
    region: affinity,
    accessToken,
    entitlementToken,
  });
  const catalogs = await loadLoadoutCatalogs();
  return {
    ok: true,
    configured: true,
    envNeeded: [],
    adim: 6,
    region: affinity,
    shard: shardForRegion(affinity),
    puuid,
    loadout: shapeLoadout(raw, catalogs),
  };
}

/**
 * Apply a partial equip patch onto a raw Riot loadout body, then PUT.
 * Body fields (all optional):
 *   guns: [{ weaponId, skinId, skinLevelId?, chromaId?, buddyId?, buddyLevelId?, buddyInstanceId? }]
 *   sprays: [{ slotId, sprayId }]
 *   identity: { cardId?, titleId?, preferredLevelBorderId?, hideAccountLevel? }
 *   incognito?: boolean
 *   raw?: full raw loadout (advanced — replaces merge base)
 */
function applyLoadoutPatch(currentRaw, patch = {}) {
  const next = JSON.parse(JSON.stringify(patch.raw || currentRaw || {}));
  if (!Array.isArray(next.Guns)) next.Guns = [];
  if (!Array.isArray(next.Sprays)) next.Sprays = [];
  if (!next.Identity || typeof next.Identity !== "object") next.Identity = {};

  if (Array.isArray(patch.guns)) {
    for (const g of patch.guns) {
      const weaponId = g.weaponId || g.ID || g.id;
      if (!weaponId) continue;
      let row = next.Guns.find((x) => x.ID === weaponId);
      if (!row) {
        row = { ID: weaponId, SkinID: null, SkinLevelID: null, ChromaID: null, Attachments: [] };
        next.Guns.push(row);
      }
      if (g.skinId || g.SkinID) row.SkinID = g.skinId || g.SkinID;
      if (g.skinLevelId || g.SkinLevelID) row.SkinLevelID = g.skinLevelId || g.SkinLevelID;
      if (g.chromaId || g.ChromaID) row.ChromaID = g.chromaId || g.ChromaID;
      if (g.buddyId !== undefined || g.CharmID !== undefined) {
        row.CharmID = g.buddyId !== undefined ? g.buddyId : g.CharmID;
      }
      if (g.buddyLevelId !== undefined || g.CharmLevelID !== undefined) {
        row.CharmLevelID = g.buddyLevelId !== undefined ? g.buddyLevelId : g.CharmLevelID;
      }
      if (g.buddyInstanceId !== undefined || g.CharmInstanceID !== undefined) {
        row.CharmInstanceID =
          g.buddyInstanceId !== undefined ? g.buddyInstanceId : g.CharmInstanceID;
      }
      if (!Array.isArray(row.Attachments)) row.Attachments = [];
    }
  }

  if (Array.isArray(patch.sprays)) {
    for (const s of patch.sprays) {
      const slotId = s.slotId || s.EquipSlotID;
      const sprayId = s.sprayId || s.SprayID;
      if (!slotId || !sprayId) continue;
      let row = next.Sprays.find((x) => x.EquipSlotID === slotId);
      if (!row) {
        row = { EquipSlotID: slotId, SprayID: sprayId, SprayLevelID: null };
        next.Sprays.push(row);
      } else {
        row.SprayID = sprayId;
        row.SprayLevelID = s.SprayLevelID ?? null;
      }
    }
  }

  if (patch.identity && typeof patch.identity === "object") {
    const id = patch.identity;
    if (id.cardId || id.PlayerCardID) {
      next.Identity.PlayerCardID = id.cardId || id.PlayerCardID;
    }
    if (id.titleId || id.PlayerTitleID) {
      next.Identity.PlayerTitleID = id.titleId || id.PlayerTitleID;
    }
    if (id.preferredLevelBorderId || id.PreferredLevelBorderID) {
      next.Identity.PreferredLevelBorderID =
        id.preferredLevelBorderId || id.PreferredLevelBorderID;
    }
    if (typeof id.hideAccountLevel === "boolean") {
      next.Identity.HideAccountLevel = id.hideAccountLevel;
    }
  }

  if (typeof patch.incognito === "boolean") {
    next.Incognito = patch.incognito;
  }

  return next;
}

async function putLoadout({ accessToken, entitlementToken, region, puuid, patch }) {
  if (!riotApiKeyConfigured()) return notConfiguredPayload({ loadout: null });
  requireLiveSession({ accessToken, entitlementToken, puuid });
  if (!patch || typeof patch !== "object") {
    const err = new Error("loadout patch body required");
    err.status = 400;
    err.code = "LOADOUT_PATCH_REQUIRED";
    throw err;
  }
  const affinity = toHenrikRegion(region || "eu");
  const path = `/personalization/v2/players/${encodeURIComponent(puuid)}/playerloadout`;

  let body;
  if (patch.raw && !patch.guns && !patch.sprays && !patch.identity) {
    body = patch.raw;
  } else {
    const current = await pdRequest({
      method: "GET",
      path,
      region: affinity,
      accessToken,
      entitlementToken,
    });
    body = applyLoadoutPatch(current, patch);
  }

  const raw = await pdRequest({
    method: "PUT",
    path,
    region: affinity,
    accessToken,
    entitlementToken,
    body,
  });
  const catalogs = await loadLoadoutCatalogs();
  return {
    ok: true,
    configured: true,
    envNeeded: [],
    adim: 6,
    region: affinity,
    shard: shardForRegion(affinity),
    puuid,
    loadout: shapeLoadout(raw, catalogs),
  };
}

async function getStorefront({ accessToken, entitlementToken, region, puuid }) {
  if (!riotApiKeyConfigured()) {
    return notConfiguredPayload({ offers: [], bundles: [] });
  }
  requireLiveSession({ accessToken, entitlementToken, puuid });
  const affinity = toHenrikRegion(region || "eu");
  const raw = await pdRequest({
    method: "GET",
    path: `/store/v2/storefront/${encodeURIComponent(puuid)}`,
    region: affinity,
    accessToken,
    entitlementToken,
  });

  const [skinDefs, bundleDefs] = await Promise.all([loadSkinDefs(), loadBundleDefs()]);

  const panel = raw?.SkinsPanelLayout || {};
  const singleOffers = Array.isArray(panel.SingleItemStoreOffers)
    ? panel.SingleItemStoreOffers
    : [];
  const offers = singleOffers.map((offer) => {
    const reward = Array.isArray(offer.Rewards) ? offer.Rewards[0] : null;
    const itemId = reward?.ItemID || offer.OfferID || null;
    const skin = itemId ? skinDefs[itemId] : null;
    const priced = costFromMap(offer.Cost);
    return {
      offerId: offer.OfferID || null,
      itemId,
      itemTypeId: reward?.ItemTypeID || ITEM_TYPE.skins,
      displayName: skin?.displayName || null,
      displayIcon: skin?.displayIcon || null,
      cost: priced.amount,
      currency: priced.currency,
      isDirectPurchase: Boolean(offer.IsDirectPurchase),
      startDate: offer.StartDate || null,
    };
  });

  const featured = raw?.FeaturedBundle || {};
  const featuredBundles = Array.isArray(featured.Bundles)
    ? featured.Bundles
    : featured.Bundle
      ? [featured.Bundle]
      : [];
  const bundles = featuredBundles.map((b) => {
    const bundleId = b.DataAssetID || b.ID || null;
    const def = bundleId ? bundleDefs[bundleId] : null;
    const items = Array.isArray(b.Items)
      ? b.Items.map((it) => {
          const itemId = it.Item?.ItemID || it.ItemID || null;
          const skin = itemId ? skinDefs[itemId] : null;
          const priced = costFromMap(
            it.DiscountedPrice || it.BasePrice
              ? { [it.CurrencyID || CURRENCY.vp]: it.DiscountedPrice ?? it.BasePrice }
              : it.BasePrice && typeof it.BasePrice === "object"
                ? it.BasePrice
                : null
          );
          // Featured bundle item shape varies — normalize
          let amount = null;
          let currency = null;
          if (typeof it.BasePrice === "number") {
            amount = it.DiscountedPrice ?? it.BasePrice;
            currency =
              it.CurrencyID === CURRENCY.radianite
                ? "radianite"
                : it.CurrencyID === CURRENCY.kingdom
                  ? "kingdom"
                  : "vp";
          } else if (it.BasePrice && typeof it.BasePrice === "object") {
            const c = costFromMap(it.DiscountedPrice || it.BasePrice);
            amount = c.amount;
            currency = c.currency;
          } else {
            amount = priced.amount;
            currency = priced.currency;
          }
          return {
            itemId,
            itemTypeId: it.Item?.ItemTypeID || it.ItemTypeID || null,
            displayName: skin?.displayName || null,
            displayIcon: skin?.displayIcon || null,
            basePrice: typeof it.BasePrice === "number" ? it.BasePrice : amount,
            cost: amount,
            currency,
            discountPercent: it.DiscountPercent ?? null,
          };
        })
      : [];
    return {
      bundleId,
      displayName: def?.displayName || null,
      displayIcon: def?.displayIcon || null,
      durationRemainingSeconds:
        b.DurationRemainingInSeconds ??
        featured.BundleRemainingDurationInSeconds ??
        null,
      totalBaseCost: b.TotalBaseCost || null,
      totalDiscountedCost: b.TotalDiscountedCost || null,
      items,
    };
  });

  const accessory = raw?.AccessoryStore || {};
  const accessoryOffers = Array.isArray(accessory.AccessoryStoreOffers)
    ? accessory.AccessoryStoreOffers.map((row) => {
        const offer = row.Offer || {};
        const reward = Array.isArray(offer.Rewards) ? offer.Rewards[0] : null;
        const priced = costFromMap(offer.Cost);
        return {
          offerId: offer.OfferID || null,
          itemId: reward?.ItemID || null,
          itemTypeId: reward?.ItemTypeID || null,
          cost: priced.amount,
          currency: priced.currency,
        };
      })
    : [];

  return {
    ok: true,
    configured: true,
    envNeeded: [],
    adim: 6,
    region: affinity,
    shard: shardForRegion(affinity),
    puuid,
    offers,
    offersRemainingSeconds: panel.SingleItemOffersRemainingDurationInSeconds ?? null,
    bundles,
    accessoryOffers,
    accessoryRemainingSeconds: accessory.AccessoryStoreRemainingDurationInSeconds ?? null,
  };
}

module.exports = {
  riotApiKeyConfigured,
  notConfiguredPayload,
  storeCapabilities,
  getWallet,
  getOwnedSkins,
  getLoadout,
  putLoadout,
  getStorefront,
  shapeWallet,
  shapeLoadout,
  applyLoadoutPatch,
  CURRENCY,
  ITEM_TYPE,
};
