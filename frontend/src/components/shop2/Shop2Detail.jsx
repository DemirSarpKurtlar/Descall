// Right-hand live preview panel of the storefront (draft A "Vitrin Masası" + C extras): the
// item on the user's real profile card, phone and member list, where it shows, facts, price
// history, palette match, hold-to-buy, gift and wishlist. Also the set purchase column (C).
import { useMemo, useState } from "react";
import { useLocale } from "../../context/LocaleContext";
import { formatNumber, formatRelativeTime } from "../../i18n/format.js";
import { composeTryOnUser, paletteMatch, priceHistoryStats, setPricing, SHOP2_REFUND_MS } from "../../lib/shop2Logic.js";
import { useS2 } from "./Shop2Context.js";
import { Chip, CloseX, HoldButton, Num, Price, Seg, ShortBy, Sparkline } from "./Shop2Bits.jsx";
import Shop2Art from "./Shop2Art.jsx";
import {
  DeviceFrame,
  S2ChatMessage,
  S2JoinSound,
  S2MemberRow,
  S2OtherMessage,
  S2PeerTile,
  S2ProfileCard,
  S2VoiceTile,
} from "./Shop2Preview.jsx";
import { Check, CheckCircle2, Gift, Heart, Monitor, Shirt, Smartphone, Undo2, Users } from "./shop2Icons.jsx";

const CHAT_CATS = new Set(["chat_bubble", "typing_flare", "reaction_burst"]);
const VOICE_CATS = new Set(["voice_tile", "join_sound", "call_overlay"]);

/** Where an item shows (draft A "Göründüğü yerler"). */
export function placesOf(category) {
  if (CHAT_CATS.has(category)) return ["chat", "dms", "servers"];
  if (VOICE_CATS.has(category)) return ["voice", "calls", "servers"];
  if (category === "theme") return ["app"];
  return ["profile", "members", "friends"];
}

/** Item rendered where it lives: profile card, chat or voice channel. */
export function ItemStage({ item, user, mode = "desktop" }) {
  const { t } = useLocale();
  const c = item?.category;
  if (CHAT_CATS.has(c)) {
    return (
      <div className={`s2-stage-chat is-${mode}`}>
        <S2OtherMessage name={t("shop2.sample.p1")} text={t("shop2.sample.chat1")} time="21:40" tone={1} />
        <S2ChatMessage user={user} text={t("shop2.sample.chat2")} time="21:41" highlight />
      </div>
    );
  }
  if (VOICE_CATS.has(c)) {
    return (
      <div className={`s2-stage-voice is-${mode}`}>
        <S2VoiceTile user={user} size={mode === "phone" ? "md" : "lg"} joined={c === "join_sound" || c === "voice_tile" ? { who: t("shop2.sample.joined", { name: user?.displayName || user?.username || "" }), sound: "" } : null} />
        {mode !== "phone" ? (
          <div className="s2-stage-peers">
            <S2PeerTile name={t("shop2.sample.p2")} tone={2} small />
            <S2PeerTile name={t("shop2.sample.p3")} tone={3} small />
          </div>
        ) : null}
        {c === "join_sound" ? <S2JoinSound item={item} compact /> : null}
      </div>
    );
  }
  if (c === "theme") {
    return <div className="s2-stage-theme"><Shop2Art item={item} size="card" /></div>;
  }
  return <S2ProfileCard user={user} compact={mode === "phone"} />;
}

export function ItemDetail({ slot, onClose }) {
  const { t, locale } = useLocale();
  const s2 = useS2();
  const [mode, setMode] = useState("desktop");
  const item = slot?.item;
  const user = useMemo(() => composeTryOnUser(s2.me, item ? { [item.category]: item } : {}), [s2.me, item]);
  if (!item) return null;
  const name = s2.itemName(item);
  const lab = s2.itemLabels(item);
  const price = slot.price ?? item.price_descoin;
  const owned = Boolean(slot.owned) || s2.owned.has(item.id);
  const equippedId = s2.equippedIdFor(item.category);
  const equippedItem = equippedId != null ? s2.inventory.find((r) => String(r.itemId) === String(equippedId))?.item : null;
  const wished = s2.data.wishlist.some((w) => String(w.id) === String(item.id));
  const set = item.set_key ? s2.data.setDetails[item.set_key] || s2.data.sets.find((x) => x.key === item.set_key) || s2.data.storefront?.featuredSets?.find((x) => x.key === item.set_key) : null;
  const hist = priceHistoryStats(item.priceHistory || item.price_history || [], price);
  const worn = s2.inventory.filter((r) => String(s2.equippedIdFor(r.item?.category)) === String(r.itemId)).map((r) => r.item);
  const wornColors = worn.map((w) => w?.color || w?.palette?.[2] || (w?.set_key && s2.data.sets.find((x) => x.key === w.set_key)?.palette?.[2])).filter(Boolean);
  const match = set?.palette?.length ? paletteMatch(set.palette, wornColors) : null;
  const affordable = s2.balance >= price;
  const isOn = equippedId != null && String(equippedId) === String(item.id);
  const equipBusy = s2.busyItemId != null && String(s2.busyItemId) === String(item.id);
  // ShopPanel reports an equip error in its own notice line, which sits on the "Tümü" tab and is
  // never visible from this sheet: say it here too (onEquip resolves false on failure).
  const equip = async () => {
    if (equipBusy) return;
    const ok = await s2.onEquip?.(item, isOn);
    if (ok === false) s2.toast(t("shop2.errors.equip"), { tone: "error" });
  };
  const buy = async (holdToken) => {
    try {
      const res = await s2.actions.buyItem(item, { holdToken, price });
      s2.openCheckout({ kind: "item", item, price, result: res, phase: "done" });
    } catch (err) {
      s2.toast(err?.message || t("shop2.errors.buy"), { tone: "error" });
    }
  };
  return (
    <div className="s2-detail-inner">
      <div className="s2-detail-head">
        <Chip tone={lab.rarityId === "legendary" || lab.rarityId === "mythic" ? "gold" : lab.rarityId === "epic" ? "violet" : "blue"}>{lab.rarity}</Chip>
        <h3>{name}</h3>
        {onClose ? <CloseX onClick={onClose} label={t("shop2.common.close")} /> : null}
      </div>
      <Seg
        size="sm"
        value={mode}
        onChange={setMode}
        label={t("shop2.detail.previewOn")}
        options={[
          { id: "desktop", label: t("shop2.detail.desktop"), icon: Monitor },
          { id: "phone", label: t("shop2.detail.phone"), icon: Smartphone },
          { id: "members", label: t("shop2.detail.members"), icon: Users },
        ]}
      />
      <div className="s2-detail-stage" key={`${item.id}-${mode}`}>
        {mode === "members" ? (
          <div className="s2-memberlist">
            <div className="s2-memberlist-h">{t("shop2.detail.online", { n: 4 })}</div>
            <S2MemberRow user={user} sub={t("shop2.detail.you")} />
            {[1, 2, 3].map((i) => (
              <div className="s2-member is-dim" key={i}>
                <span className={`s2-letter tone-${i}`}>{t(`shop2.sample.p${i}`).charAt(0)}</span>
                <span className="s2-member-text"><b>{t(`shop2.sample.p${i}`)}</b></span>
              </div>
            ))}
          </div>
        ) : mode === "phone" ? (
          <DeviceFrame mode="phone" className="s2-detail-phone"><ItemStage item={item} user={user} mode="phone" /></DeviceFrame>
        ) : (
          <ItemStage item={item} user={user} mode="desktop" />
        )}
      </div>
      <div className="s2-places">
        <DeviceFrame mode="phone" className="s2-places-phone"><ItemStage item={item} user={user} mode="phone" /></DeviceFrame>
        <div>
          <div className="s2-eyebrow">{t("shop2.detail.places")}</div>
          <ul>
            {placesOf(item.category).map((p) => (
              <li key={p}><Check size={13} />{t(`shop2.places.${p}`)}</li>
            ))}
          </ul>
        </div>
      </div>
      <dl className="s2-kv">
        <dt>{t("shop2.detail.kind")}</dt>
        <dd>{lab.category}</dd>
        <dt>{t("shop2.detail.wearing")}</dt>
        <dd>{equippedItem ? s2.itemName(equippedItem) : t("shop2.detail.none")}</dd>
        <dt>{t("shop2.detail.lastSeen")}</dt>
        <dd>{slot.lastSeenDays != null ? t("shop2.detail.daysAgo", { n: slot.lastSeenDays }) : t("shop2.detail.firstTime")}</dd>
        <dt>{t("shop2.detail.inSet")}</dt>
        <dd>
          {set ? (
            <button type="button" className="s2-link" onClick={() => s2.openSet(set.key)}>{t("shop2.detail.setPieces", { name: s2.setName(set), n: set.pieceCount || 8 })}</button>
          ) : t("shop2.detail.noSet")}
        </dd>
        {/* An owned item costs nothing more: "42.000 -> 41.750" read as if equipping charged it. */}
        {!owned ? (
          <>
            <dt>{t("shop2.detail.balanceAfter")}</dt>
            <dd className="s2-num">{formatNumber(s2.balance, locale)} {"→"} {formatNumber(s2.balance - price, locale)} {t("shop2.common.d")}</dd>
          </>
        ) : null}
      </dl>
      {hist.points.length > 1 ? (
        <div className="s2-hist">
          <div className="s2-eyebrow">{t("shop2.detail.history30")}</div>
          <p>{hist.isLowest ? t("shop2.detail.atLowest") : t("shop2.detail.lowestWas", { n: formatNumber(hist.min, locale) })}</p>
          <Sparkline values={hist.points} tone={hist.isLowest ? "green" : "blue"} />
        </div>
      ) : null}
      {match != null ? (
        <div className="s2-match">
          <span className="s2-match-n s2-num">{t("shop2.detail.match", { n: match })}</span>
          <span className="s2-swatches">{set.palette.map((c) => <i key={c} style={{ background: c }} />)}</span>
        </div>
      ) : null}
      <div className="s2-detail-actions">
        {owned ? (
          <button type="button" className="s2-btn is-primary is-wide" disabled={equipBusy} aria-busy={equipBusy || undefined} onClick={equip}>
            <Shirt size={16} />
            {isOn ? t("shop2.common.unequip") : t("shop2.common.equip")}
          </button>
        ) : affordable ? (
          <HoldButton onConfirm={buy} className="is-wide">
            {t("shop2.detail.buyHold", { n: formatNumber(price, locale) })}
          </HoldButton>
        ) : (
          <ShortBy n={price - s2.balance} compact />
        )}
        <button type="button" className="s2-ibtn" onClick={() => s2.openGift({ item, price })} aria-label={t("shop2.gifts.giftIt")} title={t("shop2.gifts.giftIt")}><Gift size={17} /></button>
        <button type="button" className={`s2-ibtn${wished ? " is-on" : ""}`} onClick={() => s2.actions.toggleWishlist(item, !wished)} aria-pressed={wished} aria-label={t("shop2.wishlist.toggle")} title={t("shop2.wishlist.toggle")}><Heart size={17} weight={wished ? "fill" : "regular"} /></button>
      </div>
      <p className="s2-note"><Undo2 size={14} />{t("shop2.detail.refundNote", { m: SHOP2_REFUND_MS / 60000 })}</p>
      {owned ? <p className="s2-note is-green"><CheckCircle2 size={14} />{t("shop2.detail.owned")}</p> : null}
    </div>
  );
}

/** Set purchase column (draft C "Satın alma"): whole set vs chosen pieces, ladder, history. */
export function SetQuickPanel({ setKey, onClose }) {
  const { t, locale } = useLocale();
  const s2 = useS2();
  const set = s2.data.setDetails[setKey];
  const [mode, setMode] = useState("all");
  // null = nothing picked yet (the first 4 missing pieces are suggested); an empty Set is a
  // real "none chosen" (it used to snap back to the 4 suggestions when the last one was removed).
  const [chosen, setChosen] = useState(null);
  if (!set) return <div className="s2-detail-inner"><div className="s2-skeleton is-panel"><i /><i /></div></div>;
  const missing = set.pieces.filter((p) => !p.owned);
  const sel = chosen || new Set(missing.slice(0, Math.min(4, missing.length)).map((p) => String(p.item.id)));
  const all = setPricing(set);
  const part = setPricing(set, { selectedIds: sel });
  const hist = priceHistoryStats(set.priceHistory, all.yourPrice);
  const total = mode === "all" ? all.yourPrice : part.selectedTotal;
  const nothing = all.complete || (mode === "part" && part.selectedCount === 0);
  const toggle = (id) => {
    const next = new Set(sel);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChosen(next);
    setMode("part");
  };
  return (
    <div className="s2-detail-inner">
      <div className="s2-detail-head">
        <span className="s2-eyebrow">{t("shop2.buy.title")}</span>
        <h3>{s2.setName(set)}</h3>
        {onClose ? <CloseX onClick={onClose} label={t("shop2.common.close")} /> : null}
      </div>
      <label className={`s2-radio${mode === "all" ? " is-on" : ""}`}>
        <input type="radio" name="s2-setmode" checked={mode === "all"} onChange={() => setMode("all")} />
        <span><b>{t("shop2.buy.completeSet")}</b><small>{t("shop2.buy.completeSetSub", { n: all.missingCount })}</small></span>
        <Price value={all.yourPrice} />
      </label>
      <label className={`s2-radio${mode === "part" ? " is-on" : ""}`}>
        <input type="radio" name="s2-setmode" checked={mode === "part"} onChange={() => setMode("part")} />
        <span><b>{t("shop2.buy.chosen", { n: part.selectedCount })}</b><small>{t("shop2.buy.chosenSub", { n: formatNumber(part.selectedExtraVsSet, locale) })}</small></span>
        <Price value={part.selectedTotal} />
      </label>
      <div className="s2-chips-wrap">
        {missing.map((p) => (
          <button key={p.item.id} type="button" className={`s2-piecechip${sel.has(String(p.item.id)) ? " is-on" : ""}`} onClick={() => toggle(String(p.item.id))} aria-pressed={sel.has(String(p.item.id))}>
            <Shop2Art item={p.item} size="chip" me={s2.me} />
            <span>{s2.itemName(p.item)}</span>
          </button>
        ))}
      </div>
      <div className="s2-ladder">
        <span>{t("shop2.buy.sum")}</span><s className="s2-num"><Num value={all.sum} /> {t("shop2.common.d")}</s>
        <span>{t("shop2.buy.setDiscount", { n: all.discountPct })}</span><b className="s2-num">-<Num value={all.discount} /> {t("shop2.common.d")}</b>
        <span className="is-green">{t("shop2.buy.ownedDeducted")}</span><b className="s2-num is-green">-<Num value={all.ownedDeduction} /> {t("shop2.common.d")}</b>
        <span>{t("shop2.buy.balanceAfter")}</span><b className="s2-num"><Num value={s2.balance - total} /> {t("shop2.common.d")}</b>
      </div>
      <div className="s2-detail-actions">
        {all.complete ? (
          <span className="s2-btn is-wide is-done" role="status"><CheckCircle2 size={16} />{t("shop2.kasa.complete")}</span>
        ) : !nothing && s2.balance < total ? (
          <ShortBy n={total - s2.balance} compact />
        ) : (
          <button type="button" className="s2-btn is-primary is-wide" disabled={nothing} onClick={() => s2.openCheckout({ kind: "set", setKey, pieceIds: mode === "all" ? null : [...sel] })}>
            {t("shop2.buy.buyN", { n: formatNumber(total, locale) })}
          </button>
        )}
        <button type="button" className="s2-ibtn" onClick={() => s2.openGift({ setKey })} aria-label={t("shop2.gifts.giftIt")}><Gift size={17} /></button>
      </div>
      {hist.points.length > 1 ? (
        <div className="s2-hist">
          <div className="s2-eyebrow">{t("shop2.detail.history30")}</div>
          <p>{hist.isLowest ? t("shop2.detail.atLowest") : t("shop2.detail.lowestWas", { n: formatNumber(hist.min, locale) })}</p>
          <Sparkline values={hist.points} tone="green" />
        </div>
      ) : null}
      <button type="button" className="s2-btn is-ghost is-wide" onClick={() => s2.openSet(setKey)}>{t("shop2.banner.inspect")}</button>
    </div>
  );
}

/** Relative "3 dk önce" text. */
export function useAgo() {
  const { locale } = useLocale();
  return (at) => (at ? formatRelativeTime(at, locale, { style: "short" }) : "");
}
