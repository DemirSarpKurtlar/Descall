// Item art for Market 2.0 cards, rows and piece slots. Uses the real cosmetic renderers
// (ShopItemThumb for the classic categories) and draws the set categories (frame, badge,
// voice tile, join sound) from the item's SVG art.
import { useCallback, useState } from "react";
import { useLocale } from "../../context/LocaleContext";
import { avatarEffectStyle } from "../../lib/avatarEffectGeometry.js";
import { cssUrl } from "../../lib/cssUrl";
import { profileColorClass, profileColorStyle } from "../../lib/profileColors";
import { localizeShopItem } from "../../lib/shopItemI18n.js";
import { localText, rarityOf } from "../../lib/shop2Logic.js";
import ShopItemThumb from "../shop/ShopItemThumb.jsx";
import ProfileAuraPreview from "../shop/ProfileAuraPreview.jsx";
import "../../styles/shop-merch.css";
import { assetSrc, JoinWave } from "./Shop2Preview.jsx";
import { VoiceTileSkin } from "../voice/VoiceCosmetics.jsx";
import { Mic, categoryIcon } from "./shop2Icons.jsx";

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

/** Categories whose piece art fills the whole tile (no centred stage). */
const FULL_BLEED = new Set(["banner", "profile_background", "profile_color", "voice_tile", "join_sound"]);

/** True when the item has nothing the renderers below can draw (no art and no CSS key). */
export function artMissing(item, imgFailed = false) {
  if (!item) return false;
  const c = item.category;
  const img = imgOf(item);
  const k = item.effect_key || "";
  if (img && imgFailed) return true;
  if (c === "banner" || c === "profile_background") return !img;
  if (c === "avatar_frame") return !img && !k;
  if (c === "profile_badge") return !img && !(typeof item.badge_icon === "string" && item.badge_icon.startsWith("data:")) && !k;
  return false;
}

/**
 * size: "card" (storefront card hero), "tile" (64-ish square), "chip" (40), "slot" (piece slot).
 * fit: the piece tiles of a set (hero strip, checkout): the art fills its tile exactly
 *   (absolutely, so it never depends on a % height that WebKit leaves unresolved inside an
 *   aspect-ratio grid item), and the fixed-size renderers are drawn on a 64 px stage that is
 *   scaled to the tile (--s2-k), centred, never cropped.
 * Art that is missing or fails to load shows the type icon + name, never an empty box.
 */
export default function Shop2Art({ item, size = "tile", me = null, sample, fit = false }) {
  const { t } = useLocale();
  const itemName = useItemName();
  const [failed, setFailed] = useState(null);
  if (!item) return <span className={`s2-art is-${size}${fit ? " is-fit" : ""} is-empty`} aria-hidden="true" />;
  const c = item.category;
  const k = item.effect_key || "";
  const img = imgOf(item);
  const onErr = () => setFailed(img);
  if (artMissing(item, failed != null && failed === img)) {
    const Icon = categoryIcon(c);
    const inner = (
      <span className="s2-art-miss">
        <Icon size={size === "card" ? 30 : size === "chip" ? 14 : 20} />
        {size === "chip" ? null : <span className="s2-art-miss-name">{itemName(item) || t(`shop2.cat.${c || "other"}`)}</span>}
      </span>
    );
    return (
      <span className={`s2-art is-${size}${fit ? " is-fit" : ""} is-cat-${c} is-r-${rarityOf(item)} is-missing`} aria-hidden="true">
        {fit ? <span className="s2-art-stage">{inner}</span> : inner}
      </span>
    );
  }
  const px = size === "card" ? 64 : size === "tile" ? 40 : size === "slot" ? (fit ? 46 : 34) : 26;
  let inner;
  if (c === "banner" || c === "profile_background") {
    inner = fit ? (
      // The whole banner, contained, over a blurred cover of itself (a banner is ~3:1; a
      // square tile would crop it).
      <>
        <span className="s2-art-bk" style={{ backgroundImage: cssUrl(img) }} />
        <span className="s2-art-stage is-wide"><img className="s2-art-banner" src={img} alt="" draggable={false} onError={onErr} /></span>
      </>
    ) : <span className="s2-art-fill" style={{ backgroundImage: cssUrl(img) }} />;
  } else if (c === "avatar_frame") {
    inner = (
      <span className="s2-art-frame">
        <span className="s2-art-face"><Letter me={me} /></span>
        {img ? <img src={img} alt="" draggable={false} onError={onErr} /> : <span className={`cosmetic-avatar-frame frame-${k}`} />}
      </span>
    );
  } else if (c === "profile_badge") {
    inner = img || (typeof item.badge_icon === "string" && item.badge_icon.startsWith("data:"))
      ? <img className="s2-art-badge" src={img || item.badge_icon} alt="" draggable={false} onError={onErr} />
      : <span className={`s2-art-badge cosmetic-profile-badge badge-${k}`} />;
  } else if (c === "profile_color") {
    // The card colour itself (.pcolor-surface) with the set name colour on a sample name.
    inner = (
      <span className={`s2-art-pcolor pcolor-surface ${profileColorClass(item)}`.trim()} style={profileColorStyle(item) || undefined}>
        <b className="pcolor-name pcolor-name-bare">{size === "card" ? sample || t("shop2.art.sampleName") : t("shop2.art.sampleAa")}</b>
        {size === "card" ? <i /> : null}
      </span>
    );
  } else if (c === "avatar_effect") {
    // The real effect renderer around a face; the ring needs room, so the face is ~half the tile.
    const face = size === "card" ? 76 : size === "slot" ? (fit ? 34 : 30) : size === "tile" ? 24 : 15;
    inner = (
      <span className="s2-art-effect" style={{ width: face, height: face }}>
        <span className="s2-art-face" style={{ width: face, height: face }}><Letter me={me} /></span>
        <span className={`cosmetic-avatar-effect effect-${k}`} style={avatarEffectStyle(face)} />
      </span>
    );
  } else if (c === "chat_bubble" && size === "card") {
    inner = (
      <span className="s2-art-bubbles">
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
    // A sound has no picture: its own icon tile (an animated wave on the big card).
    const wave = <JoinWave bars={size === "card" ? 13 : 7} playing={size === "card"} />;
    inner = <span className="s2-art-sound">{fit ? <span className="s2-art-stage">{wave}</span> : wave}</span>;
  } else if (c === "profile_aura" && fit) {
    // The mini profile card wearing the aura, straight on the stage (inside the 46 px shop
    // thumb it was cropped and sat off-centre).
    inner = <ProfileAuraPreview effectKey={k} name={item.name} compact />;
  } else if (c === "name_effect" && size === "card") {
    inner = <span className={`s2-art-name cosmetic-name-effect effect-${k}`}><b>{sample || t("shop2.art.sampleName")}</b></span>;
  } else {
    inner = <ShopItemThumb item={item} size={px} />;
  }
  // fit: the fixed-size renderers sit on the scaled 64 px stage; full-bleed ones fill the tile.
  const staged = fit && !FULL_BLEED.has(c) ? <span className="s2-art-stage">{inner}</span> : inner;
  return (
    <span className={`s2-art is-${size}${fit ? " is-fit" : ""} is-cat-${c} is-r-${rarityOf(item)}`} aria-hidden="true">
      {staged}
    </span>
  );
}
