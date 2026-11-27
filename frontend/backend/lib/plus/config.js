"use strict";

/**
 * Descall+ 2.0 offer configuration (owner pick 5B). Built-in defaults merged with the one row in
 * premium_offer_config; every value is admin-editable from Yönetim > Descall+ > Planlar.
 *
 * Selling is OFF by default on every platform (payments are not live yet). Nothing that sells is
 * shown, and no free-tier limit takes effect, on a platform whose `sales[platform]` is false.
 * `pilotUserIds` see the platform as if selling were on (owner / staff testing before launch).
 *
 * Prices are minor units (kuruş), VAT included. "mobile" = iOS / Android store price, "web" = web
 * and desktop (Paddle or iyzico).
 */

const PLATFORMS = Object.freeze(["web", "desktop", "ios", "android"]);
const PLAN_IDS = Object.freeze(["plus", "ultra"]);
const PERIODS = Object.freeze(["monthly", "yearly"]);
const GIFT_MONTHS = Object.freeze([1, 3, 12]);
const WEB_PROVIDERS = Object.freeze(["iyzico", "paddle"]);
const MOBILE_PROVIDERS = Object.freeze(["store", "revenuecat"]);
const RESOLUTIONS = Object.freeze([720, 1080, 1440]);
const FPS_VALUES = Object.freeze([15, 20, 24, 30, 60]);

const PRICE_KEYS = Object.freeze([
  "plus_monthly", "plus_yearly", "ultra_monthly", "ultra_yearly",
  "gift_plus_1", "gift_plus_3", "gift_plus_12", "gift_ultra_1", "gift_ultra_3", "gift_ultra_12",
]);

const DEFAULTS = Object.freeze({
  currency: "TRY",
  vatPercent: 20,
  sales: { web: false, desktop: false, ios: false, android: false },
  pilotUserIds: [],
  webProvider: "iyzico",
  mobileProvider: "store",
  prices: {
    plus_monthly: { web: 6999, mobile: 7499 },
    plus_yearly: { web: 59999, mobile: 64999 },
    ultra_monthly: { web: 13999, mobile: 14999 },
    ultra_yearly: { web: 119999, mobile: 129999 },
    gift_plus_1: { web: 6999, mobile: 7499 },
    gift_plus_3: { web: 19999, mobile: 21499 },
    gift_plus_12: { web: 59999, mobile: 64999 },
    gift_ultra_1: { web: 13999, mobile: 14999 },
    gift_ultra_3: { web: 39999, mobile: 42999 },
    gift_ultra_12: { web: 119999, mobile: 129999 },
  },
  features: {
    boosts: true,
    gifts: true,
    groupGifts: true,
    trial: true,
    tickets: true,
    thankWall: true,
    paywalls: true,
    animatedGate: true,
    qualityLimits: true,
  },
  trial: { days: 3, reminderHours: 24 },
  tickets: { perMonth: 2, validDays: 30, streakDays: 30 },
  boosts: { moveCooldownDays: 7, moveNoticeHours: 24, graceDays: 3 },
  gifts: { recallHours: 24, returnDays: 30, groupExpiryDays: 7, maxScheduleDays: 60 },
  paywall: { perDay: 1, minAccountHours: 48, giftAskPerWeek: 1 },
  // Per tier. The free row only applies where selling is on (no silent downgrade).
  tiers: {
    free: { screenHeight: 1080, screenFps: 30, uploadMb: 100, audioKbps: 64, boosts: 0, tickets: 0 },
    plus: { screenHeight: 1440, screenFps: 60, uploadMb: 500, audioKbps: 128, boosts: 2, tickets: 2 },
    ultra: { screenHeight: 1440, screenFps: 60, uploadMb: 1024, audioKbps: 128, boosts: 5, tickets: 2, sourceQuality: true },
  },
  // Server levels: boosts needed, and what everyone in the server gets.
  levels: [
    { boosts: 2, screenHeight: 1080, screenFps: 60, uploadMb: 100, emojiSlots: 100, animatedIcon: true },
    { boosts: 5, screenHeight: 1080, screenFps: 60, uploadMb: 250, emojiSlots: 150, banner: true, hdAudio: true },
    { boosts: 10, screenHeight: 1440, screenFps: 60, uploadMb: 500, emojiSlots: 250, vanity: true, stickers: true, hdAudio: true, banner: true },
  ],
  // Non-secret store / provider product ids (empty = not configured yet).
  products: {
    apple: {},
    google: {},
    paddle: {},
    iyzico: {},
    revenuecat: {},
  },
  // Server side: a published screen track above the ceiling is logged; muting it is a separate opt-in.
  screenEnforce: { notify: true, mute: false, tolerance: 1.1 },
});

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function isObj(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

function intIn(v, min, max) {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max;
}

class ConfigError extends Error {
  constructor(code, path) {
    super(code);
    this.code = code;
    this.status = 400;
    this.path = path;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRODUCT_ID = /^[A-Za-z0-9._:-]{1,120}$/;

/**
 * Validate an admin patch (a partial config). Returns the cleaned partial; throws ConfigError with
 * the dotted path of the first bad value. Unknown keys are refused, never silently stored.
 */
function validatePatch(patch) {
  if (!isObj(patch)) throw new ConfigError("invalid_body", "");
  const out = {};
  const bad = (p) => { throw new ConfigError("invalid_value", p); };
  for (const [k, v] of Object.entries(patch)) {
    switch (k) {
      case "currency":
        if (typeof v !== "string" || !/^[A-Z]{3}$/.test(v)) bad(k);
        out.currency = v;
        break;
      case "vatPercent":
        if (!intIn(v, 0, 50)) bad(k);
        out.vatPercent = Number(v);
        break;
      case "sales":
      case "features": {
        if (!isObj(v)) bad(k);
        const allowed = Object.keys(DEFAULTS[k]);
        for (const fk of Object.keys(v)) if (!allowed.includes(fk)) bad(`${k}.${fk}`);
        // Written under the catalog's own key names only, never a name taken from the body.
        const section = {};
        for (const name of allowed) {
          if (!Object.prototype.hasOwnProperty.call(v, name)) continue;
          if (typeof v[name] !== "boolean") bad(`${k}.${name}`);
          section[name] = v[name];
        }
        out[k] = section;
        break;
      }
      case "pilotUserIds":
        if (!Array.isArray(v) || v.length > 50 || !v.every((x) => UUID.test(String(x)))) bad(k);
        out.pilotUserIds = [...new Set(v.map(String))];
        break;
      case "webProvider":
        if (!WEB_PROVIDERS.includes(v)) bad(k);
        out.webProvider = v;
        break;
      case "mobileProvider":
        if (!MOBILE_PROVIDERS.includes(v)) bad(k);
        out.mobileProvider = v;
        break;
      case "prices": {
        if (!isObj(v)) bad(k);
        out.prices = {};
        for (const [pk, pv] of Object.entries(v)) {
          if (!PRICE_KEYS.includes(pk) || !isObj(pv)) bad(`prices.${pk}`);
          out.prices[pk] = {};
          for (const [side, amount] of Object.entries(pv)) {
            if (!["web", "mobile"].includes(side) || !intIn(amount, 0, 10000000)) bad(`prices.${pk}.${side}`);
            out.prices[pk][side] = Number(amount);
          }
        }
        break;
      }
      case "trial":
        out.trial = pickInts(v, { days: [1, 14], reminderHours: [1, 72] }, k, bad);
        break;
      case "tickets":
        out.tickets = pickInts(v, { perMonth: [0, 5], validDays: [1, 90], streakDays: [7, 365] }, k, bad);
        break;
      case "boosts":
        out.boosts = pickInts(v, { moveCooldownDays: [0, 60], moveNoticeHours: [0, 168], graceDays: [0, 30] }, k, bad);
        break;
      case "gifts":
        out.gifts = pickInts(v, { recallHours: [0, 168], returnDays: [7, 90], groupExpiryDays: [1, 30], maxScheduleDays: [0, 365] }, k, bad);
        break;
      case "paywall":
        out.paywall = pickInts(v, { perDay: [0, 5], minAccountHours: [0, 720], giftAskPerWeek: [0, 7] }, k, bad);
        break;
      case "tiers": {
        if (!isObj(v)) bad(k);
        out.tiers = {};
        for (const [tier, tv] of Object.entries(v)) {
          if (!["free", "plus", "ultra"].includes(tier) || !isObj(tv)) bad(`tiers.${tier}`);
          out.tiers[tier] = {};
          for (const [f, fv] of Object.entries(tv)) {
            const p = `tiers.${tier}.${f}`;
            if (f === "screenHeight") { if (!RESOLUTIONS.includes(Number(fv))) bad(p); out.tiers[tier][f] = Number(fv); }
            else if (f === "screenFps") { if (!FPS_VALUES.includes(Number(fv))) bad(p); out.tiers[tier][f] = Number(fv); }
            else if (f === "uploadMb") { if (!intIn(fv, 8, 4096)) bad(p); out.tiers[tier][f] = Number(fv); }
            else if (f === "audioKbps") { if (!intIn(fv, 32, 510)) bad(p); out.tiers[tier][f] = Number(fv); }
            else if (f === "boosts") { if (!intIn(fv, 0, 20) || (tier === "free" && Number(fv) !== 0)) bad(p); out.tiers[tier][f] = Number(fv); }
            else if (f === "tickets") { if (!intIn(fv, 0, 5)) bad(p); out.tiers[tier][f] = Number(fv); }
            else if (f === "sourceQuality") { if (typeof fv !== "boolean") bad(p); out.tiers[tier][f] = fv; }
            else bad(p);
          }
        }
        break;
      }
      case "levels": {
        if (!Array.isArray(v) || v.length !== 3) bad(k);
        let prev = 0;
        out.levels = v.map((lv, i) => {
          const p = `levels.${i}`;
          if (!isObj(lv) || !intIn(lv.boosts, prev + 1, 100)) bad(`${p}.boosts`);
          prev = Number(lv.boosts);
          const row = { boosts: Number(lv.boosts) };
          for (const [f, fv] of Object.entries(lv)) {
            if (f === "boosts") continue;
            if (f === "screenHeight") { if (!RESOLUTIONS.includes(Number(fv))) bad(`${p}.${f}`); row[f] = Number(fv); }
            else if (f === "screenFps") { if (!FPS_VALUES.includes(Number(fv))) bad(`${p}.${f}`); row[f] = Number(fv); }
            else if (f === "uploadMb") { if (!intIn(fv, 8, 4096)) bad(`${p}.${f}`); row[f] = Number(fv); }
            else if (f === "emojiSlots") { if (!intIn(fv, 0, 1000)) bad(`${p}.${f}`); row[f] = Number(fv); }
            else if (["animatedIcon", "banner", "hdAudio", "vanity", "stickers"].includes(f)) { if (typeof fv !== "boolean") bad(`${p}.${f}`); row[f] = fv; }
            else bad(`${p}.${f}`);
          }
          return row;
        });
        break;
      }
      case "products": {
        if (!isObj(v)) bad(k);
        out.products = {};
        for (const [prov, map] of Object.entries(v)) {
          if (!Object.keys(DEFAULTS.products).includes(prov) || !isObj(map)) bad(`products.${prov}`);
          out.products[prov] = {};
          for (const [pk, id] of Object.entries(map)) {
            if (!PRICE_KEYS.includes(pk)) bad(`products.${prov}.${pk}`);
            if (id === "" || id === null) { out.products[prov][pk] = ""; continue; }
            if (typeof id !== "string" || !PRODUCT_ID.test(id)) bad(`products.${prov}.${pk}`);
            out.products[prov][pk] = id;
          }
        }
        break;
      }
      case "screenEnforce": {
        if (!isObj(v)) bad(k);
        out.screenEnforce = {};
        for (const [f, fv] of Object.entries(v)) {
          if (f === "notify" || f === "mute") { if (typeof fv !== "boolean") bad(`${k}.${f}`); out.screenEnforce[f] = fv; }
          else if (f === "tolerance") { const n = Number(fv); if (!(n >= 1 && n <= 2)) bad(`${k}.${f}`); out.screenEnforce[f] = n; }
          else bad(`${k}.${f}`);
        }
        break;
      }
      default:
        throw new ConfigError("unknown_key", k);
    }
  }
  return out;
}

function pickInts(v, spec, base, bad) {
  if (!isObj(v)) bad(base);
  const out = {};
  for (const [f, fv] of Object.entries(v)) {
    if (!spec[f] || !intIn(fv, spec[f][0], spec[f][1])) bad(`${base}.${f}`);
    out[f] = Number(fv);
  }
  return out;
}

/** Deep merge for plain objects; arrays and scalars replace. */
function deepMerge(base, over) {
  if (!isObj(base) || !isObj(over)) return over === undefined ? clone(base) : clone(over);
  const out = clone(base);
  for (const [k, v] of Object.entries(over)) {
    out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : clone(v);
  }
  return out;
}

/** Stored overrides merged over the defaults. Stored garbage is dropped key by key, never fatal. */
function merge(stored) {
  let cfg = clone(DEFAULTS);
  if (!isObj(stored)) return cfg;
  for (const [k, v] of Object.entries(stored)) {
    try {
      cfg = deepMerge(cfg, validatePatch({ [k]: v }));
    } catch {
      /* an invalid stored key keeps its default */
    }
  }
  return cfg;
}

/** Which top-level paths a patch changes (for the history row and the audit log). */
function changedPaths(before, after, prefix = "") {
  const out = [];
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const k of keys) {
    const p = prefix ? `${prefix}.${k}` : k;
    const a = before?.[k];
    const b = after?.[k];
    if (isObj(a) && isObj(b)) out.push(...changedPaths(a, b, p));
    else if (JSON.stringify(a) !== JSON.stringify(b)) out.push(p);
  }
  return out;
}

function normalizePlatform(p) {
  const s = String(p || "").toLowerCase();
  if (PLATFORMS.includes(s)) return s;
  if (s === "electron" || s === "tauri" || s === "windows" || s === "mac") return "desktop";
  if (s === "iphone" || s === "ipad") return "ios";
  return "web";
}

function priceSide(platform) {
  return platform === "ios" || platform === "android" ? "mobile" : "web";
}

/** Selling on for this platform (or this user is a pilot). */
function salesOn(cfg, platform, userId = null) {
  const c = cfg || DEFAULTS;
  if (userId && Array.isArray(c.pilotUserIds) && c.pilotUserIds.includes(String(userId))) return true;
  return Boolean(c.sales && c.sales[normalizePlatform(platform)]);
}

function anySalesOn(cfg) {
  const c = cfg || DEFAULTS;
  return PLATFORMS.some((p) => c.sales && c.sales[p]) || (c.pilotUserIds || []).length > 0;
}

/** A feature that sells: its own switch and selling on for this platform. */
function featureOn(cfg, key, platform, userId = null) {
  const c = cfg || DEFAULTS;
  return Boolean(c.features && c.features[key]) && salesOn(c, platform, userId);
}

function priceKeyFor({ kind, plan, period, months }) {
  if (!PLAN_IDS.includes(plan)) return null;
  if (kind === "gift" || kind === "group_share") return GIFT_MONTHS.includes(Number(months)) ? `gift_${plan}_${Number(months)}` : null;
  return PERIODS.includes(period) ? `${plan}_${period}` : null;
}

/** Price in minor units for a product key on a platform, or null. */
function priceFor(cfg, key, platform) {
  const row = (cfg || DEFAULTS).prices?.[key];
  if (!row) return null;
  const v = row[priceSide(normalizePlatform(platform))];
  return Number.isInteger(v) ? v : null;
}

/** VAT share of a VAT-included amount (minor units, rounded). */
function vatOf(amount, vatPercent) {
  const a = Number(amount) || 0;
  const p = Number(vatPercent) || 0;
  return Math.round(a - a / (1 + p / 100));
}

/** What the client gets for one platform: prices, switches, limits, rules. No ids of other users. */
function publicOffer(cfg, platform, userId = null) {
  const c = cfg || DEFAULTS;
  const plat = normalizePlatform(platform);
  const on = salesOn(c, plat, userId);
  const side = priceSide(plat);
  const prices = {};
  for (const k of PRICE_KEYS) prices[k] = c.prices?.[k]?.[side] ?? null;
  const features = {};
  for (const k of Object.keys(DEFAULTS.features)) features[k] = on && Boolean(c.features?.[k]);
  return {
    platform: plat,
    salesOn: on,
    currency: c.currency,
    vatPercent: c.vatPercent,
    prices: on ? prices : null,
    // Reference prices for the comparison table stay visible even before launch, clearly unpriced.
    features,
    boostsOn: Boolean(c.features?.boosts) && anySalesOn(c),
    trial: { days: c.trial.days },
    tickets: { perMonth: c.tickets.perMonth, streakDays: c.tickets.streakDays },
    boosts: { moveCooldownDays: c.boosts.moveCooldownDays, moveNoticeHours: c.boosts.moveNoticeHours, graceDays: c.boosts.graceDays },
    gifts: { recallHours: c.gifts.recallHours, returnDays: c.gifts.returnDays, maxScheduleDays: c.gifts.maxScheduleDays },
    paywall: { perDay: c.paywall.perDay, minAccountHours: c.paywall.minAccountHours, giftAskPerWeek: c.paywall.giftAskPerWeek },
    tiers: clone(c.tiers),
    levels: clone(c.levels),
    provider: side === "mobile" ? (plat === "ios" ? "apple" : "google") : c.webProvider,
  };
}

/* ---------------- storage ---------------- */

const CACHE_MS = 30 * 1000;
let dbOverride = null;
const db = () => dbOverride || require("../../db/supabase");
let cache = null; // { at, cfg, version, updatedAt }

function invalidateLocal() {
  cache = null;
}
let invalidate = invalidateLocal;
try {
  invalidate = require("../cluster").linkInvalidate("plusOfferConfig", invalidateLocal);
} catch {
  invalidate = invalidateLocal;
}

async function loadRow() {
  const { data, error } = await db().from("premium_offer_config").select("config, version, updated_at, updated_by").eq("id", "default").maybeSingle();
  if (error) return null;
  return data || null;
}

/** The effective config (cached 30 s). A missing table means "defaults": selling stays off. */
async function load({ fresh = false, now = Date.now() } = {}) {
  if (!fresh && cache && now - cache.at < CACHE_MS) return cache.cfg;
  let row = null;
  try {
    row = await loadRow();
  } catch {
    row = null;
  }
  const cfg = merge(row?.config || {});
  cache = { at: now, cfg, version: row?.version || 0, updatedAt: row?.updated_at || null };
  return cfg;
}

async function meta() {
  await load();
  return { version: cache?.version || 0, updatedAt: cache?.updatedAt || null };
}

/** Apply an admin patch: validate, merge over the stored overrides, write the row + a history row. */
async function save(patch, { actorId = null, note = null, undoOf = null } = {}) {
  const clean = validatePatch(patch);
  const row = (await loadRow()) || { config: {}, version: 0 };
  const before = merge(row.config || {});
  const storedNext = deepMerge(isObj(row.config) ? row.config : {}, clean);
  const after = merge(storedNext);
  const changed = changedPaths(before, after);
  if (!changed.length) return { cfg: after, changed, version: row.version || 0, historyId: null };
  const version = (Number(row.version) || 0) + 1;
  const now = new Date().toISOString();
  const { error } = await db().from("premium_offer_config").upsert({ id: "default", config: storedNext, version, updated_by: actorId, updated_at: now }, { onConflict: "id" });
  if (error) {
    const e = new ConfigError("server_error", "");
    e.status = 500;
    throw e;
  }
  let historyId = null;
  try {
    const { data } = await db().from("premium_offer_config_history").insert({
      version, config: storedNext, changed, actor_id: actorId, note: note ? String(note).slice(0, 500) : null, undo_of: undoOf,
    }).select("id").single();
    historyId = data?.id ?? null;
  } catch {
    /* the history is a nicety; the change itself is saved */
  }
  invalidate();
  return { cfg: after, changed, version, historyId };
}

/** Undo one change: restore the stored config as it was right before that history row. */
async function undo(historyId, { actorId = null } = {}) {
  const id = Number(historyId);
  if (!Number.isInteger(id) || id < 1) throw new ConfigError("not_found", "");
  const { data: target } = await db().from("premium_offer_config_history").select("id, version").eq("id", id).maybeSingle();
  if (!target) { const e = new ConfigError("not_found", ""); e.status = 404; throw e; }
  const { data: prev } = await db().from("premium_offer_config_history").select("config").lt("version", target.version).order("version", { ascending: false }).limit(1).maybeSingle();
  const restore = prev?.config || {};
  const row = (await loadRow()) || { config: {}, version: 0 };
  const version = (Number(row.version) || 0) + 1;
  const before = merge(row.config || {});
  const after = merge(restore);
  const { error } = await db().from("premium_offer_config").upsert({ id: "default", config: restore, version, updated_by: actorId, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) { const e = new ConfigError("server_error", ""); e.status = 500; throw e; }
  const changed = changedPaths(before, after);
  try {
    await db().from("premium_offer_config_history").insert({ version, config: restore, changed, actor_id: actorId, note: "undo", undo_of: id });
  } catch {
    /* nicety */
  }
  invalidate();
  return { cfg: after, changed, version };
}

async function history(limit = 50) {
  const { data } = await db().from("premium_offer_config_history").select("id, version, changed, actor_id, note, undo_of, created_at").order("id", { ascending: false }).limit(Math.max(1, Math.min(200, Number(limit) || 50)));
  return data || [];
}

function __setDbForTests(client) {
  dbOverride = client;
  cache = null;
}

module.exports = {
  PLATFORMS,
  PLAN_IDS,
  PERIODS,
  GIFT_MONTHS,
  PRICE_KEYS,
  DEFAULTS,
  ConfigError,
  validatePatch,
  merge,
  deepMerge,
  changedPaths,
  normalizePlatform,
  priceSide,
  salesOn,
  anySalesOn,
  featureOn,
  priceKeyFor,
  priceFor,
  vatOf,
  publicOffer,
  load,
  meta,
  save,
  undo,
  history,
  invalidate,
  __setDbForTests,
};
