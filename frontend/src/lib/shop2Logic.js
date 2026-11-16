// Market 2.0 (user side): pure rules shared by the storefront, sets, night market, gifts,
// checkout and action log. No React, no network: every function is testable in node
// (src/lib/shop2Logic.selftest.mjs). Data comes from /api/shop2 (docs/shop2-api.md) and
// is normalised here, so camelCase and snake_case answers both work.

export const SHOP2_REFUND_MS = 10 * 60 * 1000;
export const SHOP2_RECALL_MS = 5 * 60 * 1000;
export const SHOP2_PARTIAL_DAYS = 7;
export const SHOP2_MESSAGE_MAX = 140;
export const SHOP2_KEEP_LIMIT = 2;
export const SHOP2_HOLD_MS = 800;
export const SHOP2_URGENT_MS = 10 * 60 * 1000;
export const SHOP2_NIGHT_URGENT_MS = 5 * 60 * 1000;

/** The 8 pieces of every set, in display order (frame + banner, name colour + badge, ...). */
export const SET_PIECE_ORDER = Object.freeze([
  "avatar_frame",
  "banner",
  "profile_color",
  "profile_badge",
  "avatar_effect",
  "chat_bubble",
  "voice_tile",
  "join_sound",
]);

/** Piece groups shown in the set's "Parçalar" column. */
export const SET_PIECE_GROUPS = Object.freeze([
  { id: "profile", categories: ["avatar_frame", "banner"] },
  { id: "identity", categories: ["profile_color", "profile_badge"] },
  { id: "effect", categories: ["avatar_effect", "chat_bubble"] },
  { id: "sound", categories: ["voice_tile", "join_sound"] },
]);

/** Category -> equipped field on the user object (userProfile.js). */
export const EQUIP_FIELD = Object.freeze({
  avatar_frame: "equippedAvatarFrame",
  banner: "equippedBanner",
  profile_color: "equippedProfileColor",
  profile_badge: "equippedBadge",
  avatar_effect: "equippedAvatarEffect",
  chat_bubble: "equippedChatBubble",
  voice_tile: "equippedVoiceTile",
  join_sound: "equippedJoinSound",
  name_effect: "equippedNameEffect",
  profile_aura: "equippedProfileAura",
  presence_flare: "equippedPresenceFlare",
  typing_flare: "equippedTypingFlare",
  reaction_burst: "equippedReactionBurst",
  call_overlay: "equippedCallOverlay",
  theme: "equippedTheme",
  countries: "equippedCountry",
});

export const RARITIES = Object.freeze(["common", "rare", "epic", "legendary", "mythic"]);
export const rarityOf = (item) => (RARITIES.includes(item?.rarity) ? item.rarity : "common");
export const rarityRank = (item) => RARITIES.indexOf(rarityOf(item));

const num = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const pick = (o, ...keys) => {
  if (!o || typeof o !== "object") return undefined;
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};
const ms = (v) => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
};
const arr = (v) => (Array.isArray(v) ? v : []);

// ---------------------------------------------------------------------------
// Names (s2- items carry name/description objects in 7 languages).

const LOCALE_CHAIN = (locale) => {
  const base = String(locale || "en");
  const short = base.split("-")[0];
  return [base, short, "en", "tr"];
};

/** Localised text from a {tr, en, ...} object, a plain string, or null. */
export function localText(value, locale) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value !== "object") return String(value);
  for (const k of LOCALE_CHAIN(locale)) if (value[k]) return String(value[k]);
  const first = Object.values(value).find(Boolean);
  return first ? String(first) : "";
}

/** True when the item is part of the Market 2.0 catalog (sku prefix "s2-"). */
export const isShop2Item = (item) => String(item?.sku || "").startsWith("s2-");

/** Retired = an old catalog row the user still owns (shown under "Eski koleksiyon"). */
export function isRetiredItem(item) {
  if (!item) return false;
  if (item.retired === true || item.is_retired === true || item.status === "retired") return true;
  if (item.category === "countries") return false;
  return !isShop2Item(item);
}

// ---------------------------------------------------------------------------
// Normalisers.

export function normalizeItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const item = raw.item && typeof raw.item === "object" ? { ...raw.item } : { ...raw };
  item.id = item.id ?? item.itemId ?? item.item_id ?? item.sku;
  item.price_descoin = num(pick(item, "price_descoin", "priceDescoin", "price"), 0);
  item.set_key = pick(item, "set_key", "setKey") || null;
  item.effect_key = pick(item, "effect_key", "effectKey") || null;
  item.asset_url = pick(item, "asset_url", "assetUrl") || null;
  item.preview_url = pick(item, "preview_url", "previewUrl") || null;
  if (item.i18n?.name && typeof item.i18n.name === "object") item.name = item.i18n.name;
  if (item.i18n?.description && typeof item.i18n.description === "object") item.description = item.i18n.description;
  return item;
}

/** One storefront slot: item + the price you pay today. */
export function normalizeSlot(raw, index = 0) {
  // The server sends item: null when a stored card's item left the catalog: no card for it.
  if (raw && typeof raw === "object" && "item" in raw && !raw.item) return null;
  const item = normalizeItem(raw?.item || raw);
  if (!item || item.id == null) return null;
  const base = num(pick(raw, "basePrice", "base_price", "listPrice"), item.price_descoin);
  const price = num(pick(raw, "price", "yourPrice", "your_price"), base);
  return {
    index: num(pick(raw, "slot", "index"), index + 1),
    item,
    price,
    basePrice: base,
    discountPct: base > 0 && price < base ? Math.round((1 - price / base) * 100) : num(pick(raw, "discountPct", "discount_pct"), 0),
    locked: Boolean(pick(raw, "locked", "isLocked")),
    wishlisted: Boolean(pick(raw, "wishlisted", "inWishlist", "wishlistMatch")),
    lastSeenDays: pick(raw, "lastSeenDays", "last_seen_days", "lastSeenDaysAgo") ?? null,
    owned: Boolean(pick(raw, "owned")),
    available: raw?.available !== false,
    badges: arr(raw?.badges),
    setProgress: raw?.setProgress || null,
  };
}

export function normalizeStorefront(raw, clientNow = Date.now()) {
  const r = raw?.storefront || raw || {};
  // Countdowns run on this device's clock: shift the server's absolute times by the clock
  // difference (serverTime) so "00:00" and the night market open on time on a skewed device.
  const serverNow = ms(r.serverTime);
  const skew = serverNow != null && Math.abs(serverNow - clientNow) > 2000 ? serverNow - clientNow : 0;
  const local = (v) => {
    const t = ms(v);
    return t == null ? null : t - skew;
  };
  const slots = arr(pick(r, "slots", "items")).map((s, i) => normalizeSlot(s, i)).filter(Boolean);
  const lockedItemId = r.lock?.itemId ?? pick(r, "lockedItemId", "locked_item_id") ?? slots.find((s) => s.locked)?.item.id ?? null;
  for (const s of slots) s.locked = s.locked || (lockedItemId != null && String(s.item.id) === String(lockedItemId));
  const hits = new Set(arr(r.wishlistHits).map(String));
  for (const s of slots) s.wishlisted = s.wishlisted || hits.has(String(s.item.id));
  const refresh = r.refresh || {};
  const nm = pick(r, "nightMarket", "night_market") || {};
  const free = pick(refresh, "free", "freeFromStreak");
  return {
    day: pick(r, "day", "date") || null,
    serverTime: serverNow,
    clockSkew: skew,
    resetsAt: local(pick(r, "resetsAt", "resets_at", "nextResetAt")),
    slots,
    lockedItemId,
    refresh: {
      available: refresh.available !== undefined ? Boolean(refresh.available) : true,
      price: num(pick(refresh, "price", "cost"), 120),
      usedToday: num(pick(refresh, "used", "usedToday"), 0),
      perDay: num(pick(refresh, "perDay", "limit"), 1),
      lastUsedAt: ms(pick(refresh, "usedAt", "lastUsedAt", "last_used_at")),
      freeFromStreak: Boolean(free),
      freeKind: typeof free === "string" ? free : null,
      freeGrants: num(refresh.freeGrants, 0),
      // Refreshes still possible today: the daily one + granted (admin / streak) ones.
      left: refresh.left != null
        ? num(refresh.left, 0)
        : Math.max(0, num(pick(refresh, "perDay", "limit"), 1) - num(pick(refresh, "dailyUsed", "used", "usedToday"), 0)) + num(refresh.freeGrants, 0),
    },
    streak: { days: num(r.streak?.days ?? r.streakDays, 0), rewardEvery: num(r.streak?.rewardEvery, 7) },
    nightMarket: {
      open: Boolean(nm.open),
      eligible: nm.eligible !== false,
      opensAt: local(pick(nm, "startsAt", "opensAt", "opens_at")),
      closesAt: local(pick(nm, "endsAt", "closesAt", "closes_at")),
      nextOpensAt: local(pick(nm, "nextStartsAt", "next_starts_at")),
      cards: num(pick(nm, "cards", "cardCount"), 6),
      flipsLeft: num(pick(nm, "flipsLeft", "flips_left"), 0),
      flipsTotal: num(pick(nm, "flipsTotal", "flips_total"), 3),
      keepMax: num(nm.keepMax, SHOP2_KEEP_LIMIT),
    },
    featuredSets: arr(pick(r, "featuredSets", "featured_sets", "sets")).map(normalizeSetSummary).filter(Boolean),
    yesterday: arr(pick(r, "yesterday", "yesterdayItems")).map((x) => {
      const it = normalizeItem(x);
      return it ? { ...it, _owned: Boolean(x?.owned), _wishlisted: Boolean(x?.wishlisted) } : null;
    }).filter(Boolean),
    history7d: arr(pick(r, "history7d", "history", "lastDays")).map((d) => ({
      day: pick(d, "day", "date") || "",
      items: arr(d.items || d.slots).map((x) => ({ item: normalizeItem(x), bought: Boolean(x?.bought || x?.owned || x?.purchased) })).filter((x) => x.item),
    })),
    earnedToday: num(pick(r, "earnedToday", "earned_today"), 0),
    earnCap: num(pick(r, "earnCap", "earn_cap"), 400),
    balance: typeof r.balance === "number" ? r.balance : null,
    viewers: num(r.viewers, 0),
    legacyPool: Boolean(r.legacyPool),
  };
}

export function normalizeSetSummary(raw) {
  if (!raw) return null;
  const key = pick(raw, "key", "setKey", "set_key");
  if (!key) return null;
  const sum = num(pick(raw, "sum", "sumPrice", "piecesTotal"), 0);
  const setPrice = num(pick(raw, "setPrice", "set_price", "price"), sum);
  const owned = typeof raw.owned === "number" ? raw.owned : null;
  const yp = pick(raw, "yourPrice", "your_price");
  return {
    key,
    name: raw.name ?? key,
    tagline: raw.tagline ?? raw.description ?? null,
    palette: arr(raw.palette).filter((c) => /^#[0-9a-f]{3,8}$/i.test(String(c))),
    pieceCount: num(pick(raw, "pieceCount", "pieces_count", "total"), arr(raw.pieces).length || 8),
    ownedCount: owned ?? num(pick(raw, "ownedCount", "owned_count"), arr(raw.pieces).filter((p) => p.owned).length),
    sum,
    setPrice,
    yourPrice: yp != null ? num(yp) : null,
    setRateClosed: Object.prototype.hasOwnProperty.call(raw, "yourPrice") && raw.yourPrice === null,
    discountPct: num(pick(raw, "discountPct", "discount_pct"), sum > 0 ? Math.round((1 - setPrice / sum) * 100) : 0),
    endsAt: ms(pick(raw, "endsAt", "ends_at", "until")),
    startsAt: ms(pick(raw, "startsAt", "starts_at")),
    state: raw.state || null,
    onSale: raw.onSale !== false,
    stockLeft: raw.stockLeft ?? null,
    cover: raw.cover && typeof raw.cover === "object" ? normalizeItem(raw.cover) : null,
    complete: Boolean(raw.complete),
    completedTitle: raw.completedTitle || null,
    partialPriceUntil: ms(pick(raw, "partialPriceUntil", "partial_price_until")),
    ownersCount: num(pick(raw, "ownersCount", "owners_count"), 0),
  };
}

export function normalizeSet(raw) {
  const r = raw?.set || raw || {};
  const summary = normalizeSetSummary(r);
  if (!summary) return null;
  const pieces = arr(r.pieces).map((p) => {
    const item = normalizeItem(p.item || p);
    if (!item) return null;
    if (p.category && !item.category) item.category = p.category;
    return {
      item,
      owned: Boolean(p.owned),
      equipped: Boolean(p.equipped),
      priceNow: p.priceNow != null ? num(p.priceNow) : null,
      mode: p.mode || null,
      wishlisted: Boolean(p.wishlisted),
    };
  }).filter(Boolean);
  pieces.sort((a, b) => pieceIndex(a.item.category) - pieceIndex(b.item.category));
  const hist = arr(pick(r, "priceHistory30d", "price_history_30d", "priceHistory")).map((h) => ({
    day: pick(h, "day", "date") || "",
    price: num(pick(h, "price", "value"), 0),
  })).filter((h) => h.price > 0);
  const title = r.title || r.reward || null;
  return {
    ...summary,
    pieces,
    ownedCount: pieces.length ? pieces.filter((p) => p.owned).length : summary.ownedCount,
    pieceCount: pieces.length || summary.pieceCount,
    sum: summary.sum || pieces.reduce((s, p) => s + p.item.price_descoin, 0),
    ownedDeducted: r.ownedDeducted != null ? num(r.ownedDeducted) : null,
    savings: r.savings != null ? num(r.savings) : null,
    priceHistory: hist,
    lowest30d: r.lowest30d != null ? num(r.lowest30d) : null,
    isLowest30d: r.isLowest30d != null ? Boolean(r.isLowest30d) : null,
    partialLockDays: num(r.partialLockDays, SHOP2_PARTIAL_DAYS),
    viewersNow: num(pick(r, "lookingNow", "viewersNow", "viewers_now"), 0),
    reward: title ? { title: title.name ?? title.title ?? null, palette: arr(title.palette) } : null,
    titleUnlocked: Boolean(r.titleUnlocked),
    owners: arr(r.friendOwners || r.owners),
    salesSeries: arr(pick(r, "salesSeries", "sales_series")).map((v) => num(v?.count ?? v, 0)),
    matchScore: pick(r, "matchScore", "match_score") ?? null,
    refundMinutes: num(r.refundMinutes, SHOP2_REFUND_MS / 60000),
    wishlisted: Boolean(r.wishlisted),
  };
}

export const pieceIndex = (category) => {
  const i = SET_PIECE_ORDER.indexOf(category);
  return i < 0 ? 99 : i;
};

// ---------------------------------------------------------------------------
// Set pricing.

/**
 * Price ladder for a set given the pieces you own and the pieces selected.
 * Set price applies to the whole set; owned pieces are deducted at the set rate
 * (their share of the set price). Choosing only some pieces costs their single
 * price, unless the 7-day partial window (bought one piece) keeps the set rate.
 */
export function setPricing(set, { selectedIds = null, now = Date.now() } = {}) {
  const pieces = arr(set?.pieces);
  const sum = pieces.reduce((s, p) => s + num(p.item.price_descoin), 0) || num(set?.sum);
  const setPrice = num(set?.setPrice, sum);
  const ratio = sum > 0 ? setPrice / sum : 1;
  const discount = Math.max(0, sum - setPrice);
  const discountPct = sum > 0 ? Math.round((discount / sum) * 100) : 0;
  const owned = pieces.filter((p) => p.owned);
  const computedDeduction = Math.round(owned.reduce((s, p) => s + num(p.item.price_descoin) * ratio, 0));
  const missing = pieces.filter((p) => !p.owned);
  const missingSingles = missing.reduce((s, p) => s + num(p.item.price_descoin), 0);
  // The server's "yourPrice" is the truth when it sent one; else deduct owned pieces at the set rate.
  const serverPrice = set?.yourPrice != null && Number.isFinite(Number(set.yourPrice)) ? num(set.yourPrice) : null;
  const setRateClosed = Boolean(set?.setRateClosed);
  const yourPrice = serverPrice != null ? serverPrice : Math.max(0, setPrice - computedDeduction);
  const ownedDeduction = set?.ownedDeducted != null ? num(set.ownedDeducted) : serverPrice != null ? Math.max(0, setPrice - serverPrice) : computedDeduction;
  const partialActive = set?.partialPriceUntil != null && set.partialPriceUntil > now;
  let selectedTotal = yourPrice;
  let selectedCount = missing.length;
  let selectedSingles = missingSingles;
  if (selectedIds) {
    const sel = new Set([...selectedIds].map(String));
    const chosen = missing.filter((p) => sel.has(String(p.item.id)));
    selectedCount = chosen.length;
    selectedSingles = chosen.reduce((s, p) => s + num(p.item.price_descoin), 0);
    const whole = chosen.length === missing.length;
    // Same rule as the server (pricing.piecesQuote): the partial price is the chosen list sum at
    // the set rate, rounded to 10 D once (a plain round could ask less and fail with price_changed).
    selectedTotal = whole ? yourPrice : partialActive ? Math.max(0, Math.round((selectedSingles * ratio) / 10) * 10) : selectedSingles;
  }
  return {
    sum,
    setPrice,
    discount,
    discountPct,
    ownedCount: owned.length,
    ownedDeduction,
    missingCount: missing.length,
    missingSingles,
    yourPrice,
    savingVsSingles: Math.max(0, missingSingles - yourPrice),
    selectedTotal,
    selectedCount,
    selectedSingles,
    selectedExtraVsSet: Math.max(0, selectedTotal - Math.round(selectedSingles * ratio)),
    partialActive,
    setRateClosed,
    complete: pieces.length > 0 && missing.length === 0,
  };
}

/** Lowest price in the 30-day history and whether today's price is at that low. */
export function priceHistoryStats(history, current) {
  const values = arr(history).map((h) => num(h.price ?? h)).filter((v) => v > 0);
  if (!values.length) return { min: current || 0, max: current || 0, isLowest: true, previousLowest: null, pctBelowPrevLow: 0, points: [] };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const prev = values.slice(0, -1);
  const previousLowest = prev.length ? Math.min(...prev) : null;
  const cur = num(current, values[values.length - 1]);
  return {
    min,
    max,
    isLowest: cur <= min,
    previousLowest,
    pctBelowPrevLow: previousLowest && cur < previousLowest ? Math.round((1 - cur / previousLowest) * 100) : 0,
    points: values,
  };
}

/** SVG path for a sparkline in a w x h box (with 2px padding). */
export function sparkPath(values, w = 100, h = 30) {
  const v = arr(values).map((x) => num(x));
  if (v.length < 2) return "";
  const min = Math.min(...v);
  const max = Math.max(...v);
  const span = max - min || 1;
  const step = (w - 4) / (v.length - 1);
  return v
    .map((y, i) => `${i ? "L" : "M"}${(2 + i * step).toFixed(1)} ${(h - 2 - ((y - min) / span) * (h - 4)).toFixed(1)}`)
    .join(" ");
}

/** Step path (price history drawn as steps, draft A). */
export function stepPath(values, w = 100, h = 30) {
  const v = arr(values).map((x) => num(x));
  if (v.length < 2) return "";
  const min = Math.min(...v);
  const max = Math.max(...v);
  const span = max - min || 1;
  const step = (w - 4) / (v.length - 1);
  const y = (val) => (h - 2 - ((val - min) / span) * (h - 4)).toFixed(1);
  let d = `M2 ${y(v[0])}`;
  for (let i = 1; i < v.length; i++) d += ` H${(2 + i * step).toFixed(1)} V${y(v[i])}`;
  return d;
}

// ---------------------------------------------------------------------------
// Time.

/** Countdown parts for a target time; urgent under `urgentMs`. */
export function countdownParts(target, now = Date.now(), urgentMs = SHOP2_URGENT_MS) {
  const t = ms(target);
  if (t == null) return { h: 0, m: 0, s: 0, total: 0, done: true, urgent: false, text: "00:00:00" };
  const total = Math.max(0, t - now);
  const sec = Math.floor(total / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const p2 = (n) => String(n).padStart(2, "0");
  return { h, m, s, total, done: total <= 0, urgent: total > 0 && total <= urgentMs, text: `${p2(h)}:${p2(m)}:${p2(s)}`, short: `${p2(h * 60 + m)}:${p2(s)}` };
}

/**
 * Calendar distance of a future time from now on this device: "today" | "tomorrow" | "day"
 * (within a week) | "date", for labels like "Friday at 22:00" (null when there is no time).
 */
export function whenOf(target, now = Date.now()) {
  const t = ms(target);
  if (t == null) return null;
  const a = new Date(now);
  const b = new Date(t);
  const idx = (d) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  const diff = idx(b) - idx(a);
  return { at: t, days: diff, kind: diff <= 0 ? "today" : diff === 1 ? "tomorrow" : diff < 7 ? "day" : "date" };
}

/** Fraction of the day elapsed until `resetsAt` (24 h window). */
export function dayProgress(resetsAt, now = Date.now()) {
  const t = ms(resetsAt);
  if (t == null) return 0;
  const left = Math.max(0, Math.min(86400000, t - now));
  return 1 - left / 86400000;
}

/** Window fraction between opensAt and closesAt. */
export function windowProgress(opensAt, closesAt, now = Date.now()) {
  const a = ms(opensAt);
  const b = ms(closesAt);
  if (a == null || b == null || b <= a) return 0;
  return Math.min(1, Math.max(0, (now - a) / (b - a)));
}

/** Seconds left of a refund (10 min) / recall (5 min) window, or 0. */
export function windowLeft(startedAt, windowMs, now = Date.now(), until = null) {
  const end = ms(until) ?? (ms(startedAt) != null ? ms(startedAt) + windowMs : null);
  if (end == null) return 0;
  return Math.max(0, Math.ceil((end - now) / 1000));
}

export const mmss = (sec) => {
  const s = Math.max(0, Math.floor(num(sec)));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

// ---------------------------------------------------------------------------
// Storefront rules.

/** Refresh confirm: which cards change, the cart warning and the balance after. */
export function refreshPlan(storefront, { balance = 0, cartIds = [] } = {}) {
  const slots = arr(storefront?.slots);
  const kept = slots.filter((s) => s.locked);
  const changing = slots.filter((s) => !s.locked);
  const cart = new Set(arr(cartIds).map(String));
  const cartLosing = changing.filter((s) => cart.has(String(s.item.id)));
  const r = storefront?.refresh || {};
  const price = r.freeFromStreak ? 0 : num(r.price, 120);
  const left = r.left != null ? num(r.left, 0) : r.available !== false ? 1 : 0;
  return {
    available: r.available !== false,
    price,
    free: price === 0,
    left,
    leftAfter: Math.max(0, left - 1),
    changingCount: changing.length,
    kept: kept.map((s) => s.item),
    cartLosing: cartLosing.map((s) => s.item),
    balanceAfter: balance - price,
    affordable: balance >= price,
  };
}

/** Lock rule: one card survives the refresh; locking another moves the lock. */
export function toggleLock(slots, itemId) {
  const id = String(itemId);
  const was = arr(slots).find((s) => String(s.item.id) === id)?.locked;
  return arr(slots).map((s) => ({ ...s, locked: !was && String(s.item.id) === id }));
}

/** Storefront card list with wishlist matches flagged. */
export function markWishlist(slots, wishlist) {
  const ids = new Set(arr(wishlist).map((w) => String(w?.id ?? w?.itemId ?? w)));
  return arr(slots).map((s) => ({ ...s, wishlisted: s.wishlisted || ids.has(String(s.item.id)) }));
}

/** Cart: items, total, balance after. */
export function cartSummary(cart, balance = 0) {
  const items = arr(cart);
  const total = items.reduce((s, c) => s + num(c.price ?? c.item?.price_descoin ?? c.price_descoin), 0);
  return { count: items.length, total, balanceAfter: balance - total, affordable: balance >= total };
}

// ---------------------------------------------------------------------------
// Palette match ("Kombin uyumu").

function hexToHsl(hex) {
  let h = String(hex || "").replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}/i.test(h)) return null;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let hue = 0;
  if (d) {
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
  }
  hue = (hue * 60 + 360) % 360;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h: hue, s, l };
}

/** 0..100: how well the colours you wear sit with a set palette (hue distance, weighted). */
export function paletteMatch(setPalette, wornColors) {
  const set = arr(setPalette).map(hexToHsl).filter((c) => c && c.s > 0.15);
  const worn = arr(wornColors).map(hexToHsl).filter(Boolean);
  if (!set.length || !worn.length) return null;
  let total = 0;
  for (const w of worn) {
    if (w.s < 0.12) {
      total += 0.55;
      continue;
    }
    const best = Math.min(...set.map((c) => {
      const dh = Math.abs(c.h - w.h);
      return Math.min(dh, 360 - dh);
    }));
    total += Math.max(0, 1 - best / 120);
  }
  return Math.round((total / worn.length) * 100);
}

/** Worn item that fits the palette worst (named in the hint). */
export function weakestWorn(setPalette, wornItems, colorOf) {
  let worst = null;
  for (const it of arr(wornItems)) {
    const c = colorOf(it);
    if (!c) continue;
    const score = paletteMatch(setPalette, [c]);
    if (score == null) continue;
    if (!worst || score < worst.score) worst = { item: it, score };
  }
  return worst && worst.score < 60 ? worst.item : null;
}

// ---------------------------------------------------------------------------
// Try-on.

/** The user object with try-on items equipped over what they wear (null slot = taken off). */
export function composeTryOnUser(me, tryOn = {}) {
  const user = { ...(me || {}) };
  for (const [category, item] of Object.entries(tryOn || {})) {
    const field = EQUIP_FIELD[category];
    if (!field) continue;
    user[field] = item || null;
  }
  return user;
}

/** Try-on map for a set: every piece unless hidden (eye toggle). */
export function setTryOn(set, hidden = new Set()) {
  const out = {};
  for (const p of arr(set?.pieces)) {
    if (hidden.has(String(p.item.id))) continue;
    out[p.item.category] = p.item;
  }
  return out;
}

/** Equipped items (by category) taken from the user object, for "Önceki görünüm". */
export function currentLook(me) {
  const out = {};
  for (const [category, field] of Object.entries(EQUIP_FIELD)) {
    if (me?.[field]?.id != null) out[category] = me[field].id;
  }
  return out;
}

/** Which categories an outfit changes compared with what is worn now. */
export function outfitDiff(me, outfitItems) {
  const now = currentLook(me);
  const changes = [];
  for (const [category, id] of Object.entries(outfitItems || {})) {
    if (String(now[category] ?? "") !== String(id ?? "")) changes.push({ category, from: now[category] ?? null, to: id ?? null });
  }
  return changes;
}

// ---------------------------------------------------------------------------
// Night market.

export function normalizeNightMarket(raw) {
  const r = raw?.nightMarket || raw || {};
  const night = r.night || {};
  const flips = r.flips || {};
  const cards = arr(r.cards).map((c, i) => {
    const item = c.item ? normalizeItem(c.item) : null;
    if (item && c.rarity && !item.rarity) item.rarity = c.rarity;
    const base = num(pick(c, "listPrice", "basePrice", "base_price"), item?.price_descoin || 0);
    const price = num(pick(c, "price"), base);
    return {
      index: num(pick(c, "index", "cardIndex"), i),
      hint: pick(c, "hint", "category", "categoryHint") || null,
      flipped: Boolean(c.flipped || item),
      item,
      price,
      basePrice: base,
      discountPct: num(pick(c, "discountPct", "discount_pct"), base > 0 && price < base ? Math.round((1 - price / base) * 100) : 0),
      kept: Boolean(c.kept),
      bought: Boolean(c.bought || c.owned),
      flippedAt: ms(c.flippedAt),
      previousLowest: pick(c, "previousLowest", "previous_lowest", "lowest30d") ?? null,
      priceHistory: arr(pick(c, "priceHistory", "price_history")).map((h) => num(h.price ?? h)),
    };
  });
  const byIndex = new Map(cards.map((c) => [c.index, c]));
  const next = r.next || null;
  return {
    open: Boolean(r.open),
    eligible: r.eligible !== false,
    id: night.id || r.id || null,
    opensAt: ms(pick(night, "startsAt") ?? pick(r, "opensAt", "opens_at", "startsAt")),
    closesAt: ms(pick(night, "endsAt") ?? pick(r, "closesAt", "closes_at", "endsAt")),
    nextOpensAt: ms(next?.startsAt ?? pick(r, "nextOpensAt", "next_opens_at")),
    flipsLeft: num(flips.left ?? pick(r, "flipsLeft", "flips_left"), 0),
    flipsTotal: num(flips.total ?? pick(r, "flipsTotal", "flips_total"), 3),
    coOpenBonus: num(flips.coOpenBonus, 0),
    keepLimit: num(pick(r, "keepMax", "keepLimit", "keep_limit"), SHOP2_KEEP_LIMIT),
    savings: r.savings != null ? num(r.savings) : null,
    notify: r.notify != null ? Boolean(r.notify) : null,
    cards,
    log: arr(r.log).map((e) => {
      const card = e.cardIndex ?? e.card ?? null;
      return {
        at: ms(e.at),
        kind: e.kind || "flip",
        card,
        detail: e.detail || null,
        item: e.item ? normalizeItem(e.item) : card != null ? byIndex.get(card)?.item || null : null,
        from: e.from ?? null,
        to: e.to ?? null,
        name: e.name || null,
      };
    }),
    friendBonus: r.friendBonus || r.friend_bonus || null,
  };
}

/** Summary numbers of a night: opened, kept, flips left, saved. */
export function nightSummary(nm) {
  const cards = arr(nm?.cards);
  const opened = cards.filter((c) => c.flipped);
  return {
    opened: opened.length,
    kept: cards.filter((c) => c.kept).length,
    flipsLeft: num(nm?.flipsLeft),
    flipsTotal: num(nm?.flipsTotal, 3),
    saved: nm?.savings != null ? num(nm.savings) : opened.filter((c) => c.bought).reduce((s, c) => s + Math.max(0, c.basePrice - c.price), 0),
    canKeepMore: cards.filter((c) => c.kept).length < num(nm?.keepLimit, SHOP2_KEEP_LIMIT),
  };
}

// ---------------------------------------------------------------------------
// Gifts.

export const GIFT_STATUS_ORDER = Object.freeze(["scheduled", "delivered", "opened", "equipped", "thanked"]);

export function normalizeGift(raw) {
  if (!raw) return null;
  const items = arr(raw.items).map((x) => normalizeItem(x)).filter(Boolean);
  return {
    id: raw.id,
    direction: raw.direction || null,
    to: raw.to || raw.recipient || null,
    from: raw.from || raw.sender || null,
    item: raw.item ? normalizeItem(raw.item) : items[0] || null,
    items,
    itemCount: num(raw.itemCount, items.length),
    kind: raw.kind || null,
    setKey: pick(raw, "setKey", "set_key") || null,
    setName: raw.setName ?? raw.set_name ?? null,
    message: raw.message || "",
    status: raw.status || "delivered",
    sentAt: ms(pick(raw, "createdAt", "sentAt", "sent_at", "created_at")),
    deliveredAt: ms(raw.deliveredAt),
    sendAt: ms(pick(raw, "sendAt", "send_at")),
    openedAt: ms(pick(raw, "openedAt", "opened_at")),
    recallUntil: ms(pick(raw, "recallUntil", "recall_until")),
    canRecall: raw.canRecall != null ? Boolean(raw.canRecall) : null,
    canOpen: raw.canOpen != null ? Boolean(raw.canOpen) : null,
    hiddenItem: Boolean(pick(raw, "hidden", "hiddenItem", "hidden_item")),
    hideName: Boolean(pick(raw, "anonymous", "hideName", "hide_name")),
    wrap: raw.wrap || raw.wrapColor || null,
    price: num(raw.amount ?? raw.price, 0),
  };
}

/** Recipient row from GET /gifts/recipients ({ user, owned, total, ownsAll, wishlisted, canReceive }). */
export function normalizeRecipient(raw) {
  if (!raw) return null;
  const user = raw.user && typeof raw.user === "object" ? raw.user : raw;
  if (user?.id == null) return null;
  return {
    ...user,
    owns: Boolean(raw.ownsAll ?? raw.owns ?? raw.hasItem),
    wishes: Boolean(raw.wishlisted ?? raw.wishes ?? raw.inWishlist),
    ownedCount: raw.owned != null && typeof raw.owned === "number" ? raw.owned : null,
    total: raw.total != null ? num(raw.total) : null,
    acceptsGifts: raw.canReceive != null ? Boolean(raw.canReceive) : user.acceptsGifts,
    wishlistCount: num(raw.wishlistCount, 0),
    birthdayInDays: raw.birthdayInDays ?? user.birthdayInDays ?? null,
    birthdayAt: raw.birthdayAt ?? user.birthdayAt ?? null,
  };
}

/** Can the sender still recall this gift (not opened, inside 5 minutes or still scheduled)? */
export function canRecall(gift, now = Date.now()) {
  if (!gift) return false;
  if (gift.canRecall != null) return gift.canRecall && gift.status !== "recalled";
  if (gift.status === "recalled" || gift.openedAt || ["opened", "equipped", "thanked"].includes(gift.status)) return false;
  if (gift.status === "scheduled") return true;
  const until = gift.recallUntil ?? (gift.sentAt != null ? gift.sentAt + SHOP2_RECALL_MS : null);
  return until != null && until > now;
}

/** Recipient filter chips: all, online, birthday soon, does not own it, wishes it. */
export function filterRecipients(friends, filter, query = "") {
  const q = String(query || "").trim().toLocaleLowerCase();
  return arr(friends).filter((f) => {
    if (q) {
      const hay = `${f.displayName || f.display_name || ""} ${f.username || ""}`.toLocaleLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filter === "online") return f.status && f.status !== "offline";
    if (filter === "birthday") return f.birthdaySoon || f.birthdayInDays != null && f.birthdayInDays <= 7;
    if (filter === "notOwned") return !f.owns;
    if (filter === "wishlist") return Boolean(f.wishes);
    return true;
  }).sort((a, b) => Number(Boolean(b.wishes)) - Number(Boolean(a.wishes)) || Number(Boolean(a.owns)) - Number(Boolean(b.owns)));
}

/** Gift price: a set for a friend deducts the pieces they already own. */
export function giftPrice({ item = null, set = null, friend = null } = {}) {
  if (item) return num(item.price ?? item.price_descoin);
  if (!set) return 0;
  const owned = new Set(arr(friend?.ownedPieceIds).map(String));
  const pieces = arr(set.pieces).map((p) => ({ ...p, owned: owned.has(String(p.item.id)) }));
  return setPricing({ ...set, pieces, yourPrice: null }).yourPrice;
}

export function messageCount(text) {
  return Array.from(String(text || "")).length;
}

// ---------------------------------------------------------------------------
// Action log.

const HISTORY_KIND = { gift_send: "gift_sent", gift_recall: "gift_recalled", outfit_save: "outfit", outfit_apply: "outfit_apply", wishlist_add: "wishlist", wishlist_remove: "wishlist_remove" };
// The server logs what was paid as a positive number; these kinds spent DesCoin.
const HISTORY_SPENT = new Set(["purchase", "gift_send", "refresh", "night_buy"]);

export function normalizeHistory(raw) {
  return arr(raw?.entries || raw?.history || raw).map((e) => {
    const p = e.payload && typeof e.payload === "object" ? e.payload : {};
    const itemRaw = e.item || p.item || arr(p.items)[0] || null;
    const kind = e.kind || e.type || "purchase";
    return {
      id: e.id,
      at: ms(e.at || e.createdAt || e.created_at),
      kind: HISTORY_KIND[kind] || (kind === "purchase" && (p.setKey || e.setKey) && !itemRaw ? "set_purchase" : kind),
      item: itemRaw && typeof itemRaw === "object" ? normalizeItem(itemRaw) : null,
      itemName: p.itemName || p.name || null,
      setKey: e.setKey || p.setKey || e.set_key || null,
      setName: e.setName ?? p.setName ?? null,
      to: e.to || p.to || p.recipient || null,
      amount: HISTORY_SPENT.has(kind) ? -Math.abs(num(e.amount ?? p.amount ?? p.paid ?? p.price, 0)) : num(e.amount ?? p.amount ?? p.paid ?? p.price ?? p.refunded, 0),
      undoable: Boolean(e.undoable) && !e.undoneAt,
      undoUntil: ms(e.undoUntil || e.undo_until),
      undoneAt: ms(e.undoneAt),
      status: e.status || p.status || null,
    };
  }).sort((a, b) => (b.at || 0) - (a.at || 0));
}

/** Seconds left to undo an entry, 0 when it can no longer be undone. */
export function undoLeft(entry, now = Date.now()) {
  if (!entry?.undoable) return 0;
  return windowLeft(entry.at, SHOP2_REFUND_MS, now, entry.undoUntil);
}

// ---------------------------------------------------------------------------
// Misc helpers.

/** Group storefront items by day label for the 7-day strip (oldest first). */
export function lastDays(history7d, todaySlots) {
  const days = arr(history7d).slice(-6);
  return [...days, { day: "today", items: arr(todaySlots).map((s) => ({ item: s.item, bought: Boolean(s.owned) })) }];
}

/** Set completion progress (title reward at 8/8). */
export function setProgress(set) {
  const total = num(set?.pieceCount, arr(set?.pieces).length || 8);
  const owned = num(set?.ownedCount, arr(set?.pieces).filter((p) => p.owned).length);
  return { owned, total, left: Math.max(0, total - owned), pct: total ? owned / total : 0 };
}

/** Random-enough idempotency key for a purchase (server de-duplicates retries). */
export function idempotencyKey(prefix = "s2") {
  const r = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${r}`;
}

/** 40 celebration particles in the set colours (deterministic per seed). */
export function celebrationParticles(palette, count = 40, seed = 7) {
  const colors = arr(palette).length ? arr(palette) : ["#587af5", "#a9b9ff", "#ffd76a"];
  let x = seed >>> 0 || 1;
  const rnd = () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 10000) / 10000;
  };
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    color: colors[i % colors.length],
    angle: Math.round(rnd() * 360),
    dist: Math.round(90 + rnd() * 170),
    size: Math.round(3 + rnd() * 5),
    delay: Math.round(rnd() * 180),
  }));
}

/** CSS variables for a set palette (page takes the set colours). */
export function paletteVars(palette) {
  const p = arr(palette);
  if (!p.length) return {};
  return {
    "--s2-p0": p[0],
    "--s2-p1": p[1] || p[0],
    "--s2-p2": p[2] || p[1] || p[0],
    "--s2-p3": p[3] || p[2] || p[0],
  };
}
