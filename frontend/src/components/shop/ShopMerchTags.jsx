/**
 * User shop merchandising badges (Mağaza remake): discount badge and struck-through list
 * price, limited stock left, sold out, and a live countdown for time-limited items and
 * sales. The admin desk previews the same component, so both always match.
 */
import { useEffect, useState } from "react";
import { useLocale } from "../../context/LocaleContext";
import { Clock, Coins } from "../ui/Icon.jsx";
import { formatNumber } from "../../i18n/format.js";
import { countdown, countdownLabel, endOf, saleOf, stockOf } from "../../lib/shopMerchView.js";

/** One shared 1 s ticker for every countdown on screen. */
const listeners = new Set();
let timer = null;
function subscribe(fn) {
  listeners.add(fn);
  if (!timer) timer = setInterval(() => listeners.forEach((l) => l(Date.now())), 1000);
  return () => {
    listeners.delete(fn);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function useNow(active = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => (active ? subscribe(setNow) : undefined), [active]);
  return now;
}

/** Price with the list price struck through and the discount when on sale. */
export function ShopPriceTag({ item, className = "" }) {
  const { t, locale } = useLocale();
  const s = saleOf(item);
  return (
    <span className={`shop-item-price shm-price${s.onSale ? " is-sale" : ""} ${className}`}>
      <Coins size={13} />
      {s.onSale ? (
        <>
          <s className="shm-list" aria-label={t("shopMerch.listPrice", { n: formatNumber(s.list, locale) })}>
            {formatNumber(s.list, locale)}
          </s>
          <b>{formatNumber(s.price, locale)}</b>
        </>
      ) : (
        formatNumber(s.price, locale)
      )}
    </span>
  );
}

/**
 * placement "thumb": discount badge + sold out ribbon over the preview.
 * placement "body": stock left and countdown chips under the name.
 */
export default function ShopMerchTags({ item, placement = "body" }) {
  const { t, locale } = useLocale();
  const s = saleOf(item);
  const st = stockOf(item);
  const end = endOf(item);
  const now = useNow(placement === "body" && end != null);
  if (placement === "thumb") {
    return (
      <>
        {s.onSale ? <span className="shm-badge">{t("shopMerch.off", { n: s.pct })}</span> : null}
        {st.soldOut ? <span className="shm-soldout">{t("shopMerch.soldOut")}</span> : null}
      </>
    );
  }
  const left = countdown(end, now);
  const label = countdownLabel(left);
  if (!st.limited && !label) return null;
  return (
    <div className="shm-tags">
      {st.limited && !st.soldOut ? (
        <span className={`shm-chip${st.low ? " is-low" : ""}`}>
          {t("shopMerch.stockLeft", { n: formatNumber(st.left, locale) })}
          <span className="shm-meter" aria-hidden="true">
            <i style={{ width: `${Math.max(4, Math.round((st.left / Math.max(1, st.limit)) * 100))}%` }} />
          </span>
        </span>
      ) : null}
      {label && !st.soldOut ? (
        <span className={`shm-chip is-time${left.urgent ? " is-urgent" : ""}`} title={new Date(end).toLocaleString(locale)}>
          <Clock size={12} />
          {t(label.key, label.vars)}
        </span>
      ) : null}
    </div>
  );
}
