/**
 * Drawer "Canlı önizleme": the cosmetic drawn with the real app classes on a profile card
 * (the shop purchase previews), in a member list row, or as the user shop card with its
 * sale price, stock and countdown. Updates as the admin edits.
 */
import { useMemo } from "react";
import { useLocale } from "../../../context/LocaleContext";
import { PurchasePreview } from "../../shop/purchase/StorePurchasePreviews";
import { purchaseCopy } from "../../../lib/storePurchaseCopy";
import { avatarEffectStyle } from "../../../lib/avatarEffectGeometry.js";
import { profileColorStyle } from "../../../lib/profileColors";
import { CountryBadge } from "../../shop/CountryFlag";
import ShopMerchTags, { ShopPriceTag } from "../../shop/ShopMerchTags.jsx";
import { ItemThumb, RarityPill } from "./ui.jsx";

function MemberRow({ item, me, highlight = false, name }) {
  const c = item?.category;
  const k = item?.effect_key;
  const letter = Array.from(name || "D")[0]?.toLocaleUpperCase("tr");
  return (
    <div className={`sdk-pv-mem${highlight ? " is-hl" : ""}`} style={highlight && c === "profile_color" ? profileColorStyle(item) || undefined : undefined}>
      <span className="sdk-pv-av">
        {me?.avatarUrl && highlight ? <img src={me.avatarUrl} alt="" /> : letter}
        {highlight && c === "avatar_effect" ? <span className={`cosmetic-avatar-effect effect-${k}`} style={avatarEffectStyle(30)} /> : null}
        <span className={`sdk-pv-dot status-badge status-online${highlight && c === "presence_flare" ? ` cosmetic-presence-flare flare-${k}` : ""}`} />
      </span>
      <span className={highlight && c === "name_effect" ? `cosmetic-name-effect effect-${k}` : ""}>{name}</span>
      {highlight && c === "countries" ? <CountryBadge item={item} special={false} /> : null}
    </div>
  );
}

export default function ItemPreview({ item, me, mode, bg }) {
  const { t, locale } = useLocale();
  const c = useMemo(() => purchaseCopy(locale), [locale]);
  const user = me ? { username: me.username, displayName: me.displayName, avatarUrl: me.avatarUrl } : { username: t("shopDesk.previewHandle"), displayName: t("shopDesk.previewName") };
  const supported = ["banner", "avatar_effect", "profile_background", "theme", "name_effect", "chat_bubble", "presence_flare", "profile_aura", "profile_color", "typing_flare", "reaction_burst", "call_overlay"].includes(item?.category);
  const effective = mode === "profile" && !supported ? "card" : mode;
  return (
    <div className={`sdk-pv is-${bg}`} data-testid="sdk-preview">
      {effective === "profile" ? (
        <div className="spm-root sdk-spm">
          <PurchasePreview category={item.category} item={item} me={user} c={c} currentThemeKey="dark" />
        </div>
      ) : effective === "members" ? (
        <div className="sdk-pv-list">
          <div className="sdk-pv-cap">{t("shopDesk.previewOnline")}</div>
          <MemberRow name={t("shopDesk.previewPeople.a")} />
          <MemberRow item={item} me={me} highlight name={user.displayName || user.username} />
          <MemberRow name={t("shopDesk.previewPeople.b")} />
          <MemberRow name={t("shopDesk.previewPeople.c")} />
        </div>
      ) : (
        <div className="sdk-pv-card">
          <div className="shop-item-card sdk-pv-shopcard" data-category={item.category}>
            <div className="shop-item-preview sdk-pv-shopthumb">
              <ItemThumb item={item} size={88} />
              <ShopMerchTags item={item} placement="thumb" />
            </div>
            <div className="shop-item-body">
              <div className="shop-item-name-row">
                <span className="shop-item-name">{item.name || t("shopDesk.untitled")}</span>
                <RarityPill rarity={item.rarity} />
              </div>
              <ShopMerchTags item={item} placement="body" />
              <div className="shop-item-footer">
                <ShopPriceTag item={item} />
                <span className="sdk-pv-buy">{t("shopDesk.previewBuy")}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
