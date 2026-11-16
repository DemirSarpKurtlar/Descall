// Envanter (new collection by category, saved looks, and "Eski koleksiyon": retired items the
// user still owns, still wearable) and İstek listesi (wishlist with storefront matches).
import { useMemo } from "react";
import { useLocale } from "../../context/LocaleContext";
import { isShop2Item, SET_PIECE_ORDER } from "../../lib/shop2Logic.js";
import { isRetiredShopItem } from "../../lib/shopItemI18n.js";
import { useS2 } from "./Shop2Context.js";
import { Chip, Price } from "./Shop2Bits.jsx";
import Shop2Art from "./Shop2Art.jsx";
import { applyOutfit } from "./Shop2Sets.jsx";
import { Archive, Bell, Bookmark, Cart, Gift, Heart, Package, Share2, Shirt } from "./shop2Icons.jsx";

const sameId = (a, b) => a != null && b != null && String(a) === String(b);
const ORDER = [...SET_PIECE_ORDER, "name_effect", "profile_aura", "presence_flare", "typing_flare", "reaction_burst", "call_overlay", "theme", "countries"];

function Tile({ item, retired }) {
  const { t } = useLocale();
  const s2 = useS2();
  const on = sameId(s2.equippedIdFor(item.category), item.id);
  const busy = sameId(s2.busyItemId, item.id);
  return (
    <div className={`s2-inv-tile${on ? " is-on" : ""}${retired ? " is-retired" : ""}`}>
      <Shop2Art item={item} size="tile" me={s2.me} />
      <span className="s2-inv-t">
        <b>{s2.itemName(item)}</b>
        <small>{t(`shop2.cat.${item.category}`)}</small>
      </span>
      {/* "Arkadaşlarına göster": a Market 2.0 item you own goes to friends as a look card. */}
      {!retired && isShop2Item(item) ? (
        <button type="button" className="s2-ibtn is-sm" onClick={() => s2.openShare({ itemId: item.id })} aria-label={t("shop2.share.title")} title={t("shop2.share.title")}><Share2 size={15} /></button>
      ) : null}
      <button type="button" className={`s2-btn is-sm${on ? "" : " is-primary"}`} disabled={busy} onClick={() => s2.onEquip?.(item, on)}>
        {on ? t("shop2.common.unequip") : t("shop2.common.equip")}
      </button>
    </div>
  );
}

export default function Shop2Inventory() {
  const { t } = useLocale();
  const s2 = useS2();
  const { current, retired } = useMemo(() => {
    const cur = new Map();
    const old = [];
    for (const row of s2.inventory) {
      const item = row?.item;
      if (!item) continue;
      // Retired = no longer sold (old catalog rows and recalled s2 rows); owners keep them.
      if (isRetiredShopItem(item) || (!isShop2Item(item) && item.category !== "countries")) old.push(item);
      else {
        if (!cur.has(item.category)) cur.set(item.category, []);
        cur.get(item.category).push(item);
      }
    }
    const groups = [...cur.entries()].sort((a, b) => {
      const ia = ORDER.indexOf(a[0]);
      const ib = ORDER.indexOf(b[0]);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    return { current: groups, retired: old };
  }, [s2.inventory]);
  const outfits = s2.data.outfits;
  const newCount = current.reduce((n, [, l]) => n + l.filter(isShop2Item).length, 0);
  if (!current.length && !retired.length) {
    return (
      <div className="s2-empty">
        <Package size={28} />
        <h3>{t("shop2.inv.emptyTitle")}</h3>
        <p>{t("shop2.inv.emptyBody")}</p>
        <button type="button" className="s2-btn is-primary" onClick={() => s2.setTab("vitrin")}>{t("shop2.inv.browse")}</button>
      </div>
    );
  }
  return (
    <div className="s2-inv">
      <div className="s2-sech">
        <h2>{t("shop2.inv.title")}</h2>
        <Chip>{t("shop2.inv.count", { n: newCount })}</Chip>
      </div>
      {outfits.length ? (
        <section className="s2-inv-group">
          <h3 className="s2-eyebrow"><Bookmark size={13} />{t("shop2.kasa.savedLooks")}</h3>
          <div className="s2-chips-wrap">
            {outfits.map((o) => (
              <button key={o.id} type="button" className="s2-chip is-btn" onClick={() => applyOutfit(s2, o, t)}>
                <Shirt size={12} />{o.auto ? t("shop2.kasa.previousLook") : o.name}
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {current.map(([category, list]) => (
        <section key={category} className="s2-inv-group">
          <h3 className="s2-eyebrow">{t(`shop2.cat.${category}`)} <span className="s2-count">{list.length}</span></h3>
          <div className="s2-inv-grid">{list.map((it) => <Tile key={it.id} item={it} />)}</div>
        </section>
      ))}
      {retired.length ? (
        <section className="s2-inv-group is-retired">
          <h3 className="s2-eyebrow"><Archive size={13} />{t("shopVoice.legacyCollection")} <span className="s2-count">{retired.length}</span></h3>
          <p className="s2-muted">{t("shop2.inv.legacyBody")}</p>
          <div className="s2-inv-grid">{retired.map((it) => <Tile key={it.id} item={it} retired />)}</div>
        </section>
      ) : null}
    </div>
  );
}

export function Shop2Wishlist() {
  const { t } = useLocale();
  const s2 = useS2();
  const slots = s2.data.storefront?.slots || [];
  const list = s2.data.wishlist;
  if (!list.length) {
    return (
      <div className="s2-empty">
        <Heart size={28} />
        <h3>{t("shop2.wishlist.emptyTitle")}</h3>
        <p>{t("shop2.wishlist.emptyBody")}</p>
      </div>
    );
  }
  return (
    <div className="s2-wish">
      <div className="s2-sech">
        <h2>{t("shop2.wishlist.title")}</h2>
        <Chip icon={Bell}>{t("shop2.wishlist.notify")}</Chip>
      </div>
      <div className="s2-wish-grid">
        {list.map((it) => {
          const slot = slots.find((s) => sameId(s.item.id, it.id));
          const owned = s2.owned.has(it.id);
          return (
            <div key={it.id} className={`s2-wish-card${slot ? " is-match" : ""}`}>
              <div className="s2-wish-art"><Shop2Art item={it} size="card" me={s2.me} sample={s2.me?.displayName} /></div>
              <div className="s2-wish-body">
                {slot ? <Chip tone="green">{t("shop2.wishlist.inToday")}</Chip> : <Chip>{t("shop2.wishlist.waiting")}</Chip>}
                <b>{s2.itemName(it)}</b>
                <small>{t(`shop2.cat.${it.category}`)} · {t(`shop2.rarity.${it.rarity || "common"}`)}</small>
                <div className="s2-row">
                  {owned ? <Chip tone="green">{t("shop2.common.owned")}</Chip> : <Price value={slot?.price ?? it.price_descoin} />}
                  <span className="s2-row-r">
                    {slot && !owned ? <button type="button" className="s2-ibtn is-sm" onClick={() => s2.addToCart(it, slot.price)} aria-label={t("shop2.cart.add")}><Cart size={15} /></button> : null}
                    <button type="button" className="s2-ibtn is-sm" onClick={() => s2.openGift({ item: it, price: slot?.price ?? it.price_descoin })} aria-label={t("shop2.gifts.giftIt")}><Gift size={15} /></button>
                    <button type="button" className="s2-ibtn is-sm is-on" onClick={() => s2.actions.toggleWishlist(it, false)} aria-label={t("shop2.wishlist.remove")}><Heart size={15} weight="fill" /></button>
                  </span>
                </div>
                {slot && !owned ? <button type="button" className="s2-btn is-primary is-sm is-wide" onClick={() => s2.openCheckout({ kind: "item", item: it, price: slot.price })}>{t("shop2.card.buy")}</button> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
