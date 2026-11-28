// "Vitrin" tab (draft A Vitrin Masası as the base, draft C Mağaza Konsolu mixed in):
// today's 4 personal cards (or the dense console list), lock one card for the refresh,
// refresh confirm with the cart warning, featured set banner, yesterday + wishlist strips,
// 7-day storefront history, action log with undo, and the live preview panel on the right.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../../context/LocaleContext";
import { formatNumber } from "../../i18n/format.js";
import { SET_PIECE_ORDER, slotStripFit, lastDays, refreshPlan, setPricing, setProgress, undoLeft, mmss, countdownParts } from "../../lib/shop2Logic.js";
import { useS2 } from "./Shop2Context.js";
import { keyStep, wrapIndex } from "../../lib/shop2Swipe.js";
import { useShop2Swipe } from "../../hooks/useShop2Swipe.js";
import { Chip, Coin, Layer, Num, Price, RollingClock, Seg, useNow } from "./Shop2Bits.jsx";
import Shop2Art from "./Shop2Art.jsx";
import { ItemDetail, SetQuickPanel, useAgo } from "./Shop2Detail.jsx";
import {
  AlertTriangle,
  Cart,
  ChevronLeft,
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
        <b>{plan.leftAfter > 0 ? t("shop2.refresh.leftAfter", { n: plan.leftAfter }) : t("shop2.refresh.noMoreToday")}</b>
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
  const owned = slot.owned || s2.owned.has(item.id);
  const press = useRef(null);
  const onTouchStart = () => {
    // An owned card is not offered at the refresh, so it cannot be locked.
    if (s2.layout !== "phone" || owned) return;
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
        <Shop2Art item={item} size="card" me={s2.me} sample={String(s2.me?.displayName || s2.me?.username || "").split(" ")[0]} />
        {owned ? null : <button
          type="button"
          className={`s2-lock${slot.locked ? " is-on" : ""}`}
          aria-pressed={slot.locked}
          aria-label={slot.locked ? t("shop2.lock.unlock") : t("shop2.lock.lock")}
          title={slot.locked ? t("shop2.lock.unlock") : t("shop2.lock.lock")}
          onClick={() => s2.actions.lock(item.id)}
        >
          {slot.locked ? <Lock size={14} weight="fill" /> : <LockOpen size={14} />}
        </button>}
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
  const owned = slot.owned || s2.owned.has(item.id);
  const [swipe, setSwipe] = useState(0);
  const start = useRef(null);
  return (
    <div className={`s2-rowwrap${swipe < -40 ? " is-swiped" : ""}`}>
      {swipe < 0 ? <div className="s2-swipe-actions" aria-hidden={swipe > -40}>
        <button type="button" onClick={() => { setSwipe(0); s2.openGift({ item, price: slot.price }); }}><Gift size={16} />{t("shop2.gifts.giftIt")}</button>
        <button type="button" onClick={() => { setSwipe(0); s2.actions.toggleWishlist(item, !slot.wishlisted); }}><Heart size={16} />{t("shop2.wishlist.short")}</button>
      </div> : null}
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
// The hero's piece strip: every tile gets the same explicit square size (measured, never a
// % height of an aspect-ratio grid item, which WebKit leaves unresolved: the owner's iPad
// showed empty, cropped and uneven tiles). The CSS says how many columns the layout wants
// (--s2-strip-cols) or a fixed tile (--s2-strip-fixed); slotStripFit() turns the strip's
// width into the tile size, the stage scale (--s2-k, 64 px design box) and whether the strip
// has to scroll sideways (with snap) because 9 tiles of the minimum size do not fit.

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function useSlotStrip(count) {
  const [el, setEl] = useState(null);
  useIsoLayoutEffect(() => {
    if (!el) return undefined;
    let last = "";
    const apply = () => {
      const cs = getComputedStyle(el);
      const fit = slotStripFit({
        width: el.clientWidth,
        count,
        cols: parseFloat(cs.getPropertyValue("--s2-strip-cols")),
        fixed: parseFloat(cs.getPropertyValue("--s2-strip-fixed")),
        min: parseFloat(cs.getPropertyValue("--s2-strip-min")),
        max: parseFloat(cs.getPropertyValue("--s2-strip-max")),
        gap: parseFloat(cs.columnGap),
      });
      const sig = `${fit.tile}|${fit.cols}|${fit.scroll}`;
      if (sig === last) return;
      last = sig;
      el.style.setProperty("--s2-tile", `${fit.tile}px`);
      el.style.setProperty("--s2-k", String(fit.k));
      el.style.setProperty("--s2-cols", String(fit.cols));
      el.classList.toggle("is-scroll", fit.scroll);
      el.classList.toggle("is-small", fit.tile < 52);
    };
    apply();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
    ro?.observe(el);
    // The banner switches layout (row / stacked) with its container: re-read the CSS then.
    if (el.parentElement) ro?.observe(el.parentElement);
    return () => ro?.disconnect();
  }, [el, count]);
  return setEl;
}

// ---------------------------------------------------------------------------
// Featured set banner (A), auto-advances every 8 s; pauses on hover, focus and touch, and
// restarts the 8 s after a manual change. Switch sets by swipe (touch), the prev / next
// buttons, the dots, the "Siradaki" chip, or Left / Right / Home / End while focused.

function SetBanner({ sets }) {
  const { t } = useLocale();
  const s2 = useS2();
  const [i, setI] = useState(0);
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dir, setDir] = useState(1);
  const now = useNow(true, 30000);
  const list = sets.slice(0, 3);
  const n = list.length;
  const at = i % Math.max(1, n);
  const cur = list[at];
  const next = list[(at + 1) % Math.max(1, n)];
  const detail = cur ? s2.data.setDetails[cur.key] : null;
  const { loadSet } = s2.actions;
  const go = (d) => {
    if (n < 2) return;
    setDir(d < 0 ? -1 : 1);
    setI((x) => wrapIndex(x % n, d, n));
  };
  const pick = (k) => {
    if (k === at) return;
    setDir(k < at ? -1 : 1);
    setI(k);
  };
  const swipe = useShop2Swipe(go);
  useEffect(() => {
    for (const s of list) if (!s2.data.setDetails[s.key]) loadSet(s.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.map((s) => s.key).join(",")]);
  // A set whose pieces failed to load (offline, timeout) is asked again when it is shown.
  useEffect(() => {
    if (cur && !s2.data.setDetails[cur.key]) loadSet(cur.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.key]);
  const stripRef = useSlotStrip(SET_PIECE_ORDER.length);
  // Set change: the tiles and the title block keep their DOM nodes (no keyed re-mount) and
  // replay their entry animation. Re-mounting them removed nodes mid-commit; WebKit (iPad,
  // iPhone) then scrolled the page, and a removed focused arrow lost keyboard focus.
  const stripNode = useRef(null);
  const animNode = useRef(null);
  const setStrip = (n) => {
    stripNode.current = n;
    stripRef(n);
  };
  const firstShow = useRef(true);
  useIsoLayoutEffect(() => {
    if (firstShow.current) {
      firstShow.current = false; // the first paint uses the CSS entry animation
      return;
    }
    if (typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const ease = "cubic-bezier(0.2, 0.8, 0.2, 1)";
    try {
      animNode.current?.animate?.([{ opacity: 0, transform: `translateX(${dir < 0 ? -14 : 14}px)` }, { opacity: 1, transform: "none" }], { duration: 420, easing: ease, fill: "backwards" });
      [...(stripNode.current?.children || [])].forEach((tile, k) => {
        tile.animate?.([{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }], { duration: 360, delay: k * 45, easing: ease, fill: "backwards" });
      });
    } catch {
      /* no Web Animations: the content just swaps */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.key]);
  useEffect(() => {
    if (hover || focused || n < 2) return undefined;
    const id = setTimeout(() => { setDir(1); setI((x) => (x + 1) % n); }, 8000);
    return () => clearTimeout(id);
  }, [hover, focused, n, i]);
  if (!cur) return null;
  const pricing = detail ? setPricing(detail) : null;
  const left = cur.endsAt ? countdownParts(cur.endsAt, now) : null;
  const pieces = detail?.pieces || [];
  const onKeyDown = (e) => {
    if (e.target?.closest?.("input, textarea, select")) return;
    const k = keyStep(e.key, at, n);
    if (k == null || n < 2) return;
    e.preventDefault();
    pick(k);
  };
  return (
    <section
      className="s2-banner"
      style={{ "--set-bg": setGradient(cur.palette), "--set-accent": cur.palette?.[2] || "#587af5" }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false); }}
      onKeyDown={onKeyDown}
      {...swipe}
      aria-roledescription={t("shop2.banner.carousel")}
      aria-label={s2.setName(cur)}
    >
      {/* Everything stays mounted across sets (see the animation effect above). */}
      <div className={`s2-banner-slots${pieces.length ? "" : " is-loading"}`} ref={setStrip} aria-busy={pieces.length ? undefined : "true"}>
        {(pieces.length ? pieces : Array.from({ length: SET_PIECE_ORDER.length }, () => null)).slice(0, SET_PIECE_ORDER.length).map((p, k) => {
          const label = p ? `${s2.itemName(p.item)} · ${t(`shop2.cat.${p.item.category || "other"}`)}` : undefined;
          return (
            <span
              key={k}
              className={`s2-slot${p?.owned ? " is-owned" : ""}${p ? "" : " is-skel"}`}
              style={{ "--i": k }}
              data-cat={p?.item?.category || undefined}
              role={p ? "img" : undefined}
              aria-label={p ? (p.owned ? `${label} · ${t("shop2.common.owned")}` : label) : undefined}
              title={label}
            >
              {p ? <Shop2Art item={p.item} size="slot" me={s2.me} fit /> : null}
              {p?.owned ? <em>{t("shop2.common.owned")}</em> : null}
            </span>
          );
        })}
      </div>
      <div className="s2-banner-text">
        <div className="s2-banner-chips">
          <Chip tone="violet" icon={Star}>{t("shop2.banner.featured", { i: at + 1, n })}</Chip>
          {left && !left.done ? <Chip icon={Clock}>{t("shop2.banner.left", { d: Math.floor(left.h / 24), h: left.h % 24 })}</Chip> : null}
          {next && next.key !== cur.key ? (
            <button type="button" className="s2-chip is-muted s2-banner-next" onClick={() => go(1)}>
              <span className="s2-dotc" style={{ background: next.palette?.[2] }} />
              <span className="s2-banner-next-name">{t("shop2.banner.next", { name: s2.setName(next) })}</span>
              <ChevronRight size={12} />
            </button>
          ) : null}
        </div>
        <div className="s2-banner-anim" ref={animNode}>
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
        </div>
        <div className="s2-row">
          <button type="button" className="s2-btn is-primary" onClick={() => s2.openSet(cur.key)}>{t("shop2.banner.inspect")}<ChevronRight size={15} /></button>
          <button type="button" className="s2-btn" onClick={() => s2.openGift({ setKey: cur.key })}><Gift size={15} />{t("shop2.gifts.giftIt")}</button>
          <button type="button" className="s2-btn is-ghost" onClick={() => s2.openSet(cur.key)}><Shirt size={15} />{t("shop2.banner.tryOn")}</button>
          {n > 1 ? (
            <span className="s2-banner-nav">
              <button type="button" className="s2-ibtn is-sm s2-banner-step is-prev" onClick={() => go(-1)} aria-label={t("Previous")}><ChevronLeft size={16} /></button>
              <span className="s2-dots" role="tablist" aria-label={t("shop2.banner.carousel")}>
                {list.map((s, k) => (
                  <button key={s.key} type="button" role="tab" aria-selected={k === at} aria-label={s2.setName(s)} title={s2.setName(s)} className={k === at ? "is-on" : ""} style={{ "--dot": s.palette?.[2] }} onClick={() => pick(k)} />
                ))}
              </span>
              <button type="button" className="s2-ibtn is-sm s2-banner-step is-next" onClick={() => go(1)} aria-label={t("Next")}><ChevronRight size={16} /></button>
            </span>
          ) : null}
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

const UNDO_REFUNDS = new Set(["purchase", "set_purchase", "gift_sent", "night_buy"]);

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
                    // Only a purchase / gift undo pays DesCoin back; wishlist, lock, look undo just reverse.
                    s2.toast(t(UNDO_REFUNDS.has(e.kind) ? "shop2.log.undone" : "shop2.log.undoneShort"), { tone: "ok" });
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
  // The live preview is a column only when the market is wide (container >= 1080 px);
  // narrower (settings modal, iPad, phone) it opens from a card as a drawer or sheet.
  const docked = s2.layout === "desktop";
  const slots = sf?.slots || [];
  const sets = sf?.featuredSets?.length ? sf.featuredSets : s2.data.sets;
  const cur = useMemo(() => {
    if (selSet) return null;
    return slots.find((s) => sameId(s.item.id, selected)) || (docked ? slots[0] : null) || null;
  }, [slots, selected, selSet, docked]);
  const matches = slots.filter((s) => s.wishlisted).length;
  const { focusItemId, clearFocus } = s2;
  useEffect(() => {
    if (focusItemId == null) return;
    const slot = slots.find((x) => sameId(x.item.id, focusItemId));
    clearFocus();
    if (!slot) return;
    setSelSet(null);
    setSelected(slot.item.id);
    if (!docked) setSheet({ slot });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusItemId]);
  if (!sf) return null;
  const plan = refreshPlan(sf, { balance: s2.balance, cartIds: s2.cart.map((c) => c.item.id) });
  const changeView = (v) => {
    setView(v);
    s2.actions.setPref({ view: v });
  };
  const select = (slot, buyNow = false) => {
    setSelSet(null);
    setSelected(slot.item.id);
    if (buyNow) s2.openCheckout({ kind: "item", item: slot.item, price: slot.price });
    else if (!docked) setSheet({ slot });
  };
  const doRefresh = async () => {
    setBusy(true);
    try {
      // The stored lock is kept by the server; the expected price guards a price change.
      await s2.actions.refresh(undefined, plan.price);
      setFlipKey((k) => k + 1);
      setConfirm(false);
      s2.toast(t(plan.kept.length ? "shop2.refresh.done" : "shop2.refresh.doneFresh"), { tone: "ok" });
    } catch (err) {
      s2.toast(err?.message || t("shop2.errors.refresh"), { tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  const nm = sf.nightMarket;
  // The storefront's own Istanbul day (after 21:00 UTC the device date can be a day behind).
  const dateLabel = (sf.day ? new Date(`${sf.day}T12:00:00Z`) : new Date()).toLocaleDateString(locale, { day: "numeric", month: "long", timeZone: sf.day ? "UTC" : undefined });

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
        <span className={`s2-popwrap${phone ? " is-sheetonly" : ""}`}>
          <button type="button" className={`s2-btn is-sm is-primary${confirm ? " is-active" : ""}`} onClick={() => setConfirm((x) => !x)} disabled={!plan.available} aria-expanded={confirm}>
            <RefreshCw size={14} />
            {phone ? (plan.free ? t("shop2.refresh.free") : t("shop2.refresh.short", { n: formatNumber(plan.price, locale) })) : t("shop2.vitrin.refresh")}
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
        <Card key={s.item.id} slot={s} index={k} selected={Boolean(docked && cur && sameId(cur.item.id, s.item.id))} onSelect={select} flipKey={s.locked ? "keep" : "flip"} />
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
          selected={Boolean(docked && cur && sameId(cur.item.id, s.item.id))}
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
          else if (!docked) setSheet({ setKey: st.key });
          else {
            setSelSet(st.key);
            setSelected(null);
          }
        }} />
      ))}
    </div>
  );

  const nightStrip = phone && nm.open && nm.eligible !== false ? (
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
      <button type="button" className="s2-btn is-sm" onClick={() => setConfirm(true)} disabled={!plan.available} aria-label={plan.price ? t("shop2.refresh.go", { n: formatNumber(plan.price, locale) }) : t("shop2.refresh.goFree")}>
        <RefreshCw size={15} />
        {plan.free ? <span>{t("shop2.refresh.free")}</span> : <><Coin size="sm" /><span className="s2-num">{formatNumber(plan.price, locale)}</span></>}
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
      {docked ? (
        <aside className="s2-detail" aria-label={t("shop2.detail.label")}>
          <div className="s2-detail-scroll" key={selSet || cur?.item.id || "none"}>
            {selSet ? <SetQuickPanel setKey={selSet} onClose={() => setSelSet(null)} /> : cur ? <ItemDetail slot={cur} onClose={slots.length > 1 ? () => setSelected(slots.find((s) => !sameId(s.item.id, cur.item.id))?.item.id) : null} /> : null}
            {s2.layout === "desktop" ? <ActionLog limit={4} compact /> : null}
          </div>
        </aside>
      ) : null}
      {!docked && sheet ? (
        <Layer
          kind={phone ? "sheet" : "drawer"}
          width={phone ? undefined : 400}
          onClose={() => setSheet(null)}
          label={sheet.slot ? s2.itemName(sheet.slot.item) : t("shop2.buy.title")}
          className={phone ? "s2-sheet is-tall" : "s2-side"}
        >
          {sheet.slot ? <ItemDetail slot={sheet.slot} onClose={() => setSheet(null)} /> : <SetQuickPanel setKey={sheet.setKey} onClose={() => setSheet(null)} />}
        </Layer>
      ) : null}
    </div>
  );
}
