/**
 * Market 2.0, user side (owner pick 15 Nov 2026: drafts C + A of the storefront and the sets,
 * A as the base). Header with tabs and DesCoin, five live summary tiles, then the tab:
 * Vitrin (personal storefront + live preview panel), Setler (try-on cabin / stage + kasa),
 * Gece pazarı, İstek listesi, Hediyeler, Envanter (with "Eski koleksiyon") and Tüm ürünler
 * (the classic category catalog, passed in by ShopPanel). Phone: bottom sheets, full-screen
 * night market and gifts. Data: hooks/useShop2.js -> lib/shop2Api.js.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../../context/LocaleContext";
import { formatNumber } from "../../i18n/format.js";
import useShop2 from "../../hooks/useShop2.js";
import { cartSummary, dayProgress, EQUIP_FIELD, markWishlist, paletteVars, SHOP2_NIGHT_URGENT_MS, setProgress } from "../../lib/shop2Logic.js";
import { Shop2Ctx, useS2 } from "./Shop2Context.js";
import { Coin, Layer, Num, RollingClock, useNow } from "./Shop2Bits.jsx";
import { useItemLabels, useItemName } from "./Shop2Art.jsx";
import Shop2Vitrin from "./Shop2Vitrin.jsx";
import Shop2Sets from "./Shop2Sets.jsx";
import Shop2Night from "./Shop2Night.jsx";
import Shop2Gifts, { GiftComposer } from "./Shop2Gifts.jsx";
import Shop2Checkout from "./Shop2Checkout.jsx";
import Shop2Inventory, { Shop2Wishlist } from "./Shop2Inventory.jsx";
import Shop2Search from "./Shop2Search.jsx";
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
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    setW(Math.round(el.getBoundingClientRect().width) || w);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { width: w, layout: w < 640 ? "phone" : w < 1080 ? "tablet" : "desktop" };
}

function Toasts({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return (
    <div className="s2-toasts" role="status" aria-live="polite">
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
    </div>
  );
}

function SummaryTiles({ onTab }) {
  const { t, locale } = useLocale();
  const s2 = useS2();
  const { storefront, sets, gifts } = s2.data;
  const now = useNow(true);
  const sf = storefront;
  const nm = sf?.nightMarket;
  const featured = sf?.featuredSets?.[0] || sets[0] || null;
  const prog = featured ? setProgress(featured) : null;
  const deduction = featured && featured.yourPrice != null ? Math.max(0, featured.setPrice - featured.yourPrice) : 0;
  const pending = gifts.received.filter((g) => !g.openedAt && g.status !== "opened" && g.status !== "recalled");
  const firstGift = pending[0] || null;
  const refreshLeft = sf ? Math.max(0, sf.refresh.perDay - sf.refresh.usedToday) : 0;
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
          <span className="s2-num">{refreshLeft} / {sf?.refresh.perDay || 1}</span>
          <span className="s2-chip is-blue">{t("shop2.tiles.today")}</span>
        </div>
        <small>{sf?.refresh.freeFromStreak ? t("shop2.tiles.refreshFree") : t("shop2.tiles.refreshSub", { price: formatNumber(sf?.refresh.price ?? 120, locale) })}</small>
      </div>
      <button type="button" className={`s2-tile is-night${nm?.open ? " is-open" : ""}`} onClick={() => onTab("night")}>
        <div className="s2-tile-k"><Moon size={13} />{t("shop2.tiles.night")}</div>
        <div className="s2-tile-v">
          {nm?.open ? <RollingClock target={nm.closesAt} urgentMs={SHOP2_NIGHT_URGENT_MS} className="s2-tile-mid" /> : <span className="s2-tile-mid s2-num">{nm?.opensAt ? new Date(nm.opensAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : "--:--"}</span>}
          <span className="s2-enter">{nm?.open ? t("shop2.tiles.enter") : t("shop2.tiles.soon")}<ChevronRight size={14} /></span>
        </div>
        <small>{nm?.open ? t("shop2.tiles.nightOpen", { cards: nm.cards, flips: nm.flipsLeft }) : t("shop2.tiles.nightClosed")}</small>
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
  const { layout, width } = useLayout(rootRef);
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

  const addToCart = useCallback((item, price) => {
    setCart((c) => (c.some((x) => String(x.item.id) === String(item.id)) ? c : [...c, { item, price: price ?? item.price_descoin }]));
  }, []);
  const removeFromCart = useCallback((item) => setCart((c) => c.filter((x) => String(x.item.id) !== String(item.id))), []);

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

  const value = useMemo(() => ({
    me,
    balance,
    data: { ...data, storefront: data.storefront ? { ...data.storefront, slots: markWishlist(data.storefront.slots, data.wishlist) } : null },
    actions: data.actions,
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
    openCheckout: (c) => setCheckout(c),
    cart,
    addToCart,
    removeFromCart,
    clearCart: () => setCart([]),
    toast,
    setPalette,
    onEarn,
  }), [me, balance, data, layout, width, owned, inventory, equippedIdFor, onEquip, busyItemId, itemName, itemLabels, setName, tab, openSet, cart, addToCart, removeFromCart, toast, onEarn]);

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

  const header = (
    <header className="s2-head">
      <div className="s2-title">
        <h1>{t("shop2.title")}</h1>
        {!phone ? <p>{t("shop2.subtitle")}</p> : null}
      </div>
      {!phone ? (
        <button type="button" className="s2-search-btn" onClick={() => setSearchOpen(true)}>
          <span>{t("shop2.search.placeholder")}</span>
          <kbd>{t("shop2.search.kbd")}</kbd>
        </button>
      ) : null}
      {!phone ? (
        <nav className="s2-tabs" role="tablist" aria-label={t("shop2.title")}>
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
        </nav>
      ) : null}
      <div className="s2-wallet">
        <Coin size="lg" />
        <b className="s2-num">{formatNumber(balance, locale)}</b>
        {data.storefront?.earnedToday ? <span className="s2-wallet-today">{t("shop2.wallet.today", { n: formatNumber(data.storefront.earnedToday, locale) })}</span> : null}
        {!phone ? (
          <button type="button" className="s2-earn" onClick={() => (onEarn ? onEarn() : onTab("all"))}>
            <Plus size={14} weight="bold" />
            {t("shop2.wallet.earn")}
          </button>
        ) : null}
      </div>
    </header>
  );

  const phoneTabs = phone ? (
    <nav className="s2-ptabs" role="tablist" aria-label={t("shop2.title")}>
      {TABS.map((x) => (
        <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} className={tab === x.id ? "is-on" : ""} onClick={() => onTab(x.id)}>
          {t(`shop2.tabs.${x.id}Short`)}
          {counts[x.id] && x.id !== "night" ? <span className="s2-tab-count">{counts[x.id]}</span> : null}
        </button>
      ))}
    </nav>
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
        className={`s2-root is-${layout}${palette ? " has-palette" : ""}`}
        style={palette ? paletteVars(palette) : undefined}
        data-tab={tab}
      >
        {header}
        {phone ? <PhoneChips onTab={onTab} /> : tab === "vitrin" ? <SummaryTiles onTab={onTab} /> : null}
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
        <Toasts toasts={toasts} onDismiss={(id) => setToasts((l) => l.filter((x) => x.id !== id))} />
      </div>
    </Shop2Ctx.Provider>
  );
}

function PhoneChips({ onTab }) {
  const { t, locale } = useLocale();
  const s2 = useS2();
  const sf = s2.data.storefront;
  const nm = sf?.nightMarket;
  return (
    <div className="s2-pchips">
      <div className="s2-pchip">
        <small>{t("shop2.tiles.wallet")}</small>
        <span className="s2-price is-md"><Coin /><b className="s2-num">{formatNumber(s2.balance, locale)}</b></span>
      </div>
      <div className="s2-pchip">
        <small>{t("shop2.tiles.nextShort")}</small>
        <RollingClock target={sf?.resetsAt} />
      </div>
      {nm?.open ? (
        <button type="button" className="s2-pchip is-night" onClick={() => onTab("night")}>
          <small>{t("shop2.tiles.night")}</small>
          <RollingClock target={nm.closesAt} urgentMs={SHOP2_NIGHT_URGENT_MS} />
        </button>
      ) : null}
      <div className="s2-pchip">
        <small>{t("shop2.tiles.refresh")}</small>
        <b>{t("shop2.tiles.refreshLeft", { n: sf ? Math.max(0, sf.refresh.perDay - sf.refresh.usedToday) : 0 })}</b>
      </div>
    </div>
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
