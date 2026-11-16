// Item art for Market 2.0 cards, rows and piece slots. Uses the real cosmetic renderers
// (ShopItemThumb for the classic categories) and draws the set categories (frame, badge,
// voice tile, join sound) from the item's SVG art.
import { useCallback } from "react";
import { useLocale } from "../../context/LocaleContext";
import { avatarEffectStyle } from "../../lib/avatarEffectGeometry.js";
import { cssUrl } from "../../lib/cssUrl";
import { profileColorClass, profileColorStyle } from "../../lib/profileColors";
import { localizeShopItem } from "../../lib/shopItemI18n.js";
import { localText, rarityOf } from "../../lib/shop2Logic.js";
import ShopItemThumb from "../shop/ShopItemThumb.jsx";
import { assetSrc, JoinWave } from "./Shop2Preview.jsx";
import { VoiceTileSkin } from "../voice/VoiceCosmetics.jsx";
import { Mic } from "./shop2Icons.jsx";

const imgOf = (item) => assetSrc(item);

/** item -> name in the UI language. */
export function useItemName() {
  const { locale } = useLocale();
  return useCallback((item) => {
    if (!item) return "";
    if (item.name && typeof item.name === "object") return localText(item.name, locale);
    if (item.i18n?.name && typeof item.i18n.name === "object") return localText(item.i18n.name, locale);
    try {
      return localizeShopItem(item, locale).name || String(item.name || "");
    } catch {
      return String(item.name || "");
    }
  }, [locale]);
}

/** "Profil afişi · Destansı" labels. */
export function useItemLabels() {
  const { t } = useLocale();
  return useCallback((item) => ({
    category: t(`shop2.cat.${item?.category || "other"}`),
    rarity: t(`shop2.rarity.${rarityOf(item)}`),
    rarityId: rarityOf(item),
  }), [t]);
}

function Letter({ me }) {
  const ch = String(me?.displayName || me?.display_name || me?.username || "D").trim().charAt(0).toLocaleUpperCase();
  return <span className="s2-art-letter">{ch}</span>;
}

/**
 * size: "card" (storefront card hero), "tile" (64-ish square), "chip" (40), "slot" (piece slot).
 */
export default function Shop2Art({ item, size = "tile", me = null, sample }) {
  const { t } = useLocale();
  if (!item) return <span className={`s2-art is-${size} is-empty`} aria-hidden="true" />;
  const c = item.category;
  const k = item.effect_key || "";
  const img = imgOf(item);
  const px = size === "card" ? 64 : size === "tile" ? 40 : size === "slot" ? 34 : 26;
  let inner;
  if (c === "banner" || c === "profile_background") {
    inner = img ? <span className="s2-art-fill" style={{ backgroundImage: cssUrl(img) }} /> : <span className="s2-art-fill is-fallback" />;
  } else if (c === "avatar_frame") {
    inner = (
      <span className="s2-art-frame">
        <span className="s2-art-face"><Letter me={me} /></span>
        {img ? <img src={img} alt="" draggable={false} /> : <span className={`cosmetic-avatar-frame frame-${k}`} />}
      </span>
    );
  } else if (c === "profile_badge") {
    inner = img || (typeof item.badge_icon === "string" && item.badge_icon.startsWith("data:"))
      ? <img className="s2-art-badge" src={img || item.badge_icon} alt="" draggable={false} />
      : <span className={`s2-art-badge cosmetic-profile-badge badge-${k}`} />;
  } else if (c === "profile_color") {
    // The card colour itself (.pcolor-surface) with the set name colour on a sample name.
    inner = (
      <span className={`s2-art-pcolor pcolor-surface ${profileColorClass(item)}`.trim()} style={profileColorStyle(item) || undefined}>
        <b className="pcolor-name">{size === "card" ? sample || t("shop2.art.sampleName") : t("shop2.art.sampleAa")}</b>
        {size === "card" ? <i /> : null}
      </span>
    );
  } else if (c === "avatar_effect" && size === "card") {
    inner = (
      <span className="s2-art-effect">
        <span className="s2-art-face is-lg"><Letter me={me} /></span>
        <span className={`cosmetic-avatar-effect effect-${k}`} style={avatarEffectStyle(76)} />
      </span>
    );
  } else if (c === "chat_bubble" && size === "card") {
    inner = (
      <span className="s2-art-bubbles">
        <span className="s2-art-ghost" />
        <span className={`message-bubble own cosmetic-chat-bubble bubble-${k}`}><span className="message-text">{t("shop2.art.sampleBubble")}</span></span>
      </span>
    );
  } else if (c === "voice_tile") {
    inner = (
      <span className="s2-art-vtile vt2-on">
        <VoiceTileSkin effectKey={k} />
        <span className="s2-art-face"><Letter me={me} /></span>
        {size === "card" ? <span className="s2-art-vtile-name"><Mic size={10} />{t("shop2.preview.you")}</span> : null}
      </span>
    );
  } else if (c === "join_sound") {
    inner = (
      <span className="s2-art-sound">
        <JoinWave bars={size === "card" ? 13 : 7} playing={size === "card"} />
      </span>
    );
  } else if (c === "name_effect" && size === "card") {
    inner = <span className={`s2-art-name cosmetic-name-effect effect-${k}`}><b>{sample || t("shop2.art.sampleName")}</b></span>;
  } else {
    inner = <ShopItemThumb item={item} size={px} />;
  }
  return (
    <span className={`s2-art is-${size} is-cat-${c} is-r-${rarityOf(item)}`} aria-hidden="true">
      {inner}
    </span>
  );
}
