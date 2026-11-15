/**
 * User shop storefront (Mağaza remake): the sections an admin arranges in Yönetici Paneli ›
 * Mağaza › Vitrin, in the same order, each a horizontal rail of cards with the sale price,
 * stock left and countdown. The newest shop update (price drop, new prices) sits on top.
 */
import { useMemo } from "react";
import { useLocale } from "../../context/LocaleContext";
import { CheckCircle2, Clock, TrendingDown } from "../ui/Icon.jsx";
import { localizeShopItem } from "../../lib/shopItemI18n.js";
import { countdown, countdownLabel, latestUpdate, resolveStorefront } from "../../lib/shopMerchView.js";
import ShopItemThumb from "./ShopItemThumb.jsx";
import ShopMerchTags, { ShopPriceTag, useNow } from "./ShopMerchTags.jsx";

function SectionTimer({ section }) {
  const { t } = useLocale();
  const target = section.nextRotationAt || section.endsAt;
  const now = useNow(Boolean(target));
  const parts = countdown(Date.parse(target || ""), now);
  const label = countdownLabel(parts);
  if (!label) return null;
  return (
    <span className={`shm-rail-timer${parts.urgent ? " is-urgent" : ""}`}>
      <Clock size={13} />
      {section.nextRotationAt ? t("shopMerch.rotatesIn", { time: t(label.key, label.vars) }) : t("shopMerch.endsIn", { time: t(label.key, label.vars) })}
    </span>
  );
}

export default function ShopStorefront({ sections, updates, items, ownedItemIds, onOpen }) {
  const { t, locale } = useLocale();
  const resolved = useMemo(() => resolveStorefront(sections, items), [sections, items]);
  const update = useMemo(() => latestUpdate(updates, items), [updates, items]);
  if (!resolved.length && !update) return null;
  return (
    <section className="shm-front" aria-label={t("shopMerch.storefront")}>
      {update ? (
        <div className="shm-update" role="status">
          <TrendingDown size={16} />
          <span>
            {t(update.kind === "price_drop" ? "shopMerch.updateDrop" : "shopMerch.updateChange", {
              names: update.items.slice(0, 3).map((it) => localizeShopItem(it, locale).name).join(", "),
              n: Math.max(0, update.items.length - 3),
            })}
          </span>
        </div>
      ) : null}
      {resolved.map((sec) => (
        <div className="shm-rail" key={sec.id} data-kind={sec.kind}>
          <div className="shm-rail-head">
            <h4>{sec.title}</h4>
            {sec.subtitle ? <span className="shm-rail-sub">{sec.subtitle}</span> : null}
            <SectionTimer section={sec} />
          </div>
          <div className="shm-rail-track" role="list">
            {sec.items.map((item) => {
              const owned = ownedItemIds?.has(item.id);
              const name = localizeShopItem(item, locale).name;
              return (
                <button key={item.id} type="button" role="listitem" className="shm-card" onClick={() => onOpen?.(item)} aria-label={name}>
                  <span className="shm-card-thumb">
                    <ShopItemThumb item={item} size={64} />
                    <ShopMerchTags item={item} placement="thumb" />
                  </span>
                  <span className="shm-card-name">{name}</span>
                  {owned ? (
                    <span className="shm-owned">
                      <CheckCircle2 size={12} />
                      {t("shopMerch.owned")}
                    </span>
                  ) : (
                    <ShopPriceTag item={item} />
                  )}
                  <ShopMerchTags item={item} placement="body" />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
