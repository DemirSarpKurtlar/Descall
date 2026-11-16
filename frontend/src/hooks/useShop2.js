// Market 2.0 data: storefront, sets, night market, gifts, action log, wishlist, outfits.
// Loads lazily per tab, stays live through the shop2 socket events (App bridges
// "shop2:storefront" / "shop2:gift" to window events) and degrades to empty states when
// /api/shop2 is not deployed yet.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import shop2Api, { isMissingRoute } from "../lib/shop2Api.js";
import {
  normalizeGift,
  normalizeHistory,
  normalizeItem,
  normalizeNightMarket,
  normalizeSet,
  normalizeSetSummary,
  normalizeStorefront,
} from "../lib/shop2Logic.js";

export const SHOP2_EVENTS = Object.freeze({
  storefront: "descall:shop2-storefront",
  gift: "descall:shop2-gift",
  inventory: "descall:shop-inventory-changed",
  nightReminder: "descall:shop2-night-reminder",
});

const PREFS_KEY = "descall.shop2.prefs";
const WEEK_KEY = "descall.shop2.week";

/**
 * The server keeps no storefront history for users, so the client remembers the last 7
 * Istanbul days it saw (item summaries + bought) for draft C's "Son 7 günün vitrini".
 */
export function rememberStorefrontDay(sf, ownedIds = null) {
  if (!sf?.day || !sf.slots?.length) return [];
  let week = [];
  try {
    week = JSON.parse(localStorage.getItem(WEEK_KEY) || "[]");
    if (!Array.isArray(week)) week = [];
  } catch {
    week = [];
  }
  const slim = (it) => ({ id: it.id, sku: it.sku, category: it.category, rarity: it.rarity, effect_key: it.effect_key, theme_key: it.theme_key, asset_url: it.asset_url && String(it.asset_url).length < 300 ? it.asset_url : null, name: it.name });
  const today = { day: sf.day, items: sf.slots.map((x) => ({ item: slim(x.item), bought: Boolean(x.owned || ownedIds?.has?.(x.item.id)) })) };
  week = [...week.filter((d) => d && d.day && d.day !== sf.day), today].sort((a, b) => String(a.day).localeCompare(String(b.day))).slice(-7);
  try {
    localStorage.setItem(WEEK_KEY, JSON.stringify(week));
  } catch {
    /* quota */
  }
  return week.filter((d) => d.day !== sf.day);
}

export function readShop2Prefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

export function writeShop2Prefs(patch) {
  const next = { ...readShop2Prefs(), ...patch };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
  return next;
}

/** Notify the rest of the app (ShopPanel reloads inventory + balance). */
function inventoryChanged(detail) {
  try {
    window.dispatchEvent(new CustomEvent(SHOP2_EVENTS.inventory, { detail: { source: "shop2", ...detail } }));
  } catch {
    /* ignore */
  }
}

export function useShop2({ onBalanceChange } = {}) {
  const [storefront, setStorefront] = useState(null);
  const storefrontRef = useRef(null);
  storefrontRef.current = storefront;
  const [state, setState] = useState("loading"); // loading | ready | offline | error
  const [sets, setSets] = useState([]);
  const [setDetails, setSetDetails] = useState({});
  const [night, setNight] = useState(null);
  const [gifts, setGifts] = useState({ sent: [], received: [], limits: null });
  const [history, setHistory] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [outfits, setOutfits] = useState([]);
  const [prefs, setPrefs] = useState(readShop2Prefs);
  const alive = useRef(true);
  useEffect(() => () => {
    alive.current = false;
  }, []);

  const applyBalance = useCallback((res) => {
    if (res && typeof res.balance === "number") onBalanceChange?.(res.balance);
  }, [onBalanceChange]);

  const loadStorefront = useCallback(async () => {
    try {
      const res = await shop2Api.storefront();
      if (!alive.current) return null;
      const sf = normalizeStorefront(res);
      if (!sf.history7d.length) sf.history7d = rememberStorefrontDay(sf);
      setStorefront(sf);
      setState("ready");
      if (typeof sf.balance === "number") onBalanceChange?.(sf.balance);
      return sf;
    } catch (err) {
      if (!alive.current) return null;
      setState(isMissingRoute(err) ? "offline" : "error");
      return null;
    }
  }, [onBalanceChange]);

  const loadSets = useCallback(async () => {
    try {
      const res = await shop2Api.sets();
      if (alive.current) setSets((res?.sets || res || []).map(normalizeSetSummary).filter(Boolean));
    } catch {
      /* stays empty */
    }
  }, []);

  const loadSet = useCallback(async (key) => {
    if (!key) return null;
    try {
      const res = await shop2Api.set(key);
      const set = normalizeSet(res);
      if (alive.current && set) setSetDetails((m) => ({ ...m, [key]: set }));
      return set;
    } catch {
      return null;
    }
  }, []);

  const loadNight = useCallback(async () => {
    try {
      const res = await shop2Api.nightMarket();
      if (alive.current) setNight(normalizeNightMarket(res));
    } catch {
      if (alive.current) setNight((n) => n || normalizeNightMarket({}));
    }
  }, []);

  const loadGifts = useCallback(async () => {
    try {
      const res = await shop2Api.gifts();
      if (!alive.current) return;
      const limits = res?.limits || null;
      setGifts({
        sent: (res?.sent || []).map(normalizeGift).filter(Boolean),
        received: (res?.received || []).map(normalizeGift).filter(Boolean),
        limits: limits ? { ...limits, dailyLeft: limits.left ?? limits.dailyLeft ?? null } : null,
      });
    } catch {
      /* stays empty */
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const res = await shop2Api.history();
      if (alive.current) setHistory(normalizeHistory(res));
    } catch {
      /* stays empty */
    }
  }, []);

  const loadWishlist = useCallback(async () => {
    try {
      const res = await shop2Api.wishlist();
      if (alive.current) setWishlist((res?.items || res || []).map((x) => normalizeItem(x)).filter(Boolean));
    } catch {
      /* stays empty */
    }
  }, []);

  const loadOutfits = useCallback(async () => {
    try {
      const res = await shop2Api.outfits();
      const list = Array.isArray(res?.outfits) ? res.outfits : Array.isArray(res) ? res : [];
      if (alive.current) setOutfits(list.map((o) => ({ ...o, items: o.look || o.items || {}, auto: o.kind === "previous" || Boolean(o.auto) })));
    } catch {
      /* stays empty */
    }
  }, []);

  const loadAll = useCallback(() => {
    loadStorefront();
    loadSets();
    loadHistory();
    loadWishlist();
    loadGifts();
    loadNight();
    loadOutfits();
  }, [loadStorefront, loadSets, loadHistory, loadWishlist, loadGifts, loadNight, loadOutfits]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Live: daily reset / refresh on another device, gift received, inventory changed.
  useEffect(() => {
    let t1 = null;
    let t2 = null;
    const onStore = () => {
      clearTimeout(t1);
      t1 = setTimeout(() => {
        loadStorefront();
        loadNight();
        loadSets();
      }, 250);
    };
    const onGift = () => {
      clearTimeout(t2);
      t2 = setTimeout(() => {
        loadGifts();
        loadStorefront();
        loadHistory();
      }, 250);
    };
    const onInv = (e) => {
      if (e?.detail?.source === "shop2") return;
      onStore();
      loadHistory();
    };
    window.addEventListener(SHOP2_EVENTS.storefront, onStore);
    window.addEventListener(SHOP2_EVENTS.gift, onGift);
    window.addEventListener(SHOP2_EVENTS.inventory, onInv);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener(SHOP2_EVENTS.storefront, onStore);
      window.removeEventListener(SHOP2_EVENTS.gift, onGift);
      window.removeEventListener(SHOP2_EVENTS.inventory, onInv);
    };
  }, [loadStorefront, loadNight, loadSets, loadGifts, loadHistory]);

  const afterPurchase = useCallback((res, detail) => {
    applyBalance(res);
    inventoryChanged(detail);
    loadStorefront();
    loadHistory();
  }, [applyBalance, loadStorefront, loadHistory]);

  const actions = useMemo(() => ({
    reload: loadAll,
    loadSet,
    loadNight,
    loadGifts,
    async refresh(keepLockedItemId, expectedPrice) {
      const res = await shop2Api.refreshStorefront(keepLockedItemId, expectedPrice);
      applyBalance(res);
      if (res?.storefront || res?.slots) setStorefront(normalizeStorefront(res));
      else await loadStorefront();
      loadHistory();
      return res;
    },
    async lock(itemId) {
      const before = storefrontRef.current;
      const wasLocked = before?.lockedItemId != null && String(before.lockedItemId) === String(itemId);
      setStorefront((sf) => (sf ? {
        ...sf,
        lockedItemId: sf.lockedItemId != null && String(sf.lockedItemId) === String(itemId) ? null : itemId,
        slots: sf.slots.map((s) => ({ ...s, locked: String(s.item.id) === String(itemId) ? !s.locked : false })),
      } : sf));
      try {
        const res = await shop2Api.lockSlot(wasLocked ? null : itemId);
        if (res?.storefront || res?.slots) setStorefront(normalizeStorefront(res));
      } catch (err) {
        if (!isMissingRoute(err)) loadStorefront();
      }
    },
    async buyItem(item, opts) {
      const res = await shop2Api.buyItem(item.id, opts);
      afterPurchase(res, { itemId: item.id });
      return res;
    },
    async buySet(key, opts) {
      const res = await shop2Api.buySet(key, opts);
      afterPurchase(res, { setKey: key });
      loadSet(key);
      loadSets();
      return res;
    },
    async refund(purchaseId) {
      const res = await shop2Api.refund(purchaseId);
      afterPurchase(res, { refund: purchaseId });
      return res;
    },
    async undo(entryId) {
      const res = await shop2Api.undo(entryId);
      afterPurchase(res, { undo: entryId });
      loadGifts();
      return res;
    },
    async flip(cardIndex) {
      const res = await shop2Api.flip(cardIndex);
      if (res?.nightMarket || res?.cards) setNight(normalizeNightMarket(res));
      else await loadNight();
      loadHistory();
      return res;
    },
    async buyNight(cardIndex, opts) {
      const res = await shop2Api.buyNight(cardIndex, opts);
      afterPurchase(res, { night: cardIndex });
      loadNight();
      return res;
    },
    async keepNight(cardIndex, keep) {
      setNight((n) => (n ? { ...n, cards: n.cards.map((c) => (c.index === cardIndex ? { ...c, kept: keep } : c)) } : n));
      try {
        await shop2Api.keepNight(cardIndex, keep);
      } catch (err) {
        loadNight();
        throw err;
      }
    },
    /** Server-side reminder 10 minutes before every night (in-app + push + socket). */
    async nightNotify(on) {
      try {
        const res = await shop2Api.nightNotify(on);
        setNight((n) => (n ? { ...n, notify: typeof res?.notify === "boolean" ? res.notify : on } : n));
        return res;
      } catch {
        return null;
      }
    },
    async sendGift(payload) {
      const res = await shop2Api.sendGift(payload);
      applyBalance(res);
      loadGifts();
      loadHistory();
      return res;
    },
    async recallGift(id) {
      const res = await shop2Api.recallGift(id);
      applyBalance(res);
      loadGifts();
      loadHistory();
      return res;
    },
    async openGift(id, opts) {
      const res = await shop2Api.openGift(id, opts);
      inventoryChanged({ gift: id });
      loadGifts();
      return res;
    },
    async toggleSetWishlist(setKey, on) {
      try {
        await shop2Api.toggleSetWishlist(setKey, on);
      } catch {
        /* optional */
      }
    },
    async toggleWishlist(item, on) {
      setWishlist((list) => (on ? [...list.filter((x) => String(x.id) !== String(item.id)), item] : list.filter((x) => String(x.id) !== String(item.id))));
      try {
        await shop2Api.toggleWishlist(item.id, on);
      } catch (err) {
        if (!isMissingRoute(err)) loadWishlist();
      }
    },
    async saveOutfit(name, items, auto = false) {
      const local = { id: `local-${Date.now()}`, name, items, auto, createdAt: new Date().toISOString() };
      setOutfits((list) => [local, ...list]);
      try {
        const res = await shop2Api.saveOutfit({ name, look: items });
        const o = res?.outfit || (res?.id ? res : null);
        if (o) {
          const saved = { ...o, items: o.look || o.items || items, auto: o.kind === "previous" || auto };
          setOutfits((list) => list.map((x) => (x.id === local.id ? saved : x)));
          return saved;
        }
        return local;
      } catch {
        return local;
      }
    },
    /** Wear a saved look on the server (it logs an undoable action); null when it can't. */
    async applyOutfit(outfit) {
      if (!outfit?.id || String(outfit.id).startsWith("local-")) return null;
      try {
        const res = await shop2Api.applyOutfit(outfit.id);
        inventoryChanged({ outfit: outfit.id });
        loadHistory();
        return res || {};
      } catch {
        return null;
      }
    },
    async shareLook(payload) {
      return shop2Api.shareLook(payload);
    },
    setPref(patch) {
      setPrefs(writeShop2Prefs(patch));
    },
  }), [loadAll, loadSet, loadNight, loadGifts, loadStorefront, loadHistory, loadSets, loadWishlist, applyBalance, afterPurchase]);

  return { state, storefront, sets, setDetails, night, gifts, history, wishlist, outfits, prefs, actions };
}

export default useShop2;
