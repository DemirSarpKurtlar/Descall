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
import { normalizeEquipHistory } from "../lib/shop2Inventory.js";

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
  const setDetailsRef = useRef(setDetails);
  setDetailsRef.current = setDetails;
  const [night, setNight] = useState(null);
  const [gifts, setGifts] = useState({ sent: [], received: [], limits: null });
  const [history, setHistory] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [outfits, setOutfits] = useState([]);
  const [equipHistory, setEquipHistory] = useState(null);
  const [prefs, setPrefs] = useState(readShop2Prefs);
  const alive = useRef(true);
  useEffect(() => () => {
    alive.current = false;
  }, []);

  // Kept in a ref: Settings passes a fresh inline callback on every render, and the balance it
  // reports re-renders Settings (new `me`). With the callback in the loaders' deps that was a
  // loop: every storefront answer reloaded all seven endpoints again (~9 times a second) and
  // re-applied the app theme on <html>, which also cancelled smooth scrolling in the market.
  const balanceCb = useRef(onBalanceChange);
  balanceCb.current = onBalanceChange;
  const applyBalance = useCallback((res) => {
    if (res && typeof res.balance === "number") balanceCb.current?.(res.balance);
  }, []);

  const loadStorefront = useCallback(async () => {
    try {
      const res = await shop2Api.storefront();
      if (!alive.current) return null;
      const sf = normalizeStorefront(res);
      if (!sf.history7d.length) sf.history7d = rememberStorefrontDay(sf);
      setStorefront(sf);
      setState("ready");
      if (typeof sf.balance === "number") balanceCb.current?.(sf.balance);
      return sf;
    } catch (err) {
      if (!alive.current) return null;
      setState(isMissingRoute(err) ? "offline" : "error");
      return null;
    }
  }, []);

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

  /** Re-read every set page already opened (owned pieces, partial price, title after a buy). */
  const reloadSetDetails = useCallback(() => {
    for (const key of Object.keys(setDetailsRef.current)) loadSet(key);
  }, [loadSet]);

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

  const loadEquipHistory = useCallback(async () => {
    try {
      const res = await shop2Api.equipHistory();
      if (alive.current) setEquipHistory(normalizeEquipHistory(res));
    } catch (err) {
      if (alive.current) setEquipHistory((h) => h || { ...normalizeEquipHistory({}), missing: isMissingRoute(err) });
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

  // Day rollover (00:00 Istanbul) and the night market opening / closing while the shop stays
  // open: the socket event can come late or not at all (sleep, reconnect), so the client also
  // reloads at the boundary itself (with a little jitter), and again when the tab comes back.
  const edgeRetries = useRef(0);
  const nightRef = useRef(null);
  nightRef.current = night;
  const edges = [
    storefront?.resetsAt,
    storefront?.nightMarket?.open ? storefront.nightMarket.closesAt : storefront?.nightMarket?.nextOpensAt,
    night?.open ? night.closesAt : night?.nextOpensAt,
  ].filter((x) => typeof x === "number");
  const nextEdge = edges.length ? Math.min(...edges) : null;
  useEffect(() => {
    if (nextEdge == null) return undefined;
    let wait = nextEdge - Date.now();
    if (wait <= 0) {
      // Still on the old side after a reload (clock drift): try a few more times, then stop.
      if (edgeRetries.current >= 4) return undefined;
      edgeRetries.current += 1;
      wait = 5000;
    } else {
      edgeRetries.current = 0;
      wait += 1200 + Math.floor(Math.random() * 2500);
    }
    const id = setTimeout(() => {
      loadStorefront();
      loadNight();
    }, Math.min(wait, 2 ** 31 - 1));
    return () => clearTimeout(id);
  }, [nextEdge, loadStorefront, loadNight]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const sf = storefrontRef.current;
      const nm = nightRef.current;
      const now = Date.now();
      const passed = (t) => typeof t === "number" && t <= now;
      if (passed(sf?.resetsAt) || passed(sf?.nightMarket?.open ? sf.nightMarket.closesAt : sf?.nightMarket?.nextOpensAt) || passed(nm?.open ? nm.closesAt : nm?.nextOpensAt)) {
        loadStorefront();
        loadNight();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadStorefront, loadNight]);

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
        reloadSetDetails();
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
      loadEquipHistory();
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
  }, [loadStorefront, loadNight, loadSets, loadGifts, loadHistory, loadEquipHistory, reloadSetDetails]);

  // Any buy, refund or undo can change a set (a single piece opens the 7-day partial price,
  // the last piece completes it), so the set list and the opened set pages are re-read too.
  const afterPurchase = useCallback((res, detail) => {
    applyBalance(res);
    inventoryChanged(detail);
    loadStorefront();
    loadHistory();
    loadSets();
    reloadSetDetails();
  }, [applyBalance, loadStorefront, loadHistory, loadSets, reloadSetDetails]);

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
      // Undo reverses any logged action: a wishlist add / remove, a saved look, a gift.
      loadGifts();
      loadWishlist();
      loadOutfits();
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
        loadHistory();
      } catch {
        /* optional */
      }
    },
    /** Optimistic; a refusal (wishlist_full, ...) rolls back and rejects with the reason. */
    async toggleWishlist(item, on) {
      setWishlist((list) => (on ? [...list.filter((x) => String(x.id) !== String(item.id)), item] : list.filter((x) => String(x.id) !== String(item.id))));
      try {
        await shop2Api.toggleWishlist(item.id, on);
        loadHistory();
      } catch (err) {
        if (isMissingRoute(err)) return;
        loadWishlist();
        throw err;
      }
    },
    async saveOutfit(name, items, auto = false) {
      const local = { id: `local-${Date.now()}`, name, items, auto, createdAt: new Date().toISOString() };
      setOutfits((list) => [local, ...list]);
      try {
        const res = await shop2Api.saveOutfit({ name, look: items, ...(auto ? { kind: "previous" } : {}) });
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
    /** "Hepsini kuşan" in one request; null when the server has no batch equip yet. */
    async equipItems(itemIds) {
      try {
        const res = await shop2Api.equip(itemIds);
        inventoryChanged({ equip: itemIds });
        loadHistory();
        loadOutfits();
        return res || {};
      } catch (err) {
        if (isMissingRoute(err)) return null;
        throw err;
      }
    },
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
    loadEquipHistory,
    /**
     * Inventory "Uygula" / "Geri dön" / one slot: { category: itemId|null } in one request.
     * null when the server has no /look route yet (the caller falls back to single equips).
     */
    async applyLook(look, source = "inventory") {
      try {
        const res = await shop2Api.look(look, source);
        inventoryChanged({ look: Object.keys(look || {}) });
        loadHistory();
        loadOutfits();
        loadEquipHistory();
        return res || {};
      } catch (err) {
        if (isMissingRoute(err)) return null;
        throw err;
      }
    },
    /** Rename / pin a saved look (optimistic, rolled back on failure). */
    async updateOutfit(outfit, patch) {
      setOutfits((list) => list.map((o) => (o.id === outfit.id ? { ...o, ...patch, ...(patch.name ? { auto: false, kind: "saved" } : {}) } : o)));
      try {
        const res = await shop2Api.updateOutfit(outfit.id, patch);
        const o = res?.outfit;
        if (o) setOutfits((list) => list.map((x) => (x.id === o.id ? { ...o, items: o.look || {}, auto: o.kind === "previous" } : x)));
        return o || null;
      } catch (err) {
        loadOutfits();
        throw err;
      }
    },
    async deleteOutfit(outfit) {
      setOutfits((list) => list.filter((o) => o.id !== outfit.id));
      try {
        if (!String(outfit.id).startsWith("local-")) await shop2Api.deleteOutfit(outfit.id);
      } catch (err) {
        loadOutfits();
        throw err;
      }
    },
    async shareLook(payload) {
      return shop2Api.shareLook(payload);
    },
    setPref(patch) {
      setPrefs(writeShop2Prefs(patch));
    },
  }), [loadAll, loadSet, loadNight, loadGifts, loadStorefront, loadHistory, loadSets, loadWishlist, loadOutfits, loadEquipHistory, applyBalance, afterPurchase]);

  return { state, storefront, sets, setDetails, night, gifts, history, wishlist, outfits, equipHistory, prefs, actions };
}

export default useShop2;
