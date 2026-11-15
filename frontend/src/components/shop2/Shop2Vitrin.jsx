// "Vitrin" tab (draft A Vitrin Masası as the base, draft C Mağaza Konsolu mixed in):
// today's 4 personal cards (or the dense console list), lock one card for the refresh,
// refresh confirm with the cart warning, featured set banner, yesterday + wishlist strips,
// 7-day storefront history, action log with undo, and the live preview panel on the right.
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../../context/LocaleContext";
import { formatNumber } from "../../i18n/format.js";
import { lastDays, refreshPlan, setPricing, setProgress, undoLeft, mmss, countdownParts } from "../../lib/shop2Logic.js";
import { useS2 } from "./Shop2Context.js";
import { Chip, Coin, Layer, Num, Price, RollingClock, Seg, useNow } from "./Shop2Bits.jsx";
import Shop2Art from "./Shop2Art.jsx";
import { ItemDetail, SetQuickPanel, useAgo } from "./Shop2Detail.jsx";
import {
  AlertTriangle,
  Cart,
  ChevronRight,
  Clock,
  Gift,
  Heart,
  History,
  LayoutGrid,
  List,
  Lock,
  LockOpen,
  Moon,
  RefreshCw,
  Shirt,
  Star,
  Undo2,
} from "./shop2Icons.jsx";

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

function rarityTone(r) {
  return r === "legendary" || r === "mythic" ? "gold" : r === "epic" ? "violet" : r === "rare" ? "blue" : "muted";
}

// ---------------------------------------------------------------------------
// Refresh confirm (A popover on desktop, bottom sheet on phone; C cart warning).

function RefreshConfirm({ plan, onCancel, onConfirm, onBuyCart, busy, asSheet }) {
  const { t, locale } = useLocale();
  const s2 = useS2();
  const kept = plan.kept[0];
  const body = (
    <div className="s2-refresh">
      <h4>{t("shop2.refresh.title")}</h4>
      <p className="s2-muted">
        {kept
          ? t("shop2.refresh.bodyKept", { n: plan.changingCount, name: s2.itemName(kept) })
          : t("shop2.refresh.body", { n: plan.changingCount })}
      </p>
      <div className="s2-rows">
        <span>{t("shop2.refresh.fee")}</span>
        <b>{plan.price ? <Price value={plan.price} size="sm" /> : t("shop2.refresh.free")}</b>
        <span>{t("shop2.refresh.balance")}</span>
        <b className="s2-num">{formatNumber(s2.balance, locale)} {"→"} {formatNumber(plan.balanceAfter, locale)}</b>
        <span>{t("shop2.refresh.left")}</span>
        <b>{t("shop2.refresh.noMoreToday")}</b>
      </div>
      {plan.cartLosing.length ? (
        <div className="s2-warn">
          <AlertTriangle size={15} />
          <span>{t("shop2.refresh.cartWarn", { names: plan.cartLosing.map((i) => s2.itemName(i)).join(", ") })}</span>
          <button type="button" className="s2-btn is-sm" onClick={onBuyCart}>{t("shop2.refresh.buyCartFirst")}</button>
        </div>
      ) : null}
      <div className="s2-row">
        <button type="button" className="s2-btn is-flex" onClick={onCancel}>{t("shop2.common.cancel")}</button>
        <button type="button" className="s2-btn is-primary is-flex2" disabled={busy || !plan.affordable || !plan.available} onClick={onConfirm}>
          <RefreshCw size={15} />
          {plan.price ? t("shop2.refresh.go", { n: formatNumber(plan.price, locale) }) : t("shop2.refresh.goFree")}
        </button>
      </div>
    </div>
  );
  if (asSheet) {
    return <Layer kind="sheet" onClose={onCancel} label={t("shop2.refresh.title")} className="s2-sheet">{body}</Layer>;
  }
  return <div className="s2-pop" role="dialog" aria-label={t("shop2.refresh.title")}>{body}</div>;
}

// ---------------------------------------------------------------------------
// Card (A) and console row (C).

function Card({ slot, selected, onSelect, index, flipKey }) {
  const { t } = useLocale();
  const s2 = useS2();
  const item = slot.item;
  const lab = s2.itemLabels(item);
  const owned = s2.owned.has(item.id);
  const press = useRef(null);
  const onTouchStart = () => {
    if (s2.layout !== "phone") return;
    press.current = setTimeout(() => {
      press.current = "fired";
      try {
        navigator.vibrate?.(10);
      } catch {
        /* no haptics */
      }
      s2.actions.lock(item.id);
    }, 480);
  };
  const onTouchEnd = (e) => {
    if (press.current === "fired") e.preventDefault();
    if (press.current && press.current !== "fired") clearTimeout(press.current);
    press.current = null;
  };
  return (
    <div
      className={`s2-card is-r-${lab.rarityId}${selected ? " is-selected" : ""}${slot.locked ? " is-locked" : ""}`}
      style={{ "--i": index }}
      data-flip={flipKey}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={s2.itemName(item)}
      onClick={(e) => {
        if (e.target.closest("button")) return;
        onSelect(slot);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.target.closest("button")) onSelect(slot);
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchMove={() => press.current && press.current !== "fired" && clearTimeout(press.current)}
    >
      <div className="s2-card-art">
        <Shop2Art item={item} size="card" me={s2.me} sample={s2.me?.displayName || s2.me?.username} />
        <button
          type="button"
          className={`s2-lock${slot.locked ? " is-on" : ""}`}
          aria-pressed={slot.locked}
          aria-label={slot.locked ? t("shop2.lock.unlock") : t("shop2.lock.lock")}
          title={slot.locked ? t("shop2.lock.unlock") : t("shop2.lock.lock")}
          onClick={() => s2.actions.lock(item.id)}
        >
          {slot.locked ? <Lock size={14} weight="fill" /> : <LockOpen size={14} />}
        </button>
        {slot.wishlisted ? <span className="s2-wishtag"><Heart size={12} weight="fill" />{t("shop2.card.inWishlist")}</span> : null}
        {slot.discountPct > 0 ? <span className="s2-disc s2-num">-%{slot.discountPct}</span> : null}
      </div>
      <div className="s2-card-body">
        <span className={`s2-rar is-${lab.rarityId}`}>{lab.rarity}</span>
        <b className="s2-card-name">{s2.itemName(item)}</b>
        <small>{lab.category}</small>
        <div className="s2-card-foot">
          {owned ? <Chip tone="green">{t("shop2.common.owned")}</Chip> : <Price value={slot.price} old={slot.discountPct ? slot.basePrice : null} size="md" />}
          <button type="button" className="s2-ibtn is-sm" onClick={() => s2.openGift({ item, price: slot.price })} aria-label={t("shop2.gifts.giftIt")} title={t("shop2.gifts.giftIt")}><Gift size={15} /></button>
          {!owned ? (
            <button type="button" className={`s2-ibtn is-sm is-buy${selected ? " is-on" : ""}`} onClick={() => onSelect(slot, true)}>{t("shop2.card.buy")}</button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Row({ slot, selected, onSelect, expanded, onToggle }) {
  const { t, locale } = useLocale();
  const s2 = useS2();
  const item = slot.item;
  const lab = s2.itemLabels(item);
  const inCart = s2.cart.some((c) => sameId(c.item.id, item.id));
  const owned = s2.owned.has(item.id);
  const [swipe, setSwipe] = useState(0);
  const start = useRef(null);
  return (
    <div className={`s2-rowwrap${swipe < -40 ? " is-swiped" : ""}`}>
      <div className="s2-swipe-actions" aria-hidden={swipe > -40}>
        <button type="button" onClick={() => { setSwipe(0); s2.openGift({ item, price: slot.price }); }}><Gift size={16} />{t("shop2.gifts.giftIt")}</button>
        <button type="button" onClick={() => { setSwipe(0); s2.actions.toggleWishlist(item, !slot.wishlisted); }}><Heart size={16} />{t("shop2.wishlist.short")}</button>
      </div>
      <div
        className={`s2-row-item${selected ? " is-selected" : ""}`}
        style={swipe ? { transform: `translateX(${swipe}px)` } : undefined}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={(e) => {
          if (e.target.closest("button")) return;
          if (s2.layout === "phone") onToggle?.(slot);
          else onSelect(slot);
        }}
        onKeyDown={(e) => e.key === "Enter" && !e.target.closest("button") && (s2.layout === "phone" ? onToggle?.(slot) : onSelect(slot))}
        onTouchStart={(e) => {
          start.current = e.touches[0].clientX;
        }}
        onTouchMove={(e) => {
          if (start.current == null) return;
          const dx = e.touches[0].clientX - start.current;
          setSwipe(Math.max(-150, Math.min(0, dx)));
        }}
        onTouchEnd={() => {
          start.current = null;
          setSwipe((x) => (x < -60 ? -150 : 0));
        }}
      >
        <Shop2Art item={item} size="tile" me={s2.me} />
        <span className="s2-row-text">
          <b>
            {s2.itemName(item)}
            {slot.wishlisted ? <Heart size={13} weight="fill" className="s2-heart" /> : null}
            {slot.locked ? <Lock size={12} weight="fill" className="s2-lockmini" /> : null}
          </b>
          <small>{lab.category} · <span className={`s2-rar-t is-${lab.rarityId}`}>{lab.rarity}</span></small>
        </span>
        <span className="s2-row-price">
          {owned ? <Chip tone="green">{t("shop2.common.owned")}</Chip> : <Price value={slot.price} />}
          {slot.discountPct ? <small className="s2-num"><s>{formatNumber(slot.basePrice, locale)}</s> -%{slot.discountPct}</small> : null}
        </span>
        <button type="button" className="s2-ibtn is-sm is-plain" onClick={() => s2.openGift({ item, price: slot.price })} aria-label={t("shop2.gifts.giftIt")}><Gift size={16} /></button>
        <button
          type="button"
          className={`s2-ibtn is-sm is-plain${inCart ? " is-on" : ""}`}
          disabled={owned}
          aria-pressed={inCart}
          onClick={() => (inCart ? s2.removeFromCart(item) : s2.addToCart(item, slot.price))}
          aria-label={inCart ? t("shop2.cart.remove") : t("shop2.cart.add")}
        >
          <Cart size={16} weight={inCart ? "fill" : "regular"} />
        </button>
      </div>
      {expanded ? <RowExpand slot={slot} /> : null}
    </div>
  );
}

/** Phone accordion (C): mini phone preview, facts, buy / gift / cart. */
function RowExpand({ slot }) {
  const { t, locale } = useLocale();
  const s2 = useS2();
  const item = slot.item;
  const set = item.set_key ? s2.data.sets.find((x) => x.key === item.set_key) : null;
  return (
    <div className="s2-rowx">
      <div className="s2-rowx-phone"><Shop2Art item={item} size="card" me={s2.me} sample={s2.me?.displayName} /></div>
      <div className="s2-rowx-facts">
        <p>{slot.lastSeenDays != null ? t("shop2.row.lastSeen", { n: slot.lastSeenDays }) : t("shop2.detail.firstTime")}</p>
        {set ? <p>{t("shop2.row.inSet", { name: s2.setName(set) })}</p> : null}
        <div className="s2-row">
          <button type="button" className="s2-btn is-primary is-flex2" onClick={() => s2.openCheckout({ kind: "item", item, price: slot.price })}>{t("shop2.row.buy", { n: formatNumber(slot.price, locale) })}</button>
          <button type="button" className="s2-ibtn" onClick={() => s2.openGift({ item, price: slot.price })} aria-label={t("shop2.gifts.giftIt")}><Gift size={16} /></button>
          <button type="button" className="s2-ibtn" onClick={() => s2.addToCart(item, slot.price)} aria-label={t("shop2.cart.add")}><Cart size={16} /></button>
        </div>
      </div>
    </div>
  );
}

function SetRow({ set, selected, onSelect }) {
  const { t, locale } = useLocale();
  const s2 = useS2();
  const prog = setProgress(set);
  return (
    <div className={`s2-row-item is-set${selected ? " is-selected" : ""}`} role="button" tabIndex={0} onClick={(e) => !e.target.closest("button") && onSelect(set)} onKeyDown={(e) => e.key === "Enter" && onSelect(set)}>
      <span className="s2-set-thumb" style={{ background: setGradient(set.palette) }} />
      <span className="s2-row-text">
        <b>{s2.setName(set)}</b>
        <small>{t("shop2.sets.piecesOwned", { n: set.pieceCount, owned: prog.owned })}</small>
        <span className="s2-bar is-thin"><i style={{ width: `${Math.round(prog.pct * 100)}%`, background: set.palette?.[2] }} /></span>
      </span>
      <span className="s2-row-price">
        <Price value={set.yourPrice ?? set.setPrice} />
        <small className="s2-num"><s>{formatNumber(set.sum, locale)}</s></small>
      </span>
      <button type="button" className="s2-ibtn is-sm is-plain" onClick={() => s2.openGift({ setKey: set.key })} aria-label={t("shop2.gifts.giftIt")}><Gift size={16} /></button>
      <button type="button" className="s2-ibtn is-sm is-plain" onClick={() => onSelect(set)} aria-label={t("shop2.buy.title")}><Cart size={16} /></button>
    </div>
  );
}

export function setGradient(palette = []) {
  const p = palette.length ? palette : ["#0c0d13", "#2b1f6e", "#587af5", "#c6b7ff"];
  return `radial-gradient(120% 90% at 80% 10%, ${p[3] || p[2]}55, transparent 55%), linear-gradient(135deg, ${p[0]} 0%, ${p[1] || p[0]} 55%, ${p[2] || p[1] || p[0]} 100%)`;
}

// ---------------------------------------------------------------------------
// Featured set banner (A), auto-advances every 8 s, pauses on hover.

function SetBanner({ sets }) {
  const { t } = useLocale();
  const s2 = useS2();
  const [i, setI] = useState(0);
  const [hover, setHover] = useState(false);
  const now = useNow(true, 30000);
  const list = sets.slice(0, 3);
  const cur = list[i % Math.max(1, list.length)];
  const next = list[(i + 1) % Math.max(1, list.length)];
  const detail = cur ? s2.data.setDetails[cur.key] : null;
  const { loadSet } = s2.actions;
  useEffect(() => {
    for (const s of list) if (!s2.data.setDetails[s.key]) loadSet(s.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.map((s) => s.key).join(",")]);
  useEffect(() => {
    if (hover || list.length < 2) return undefined;
    const id = setInterval(() => setI((x) => (x + 1) % list.length), 8000);
    return () => clearInterval(id);
  }, [hover, list.length]);
  if (!cur) return null;
  const pricing = detail ? setPricing(detail) : null;
  const left = cur.endsAt ? countdownParts(cur.endsAt, now) : null;
  const pieces = detail?.pieces || [];
  return (
    <section
      className="s2-banner"
      style={{ "--set-bg": setGradient(cur.palette), "--set-accent": cur.palette?.[2] || "#587af5" }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-roledescription={t("shop2.banner.carousel")}
    >
      <div className="s2-banner-slots" key={cur.key}>
        {(pieces.length ? pieces : Array.from({ length: 8 }, () => null)).slice(0, 8).map((p, k) => (
          <span key={p?.item?.id ?? k} className={`s2-slot${p?.owned ? " is-owned" : ""}`} style={{ "--i": k }}>
            {p ? <Shop2Art item={p.item} size="slot" me={s2.me} /> : null}
            {p?.owned ? <em>{t("shop2.common.owned")}</em> : null}
          </span>
        ))}
      </div>
      <div className="s2-banner-text" key={`t-${cur.key}`}>
        <div className="s2-banner-chips">
          <Chip tone="violet" icon={Star}>{t("shop2.banner.featured", { i: (i % list.length) + 1, n: list.length })}</Chip>
          {left && !left.done ? <Chip icon={Clock}>{t("shop2.banner.left", { d: Math.floor(left.h / 24), h: left.h % 24 })}</Chip> : null}
          {next && next.key !== cur.key ? <Chip><span className="s2-dotc" style={{ background: next.palette?.[2] }} />{t("shop2.banner.next", { name: s2.setName(next) })}</Chip> : null}
        </div>
        <h2>{s2.setName(cur)}</h2>
        <p className="s2-muted">{cur.tagline ? s2.itemName({ name: cur.tagline }) : t("shop2.banner.desc")}</p>
        <div className="s2-banner-price">
          <div className="s2-ladder is-compact">
            <span>{t("shop2.buy.sum")}</span><s className="s2-num"><Num value={pricing?.sum ?? cur.sum} /> {t("shop2.common.d")}</s>
            <span>{t("shop2.buy.setPricePct", { n: pricing?.discountPct ?? 0 })}</span><b className="s2-num"><Num value={pricing?.setPrice ?? cur.setPrice} /> {t("shop2.common.d")}</b>
            {pricing?.ownedCount ? (
              <>
                <span className="is-green">{t("shop2.buy.ownedDeductedN", { n: pricing.ownedCount })}</span>
                <b className="s2-num is-green">-<Num value={pricing.ownedDeduction} /> {t("shop2.common.d")}</b>
              </>
            ) : null}
          </div>
          <div className="s2-banner-your">
            <span className="s2-eyebrow">{t("shop2.banner.yourPrice")}</span>
            <Price value={pricing?.yourPrice ?? cur.yourPrice ?? cur.setPrice} size="xl" />
          </div>
        </div>
        <div className="s2-row">
          <button type="button" className="s2-btn is-primary" onClick={() => s2.openSet(cur.key)}>{t("shop2.banner.inspect")}<ChevronRight size={15} /></button>
          <button type="button" className="s2-btn" onClick={() => s2.openGift({ setKey: cur.key })}><Gift size={15} />{t("shop2.gifts.giftIt")}</button>
          <button type="button" className="s2-btn is-ghost" onClick={() => s2.openSet(cur.key)}><Shirt size={15} />{t("shop2.banner.tryOn")}</button>
          <span className="s2-dots" role="tablist">
            {list.map((s, k) => (
              <button key={s.key} type="button" role="tab" aria-selected={k === i % list.length} aria-label={s2.setName(s)} className={k === i % list.length ? "is-on" : ""} onClick={() => setI(k)} />
            ))}
          </span>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Strips and logs.

function YesterdayStrip({ items }) {
  const { t } = useLocale();
  const s2 = useS2();
  const wished = new Set(s2.data.wishlist.map((w) => String(w.id)));
  return (
    <section className="s2-strip">
      <div className="s2-strip-text">
        <div className="s2-eyebrow"><History size={13} />{t("shop2.yesterday.title")}</div>
        <p className="s2-muted">{t("shop2.yesterday.body")}</p>
      </div>
      <div className="s2-strip-items">
        {items.length ? items.slice(0, 4).map((it) => (
          <button
            key={it.id}
            type="button"
            className={`s2-strip-item${wished.has(String(it.id)) ? " is-on" : ""}`}
            onClick={() => s2.actions.toggleWishlist(it, !wished.has(String(it.id)))}
            title={wished.has(String(it.id)) ? t("shop2.wishlist.remove") : t("shop2.wishlist.add")}
            aria-label={`${s2.itemName(it)}: ${wished.has(String(it.id)) ? t("shop2.wishlist.remove") : t("shop2.wishlist.add")}`}
          >
            <Shop2Art item={it} size="tile" me={s2.me} />
            <Heart size={12} weight={wished.has(String(it.id)) ? "fill" : "bold"} className="s2-strip-heart" />
          </button>
        )) : <span className="s2-muted">{t("shop2.yesterday.none")}</span>}
      </div>
    </section>
  );
}

function WishStrip({ matches }) {
  const { t } = useLocale();
  const s2 = useS2();
  const list = s2.data.wishlist;
  return (
    <button type="button" className="s2-strip is-wish" onClick={() => s2.setTab("wishlist")}>
      <div className="s2-strip-text">
        <div className="s2-eyebrow"><Heart size={13} />{t("shop2.wishlist.stripTitle", { n: list.length })}</div>
        <p className="s2-muted">{t("shop2.wishlist.stripBody", { n: matches })}</p>
      </div>
      <div className="s2-strip-items">
        {list.slice(0, 3).map((it) => (
          <span key={it.id} className={`s2-strip-item${s2.data.storefront?.slots.some((s) => sameId(s.item.id, it.id)) ? " is-match" : ""}`}>
            <Shop2Art item={it} size="tile" me={s2.me} />
          </span>
        ))}
      </div>
    </button>
  );
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function SevenDays({ storefront }) {
  const { t } = useLocale();
  const s2 = useS2();
  const days = lastDays(storefront.history7d, storefront.slots);
  return (
    <section className="s2-week">
      <div className="s2-sech is-small">
        <span className="s2-eyebrow"><Clock size={13} />{t("shop2.week.title")}</span>
      </div>
      <div className="s2-week-grid">
        {days.map((d, k) => {
          const date = d.day === "today" ? null : new Date(`${d.day}T12:00:00`);
          const label = d.day === "today" ? t("shop2.week.today") : Number.isFinite(date?.getTime()) ? t(`shop2.week.${DAY_KEYS[date.getDay()]}`) : "";
          return (
            <div key={`${d.day}-${k}`} className={`s2-week-day${d.day === "today" ? " is-today" : ""}`}>
              <span>{label}</span>
              <div className="s2-week-dots">
                {d.items.slice(0, 4).map((x, j) => (
                  <span key={j} className={`s2-week-dot${x.bought ? " is-bought" : ""}`} title={s2.itemName(x.item)}>
                    <Shop2Art item={x.item} size="chip" me={s2.me} />
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function ActionLog({ limit = 5, compact = false }) {
  const { t, locale } = useLocale();
  const s2 = useS2();
  const now = useNow(true);
  const ago = useAgo();
  const entries = s2.data.history.slice(0, limit);
  if (!entries.length) return null;
  const text = (e) => {
    const name = e.item ? s2.itemName(e.item) : e.setName ? s2.itemName({ name: e.setName }) : "";
    return t(`shop2.log.${e.kind}`, { name, to: e.to?.displayName || e.to?.username || "", n: formatNumber(Math.abs(e.amount), locale) });
  };
  return (
    <section className={`s2-log${compact ? " is-compact" : ""}`}>
      <div className="s2-eyebrow"><History size={13} />{t("shop2.log.title")}</div>
      <ul>
        {entries.map((e) => {
          const left = undoLeft(e, now);
          const time = e.at ? new Date(e.at) : null;
          const sameDay = time && new Date().toDateString() === time.toDateString();
          return (
            <li key={e.id}>
              <time>{time ? (sameDay ? time.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : ago(e.at)) : ""}</time>
              <span>{text(e)}</span>
              {left > 0 ? (
                <button type="button" className={`s2-link is-undo${left < 60 ? " is-fading" : ""}`} onClick={async () => {
                  try {
                    await s2.actions.undo(e.id);
                    s2.toast(t("shop2.log.undone"), { tone: "ok" });
                  } catch (err) {
                    s2.toast(err?.message || t("shop2.errors.undo"), { tone: "error" });
                  }
                }}>
                  <Undo2 size={13} />
                  {t("shop2.log.undo", { t: mmss(left) })}
                </button>
              ) : e.status === "thanked" ? (
                <span className="s2-ok">{t("shop2.log.thanked")}</span>
              ) : e.kind === "night_keep" ? (
                <button type="button" className="s2-link" onClick={() => s2.setTab("night")}>{t("shop2.log.open")}</button>
              ) : (
                <span className="s2-dim">{e.amount ? `${e.amount > 0 ? "+" : ""}${formatNumber(e.amount, locale)}` : ""}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------

export default function Shop2Vitrin() {
  const { t, locale } = useLocale();
  const s2 = useS2();
  const sf = s2.data.storefront;
  const [view, setView] = useState(() => s2.data.prefs.view || "cards");
  const [selected, setSelected] = useState(null);
  const [selSet, setSelSet] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flipKey, setFlipKey] = useState(0);
  const [expanded, setExpanded] = useState(null);
  const [sheet, setSheet] = useState(null);
  const yRef = useRef(null);
  const phone = s2.layout === "phone";
  const slots = sf?.slots || [];
  const sets = sf?.featuredSets?.length ? sf.featuredSets : s2.data.sets;
  const cur = useMemo(() => {
    if (selSet) return null;
    return slots.find((s) => sameId(s.item.id, selected)) || (phone ? null : slots[0]) || null;
  }, [slots, selected, selSet, phone]);
  const matches = slots.filter((s) => s.wishlisted).length;
  if (!sf) return null;
  const plan = refreshPlan(sf, { balance: s2.balance, cartIds: s2.cart.map((c) => c.item.id) });
  const changeView = (v) => {
    setView(v);
    s2.actions.setPref({ view: v });
  };
  const select = (slot, buyNow = false) => {
    setSelSet(null);
    setSelected(slot.item.id);
    if (phone) setSheet({ slot });
    else if (buyNow) s2.openCheckout({ kind: "item", item: slot.item, price: slot.price });
  };
  const doRefresh = async () => {
    setBusy(true);
    try {
      const keep = slots.find((s) => s.locked)?.item.id;
      await s2.actions.refresh(keep);
      setFlipKey((k) => k + 1);
      setConfirm(false);
      s2.toast(t("shop2.refresh.done"), { tone: "ok" });
    } catch (err) {
      s2.toast(err?.message || t("shop2.errors.refresh"), { tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  const nm = sf.nightMarket;
  const dateLabel = new Date().toLocaleDateString(locale, { day: "numeric", month: "long" });

  const head = (
    <div className="s2-sech">
      <h2>{t("shop2.vitrin.today")}</h2>
      {!phone ? <Chip>{t("shop2.vitrin.forYou", { date: dateLabel })}</Chip> : <span className="s2-muted s2-sech-sub">{t("shop2.vitrin.forYouN", { n: slots.length })}</span>}
      {!phone && s2.width > 1180 ? <span className="s2-muted s2-sech-hint"><Lock size={12} />{t("shop2.vitrin.lockHint")}</span> : null}
      <span className="s2-sech-r">
        <Seg
          size="sm"
          value={view}
          onChange={changeView}
          label={t("shop2.vitrin.view")}
          options={[
            { id: "cards", icon: LayoutGrid, title: t("shop2.vitrin.cards") },
            { id: "list", icon: List, title: t("shop2.vitrin.list") },
          ]}
        />
        {!phone ? (
          <button type="button" className="s2-btn is-sm" onClick={() => yRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}>
            <History size={14} />
            {t("shop2.vitrin.yesterday")}
          </button>
        ) : null}
        <span className="s2-popwrap">
          <button type="button" className={`s2-btn is-sm is-primary${confirm ? " is-active" : ""}`} onClick={() => setConfirm((x) => !x)} disabled={!plan.available} aria-expanded={confirm}>
            <RefreshCw size={14} />
            {phone ? t("shop2.refresh.short", { n: formatNumber(plan.price, locale) }) : t("shop2.vitrin.refresh")}
          </button>
          {confirm ? (
            <RefreshConfirm
              plan={plan}
              busy={busy}
              asSheet={phone}
              onCancel={() => setConfirm(false)}
              onConfirm={doRefresh}
              onBuyCart={() => {
                setConfirm(false);
                s2.openCheckout({ kind: "cart", items: s2.cart });
              }}
            />
          ) : null}
        </span>
      </span>
    </div>
  );

  const grid = view === "cards" ? (
    <div className="s2-cards" key={`f-${flipKey}`} data-flipped={flipKey > 0 ? "1" : undefined}>
      {slots.map((s, k) => (
        <Card key={s.item.id} slot={s} index={k} selected={!phone && cur && sameId(cur.item.id, s.item.id)} onSelect={select} flipKey={s.locked ? "keep" : "flip"} />
      ))}
    </div>
  ) : (
    <div className="s2-console">
      <div className="s2-console-h">
        <span className="s2-eyebrow"><LayoutGrid size={13} />{t("shop2.vitrin.todayCaps")}</span>
        <span className="s2-muted">{t("shop2.vitrin.forYouN", { n: slots.length })}</span>
      </div>
      {slots.map((s) => (
        <Row
          key={s.item.id}
          slot={s}
          selected={!phone && cur && sameId(cur.item.id, s.item.id)}
          onSelect={select}
          expanded={phone && sameId(expanded, s.item.id)}
          onToggle={(x) => setExpanded((e) => (sameId(e, x.item.id) ? null : x.item.id))}
        />
      ))}
      <div className="s2-console-h">
        <span className="s2-eyebrow"><Star size={13} />{t("shop2.vitrin.featuredSets")}</span>
        <span className="s2-muted">{t("shop2.vitrin.pricesForYou")}</span>
      </div>
      {sets.slice(0, 3).map((x) => (
        <SetRow key={x.key} set={x} selected={selSet === x.key} onSelect={(st) => {
          s2.actions.loadSet(st.key);
          if (phone) s2.openSet(st.key);
          else {
            setSelSet(st.key);
            setSelected(null);
          }
        }} />
      ))}
    </div>
  );

  const nightStrip = phone && nm.open ? (
    <button type="button" className="s2-nightstrip" onClick={() => s2.setTab("night")}>
      <Moon size={20} />
      <span>
        <b>{t("shop2.night.openNow")}</b>
        <small>{t("shop2.night.stripSub", { n: nm.cards })} · <RollingClock target={nm.closesAt} /></small>
      </span>
      <ChevronRight size={18} />
    </button>
  ) : null;

  const sticky = phone ? (
    <div className="s2-sticky">
      <span className="s2-sticky-ic"><Clock size={20} /></span>
      <span className="s2-sticky-t">
        <small>{t("shop2.tiles.nextStorefront")}</small>
        <RollingClock target={sf.resetsAt} className="s2-sticky-clock" />
      </span>
      <button type="button" className="s2-btn is-sm" onClick={() => setConfirm(true)} disabled={!plan.available}>
        <RefreshCw size={15} />
        <Coin size="sm" />
        <span className="s2-num">{formatNumber(plan.price, locale)}</span>
      </button>
    </div>
  ) : null;

  return (
    <div className={`s2-vitrin${phone ? " is-phone" : ""}`}>
      <div className="s2-vitrin-main">
        {sticky}
        {nightStrip}
        {head}
        {grid}
        {view === "cards" || phone ? <SetBanner sets={sets} /> : null}
        <div className="s2-strips" ref={yRef}>
          <YesterdayStrip items={sf.yesterday} />
          <WishStrip matches={matches} />
        </div>
        {view === "list" || s2.layout !== "desktop" ? <SevenDays storefront={sf} /> : null}
        {s2.layout !== "desktop" ? <ActionLog /> : null}
      </div>
      {!phone ? (
        <aside className="s2-detail" aria-label={t("shop2.detail.label")}>
          <div className="s2-detail-scroll" key={selSet || cur?.item.id || "none"}>
            {selSet ? <SetQuickPanel setKey={selSet} onClose={() => setSelSet(null)} /> : cur ? <ItemDetail slot={cur} onClose={slots.length > 1 ? () => setSelected(slots.find((s) => !sameId(s.item.id, cur.item.id))?.item.id) : null} /> : null}
            {s2.layout === "desktop" ? <ActionLog limit={4} compact /> : null}
          </div>
        </aside>
      ) : null}
      {phone && sheet ? (
        <Layer kind="sheet" onClose={() => setSheet(null)} label={s2.itemName(sheet.slot.item)} className="s2-sheet is-tall">
          <ItemDetail slot={sheet.slot} onClose={() => setSheet(null)} />
        </Layer>
      ) : null}
    </div>
  );
}
