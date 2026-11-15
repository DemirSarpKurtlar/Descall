/**
 * Vitrin ve Setler: every call to the admin Market 2.0 API (routes/adminShop2.js, mounted
 * at /api/admin/shop2). All data access of the page lives here, so a change in the
 * server contract is fixed in one file. Writes go through adminFetch, which asks for
 * the step-up code on STEP_UP_REQUIRED (2FA re-verify) and retries once; the server
 * writes the audit row.
 *
 * Normalizers accept the plan's field names and a few likely variants (camelCase /
 * snake_case, `items` / `rows`), so the page keeps working while both sides settle.
 */
import { adminFetch } from "../../../api/adminHttp";
import { SET_SLOTS } from "./shop2Model.js";

const BASE = "/shop2";
const enc = encodeURIComponent;
const json = (method, body) => ({ method, body: JSON.stringify(body || {}) });
const qs = (params) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) if (v != null && v !== "") s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : "";
};
const arr = (v) => (Array.isArray(v) ? v : []);
const pick = (o, ...keys) => {
  for (const k of keys) if (o?.[k] !== undefined) return o[k];
  return undefined;
};

/* ------------------------------------------------------------------ normalizers */

export function normItem(it) {
  if (!it || typeof it !== "object") return null;
  return {
    ...it,
    id: pick(it, "id", "itemId", "item_id", "sku"),
    category: pick(it, "category", "slot") || "",
    rarity: pick(it, "rarity") || "common",
    price_descoin: Number(pick(it, "price_descoin", "price", "priceDescoin") || 0),
    effect_key: pick(it, "effect_key", "effectKey") ?? null,
    asset_url: pick(it, "asset_url", "assetUrl") ?? null,
    preview_url: pick(it, "preview_url", "previewUrl") ?? null,
    theme_key: pick(it, "theme_key", "themeKey") ?? null,
    set_key: pick(it, "set_key", "setKey") ?? null,
    ownerSharePct: pick(it, "ownerSharePct", "owner_share_pct", "ownedPct") ?? null,
  };
}

/** Pieces as `{ [slot]: item }` from an object or a list. */
function normPieces(p) {
  const out = {};
  if (Array.isArray(p)) {
    for (const raw of p) {
      const it = normItem(raw?.item || raw);
      const slot = raw?.slot || it?.category;
      if (it && SET_SLOTS.includes(slot)) out[slot] = it;
    }
  } else if (p && typeof p === "object") {
    for (const s of SET_SLOTS) if (p[s]) out[s] = normItem(p[s]);
  }
  return out;
}

export function normSet(s) {
  if (!s || typeof s !== "object") return null;
  const stock = s.stock && typeof s.stock === "object" ? s.stock : { total: pick(s, "stockTotal", "stock_total", "stock") ?? null, left: pick(s, "stockLeft", "stock_left") ?? null };
  return {
    ...s,
    key: pick(s, "key", "set_key", "setKey", "id"),
    name: pick(s, "name", "title") || "",
    status: pick(s, "status") || "draft",
    palette: arr(pick(s, "palette", "colors")),
    pieces: normPieces(pick(s, "pieces", "items")),
    price: Number(pick(s, "price", "setPrice", "set_price") || 0),
    stock: { total: stock.total ?? null, left: stock.left ?? stock.total ?? null },
    perPerson: Number(pick(s, "perPerson", "per_person", "perUserLimit") || 1),
    partialSale: pick(s, "partialSale", "partial_sale", "pieceSale") !== false,
    giftable: pick(s, "giftable") !== false,
    startsAt: pick(s, "startsAt", "starts_at", "publishAt") ?? null,
    endsAt: pick(s, "endsAt", "ends_at") ?? null,
    recalledAt: pick(s, "recalledAt", "recalled_at") ?? null,
    soldOutAt: pick(s, "soldOutAt", "sold_out_at") ?? null,
    undoUntil: pick(s, "undoUntil", "undo_until") ?? null,
    revenue7d: Number(pick(s, "revenue7d", "revenue_7d") || 0),
    conversionPct: pick(s, "conversionPct", "conversion_pct") ?? null,
    velocity: arr(pick(s, "velocity", "salesSeries")),
    sold: Number(pick(s, "sold", "soldSets") || 0),
    soldPieces: Number(pick(s, "soldPieces", "sold_pieces") || 0),
    translations: s.translations || { ready: 7, total: 7 },
    abTest: s.abTest || s.ab_test || null,
    ownerShares: s.ownerShares || s.owner_shares || {},
    updatedAt: pick(s, "updatedAt", "updated_at") ?? null,
  };
}

export function normRules(r) {
  const one = (x) =>
    x
      ? {
          version: Number(pick(x, "version", "v") || 0),
          weights: x.weights || {},
          bands: arr(x.bands || x.slotBands),
          toggles: x.toggles || {},
          newAccount: x.newAccount || x.new_account || null,
          pool: x.pool ?? null,
          at: x.at || x.createdAt || null,
          by: x.by || x.actor || null,
          note: x.note || "",
        }
      : null;
  return {
    live: one(r?.live || r?.current),
    draft: one(r?.draft),
    versions: arr(r?.versions).map(one),
    scheduled: r?.scheduled || null,
    pool: r?.pool || null,
  };
}

/* ------------------------------------------------------------------ API */

export const shop2Api = {
  /** Tiles, live sales series (range today | 7d | 30d), slot conversion, top sellers, live count. */
  dashboard: (range = "today") => adminFetch(`${BASE}/dashboard${qs({ range })}`),
  /** Sales series only (the chart polls it). */
  sales: (range = "today") => adminFetch(`${BASE}/sales${qs({ range })}`),

  sets: async (status) => {
    const r = await adminFetch(`${BASE}/sets${qs({ status })}`);
    return arr(r?.sets || r?.items || r).map(normSet).filter(Boolean);
  },
  set: async (key) => {
    const r = await adminFetch(`${BASE}/sets/${enc(key)}`);
    return { ...r, set: normSet(r?.set || r) };
  },
  createSet: (body) => adminFetch(`${BASE}/sets`, json("POST", body)),
  saveSet: (key, patch) => adminFetch(`${BASE}/sets/${enc(key)}`, json("PATCH", patch)),
  publishSet: (key, { at = null, reason = "" } = {}) => adminFetch(`${BASE}/sets/${enc(key)}/publish`, json("POST", { at, reason })),
  unpublishSet: (key) => adminFetch(`${BASE}/sets/${enc(key)}/unpublish`, json("POST", {})),
  duplicateSet: (key) => adminFetch(`${BASE}/sets/${enc(key)}/duplicate`, json("POST", {})),
  /** Recall: mode keep | refund | swap; notify buyers; pause gifts on the way. 30 min undo. */
  recallSet: (key, { mode, reason, notify, pauseGifts, swapItemId }) => adminFetch(`${BASE}/sets/${enc(key)}/recall`, json("POST", { mode, reason, notify, pauseGifts, swapItemId })),
  undoRecall: (key) => adminFetch(`${BASE}/sets/${enc(key)}/recall/undo`, json("POST", {})),
  recallImpact: (key) => adminFetch(`${BASE}/sets/${enc(key)}/recall-impact`),
  addStock: (key, add, reason = "") => adminFetch(`${BASE}/sets/${enc(key)}/stock`, json("POST", { add, reason })),
  extendSet: (key, hours, reason = "") => adminFetch(`${BASE}/sets/${enc(key)}/extend`, json("POST", { hours, reason })),
  previewLink: (key) => adminFetch(`${BASE}/sets/${enc(key)}/preview-link`, json("POST", {})),
  /** A/B price test: half the users see priceB until endsAt, then the winner is kept. */
  abTest: (key, { enabled, priceB, hours }) => adminFetch(`${BASE}/sets/${enc(key)}/ab-test`, json("POST", { enabled, priceB, hours })),
  /** What the set looks like for one sample user (owned pieces, their price). */
  setForUser: (key, userId) => adminFetch(`${BASE}/sets/${enc(key)}/for-user/${enc(userId)}`),

  /** Catalog rack: sellable s2- items (q, category, palette for the match score). */
  catalog: async ({ q, category, setKey, limit = 200 } = {}) => {
    const r = await adminFetch(`${BASE}/catalog${qs({ q, category, setKey, limit })}`);
    return { items: arr(r?.items || r).map(normItem).filter(Boolean), total: Number(r?.total || 0) };
  },

  rules: async () => normRules(await adminFetch(`${BASE}/rules`)),
  saveDraft: (draft) => adminFetch(`${BASE}/rules/draft`, json("PUT", draft)),
  /** Simulate the draft on 10 000 sampled users for tomorrow; nothing is saved. */
  simulate: (draft, sample = 10000) => adminFetch(`${BASE}/rules/simulate`, json("POST", { draft, sample })),
  /** Schedule the draft for the next 00:00 Istanbul (`at` = "midnight") or now ("now"). */
  applyRules: ({ reason, at = "midnight" }) => adminFetch(`${BASE}/rules/apply`, json("POST", { reason, at })),
  revertRules: (version, reason) => adminFetch(`${BASE}/rules/revert`, json("POST", { version, reason })),

  /** One user's storefront: day today | tomorrow | history, with the reason of every slot. */
  userStorefront: (userId, day = "today") => adminFetch(`${BASE}/users/${enc(userId)}/storefront${qs({ day })}`),
  regenerate: (userId, reason) => adminFetch(`${BASE}/users/${enc(userId)}/storefront/regenerate`, json("POST", { reason })),
  grantRefresh: (userId, reason) => adminFetch(`${BASE}/users/${enc(userId)}/refresh-grant`, json("POST", { reason })),
  searchUsers: (q) => adminFetch(`${BASE}/users/search${qs({ q })}`),

  nightMarket: () => adminFetch(`${BASE}/night-market`),
  saveNightMarket: (schedule, reason) => adminFetch(`${BASE}/night-market`, json("PUT", { schedule, reason })),
  openNightNow: (reason, minutes) => adminFetch(`${BASE}/night-market/open-now`, json("POST", { reason, minutes })),
  closeNightNow: (reason) => adminFetch(`${BASE}/night-market/close`, json("POST", { reason })),
  skipWeek: (reason) => adminFetch(`${BASE}/night-market/skip-week`, json("POST", { reason })),

  limits: () => adminFetch(`${BASE}/limits`),
  saveLimits: (patch, reason) => adminFetch(`${BASE}/limits`, json("PUT", { patch, reason })),

  /** Two weeks of rule versions, sets, nights, events, revenue + clashes + scheduled queue. */
  timeline: (from, days = 14) => adminFetch(`${BASE}/timeline${qs({ from, days })}`),
  cancelQueued: (id, reason = "") => adminFetch(`${BASE}/queue/${enc(id)}`, json("DELETE", { reason })),

  audit: ({ before, limit = 50, kind } = {}) => adminFetch(`${BASE}/audit${qs({ before, limit, kind })}`),
  undoAudit: (id) => adminFetch(`${BASE}/audit/${enc(id)}/undo`, json("POST", {})),
};

/** Server error codes → locale keys (adminShop2.err.*). */
export const ERR_KEYS = Object.freeze({
  STEP_UP_REQUIRED: "adminShop2.err.stepUp",
  REASON_REQUIRED: "adminShop2.err.reason",
  UNDO_EXPIRED: "adminShop2.err.undoExpired",
  ALREADY_REVERTED: "adminShop2.err.undoExpired",
  NOT_FOUND: "adminShop2.err.notFound",
  BAND: "adminShop2.err.band",
  DISCOUNT_OUT_OF_BAND: "adminShop2.err.band",
  CLASH: "adminShop2.err.clash",
  STALE: "adminShop2.err.stale",
  NOT_READY: "adminShop2.err.notReady",
  SHOP2_NOT_READY: "adminShop2.err.notReady",
  ADMIN_PERMISSION_DENIED: "adminShop2.err.permission",
});

export function errKey(e) {
  if (e?.status === 404 && !e?.code) return "adminShop2.err.notReady";
  return ERR_KEYS[e?.code] || "adminShop2.err.generic";
}
