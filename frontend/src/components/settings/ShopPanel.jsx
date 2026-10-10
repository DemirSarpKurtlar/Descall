import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Award,
  CheckCircle2,
  CircleDot,
  Coins,
  Ellipsis,
  Flame,
  Image,
  MessageSquare,
  Palette,
  Phone,
  Sparkles,
  Sun,
  Tag,
  Type,
  Wallpaper,
  Zap,
} from "lucide-react";
import { ShopBadgeIcon, ShopTitleTag } from "../../lib/shopIcons";
import RippleButton from "../ui/RippleButton";
import {
  getShopCatalog,
  getShopInventory,
  purchaseShopItem,
  equipShopItem,
  getDesCoinDaily,
  claimDesCoinDaily,
} from "../../api/shop";
import { useLocale, useT } from "../../context/LocaleContext";
import { useMobile } from "../../hooks/useMobile";
import { useGlassShell } from "../layout/glass/GlassShell";
import InviteCard from "../friends/InviteCard";
import { ShopGridSkeleton, SkeletonImage } from "../ui/Skeleton";
import ShopProfilePreview from "./ShopProfilePreview";

/** Short tab labels — same pattern as admin top nav. */
const CATEGORY_TABS = [
  { id: "banner", label: "Banners", icon: Image },
  { id: "avatar_frame", label: "Frames", icon: CircleDot },
  { id: "profile_background", label: "Backgrounds", icon: Wallpaper },
  { id: "theme", label: "Themes", icon: Palette },
  { id: "profile_badge", label: "Badges", icon: Award },
  { id: "profile_title", label: "Titles", icon: Tag },
  { id: "name_effect", label: "Name Effects", icon: Type },
  { id: "avatar_effect", label: "Avatar Effects", icon: Sparkles },
  { id: "chat_bubble", label: "Bubbles", icon: MessageSquare },
  { id: "presence_flare", label: "Presence", icon: CircleDot },
  { id: "profile_aura", label: "Auras", icon: Sun },
  { id: "typing_flare", label: "Typing", icon: Ellipsis },
  { id: "reaction_burst", label: "Reactions", icon: Flame },
  { id: "call_overlay", label: "Call Overlays", icon: Phone },
];

const IMAGE_ASSET_CATEGORIES = new Set(["banner", "avatar_frame", "profile_background"]);

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
  profile_title: "Profile Titles",
  name_effect: "Name Effects",
  avatar_effect: "Avatar Effects",
  chat_bubble: "Chat Bubble Skins",
  presence_flare: "Presence Flares",
  profile_aura: "Profile Auras",
  typing_flare: "Typing Flares",
  reaction_burst: "Reaction Bursts",
  call_overlay: "Call Overlays",
};

function ShopItemPreview({ category, item, t }) {
  if (category === "theme") {
    return <div className={`shop-theme-swatch theme-${item.theme_key || "default"}`} />;
  }
  if (category === "profile_badge") {
    return <ShopBadgeIcon item={item} size={44} className="shop-badge-preview" />;
  }
  if (category === "profile_title") {
    return <ShopTitleTag item={item} size={14} className="cosmetic-title-tag shop-title-preview" />;
  }
  if (category === "name_effect") {
    return (
      <span className={`cosmetic-name-effect effect-${item.effect_key} shop-name-effect-preview`}>
        {item.name}
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
  const loadedAssetCategories = useRef(new Set());
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const load = useCallback(async ({ silent = false } = {}) => {
    // Full loading flash unmounts the grid and resets .us-main-scroll to top.
    // Only show it on the first open — refresh after buy/equip stays silent.
    if (!silent) setLoading(true);
    if (!silent) setCatalogError("");
    const [catalogRes, inventoryRes, dailyRes] = await Promise.allSettled([
      getShopCatalog(),
      getShopInventory(),
      getDesCoinDaily(),
    ]);
    if (catalogRes.status === "fulfilled") {
      loadedAssetCategories.current = new Set();
      setItems(catalogRes.value?.items || []);
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
        setNotice(t("Daily DesCoin claimed! +{amount}", { amount: result.credited || 0 }));
      } else if (result?.alreadyClaimed) {
        setNotice(t("Already claimed today — come back tomorrow"));
      }
    } catch (err) {
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
    // The catalog already carries image URLs (backend 2.9.148+) — no second request.
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
  const { isMobile } = useMobile();
  const availableTabs = useMemo(
    () => (glassShell && isMobile
      ? CATEGORY_TABS
      : CATEGORY_TABS.filter((tab) => countsByCategory.has(tab.id))),
    [countsByCategory, glassShell, isMobile]
  );

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

  const handleBuy = async (item) => {
    setBusyItemId(item.id);
    setBusyAction("buy");
    setNotice("");
    try {
      await preserveShopScroll(async () => {
        const result = await purchaseShopItem(item.id);
        if (result?.balance != null) onBalanceChange?.(result.balance);
        setInventory((prev) =>
          prev.some((row) => row.itemId === item.id)
            ? prev
            : [...prev, { itemId: item.id, item }]
        );
        setCelebrateItemId(item.id);
        window.setTimeout(() => {
          setCelebrateItemId((id) => (id === item.id ? null : id));
        }, 1200);
        await load({ silent: true });
      });
    } catch (err) {
      setNotice(err.message || t("Purchase failed. Please try again."));
    } finally {
      setBusyItemId(null);
      setBusyAction(null);
    }
  };

  const handleEquip = async (item, isEquipped) => {
    setBusyItemId(item.id);
    setBusyAction("equip");
    try {
      await preserveShopScroll(async () => {
        await equipShopItem(item.category, isEquipped ? null : item.id);
        await onEquippedChange?.(item.category, isEquipped ? null : item.id);
      });
    } catch (err) {
      setNotice(err.message || t("Could not update equipped item."));
    } finally {
      setBusyItemId(null);
      setBusyAction(null);
    }
  };

  const equippedIdFor = (category) => {
    if (category === "banner") return equipped?.bannerId;
    if (category === "avatar_frame") return equipped?.avatarFrameId;
    if (category === "profile_background") return equipped?.backgroundId;
    if (category === "theme") return equipped?.themeId;
    if (category === "profile_badge") return equipped?.badgeId;
    if (category === "profile_title") return equipped?.titleId;
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

  const activeTabMeta = availableTabs.find((tab) => tab.id === activeCategory) || null;
  const wallet = (
    <div className="shop-wallet-bar">
      <div className="shop-wallet-pill" title={t("Your DesCoin balance")}>
        <Coins size={16} />
        <span>{balance.toLocaleString()}</span>
        <span className="shop-wallet-label">DesCoin</span>
      </div>
      {glassShell && isMobile && activeTabMeta ? (
        <span className="g-shop-count">{t(activeTabMeta.label)} · {visibleItems.length}</span>
      ) : null}
    </div>
  );

  const lead = (
    <div className="shop-lead">
      <p className="shop-panel-intro">
        {t("Earn DesCoin by talking in calls, messaging, and sharing your screen — then spend it on banners, frames, auras, flares, and more.")}
      </p>

      <div className="descoin-retention-row">
        <div className="descoin-daily-card">
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
      ) : items.length === 0 ? (
        <p className="shop-empty-state">{t("No items available yet — check back soon!")}</p>
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
              return (
                <div
                  className={`shop-item-card${celebrateItemId === item.id ? " is-celebrating" : ""}`}
                  data-category={category}
                  key={item.id}
                >
                  {celebrateItemId === item.id && (
                    <div className="shop-celebrate-banner">{t("Purchased — equip it anytime")}</div>
                  )}
                  <div
                    className="shop-item-preview"
                    data-theme-preview={category === "theme" ? item.theme_key : undefined}
                  >
                    <ShopItemPreview category={category} item={item} t={t} />
                  </div>
                  <div className="shop-item-body">
                    <div className="shop-item-name-row">
                      <span className="shop-item-name">{item.name}</span>
                      {item.rarity && (
                        <span className={`shop-rarity-badge shop-rarity-${item.rarity}`}>{item.rarity}</span>
                      )}
                    </div>
                    {item.description && <p className="shop-item-desc">{item.description}</p>}
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
                          onClick={() => handleBuy(item)}
                          disabled={buying || !affordable}
                          title={!affordable ? t("Not enough DesCoin yet") : undefined}
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

  return (
    <motion.div className="shop-panel" initial={false} animate={{ opacity: 1, y: 0 }}>
      <div className="shop-workspace">
        <div className="shop-main">
          {wallet}
          <div className="shop-catalog">
            {lead}
            {catalog}
          </div>
        </div>
        {!loading && availableTabs.length > 0 && (
          <nav className="shop-category-tabs" aria-label={t("Shop categories")}>
            {availableTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={`shop-category-tab ${activeCategory === tab.id ? "active" : ""}`}
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
          </nav>
        )}
        <ShopProfilePreview me={me} t={t} />
      </div>
    </motion.div>
  );
}
