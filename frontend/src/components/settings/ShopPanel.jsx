import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Award,
  CheckCircle2,
  CircleDot,
  Coins,
  Ellipsis,
  Flame,
  Globe,
  Image,
  Package,
  Store,
  MessageSquare,
  Palette,
  Phone,
  Sparkles,
  Sun,
  Type,
  Wallpaper,
  Zap,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { ShopBadgeIcon } from "../../lib/shopIcons";
import CountryShop, { ShopInventoryView } from "../shop/CountryShop";
import RippleButton from "../ui/RippleButton";
import ErrorBoundary from "../ErrorBoundary";
import { hapticError, hapticSuccess } from "../../lib/fluid/haptics";
import {
  getShopCatalog,
  getShopInventory,
  getShopVouchers,
  purchaseShopItem,
  equipShopItem,
  getDesCoinDaily,
  claimDesCoinDaily,
} from "../../api/shop";
import { useLocale, useT } from "../../context/LocaleContext";
import { useMobile } from "../../hooks/useMobile";
import { useGlassShell } from "../layout/glass/GlassShell";
import { useGlassDesktop } from "../../hooks/useGlassDesktop";
import { useShopChipScroll } from "../../hooks/useShopChipScroll";
import InviteCard from "../friends/InviteCard";
import { ShopGridSkeleton, SkeletonImage } from "../ui/Skeleton";
import ShopProfilePreview from "./ShopProfilePreview";
import { GLASS_THEME_SCENE_SKUS } from "../../lib/glassThemeScenes";
import { SHOP_CATEGORY_TABS, visibleShopTabs, visibleShopItems } from "../../lib/shopCategories.js";
import { localizeShopItem } from "../../lib/shopItemI18n.js";
import { usesPurchaseModal } from "../../lib/storePurchaseState.js";
import StorePurchaseModal from "../shop/purchase/StorePurchaseModal";

/** Short tab labels, same pattern as admin top nav. Source: lib/shopCategories.js. */
const CATEGORY_ICONS = {
  banner: Image,
  avatar_effect: Sparkles,
  profile_background: Wallpaper,
  theme: Palette,
  profile_badge: Award,
  countries: Globe,
  name_effect: Type,
  chat_bubble: MessageSquare,
  presence_flare: CircleDot,
  profile_aura: Sun,
  typing_flare: Ellipsis,
  reaction_burst: Flame,
  call_overlay: Phone,
};
const CATEGORY_TABS = SHOP_CATEGORY_TABS.map((tab) => ({ ...tab, icon: CATEGORY_ICONS[tab.id] || null }));

const IMAGE_ASSET_CATEGORIES = new Set(["banner", "profile_background"]);

function shopLoadNotice(err, t) {
  const msg = String(err?.message || "").trim();
  // WebKit appends the host on newer iOS: "Load failed (des-call.onrender.com)".
  const generic =
    !msg ||
    err?.name === "TypeError" ||
    /^Load failed\b/.test(msg) ||
    /^Failed to fetch\b/.test(msg) ||
    msg === "NetworkError when attempting to fetch resource." ||
    msg === "Failed to load shop catalog." ||
    msg === "Failed to load your inventory." ||
    /^Request failed \(\d+\)$/.test(msg);
  return generic ? t("Failed to load") : msg;
}

const CATEGORY_HEADING = {
  banner: "Profile Banners",
  avatar_frame: "Avatar Frames",
  profile_background: "Profile Backgrounds",
  theme: "Premium Themes",
  profile_badge: "Profile Badges",
  countries: "Countries",
  name_effect: "Name Effects",
  avatar_effect: "Avatar Effects",
  chat_bubble: "Chat Bubble Skins",
  presence_flare: "Presence Flares",
  profile_aura: "Profile Auras",
  typing_flare: "Typing Flares",
  reaction_burst: "Reaction Bursts",
  call_overlay: "Call Overlays",
};

function ShopItemPreview({ category, item, t, name }) {
  if (category === "theme") {
    return <div className={`shop-theme-swatch theme-${item.theme_key || "default"}`} />;
  }
  if (category === "profile_badge") {
    return <ShopBadgeIcon item={item} size={44} className="shop-badge-preview" />;
  }
  if (category === "name_effect") {
    return (
      <span className={`cosmetic-name-effect effect-${item.effect_key} shop-name-effect-preview`}>
        {name || item.name}
      </span>
    );
  }
  if (category === "avatar_effect") {
    return (
      <div className="shop-avatar-effect-preview">
        <div className={`cosmetic-avatar-effect effect-${item.effect_key}`} />
        <div className="shop-avatar-effect-dot" />
      </div>
    );
  }
  if (category === "chat_bubble") {
    return (
      <div className={`cosmetic-chat-bubble bubble-${item.effect_key} shop-bubble-preview`}>
        {t("Hey there!")}
      </div>
    );
  }
  if (category === "presence_flare") {
    return (
      <div className="shop-presence-flare-preview">
        <span className="shop-presence-flare-avatar" aria-hidden="true">
          <span className={`status-badge status-online cosmetic-presence-flare flare-${item.effect_key}`} />
        </span>
      </div>
    );
  }
  if (category === "profile_aura") {
    return (
      <div className={`shop-profile-aura-preview cosmetic-profile-aura aura-${item.effect_key}`}>
        <Sparkles size={18} />
      </div>
    );
  }
  if (category === "typing_flare") {
    return (
      <div className={`shop-typing-flare-preview cosmetic-typing-flare typing-${item.effect_key}`}>
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
    );
  }
  if (category === "reaction_burst") {
    return (
      <div className={`shop-reaction-burst-preview cosmetic-reaction-burst burst-${item.effect_key}`}>
        <Flame size={18} />
        <Zap size={14} />
      </div>
    );
  }
  if (category === "call_overlay") {
    return (
      <div className={`shop-call-overlay-preview cosmetic-call-overlay overlay-${item.effect_key}`}>
        <Phone size={18} />
      </div>
    );
  }
  const src = item.preview_url || item.asset_url;
  return (
    <SkeletonImage
      src={src}
      alt={item.name}
      className="shop-item-preview-img"
      fallback={<span className="shop-asset-pending" aria-hidden />}
    />
  );
}

export default function ShopPanel({ equipped, onEquippedChange, balance = 0, me = null, onBalanceChange }) {
  const t = useT();
  const { locale } = useLocale();
  const [items, setItems] = useState([]);
  const [serverRetired, setServerRetired] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyItemId, setBusyItemId] = useState(null);
  const [busyAction, setBusyAction] = useState(null);
  const [celebrateItemId, setCelebrateItemId] = useState(null);
  const [notice, setNotice] = useState("");
  const [activeCategory, setActiveCategory] = useState(null);
  const [daily, setDaily] = useState(null);
  const [claiming, setClaiming] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [catalogGeneration, setCatalogGeneration] = useState(0);
  const [vouchers, setVouchers] = useState({});
  const [retiredTitles, setRetiredTitles] = useState(0);
  const [view, setView] = useState("store");
  // Purchase modal (2.13.1): the item id it is open for, null when closed.
  const [purchaseItemId, setPurchaseItemId] = useState(null);
  const dailyCardRef = useRef(null);
  const inviteRef = useRef(null);
  const loadedAssetCategories = useRef(new Set());
  const itemsRef = useRef(items);
  const buyLockRef = useRef(new Set());
  itemsRef.current = items;

  const load = useCallback(async ({ silent = false } = {}) => {
    // Full loading flash unmounts the grid and resets .us-main-scroll to top.
    // Only show it on the first open, refresh after buy/equip stays silent.
    if (!silent) setLoading(true);
    if (!silent) setCatalogError("");
    const [catalogRes, inventoryRes, dailyRes, vouchersRes] = await Promise.allSettled([
      getShopCatalog(),
      getShopInventory(),
      getDesCoinDaily(),
      getShopVouchers(),
    ]);
    if (vouchersRes.status === "fulfilled") setVouchers(vouchersRes.value?.vouchers || {});
    if (catalogRes.status === "fulfilled") {
      loadedAssetCategories.current = new Set();
      setServerRetired(Array.isArray(catalogRes.value?.retiredCategories) ? catalogRes.value.retiredCategories : []);
      setItems(visibleShopItems(catalogRes.value?.items || [], catalogRes.value?.retiredCategories));
      setCatalogError("");
      setCatalogGeneration((n) => n + 1);
    } else if (!silent) {
      setItems([]);
      setCatalogError(shopLoadNotice(catalogRes.reason, t));
    } else {
      setCatalogError(shopLoadNotice(catalogRes.reason, t));
    }
    if (inventoryRes.status === "fulfilled") {
      setInventory(inventoryRes.value?.inventory || []);
      setRetiredTitles(Number(inventoryRes.value?.retiredTitles) || 0);
    }
    if (dailyRes.status === "fulfilled" && dailyRes.value) {
      setDaily(dailyRes.value);
    }
    if (!silent) setLoading(false);
  }, [t]);

  const handleDailyClaim = async () => {
    if (claiming || daily?.claimedToday) return;
    setClaiming(true);
    setNotice("");
    try {
      const result = await claimDesCoinDaily();
      setDaily(result);
      if (result?.balance != null) onBalanceChange?.(result.balance);
      if (result?.claimed) {
        hapticSuccess();
        setNotice(t("Daily DesCoin claimed! +{amount}", { amount: result.credited || 0 }));
      } else if (result?.alreadyClaimed) {
        setNotice(t("Already claimed today, come back tomorrow"));
      }
    } catch (err) {
      hapticError();
      setNotice(err.message || t("Could not claim daily DesCoin"));
    } finally {
      setClaiming(false);
    }
  };

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!activeCategory || !IMAGE_ASSET_CATEGORIES.has(activeCategory)) return;
    if (loadedAssetCategories.current.has(activeCategory)) return;
    // The catalog already carries image URLs (backend 2.9.148+), no second request.
    const inCategory = itemsRef.current.filter((item) => item.category === activeCategory);
    if (inCategory.length && inCategory.every((item) => item.asset_url || item.preview_url)) {
      loadedAssetCategories.current.add(activeCategory);
      return;
    }
    let cancel = false;
    getShopCatalog({ category: activeCategory, assets: true })
      .then(({ items: withAssets }) => {
        if (cancel) return;
        loadedAssetCategories.current.add(activeCategory);
        const byId = new Map((withAssets || []).map((item) => [item.id, item]));
        setItems((prev) =>
          prev.map((item) => {
            const next = byId.get(item.id);
            if (!next) return item;
            return { ...item, asset_url: next.asset_url, preview_url: next.preview_url };
          })
        );
      })
      .catch((err) => {
        if (cancel) return;
        setCatalogError(shopLoadNotice(err, t));
      });
    return () => {
      cancel = true;
    };
  }, [activeCategory, catalogGeneration, t]);

  const preserveShopScroll = useCallback(async (action) => {
    const scrollers = [".shop-catalog", ".us-main-scroll"]
      .map((sel) => document.querySelector(sel))
      .filter(Boolean);
    const tops = scrollers.map((el) => el.scrollTop);
    try {
      return await action();
    } finally {
      const restore = () => {
        scrollers.forEach((el, i) => {
          el.scrollTop = tops[i];
        });
      };
      restore();
      requestAnimationFrame(restore);
      setTimeout(restore, 0);
      setTimeout(restore, 50);
    }
  }, []);

  const ownedItemIds = useMemo(() => new Set(inventory.map((i) => i.itemId)), [inventory]);

  const countsByCategory = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      map.set(item.category, (map.get(item.category) || 0) + 1);
    }
    return map;
  }, [items]);

  const glassShell = useGlassShell();
  const glassDesktop = useGlassDesktop();
  const { isMobile } = useMobile();
  const availableTabs = useMemo(
    () => visibleShopTabs(CATEGORY_TABS, {
      counts: countsByCategory,
      showEmpty: Boolean(glassShell && isMobile),
      serverRetired,
    }),
    [countsByCategory, glassShell, isMobile, serverRetired]
  );
  const chips = useShopChipScroll({
    activeId: activeCategory,
    onActivate: setActiveCategory,
    ready: !loading && availableTabs.length > 0,
  });

  useEffect(() => {
    if (!availableTabs.length) {
      setActiveCategory(null);
      return;
    }
    if (!activeCategory || !availableTabs.some((tab) => tab.id === activeCategory)) {
      setActiveCategory(availableTabs[0].id);
    }
  }, [availableTabs, activeCategory]);

  const visibleItems = useMemo(
    () => (activeCategory ? items.filter((item) => item.category === activeCategory) : []),
    [items, activeCategory]
  );

  const handleBuy = async (item, { useVoucher = false, equipAfter = false } = {}) => {
    if (!item?.id || buyLockRef.current.has(item.id)) return false;
    let ok = false;
    buyLockRef.current.add(item.id);
    setBusyItemId(item.id);
    setBusyAction("buy");
    setNotice("");
    try {
      await preserveShopScroll(async () => {
        const result = await purchaseShopItem(item.id, { useVoucher });
        if (result?.balance != null) onBalanceChange?.(result.balance);
        if (result?.voucher) {
          setVouchers((prev) => ({ ...prev, [item.category]: Math.max(0, (prev[item.category] || 0) - 1) }));
        }
        ok = true;
        setInventory((prev) =>
          prev.some((row) => row.itemId === item.id)
            ? prev
            : [...prev, { itemId: item.id, item }]
        );
        hapticSuccess();
        setCelebrateItemId(item.id);
        window.setTimeout(() => {
          setCelebrateItemId((id) => (id === item.id ? null : id));
        }, 1200);
        await load({ silent: true });
      });
    } catch (err) {
      if (typeof err.balance === "number") onBalanceChange?.(err.balance);
      if (err.status === 409 && err.code !== "theme_client" && err.code !== "no_voucher") {
        await load({ silent: true });
        return false;
      }
      if (err.code === "no_voucher") setVouchers((prev) => ({ ...prev, [item.category]: 0 }));
      hapticError();
      setNotice(err.message || t("Purchase failed. Please try again."));
    } finally {
      buyLockRef.current.delete(item.id);
      setBusyItemId(null);
      setBusyAction(null);
    }
    if (ok && equipAfter) await handleEquip(item, false);
    return ok;
  };

  const handleEquip = async (item, isEquipped) => {
    setBusyItemId(item.id);
    setBusyAction("equip");
    try {
      await preserveShopScroll(async () => {
        await equipShopItem(item.category, isEquipped ? null : item.id);
        await onEquippedChange?.(item.category, isEquipped ? null : item.id);
        hapticSuccess();
      });
    } catch (err) {
      hapticError();
      setNotice(err.message || t("Could not update equipped item."));
    } finally {
      setBusyItemId(null);
      setBusyAction(null);
    }
  };

  const equippedIdFor = (category) => {
    if (category === "banner") return equipped?.bannerId;
    if (category === "profile_background") return equipped?.backgroundId;
    if (category === "theme") return equipped?.themeId;
    if (category === "profile_badge") return equipped?.badgeId;
    if (category === "countries") return equipped?.countryId;
    if (category === "name_effect") return equipped?.nameEffectId;
    if (category === "avatar_effect") return equipped?.avatarEffectId;
    if (category === "chat_bubble") return equipped?.chatBubbleId;
    if (category === "presence_flare") return equipped?.presenceFlareId;
    if (category === "profile_aura") return equipped?.profileAuraId;
    if (category === "typing_flare") return equipped?.typingFlareId;
    if (category === "reaction_burst") return equipped?.reactionBurstId;
    if (category === "call_overlay") return equipped?.callOverlayId;
    return null;
  };

  const inventoryById = useMemo(() => new Map(inventory.map((row) => [row.itemId, row])), [inventory]);
  const itemsById = useMemo(() => new Map(items.map((row) => [row.id, row])), [items]);
  const purchaseItem = purchaseItemId ? itemsById.get(purchaseItemId) || inventoryById.get(purchaseItemId)?.item || null : null;
  const openPurchase = (item) => {
    if (!item?.id || !usesPurchaseModal(item.category)) return;
    setNotice("");
    setPurchaseItemId(item.id);
  };
  const closePurchase = () => setPurchaseItemId(null);
  // "Ways to earn" in the insufficient state: close, then bring the daily reward card or
  // the invite card into view and focus its button.
  const goEarn = (kind) => {
    setPurchaseItemId(null);
    setView("store");
    window.setTimeout(() => {
      const row = document.querySelector(".shop-lead .descoin-retention-row");
      const target = kind === "invite"
        ? row?.querySelector(":scope > :not(.descoin-daily-card)")
        : dailyCardRef.current || row?.querySelector(".descoin-daily-card");
      if (!target) return;
      const reduce = document.documentElement.getAttribute("data-reduce-motion") === "true"
        || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
      target.classList.add("shop-earn-focus");
      window.setTimeout(() => target.classList.remove("shop-earn-focus"), 1800);
      const btn = target.querySelector("button:not([disabled])");
      btn?.focus({ preventScroll: true });
    }, 260);
  };
  const currentThemeKey = typeof document !== "undefined"
    ? document.documentElement.getAttribute("data-theme") || "dark"
    : "dark";

  const activeTabMeta = availableTabs.find((tab) => tab.id === activeCategory) || null;
  const [chromeSlot, setChromeSlot] = useState(null);
  useLayoutEffect(() => {
    if (!glassShell || !isMobile) {
      setChromeSlot(null);
      return;
    }
    setChromeSlot(document.querySelector(".user-settings.g-shop-open .g-shop-chrome"));
  }, [glassShell, isMobile, activeCategory]);
  const viewSwitch = (
    <div className="cs-seg shop-view-seg" role="tablist" aria-label={t("Shop view")}>
      <button type="button" role="tab" aria-selected={view === "store"} className={view === "store" ? "is-on" : ""} onClick={() => setView("store")}>
          <Store size={13} /> {t("Store")}
        </button>
        <button type="button" role="tab" aria-selected={view === "inventory"} className={view === "inventory" ? "is-on" : ""} onClick={() => setView("inventory")}>
          <Package size={13} /> {t("Inventory")}
          {inventory.length ? <span className="cs-count">{inventory.length}</span> : null}
        </button>
      </div>
  );
  const wallet = (
    <div className="shop-wallet-bar">
      <div className="shop-wallet-pill" title={t("Your DesCoin balance")}>
        <Coins size={16} />
        <span>{balance.toLocaleString()}</span>
        <span className="shop-wallet-label">DesCoin</span>
      </div>
      {chromeSlot ? null : viewSwitch}
      {glassShell && isMobile && activeTabMeta && view === "store" ? (
        <span className="g-shop-count">{t(activeTabMeta.label)} · {visibleItems.length}</span>
      ) : null}
    </div>
  );

  const lead = (
    <div className="shop-lead">
      <p className="shop-panel-intro">
        {t("Earn DesCoin by talking in calls, messaging, and sharing your screen, then spend it on banners, frames, auras, flares, and more.")}
      </p>

      <div className="descoin-retention-row">
        <div className="descoin-daily-card" ref={dailyCardRef} id="shop-daily-reward">
          <div className="descoin-daily-head">
            <Flame size={18} />
            <div>
              <strong>{t("Daily reward")}</strong>
              <span>
                {t("Streak")}: {daily?.streak ?? 0}
                {daily?.claimedToday ? ` · ${t("Claimed")}` : ""}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="descoin-daily-claim"
            disabled={claiming || Boolean(daily?.claimedToday)}
            onClick={handleDailyClaim}
          >
            <Coins size={15} />
            {daily?.claimedToday
              ? t("Come back tomorrow")
              : t("Claim {amount} DesCoin", { amount: daily?.claimAmount || 40 })}
          </button>
          {daily?.goals && (
            <div className="descoin-goals">
              <div className="descoin-goal">
                <span>{t("Talk")}</span>
                <b>{daily.goals.voice.earned}/{daily.goals.voice.cap}</b>
              </div>
              <div className="descoin-goal">
                <span>{glassShell && locale === "tr" ? "Mesajlar" : t("Messages")}</span>
                <b>{daily.goals.message.earned}/{daily.goals.message.cap}</b>
              </div>
              <div className="descoin-goal">
                <span>{glassShell && locale === "tr" ? "Ekran" : t("Screenshare")}</span>
                <b>{daily.goals.screenshare.earned}/{daily.goals.screenshare.cap}</b>
              </div>
            </div>
          )}
        </div>
        {me?.username && <InviteCard username={me.username} compact variant="shop" />}
      </div>

      {notice && <p className="us-inline-notice" style={{ margin: "-6px 0 4px" }}>{notice}</p>}
    </div>
  );

  const catalog = (
    <>
      {catalogError && items.length > 0 && (
        <div className="shop-load-error is-inline">
          <p>{catalogError}</p>
          <RippleButton
            className="btn-secondary sm"
            onClick={() => {
              if (activeCategory) loadedAssetCategories.current.delete(activeCategory);
              setCatalogError("");
              setCatalogGeneration((n) => n + 1);
            }}
          >
            {t("Retry")}
          </RippleButton>
        </div>
      )}

      {loading ? (
        <ShopGridSkeleton count={6} />
      ) : catalogError && items.length === 0 ? (
        <div className="shop-load-error">
          <p>{catalogError}</p>
          <RippleButton className="btn-secondary sm" onClick={() => load()}>
            {t("Retry")}
          </RippleButton>
        </div>
      ) : view === "inventory" ? (
        <ShopInventoryView
          inventory={inventory}
          equippedIdFor={equippedIdFor}
          busyItemId={busyItemId}
          onEquip={handleEquip}
          retiredTitles={retiredTitles}
          categoryLabel={(category) => CATEGORY_HEADING[category] || category}
          onBrowseCountries={() => {
            setView("store");
            setActiveCategory("countries");
          }}
        />
      ) : items.length === 0 ? (
        <p className="shop-empty-state">{t("No items available yet, check back soon!")}</p>
      ) : activeCategory === "countries" ? (
        <div className="shop-category-block">
          <h4>{t("Countries")}</h4>
          <CountryShop
            items={visibleItems}
            ownedItemIds={ownedItemIds}
            equippedId={equippedIdFor("countries")}
            balance={balance}
            vouchers={vouchers.countries || 0}
            me={me}
            busyItemId={busyItemId}
            onBuy={handleBuy}
            onEquip={handleEquip}
            isMobile={isMobile}
          />
        </div>
      ) : (
        <div className="shop-category-block">
          <h4>{t(CATEGORY_HEADING[activeCategory] || activeCategory)}</h4>
          <div className="shop-grid">
            {visibleItems.map((item) => {
              const category = item.category;
              const owned = ownedItemIds.has(item.id);
              const isEquipped = equippedIdFor(category) === item.id;
              const buying = busyItemId === item.id && busyAction === "buy";
              const equipping = busyItemId === item.id && busyAction === "equip";
              const affordable = balance >= (item.price_descoin || 0);
              const label = localizeShopItem(item, locale);
              const modal = usesPurchaseModal(category);
              return (
                <div
                  className={`shop-item-card${celebrateItemId === item.id ? " is-celebrating" : ""}${modal ? " is-openable" : ""}`}
                  data-category={category}
                  data-sku={item.sku || undefined}
                  key={item.id}
                  onClick={modal ? (e) => {
                    if (e.target.closest("button, a")) return;
                    openPurchase(item);
                  } : undefined}
                >
                  {celebrateItemId === item.id && (
                    <div className="shop-celebrate-banner">{t("Purchased, equip it anytime")}</div>
                  )}
                  <div
                    className="shop-item-preview"
                    data-theme-preview={category === "theme" ? item.theme_key : undefined}
                  >
                    {GLASS_THEME_SCENE_SKUS.has(item.sku) ? (
                      <span className="shop-item-new">{t("New")}</span>
                    ) : null}
                    <ShopItemPreview category={category} item={item} t={t} name={label.name} />
                  </div>
                  <div className="shop-item-body">
                    <div className="shop-item-name-row">
                      <span className="shop-item-name">{label.name}</span>
                      {item.rarity && (
                        <span className={`shop-rarity-badge shop-rarity-${item.rarity}`}>{item.rarity}</span>
                      )}
                    </div>
                    {label.description && <p className="shop-item-desc">{label.description}</p>}
                    <div className="shop-item-footer">
                      {owned && !buying ? (
                        <span className="shop-item-owned-pill">
                          <CheckCircle2 size={13} /> {t("Owned")}
                        </span>
                      ) : (
                        <span className="shop-item-price">
                          <Coins size={13} /> {(item.price_descoin || 0).toLocaleString()}
                        </span>
                      )}
                      {owned && !buying ? (
                        <RippleButton
                          className={isEquipped ? "btn-secondary sm" : "btn-primary sm"}
                          onClick={() => handleEquip(item, isEquipped)}
                          disabled={equipping}
                        >
                          {equipping ? t("Applying…") : isEquipped ? t("Unequip") : t("Apply")}
                        </RippleButton>
                      ) : (
                        <RippleButton
                          className="btn-primary sm"
                          data-short={!affordable ? "true" : undefined}
                          onClick={() => (modal ? openPurchase(item) : handleBuy(item))}
                          disabled={buying || (!modal && !affordable)}
                          title={!affordable ? t("Not enough DesCoin yet") : undefined}
                          data-action="open-purchase"
                        >
                          {buying ? t("Buying…") : affordable ? t("Buy") : t("Not enough DesCoin")}
                        </RippleButton>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );

  const categoryTabs = !loading && view === "store" && availableTabs.length > 0 ? (
    <div className="shop-chip-rail">
      <button
        type="button"
        className="shop-chip-arrow is-prev"
        aria-label={t("Previous")}
        hidden={!chips.edges.left}
        onClick={() => chips.scrollByPage(-1)}
      >
        <ChevronLeft size={16} />
      </button>
      <div
        ref={chips.viewportRef}
        className={[
          "shop-chip-viewport",
          "shop-category-tabs",
          glassDesktop ? "is-glass-chips" : "",
          chips.edges.left ? "is-fade-left" : "",
          chips.edges.right ? "is-fade-right" : "",
        ].filter(Boolean).join(" ")}
        role="tablist"
        tabIndex={0}
        aria-label={t("Shop categories")}
        onKeyDown={chips.onKeyDown}
      >
        <div className="shop-chip-track" ref={chips.trackRef}>
          {availableTabs.map((tab) => {
            const Icon = tab.icon;
            const selected = activeCategory === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                data-tab-id={tab.id}
                aria-selected={selected}
                className={`shop-category-tab ${selected ? "active" : ""}`}
                onClick={() => setActiveCategory(tab.id)}
              >
                <span className="shop-category-tab-label">
                  {Icon ? <Icon size={14} /> : null}
                  {t(tab.label)}
                </span>
                <span className="shop-category-tab-count">{countsByCategory.get(tab.id) || 0}</span>
              </button>
            );
          })}
        </div>
      </div>
      <button
        type="button"
        className="shop-chip-arrow is-next"
        aria-label={t("Next")}
        hidden={!chips.edges.right}
        onClick={() => chips.scrollByPage(1)}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  ) : null;

  return (
    <motion.div className="shop-panel" initial={false} animate={{ opacity: 1, y: 0 }}>
      <div className="shop-workspace">
        <div className="shop-main">
          {chromeSlot ? createPortal(wallet, chromeSlot) : wallet}
          <div className="shop-catalog">
            {chromeSlot ? <div className="shop-view-row">{viewSwitch}</div> : null}
            {lead}
            {categoryTabs}
            {/* A broken category (e.g. Ülkeler) shows an inline error with Tekrar dene and
                never takes Settings or the app down with it (2.13.1). */}
            <ErrorBoundary scope="pane" resetKey={`${view}:${activeCategory || ""}`}>
              {catalog}
            </ErrorBoundary>
          </div>
        </div>
        <ShopProfilePreview me={me} t={t} />
      </div>
      <AnimatePresence>
        {purchaseItem ? (
          <StorePurchaseModal
            key={purchaseItem.id}
            item={purchaseItem}
            balance={balance}
            owned={ownedItemIds.has(purchaseItem.id)}
            ownedRow={inventoryById.get(purchaseItem.id) || null}
            isEquipped={equippedIdFor(purchaseItem.category) === purchaseItem.id}
            equippedItem={(() => {
              const id = equippedIdFor(purchaseItem.category);
              return id ? itemsById.get(id) || inventoryById.get(id)?.item || null : null;
            })()}
            me={me}
            isMobile={isMobile}
            locale={locale}
            notice={notice}
            dailyAmount={daily?.claimAmount || 40}
            canInvite={Boolean(me?.username)}
            currentThemeKey={currentThemeKey}
            onClose={closePurchase}
            onBuy={handleBuy}
            onEquip={handleEquip}
            onOpenInventory={() => {
              setPurchaseItemId(null);
              setView("inventory");
            }}
            onEarn={goEarn}
          />
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
