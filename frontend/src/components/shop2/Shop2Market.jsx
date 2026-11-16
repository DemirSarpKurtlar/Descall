/**
 * Market 2.0, user side (owner pick 15 Nov 2026: drafts C + A of the storefront and the sets,
 * A as the base). Header with tabs and DesCoin, five live summary tiles, then the tab:
 * Vitrin (personal storefront + live preview panel), Setler (try-on cabin / stage + kasa),
 * Gece pazarı, İstek listesi, Hediyeler, Envanter (with "Eski koleksiyon") and Tüm ürünler
 * (the classic category catalog, passed in by ShopPanel). Phone: bottom sheets, full-screen
 * night market and gifts. Data: hooks/useShop2.js -> lib/shop2Api.js.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "../../context/LocaleContext";
import { formatNumber } from "../../i18n/format.js";
import useShop2, { SHOP2_EVENTS } from "../../hooks/useShop2.js";
import { SHOP_FOCUS_EVENT, handOffShopFocus, peekShopFocus, takeShopFocus } from "../../lib/callCoinPrefs.js";
import shop2Api from "../../lib/shop2Api.js";
import { cartSummary, dayProgress, EQUIP_FIELD, markWishlist, paletteVars, SHOP2_NIGHT_URGENT_MS, setProgress } from "../../lib/shop2Logic.js";
import { Shop2Ctx, useS2 } from "./Shop2Context.js";
import { Coin, HScroller, Layer, Num, RollingClock, useNow, useWhen } from "./Shop2Bits.jsx";
import { useItemLabels, useItemName } from "./Shop2Art.jsx";
import Shop2Vitrin from "./Shop2Vitrin.jsx";
import Shop2Sets from "./Shop2Sets.jsx";
import Shop2Night from "./Shop2Night.jsx";
import Shop2Gifts, { GiftComposer } from "./Shop2Gifts.jsx";
import Shop2Checkout from "./Shop2Checkout.jsx";
import Shop2Inventory, { Shop2Wishlist } from "./Shop2Inventory.jsx";
import Shop2Search from "./Shop2Search.jsx";
import Shop2Share from "./Shop2Share.jsx";
import { SHOP2_FOCUS_EVENT, takeShop2Focus } from "../../lib/shop2Look.js";
import { requestShopFocus } from "../../lib/callCoinPrefs.js";
import {
  ChevronRight,
  Clock,
  Gift,
  Heart,
  Layers,
  LayoutGrid,
  Moon,
  Package,
  Plus,
  RefreshCw,
  Search,
  Store,
  Undo2,
  X,
} from "./shop2Icons.jsx";
import "../../styles/shop2-ui.css";

const TABS = [
  { id: "vitrin", icon: LayoutGrid },
  { id: "sets", icon: Layers },
  { id: "night", icon: Moon },
  { id: "wishlist", icon: Heart },
  { id: "gifts", icon: Gift },
  { id: "inventory", icon: Package },
  { id: "all", icon: Store },
];

function useLayout(ref) {
  const [w, setW] = useState(() => (typeof window !== "undefined" ? Math.min(window.innerWidth, 1200) : 1200));
  const [embedded, setEmbedded] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    setW(Math.round(el.getBoundingClientRect().width) || w);
    // Inside the Settings window the pane already titles the page "Mağaza".
    setEmbedded(Boolean(el.closest(".user-settings, .us-main, [data-shop-embedded]")));
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { width: w, embedded, layout: w < 640 ? "phone" : w < 1080 ? "tablet" : "desktop" };
}

// Portaled to <body> next to the layers (drawer, checkout, celebration), so a toast is never
// painted behind the window that caused it nor clipped by the Settings window.
function Toasts({ toasts, onDismiss, phone }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className={`s2-toasts${phone ? " is-phone" : ""}`} role="status" aria-live="polite">
      {toasts.map((x) => (
        <div key={x.id} className={`s2-toast is-${x.tone || "info"}`}>
          <span>{x.text}</span>
          {x.action ? (
            <button type="button" onClick={() => { x.action.run(); onDismiss(x.id); }}>
              <Undo2 size={14} />
              {x.action.label}
            </button>
          ) : null}
          <button type="button" className="s2-toast-x" aria-label={x.closeLabel} onClick={() => onDismiss(x.id)}>
            <X size={13} />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}

function SummaryTiles({ onTab }) {
  const { t, locale } = useLocale();
  const s2 = useS2();
  const { storefront, sets, gifts } = s2.data;
  const now = useNow(true);
  const when = useWhen();
  const sf = storefront;
  const nm = sf?.nightMarket;
  const nightNext = nm && !nm.open ? nm.nextOpensAt || nm.opensAt || null : null;
  const featured = sf?.featuredSets?.[0] || sets[0] || null;
  const prog = featured ? setProgress(featured) : null;
  const deduction = featured && featured.yourPrice != null ? Math.max(0, featured.setPrice - featured.yourPrice) : 0;
  const pending = gifts.received.filter((g) => !g.openedAt && g.status !== "opened" && g.status !== "recalled");
  const firstGift = pending[0] || null;
  const refreshLeft = sf ? sf.refresh.left : 0;
  const refreshNote = !sf ? "" : sf.refresh.freeKind === "premium" ? t("shop2.tiles.refreshPremium") : sf.refresh.freeKind === "streak" ? t("shop2.tiles.refreshFree") : sf.refresh.freeGrants > 0 ? t("shop2.tiles.refreshGrant", { n: sf.refresh.freeGrants }) : t("shop2.tiles.refreshSub", { price: formatNumber(sf.refresh.price ?? 120, locale) });
  return (
    <div className="s2-tiles">
      <div className="s2-tile">
        <div className="s2-tile-k"><Clock size={13} />{t("shop2.tiles.nextStorefront")}</div>
        <RollingClock target={sf?.resetsAt} className="s2-tile-big" />
        <div className="s2-bar"><i style={{ width: `${Math.round(dayProgress(sf?.resetsAt, now) * 100)}%` }} /></div>
        <small>{t("shop2.tiles.nextStorefrontSub")}</small>
      </div>
      <div className="s2-tile">
        <div className="s2-tile-k"><RefreshCw size={13} />{t("shop2.tiles.refresh")}</div>
        <div className="s2-tile-v">
          <span className="s2-num">{refreshLeft} / {Math.max(refreshLeft, sf?.refresh.perDay || 1)}</span>
          <span className="s2-chip is-blue">{t("shop2.tiles.today")}</span>
        </div>
        <small>{refreshNote}</small>
      </div>
      <button type="button" className={`s2-tile is-night${nm?.open ? " is-open" : ""}`} onClick={() => onTab("night")}>
        <div className="s2-tile-k"><Moon size={13} />{t("shop2.tiles.night")}</div>
        <div className="s2-tile-v">
          {nm?.open ? <RollingClock target={nm.closesAt} urgentMs={SHOP2_NIGHT_URGENT_MS} className="s2-tile-mid" /> : nightNext ? <span className="s2-tile-mid s2-num">{when(nightNext, { short: true, now })}</span> : <span className="s2-tile-mid">{"–"}</span>}
          <span className="s2-enter">{nm?.open ? t("shop2.tiles.enter") : t("shop2.tiles.soon")}<ChevronRight size={14} /></span>
        </div>
        <small>{nm?.open ? (nm.eligible === false ? t("shop2.night.notEligible") : t("shop2.tiles.nightOpen", { cards: nm.cards, flips: nm.flipsLeft })) : nightNext ? t("shop2.tiles.nightNext", { when: when(nightNext, { now }) }) : t("shop2.tiles.nightNone")}</small>
      </button>
      <button type="button" className="s2-tile" onClick={() => featured && s2.openSet(featured.key)} disabled={!featured}>
        <div className="s2-tile-k"><Layers size={13} />{t("shop2.tiles.setProgress")}</div>
        <div className="s2-tile-v">
          <span className="s2-num s2-tile-mid">{prog ? `${prog.owned} / ${prog.total}` : "0 / 8"}</span>
          <span className="s2-tile-name">{featured ? s2.setName(featured) : t("shop2.tiles.noSet")}</span>
        </div>
        <div className="s2-bar is-pink"><i style={{ width: `${Math.round((prog?.pct || 0) * 100)}%` }} /></div>
        <small>{deduction > 0 ? t("shop2.tiles.yourShare", { n: formatNumber(deduction, locale) }) : t("shop2.tiles.setSub")}</small>
      </button>
      <button type="button" className="s2-tile" onClick={() => onTab("gifts")}>
        <div className="s2-tile-k"><Gift size={13} />{t("shop2.tiles.giftBox")}</div>
        <div className="s2-tile-v">
          {firstGift ? (
            <>
              <span className="s2-letter tone-1 is-xs">{String(firstGift.hideName ? "?" : firstGift.from?.displayName || firstGift.from?.username || "?").charAt(0)}</span>
              <span className="s2-tile-name is-strong">{firstGift.hideName ? t("shop2.tiles.anonGift", { n: pending.length }) : t("shop2.tiles.fromGift", { name: firstGift.from?.displayName || firstGift.from?.username || "", n: pending.length })}</span>
            </>
          ) : (
            <span className="s2-tile-name">{t("shop2.tiles.noGift")}</span>
          )}
        </div>
        <small>{firstGift?.sentAt ? t("shop2.tiles.giftWhen", { time: new Date(firstGift.sentAt).toLocaleString(locale, { weekday: "short", hour: "2-digit", minute: "2-digit" }) }) : t("shop2.tiles.giftSub")}</small>
      </button>
    </div>
  );
}

export default function Shop2Market({
  me,
  balance = 0,
  onBalanceChange,
  inventory = [],
  ownedItemIds,
  equippedIdFor,
  onEquip,
  busyItemId,
  allProducts = null,
  earnSlot = null,
  onEarn,
  initialTab = "vitrin",
}) {
  const { t, locale } = useLocale();
  const rootRef = useRef(null);
  const { layout, width, embedded } = useLayout(rootRef);
  const data = useShop2({ onBalanceChange });
  const itemName = useItemName();
  const itemLabels = useItemLabels();
  const [tab, setTab] = useState(initialTab);
  const [setKey, setSetKey] = useState(null);
  const [checkout, setCheckout] = useState(null);
  const [gift, setGift] = useState(null);
  const [cart, setCart] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [palette, setPalette] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [share, setShare] = useState(null);
  const [focusItemId, setFocusItemId] = useState(null);
  const owned = useMemo(() => ownedItemIds || new Set(inventory.map((r) => r.itemId)), [ownedItemIds, inventory]);

  const toast = useCallback((text, opts = {}) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((list) => [...list.slice(-2), { id, text, closeLabel: t("shop2.common.close"), ...opts }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), opts.ms || 7000);
  }, [t]);

  const setName = useCallback((set) => (set?.name && typeof set.name === "object" ? itemName({ name: set.name }) : String(set?.name || set?.key || "")), [itemName]);

  const openSet = useCallback((key) => {
    setSetKey(key);
    setTab("sets");
  }, []);

  // A night market card keeps its index: the cart pays it at the revealed discount (buyNight).
  const addToCart = useCallback((item, price, extra = null) => {
    setCart((c) => (c.some((x) => String(x.item.id) === String(item.id)) ? c : [...c, { item, price: price ?? item.price_descoin, ...(extra?.nightCardIndex != null ? { nightCardIndex: extra.nightCardIndex } : {}) }]));
  }, []);
  const removeFromCart = useCallback((item) => setCart((c) => c.filter((x) => String(x.item.id) !== String(item.id))), []);

  // Shop deep link (end-of-call summary "Hemen al" / "Mağazada harca", a look link's item):
  // today's storefront card (+ its checkout for "Hemen al"), else the item's set page, else
  // the classic catalog ("Tüm ürünler", ShopPanel scrolls to it / opens its purchase window).
  const ownedRef = useRef(owned);
  ownedRef.current = owned;
  useEffect(() => {
    let off = false;
    const decide = async () => {
      const p = peekShopFocus();
      if (!p || p.classic) return;
      const sf = data.storefront;
      if (!sf) {
        if (data.state === "offline" || data.state === "error") {
          setTab("all");
          handOffShopFocus();
        }
        return;
      }
      const slot = sf.slots.find((s) => String(s.item.id) === String(p.itemId));
      if (slot) {
        takeShopFocus();
        setTab("vitrin");
        // "Hemen al": straight to its checkout; "Mağazada harca": the card's detail.
        if (p.buy && !slot.owned && !ownedRef.current.has(slot.item.id)) setCheckout({ kind: "item", item: slot.item, price: slot.price });
        else setFocusItemId(slot.item.id);
        return;
      }
      let setKeyOf = null;
      try {
        const res = await shop2Api.catalog();
        const it = (res?.items || []).find((x) => String(x?.id) === String(p.itemId));
        setKeyOf = it?.set_key || it?.setKey || null;
      } catch {
        /* classic catalog below */
      }
      if (off || peekShopFocus() !== p) return;
      if (setKeyOf) {
        takeShopFocus();
        setSetKey(setKeyOf);
        setTab("sets");
        return;
      }
      setTab("all");
      handOffShopFocus();
    };
    decide();
    window.addEventListener(SHOP_FOCUS_EVENT, decide);
    return () => {
      off = true;
      window.removeEventListener(SHOP_FOCUS_EVENT, decide);
    };
  }, [data.storefront, data.state]);

  // A look link (chat card or /shop/look/... path) opens the shop at that set or item.
  const pendingFocus = useRef(null);
  useEffect(() => {
    const apply = () => {
      const f = takeShop2Focus();
      if (!f) return;
      if (f.kind === "tab") {
        setTab(f.ref);
        return;
      }
      if (f.kind === "set") {
        setSetKey(f.ref);
        setTab("sets");
      } else pendingFocus.current = f.ref;
      if (f.kind === "item") setTab("vitrin");
    };
    apply();
    window.addEventListener(SHOP2_FOCUS_EVENT, apply);
    return () => window.removeEventListener(SHOP2_FOCUS_EVENT, apply);
  }, []);
  useEffect(() => {
    const ref = pendingFocus.current;
    if (!ref || !data.storefront) return;
    pendingFocus.current = null;
    if (data.storefront.slots.some((s) => String(s.item.id) === String(ref))) setFocusItemId(ref);
    else {
      // Not in today's storefront: its set page, else the classic catalog scrolls to it.
      requestShopFocus({ itemId: ref });
    }
  }, [data.storefront]);

  // Night market reminder from the server (10 minutes before it opens) and the in-app
  // "10 minutes before closing" nudge while the shop is open.
  const toastRef = useRef(null);
  toastRef.current = toast;
  useEffect(() => {
    const on = (e) => {
      const d = e?.detail || {};
      if (d.title || d.body) toastRef.current?.([d.title, d.body].filter(Boolean).join(" · "), { tone: "info", ms: 9000, action: { label: t("shop2.tiles.enter"), run: () => setTab("night") } });
      data.actions.loadNight();
      data.actions.reload();
    };
    window.addEventListener(SHOP2_EVENTS.nightReminder, on);
    return () => window.removeEventListener(SHOP2_EVENTS.nightReminder, on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const closeNudged = useRef(null);
  const nmClose = data.storefront?.nightMarket?.open ? data.storefront.nightMarket.closesAt : null;
  useEffect(() => {
    if (!nmClose || data.prefs.nightRemind === false || closeNudged.current === nmClose) return undefined;
    const fire = () => {
      closeNudged.current = nmClose;
      toastRef.current?.(t("shop2.night.closingSoon"), { tone: "info", ms: 9000, action: { label: t("shop2.tiles.enter"), run: () => setTab("night") } });
    };
    const wait = nmClose - 10 * 60e3 - Date.now();
    if (wait <= 0) {
      if (nmClose > Date.now()) fire();
      return undefined;
    }
    const id = setTimeout(fire, Math.min(wait, 2 ** 31 - 1));
    return () => clearTimeout(id);
  }, [nmClose, data.prefs.nightRemind, t]);

  const earn = useCallback(() => {
    setTab("all");
    if (onEarn) setTimeout(() => onEarn(), 80);
  }, [onEarn]);

  // Ctrl/Cmd+K opens the search (draft C).
  useEffect(() => {
    const on = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && rootRef.current?.offsetParent !== null) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  // A refused wishlist toggle (e.g. the list is full) says why instead of silently undoing.
  const wrappedActions = useMemo(() => ({
    ...data.actions,
    toggleWishlist: (item, on) => data.actions.toggleWishlist(item, on).catch((err) => {
      if (err?.message) toast(err.message, { tone: "error" });
    }),
  }), [data.actions, toast]);
  const value = useMemo(() => ({
    me,
    balance,
    data: { ...data, storefront: data.storefront ? { ...data.storefront, slots: markWishlist(data.storefront.slots, data.wishlist) } : null },
    actions: wrappedActions,
    layout,
    width,
    owned,
    inventory,
    // ShopPanel knows the classic slots; the set slots (frame, badge, voice tile, join sound) come from the user.
    equippedIdFor: (category) => equippedIdFor?.(category) ?? me?.[EQUIP_FIELD[category]]?.id ?? null,
    onEquip,
    busyItemId,
    itemName,
    itemLabels,
    setName,
    tab,
    setTab,
    openSet,
    openGift: (target) => setGift(target),
    openShare: (target) => setShare(target),
    focusItemId,
    clearFocus: () => setFocusItemId(null),
    openCheckout: (c) => setCheckout(c),
    cart,
    addToCart,
    removeFromCart,
    clearCart: () => setCart([]),
    toast,
    setPalette,
    onEarn: earn,
  }), [me, balance, data, wrappedActions, layout, width, owned, inventory, equippedIdFor, onEquip, busyItemId, itemName, itemLabels, setName, tab, openSet, cart, addToCart, removeFromCart, toast, earn, focusItemId]);

  const counts = {
    sets: data.sets.length || data.storefront?.featuredSets?.length || null,
    night: data.storefront?.nightMarket?.open ? data.storefront.nightMarket.cards : null,
    wishlist: data.wishlist.length || null,
    gifts: data.gifts.received.filter((g) => !g.openedAt && g.status !== "opened" && g.status !== "recalled").length || null,
    vitrin: data.storefront?.slots.length || null,
  };
  const phone = layout === "phone";
  const cartInfo = cartSummary(cart, balance);
  const onTab = (id) => {
    setTab(id);
    if (id !== "sets") setPalette(null);
  };
  // A new tab (or another set) starts at its top: the market shares one scroll box with
  // every tab (the Settings pane, .us-main-scroll on phones), so "Seti incele" from the
  // middle of Vitrin used to land in the middle of the set page.
  const firstPage = useRef(true);
  useLayoutEffect(() => {
    if (firstPage.current) {
      firstPage.current = false;
      return;
    }
    const root = rootRef.current;
    if (!root) return;
    let box = root.parentElement;
    while (box && box !== document.body) {
      const oy = getComputedStyle(box).overflowY;
      if ((oy === "auto" || oy === "scroll") && box.scrollHeight > box.clientHeight + 1) break;
      box = box.parentElement;
    }
    const top = root.getBoundingClientRect().top;
    if (box && box !== document.body) {
      // The market is the pane's main content: back to the pane's top (keeps a sticky
      // Settings header from covering the market's own header on phones).
      if (top < box.getBoundingClientRect().top) box.scrollTop = 0;
    } else if (top < 0) {
      window.scrollBy(0, top);
    }
  }, [tab, setKey]);

  const header = (
    <header className="s2-head">
      <div className="s2-title">
        {embedded ? null : <h1>{t("shop2.title")}</h1>}
        {!phone || embedded ? <p>{t("shop2.subtitle")}</p> : null}
      </div>
      {!phone ? (
        <HScroller as="nav" className="s2-tabs" wrapClassName="s2-tabs-hs" role="tablist" aria-label={t("shop2.title")} activeKey={tab}>
          {TABS.map((x) => {
            const Icon = x.icon;
            const on = tab === x.id;
            return (
              <button key={x.id} type="button" role="tab" aria-selected={on} className={on ? "is-on" : ""} onClick={() => onTab(x.id)}>
                <Icon size={15} weight={on ? "fill" : "regular"} />
                <span>{t(`shop2.tabs.${x.id}`)}</span>
                {x.id === "night" && data.storefront?.nightMarket?.open ? <span className="s2-tab-live">{t("shop2.tabs.open")}</span> : counts[x.id] ? <span className={`s2-tab-count${x.id === "gifts" ? " is-red" : ""}`}>{counts[x.id]}</span> : null}
              </button>
            );
          })}
        </HScroller>
      ) : null}
      {!phone ? (
        <button type="button" className="s2-search-btn" onClick={() => setSearchOpen(true)}>
          <Search size={15} />
          <span>{t("shop2.search.placeholder")}</span>
          <kbd>{t("shop2.search.kbd")}</kbd>
        </button>
      ) : null}
      <div className="s2-wallet">
        <Coin size="lg" />
        <b className="s2-num">{formatNumber(balance, locale)}</b>
        {data.storefront?.earnedToday ? <span className="s2-wallet-today">{t("shop2.wallet.today", { n: formatNumber(data.storefront.earnedToday, locale) })}</span> : null}
        {!phone ? (
          <button type="button" className="s2-earn" onClick={earn}>
            <Plus size={14} weight="bold" />
            {t("shop2.wallet.earn")}
          </button>
        ) : null}
      </div>
    </header>
  );

  const phoneTabs = phone ? (
    <HScroller as="nav" className="s2-ptabs" wrapClassName="s2-ptabs-hs" role="tablist" aria-label={t("shop2.title")} activeKey={tab}>
      {TABS.map((x) => (
        <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} className={tab === x.id ? "is-on" : ""} onClick={() => onTab(x.id)}>
          {t(`shop2.tabs.${x.id}Short`)}
          {counts[x.id] && x.id !== "night" ? <span className="s2-tab-count">{counts[x.id]}</span> : null}
        </button>
      ))}
    </HScroller>
  ) : null;

  let body;
  if (data.state === "loading" && tab !== "all" && tab !== "inventory") {
    body = <div className="s2-skeleton" aria-busy="true"><i /><i /><i /><i /></div>;
  } else if (tab === "vitrin") body = data.state === "offline" || data.state === "error" ? <Offline onRetry={data.actions.reload} onAll={() => onTab("all")} /> : <Shop2Vitrin />;
  else if (tab === "sets") body = <Shop2Sets setKey={setKey} onSetKey={setSetKey} />;
  else if (tab === "night") body = phone ? null : <Shop2Night />;
  else if (tab === "gifts") body = phone ? null : <Shop2Gifts />;
  else if (tab === "wishlist") body = <Shop2Wishlist />;
  else if (tab === "inventory") body = <Shop2Inventory />;
  else body = <div className="s2-all">{earnSlot}{allProducts}</div>;

  return (
    <Shop2Ctx.Provider value={value}>
      <div
        ref={rootRef}
        className={`s2-root is-${layout}${embedded ? " is-embedded" : ""}${palette ? " has-palette" : ""}`}
        style={palette ? paletteVars(palette) : undefined}
        data-tab={tab}
      >
        {header}
        {phone ? (tab !== "sets" ? <PhoneChips onTab={onTab} tab={tab} /> : null) : tab === "vitrin" ? <SummaryTiles onTab={onTab} /> : null}
        {phoneTabs}
        <div className="s2-body">{body}</div>
        {cart.length && (tab === "vitrin" || tab === "wishlist") ? (
          <div className="s2-cartbar" role="region" aria-label={t("shop2.cart.title")}>
            <Package size={18} />
            <span className="s2-cartbar-text">
              <b>{t("shop2.cart.count", { n: cart.length })}</b>
              <small>{cart.map((c) => itemName(c.item)).join(", ")}</small>
            </span>
            <span className="s2-price is-md"><Coin /><b className="s2-num"><Num value={cartInfo.total} /></b></span>
            <button type="button" className="s2-btn is-ghost is-sm" onClick={() => setCart([])}>{t("shop2.cart.clear")}</button>
            <button type="button" className="s2-btn is-primary" disabled={!cartInfo.affordable} onClick={() => setCheckout({ kind: "cart", items: cart })}>{t("shop2.cart.pay")}</button>
          </div>
        ) : null}
        {phone && tab === "night" ? (
          <Layer kind="full" onClose={() => onTab("vitrin")} label={t("shop2.night.title")} className="s2-full s2-night-full">
            <Shop2Night onClose={() => onTab("vitrin")} />
          </Layer>
        ) : null}
        {phone && tab === "gifts" ? (
          <Layer kind="full" onClose={() => onTab("vitrin")} label={t("shop2.gifts.title")} className="s2-full">
            <Shop2Gifts onClose={() => onTab("vitrin")} />
          </Layer>
        ) : null}
        {gift ? (
          <Layer
            kind={phone ? "full" : "drawer"}
            onClose={() => setGift(null)}
            label={t("shop2.gifts.giftIt")}
            width={phone ? undefined : 852}
            className={phone ? "s2-full" : "s2-gift-drawer"}
          >
            <GiftComposer target={gift} variant="drawer" onDone={() => setGift(null)} onClose={() => setGift(null)} />
          </Layer>
        ) : null}
        {checkout ? <Shop2Checkout checkout={checkout} onClose={() => setCheckout(null)} /> : null}
        {searchOpen ? <Shop2Search onClose={() => setSearchOpen(false)} /> : null}
        {share ? <Shop2Share target={share} onClose={() => setShare(null)} /> : null}
        <Toasts toasts={toasts} phone={phone} onDismiss={(id) => setToasts((l) => l.filter((x) => x.id !== id))} />
      </div>
    </Shop2Ctx.Provider>
  );
}

function PhoneChips({ onTab, tab }) {
  const { t, locale } = useLocale();
  const s2 = useS2();
  const sf = s2.data.storefront;
  const nm = sf?.nightMarket;
  return (
    <HScroller className="s2-pchips" wrapClassName="s2-pchips-hs" arrows={false}>
      {sf?.earnedToday ? (
        <div className="s2-pchip">
          <small>{t("shop2.tiles.earned")}</small>
          <b className="s2-num">{formatNumber(sf.earnedToday, locale)} <small>/ {formatNumber(sf.earnCap, locale)}</small></b>
        </div>
      ) : null}
      {tab !== "vitrin" ? (
        <div className="s2-pchip">
          <small>{t("shop2.tiles.nextShort")}</small>
          <RollingClock target={sf?.resetsAt} />
        </div>
      ) : null}
      {nm?.open ? (
        <button type="button" className="s2-pchip is-night" onClick={() => onTab("night")}>
          <small>{t("shop2.tiles.night")}</small>
          <RollingClock target={nm.closesAt} urgentMs={SHOP2_NIGHT_URGENT_MS} />
        </button>
      ) : null}
      <div className="s2-pchip">
        <small>{t("shop2.tiles.refresh")}</small>
        <b>{t("shop2.tiles.refreshLeft", { n: sf ? sf.refresh.left : 0 })}</b>
      </div>
    </HScroller>
  );
}

function Offline({ onRetry, onAll }) {
  const { t } = useLocale();
  return (
    <div className="s2-empty">
      <Store size={28} />
      <h3>{t("shop2.offline.title")}</h3>
      <p>{t("shop2.offline.body")}</p>
      <div className="s2-row">
        <button type="button" className="s2-btn" onClick={onRetry}><RefreshCw size={15} />{t("shop2.common.retry")}</button>
        <button type="button" className="s2-btn is-primary" onClick={onAll}>{t("shop2.offline.all")}</button>
      </div>
    </div>
  );
}
