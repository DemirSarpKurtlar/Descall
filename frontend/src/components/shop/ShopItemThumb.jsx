/**
 * Small shop item thumbnail drawn with the real cosmetic classes (theme swatch, flag, name
 * effect, avatar ring, bubble, flare, aura, typing dots, reaction burst, card colour, call
 * overlay, banner image). Used by the user shop storefront rails and the admin Mağaza desk.
 */
import { useLocale } from "../../context/LocaleContext";
import { avatarEffectStyle } from "../../lib/avatarEffectGeometry.js";
import { profileColorSwatch } from "../../lib/profileColors";
import ProfileAuraPreview from "./ProfileAuraPreview.jsx";
import ReactionBurstPreview from "./ReactionBurstPreview.jsx";
import CallOverlayPreview from "./CallOverlayPreview.jsx";
import { CountryFlag } from "./CountryFlag";
import { Music } from "../ui/Icon.jsx";

export default function ShopItemThumb({ item, size = 40, className = "" }) {
  const { t } = useLocale();
  if (!item) return <span className={`shm-th ${className}`.trim()} style={{ "--th": `${size}px` }} />;
  const c = item.category;
  const k = item.effect_key;
  let inner = null;
  if (c === "theme") inner = <span className={`shm-th-fill shop-theme-swatch theme-${item.theme_key || "default"}`} />;
  else if (c === "countries") inner = <CountryFlag item={item} size={Math.round(size * 0.55)} />;
  else if (c === "name_effect") inner = <span className={`shm-th-aa cosmetic-name-effect effect-${k}`}>{t("shopMerch.sampleAa")}</span>;
  else if (c === "avatar_effect")
    inner = (
      <span className="shm-th-av">
        <span className="shm-th-av-face" />
        <span className={`cosmetic-avatar-effect effect-${k}`} style={avatarEffectStyle(Math.round(size * 0.55))} />
      </span>
    );
  else if (c === "chat_bubble") inner = <span className={`shm-th-bubble cosmetic-chat-bubble bubble-${k}`} />;
  else if (c === "presence_flare") inner = <span className={`shm-th-dot status-badge status-online cosmetic-presence-flare flare-${k}`} />;
  else if (c === "profile_aura") inner = <ProfileAuraPreview effectKey={k} name={item.name} compact />;
  else if (c === "typing_flare")
    inner = (
      <span className={`shm-th-typing cosmetic-typing-flare typing-${k}`}>
        <i className="typing-dot" />
        <i className="typing-dot" />
        <i className="typing-dot" />
      </span>
    );
  else if (c === "reaction_burst") inner = <ReactionBurstPreview effectKey={k} compact />;
  else if (c === "profile_color") inner = <span className="shm-th-fill" style={{ background: profileColorSwatch(item) || "rgba(255,255,255,.06)" }} />;
  else if (c === "call_overlay") inner = <CallOverlayPreview effectKey={k} name={item.name} compact />;
  else if (c === "sound_pack") inner = <Music size={Math.round(size * 0.42)} />;
  else if (item.preview_url || item.asset_url) inner = <img className="shm-th-img" src={item.preview_url || item.asset_url} alt="" draggable={false} loading="lazy" />;
  return (
    <span className={`shm-th is-${c} ${className}`.trim()} style={{ "--th": `${size}px` }} aria-hidden="true">
      {inner}
    </span>
  );
}
