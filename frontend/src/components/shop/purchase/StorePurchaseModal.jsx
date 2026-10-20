import OverlayPortal from "../../ui/OverlayPortal.jsx";
// Store purchase modal / sheet (2.13.1), built from the approved mockups
// (design/store-purchase-modal-2026-10-19). Desktop and Electron get the centred
// heavy-glass modal; phones (iOS) get the bottom sheet.
// Logic stays in ShopPanel: onBuy is ShopPanel.handleBuy(item, { equipAfter }) and
// onEquip is ShopPanel.handleEquip(item, isEquipped), with the same endpoints, prices and
// DesCoin rules as the cards. This file only renders and sequences them.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useDragControls, useReducedMotion } from "framer-motion";
import {
  Check, CircleDot, Crown, Ellipsis, Flame, Image as ImageIcon, Lock, MessageCircle, Mic, Minus,
  Package, Palette, Phone, Smile, Sparkles, Sun, Type, UserPlus, X,
} from "lucide-react";
import { purchaseCopy } from "../../../lib/storePurchaseCopy";
import { localizeShopItem } from "../../../lib/shopItemI18n";
import {
  applyUndo, formatCoins, formatOwnedDate, isAnimatedItem, purchaseView, RARITY_COLORS, rarityKey, undoTarget,
} from "../../../lib/storePurchaseState";
import { PurchasePreview, PurchaseThumb } from "./StorePurchasePreviews";

const CAT_ICON = {
  banner: ImageIcon, avatar_effect: Sparkles, profile_background: ImageIcon, theme: Palette, profile_badge: Crown,
  name_effect: Type, chat_bubble: MessageCircle, presence_flare: CircleDot, profile_aura: Sun, typing_flare: Ellipsis,
  reaction_burst: Smile, call_overlay: Phone,
};

// Springs from the motion spec: damping ratio → bounce (1 - ζ), response → duration.
const SPRING_OPEN = { type: "spring", bounce: 0, duration: 0.35 };
const SPRING_SHEET = { type: "spring", bounce: 0.2, duration: 0.3 };
const SPRING_SEG = { type: "spring", bounce: 0, duration: 0.3 };
const SPRING_SEAL = { type: "spring", bounce: 0.3, duration: 0.4 };
const FADE = { duration: 0.2, ease: "easeOut" };
const DISMISS_DRAG_PX = 110;

function useAppReducedMotion() {
  const media = useReducedMotion();
  const [setting, setSetting] = useState(
    () => typeof document !== "undefined" && document.documentElement.getAttribute("data-reduce-motion") === "true",
  );
  useEffect(() => {
    const root = document.documentElement;
    const obs = new MutationObserver(() => setSetting(root.getAttribute("data-reduce-motion") === "true"));
    obs.observe(root, { attributes: true, attributeFilter: ["data-reduce-motion"] });
    return () => obs.disconnect();
  }, []);
  return Boolean(media || setting);
}

function Coin() {
  return <span className="spm-coin" aria-hidden="true" />;
}

function focusables(root) {
  if (!root) return [];
  return [...root.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')].filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

export default function StorePurchaseModal({
  item,
  balance = 0,
  owned = false,
  ownedRow = null,
  isEquipped = false,
  equippedItem = null,
  me = null,
  isMobile = false,
  locale = "tr",
  notice = "",
  dailyAmount = 40,
  canInvite = true,
  currentThemeKey = "dark",
  onClose,
  onBuy,
  onEquip,
  onOpenInventory,
  onEarn,
}) {
  const category = item.category;
  const c = purchaseCopy(locale);
  const cat = c.cat[category] || c.cat.banner;
  const L = localizeShopItem(item, locale);
  const rk = rarityKey(item.rarity);
  const rc = RARITY_COLORS[rk];
  const animated = isAnimatedItem(item);
  const reduced = useAppReducedMotion();
  const titleId = useId();
  const dialogRef = useRef(null);
  const primaryRef = useRef(null);
  const drag = useDragControls();

  const [phase, setPhase] = useState("idle"); // idle | buying | success
  const [autoWear, setAutoWear] = useState(true);
  const [compare, setCompare] = useState("this"); // this | now
  const [success, setSuccess] = useState(null); // { prev, prevBalance, wore, undone }
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // Keyboard focus rings only when the modal was opened or is used from the keyboard, so a
  // mouse/tap open (the card itself is not focusable) does not ring the primary button.
  const [kbd, setKbd] = useState(() => {
    try { return !!document.activeElement?.matches?.(":focus-visible"); } catch { return false; }
  });

  const current = equippedItem && equippedItem.id !== item.id ? equippedItem : null;
  const currentName = current ? localizeShopItem(current, locale).name : category === "theme" && !equippedItem ? c.defaultTheme : null;
  const view = purchaseView({ item, balance, owned: owned && phase !== "success", equipped: isEquipped, phase });
  const state = view.state;

  // Focus the main action on open, give focus back to the card on close.
  useLayoutEffect(() => {
    const opener = document.activeElement;
    const id = requestAnimationFrame(() => {
      (primaryRef.current || dialogRef.current)?.focus?.({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(id);
      if (opener && typeof opener.focus === "function" && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, []);

  const close = useCallback(() => {
    if (phase === "buying") return;
    onClose?.();
  }, [phase, onClose]);

  // Escape closes the modal only (capture phase, so Settings does not close under it).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Tab" || e.key.startsWith("Arrow")) setKbd(true);
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
        return;
      }
      if (e.key === "Tab") {
        const list = focusables(dialogRef.current);
        if (!list.length) return;
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        } else if (!dialogRef.current.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [close]);

  const buy = async () => {
    if (!view.canBuy || phase !== "idle") return;
    const prev = current;
    const prevBalance = balance;
    const wear = autoWear;
    setFailed(false);
    setPhase("buying");
    let ok = false;
    try {
      ok = await onBuy?.(item, { equipAfter: wear });
    } catch {
      ok = false;
    }
    if (ok) {
      setSuccess({ prev, prevBalance, wore: wear, undone: false });
      setCompare("this");
      setPhase("success");
    } else {
      setFailed(true);
      setPhase("idle");
    }
  };

  const undo = async () => {
    const target = undoTarget({ item, previous: success?.prev, autoWore: success?.wore, undone: success?.undone });
    if (!target || busy) return;
    setBusy(true);
    try {
      const ok = await applyUndo(target, onEquip);
      if (ok) setSuccess((s) => ({ ...s, undone: true }));
    } finally {
      setBusy(false);
    }
  };

  const toggleWear = async (wearIt) => {
    if (busy) return;
    setBusy(true);
    try {
      await onEquip?.(item, !wearIt);
    } finally {
      setBusy(false);
    }
  };

  // Preview sides: "Şu an" = what is worn now, the other side = this item.
  const nowItem = state === "success" ? success?.prev || null : current || (isEquipped ? item : null);
  const previewItem = compare === "now" ? nowItem : item;
  const ownedish = state === "owned-equipped" || state === "owned-stowed" || state === "success";
  const segThis = ownedish ? c.worn : c.withThis;

  const chips = (
    <div className="spm-h-chips">
      <span className={`spm-chip spm-rar spm-${rk}`}><span className="spm-gem" />{c.rarity[rk]}</span>
      {animated ? <span className="spm-chip"><Sparkles className="spm-ic" />{c.animated}</span> : null}
      {ownedish ? <span className="spm-chip spm-chip-own"><Check className="spm-ic" />{c.owned}</span> : null}
    </div>
  );

  const CatIcon = CAT_ICON[category] || ImageIcon;
  const head = (
    <div
      className="spm-m-head"
      onPointerDown={isMobile ? (e) => drag.start(e) : undefined}
    >
      <span className="spm-eyebrow"><CatIcon className="spm-ic" />{cat.eyebrow}</span>
      <button type="button" className="spm-x" aria-label={c.closeLabel} onClick={close} onPointerDown={(e) => e.stopPropagation()}>
        <X className="spm-ic" />
      </button>
    </div>
  );

  const hero = (
    <div className="spm-hero">
      <div className="spm-tile"><PurchaseThumb category={category} item={item} me={me} /></div>
      <div>
        <div className="spm-h-name" id={titleId}>{L.name}</div>
        <div className="spm-h-meta">{cat.meta(animated ? c.animated : c.still, item)}</div>
        {chips}
        {L.description ? <div className="spm-h-desc">{L.description}</div> : null}
      </div>
    </div>
  );

  const preview = (
    <div className="spm-pv">
      <div className="spm-pv-top">
        <span className="spm-label">{c.looks(cat.label)}</span>
        {animated ? <span className="spm-live"><i />{c.live}</span> : null}
        <span className="spm-seg" role="radiogroup" aria-label={c.looks(cat.label)}>
          {[["now", c.now], ["this", segThis]].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={compare === id}
              className={compare === id ? "on" : ""}
              onClick={() => setCompare(id)}
            >
              {compare === id ? (
                <motion.span layoutId={`spm-seg-${titleId}`} className="spm-seg-pill" transition={reduced ? { duration: 0 } : SPRING_SEG} />
              ) : null}
              <span className="spm-seg-label">{label}</span>
            </button>
          ))}
        </span>
      </div>
      <div className="spm-stage-wrap" data-compare={compare}>
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            key={compare}
            className="spm-stage-fade"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0.2 : 0.18 }}
          >
            <PurchasePreview
              category={category}
              item={previewItem}
              me={me}
              c={c}
              compact={isMobile}
              currentThemeKey={currentThemeKey}
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );

  const fmt = formatCoins;
  let body = null;
  let foot = cat.foot;
  let actions = null;

  if (state === "buy") {
    body = (
      <>
        <div className="spm-ledger">
          <div className="spm-lt"><small>{c.price}</small><b className="gold"><Coin />{fmt(view.price)}</b></div>
          <div className="spm-lt"><small>{c.balance}</small><b>{fmt(view.balance)}</b></div>
          <div className="spm-lt"><small>{c.after}</small><b>{fmt(view.after)}<span className="spm-delta">−{fmt(view.price)}</span></b></div>
        </div>
        <label className="spm-row">
          <button
            type="button"
            role="switch"
            aria-checked={autoWear}
            aria-label={c.wearNow}
            className={`spm-sw${autoWear ? " is-on" : ""}`}
            onClick={() => setAutoWear((v) => !v)}
            disabled={phase === "buying"}
          />
          <span className="spm-t">{c.wearNow}<em>{c.wearSub(currentName)}</em></span>
        </label>
        {failed && notice ? <p className="spm-error" role="alert">{notice}</p> : null}
      </>
    );
    actions = (
      <>
        <button type="button" className="spm-btn spm-btn-ghost spm-btn-cancel" onClick={close} disabled={phase === "buying"}>{c.cancel}</button>
        <button type="button" ref={primaryRef} className="spm-btn spm-btn-primary" onClick={buy} disabled={phase === "buying"} data-action="buy" aria-label={phase === "buying" ? c.buying : c.buyFor(fmt(view.price))}>
          <Coin />{phase === "buying" ? c.buying : c.buyFor(fmt(view.price))}
        </button>
      </>
    );
  } else if (state === "insufficient") {
    body = (
      <>
        <div className="spm-ledger">
          <div className="spm-lt"><small>{c.price}</small><b className="gold"><Coin />{fmt(view.price)}</b></div>
          <div className="spm-lt"><small>{c.balance}</small><b>{fmt(view.balance)}</b></div>
          <div className="spm-lt neg"><small>{c.missing}</small><b>{fmt(view.short)}<span className="spm-delta">{c.notEnough}</span></b></div>
        </div>
        <div className="spm-need">
          <div className="spm-top">
            <Lock className="spm-ic" />
            <span><b>{c.needMore(fmt(view.short))[0]}</b>{c.needMore(fmt(view.short))[1]}</span>
            <span className="spm-pct">{c.ready(view.pct)}</span>
          </div>
          <div className="spm-bar"><i style={{ width: `${view.pct}%` }} /></div>
          <div className="spm-ways">
            <button type="button" onClick={() => onEarn?.("daily")} data-earn="daily"><Flame className="spm-ic" />{c.daily} <b>+{dailyAmount}</b></button>
            {canInvite ? (
              <button type="button" onClick={() => onEarn?.("invite")} data-earn="invite"><UserPlus className="spm-ic" />{c.invite} <b>+100</b></button>
            ) : null}
            <span><Mic className="spm-ic" />{c.talk}</span>
          </div>
        </div>
      </>
    );
    foot = c.shortFoot;
    actions = (
      <>
        <button type="button" ref={primaryRef} className="spm-btn spm-btn-ghost spm-btn-cancel" onClick={close}>{c.close}</button>
        <button type="button" className="spm-btn spm-btn-disabled" disabled aria-disabled="true"><Lock className="spm-ic" />{c.shortBtn(fmt(view.short))}</button>
      </>
    );
  } else if (state === "owned-equipped" || state === "owned-stowed") {
    const eq = state === "owned-equipped";
    const via = ownedRow?.acquiredVia === "gift" ? "gift" : ownedRow?.acquiredVia === "voucher" ? "voucher" : "purchase";
    const date = formatOwnedDate(ownedRow?.acquiredAt, locale);
    body = (
      <div className="spm-own">
        <span className="spm-ok"><Check className="spm-ic" /></span>
        <div>
          <div className="spm-tt">{c.ownTitle(cat.noun)}</div>
          <div className="spm-ss">{date ? c.ownSub(date, fmt(view.price), fmt(view.balance), via) : `${c.balance} ${fmt(view.balance)}`}</div>
        </div>
        {eq ? <span className="spm-pill spm-pill-eq"><i />{c.worn}</span> : <span className="spm-pill spm-pill-inv"><Package className="spm-ic" />{c.inInventory}</span>}
      </div>
    );
    foot = eq ? c.ownFootEq : c.ownFootInv(currentName);
    actions = (
      <>
        <button type="button" className="spm-btn spm-btn-ghost spm-btn-cancel" onClick={close}>{c.close}</button>
        {eq ? (
          <button type="button" ref={primaryRef} className="spm-btn spm-btn-danger" onClick={() => toggleWear(false)} disabled={busy} data-action="unequip" aria-label={busy ? c.working : c.remove}>
            <Minus className="spm-ic" />{busy ? c.working : c.remove}
          </button>
        ) : (
          <button type="button" ref={primaryRef} className="spm-btn spm-btn-primary" onClick={() => toggleWear(true)} disabled={busy} data-action="equip" aria-label={busy ? c.working : c.wear}>
            <Check className="spm-ic" />{busy ? c.working : c.wear}
          </button>
        )}
      </>
    );
  } else if (state === "success") {
    const prevName = success?.prev ? localizeShopItem(success.prev, locale).name : null;
    const canUndo = Boolean(undoTarget({ item, previous: success?.prev, autoWore: success?.wore, undone: success?.undone }));
    body = (
      <>
        <div className="spm-done">
          <motion.span
            className="spm-seal"
            initial={reduced ? { opacity: 0 } : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={reduced ? FADE : SPRING_SEAL}
          >
            <Check className="spm-ic" />
          </motion.span>
          <div>
            <div className="spm-tt">{c.doneTitle(L.name)}</div>
            <div className="spm-ss" aria-live="polite">{success?.undone ? c.undoneSub(prevName) : c.doneSub(prevName, success?.wore)}</div>
          </div>
          {canUndo ? (
            <button type="button" className="spm-undo" onClick={undo} disabled={busy} data-action="undo">{c.undo}</button>
          ) : null}
        </div>
        <div className="spm-ledger">
          <div className="spm-lt"><small>{c.paid}</small><b className="gold"><Coin />{fmt(view.price)}</b></div>
          <div className="spm-lt"><small>{c.prevBalance}</small><b className="spm-dim">{fmt(success?.prevBalance)}</b></div>
          <div className="spm-lt hi"><small>{c.newBalance}</small><b>{fmt(balance)}</b></div>
        </div>
      </>
    );
    foot = c.doneFoot(cat.acc);
    actions = (
      <>
        <button type="button" className="spm-btn spm-btn-ghost" onClick={() => onOpenInventory?.()}><Package className="spm-ic" />{c.openInventory}</button>
        <button type="button" ref={primaryRef} className="spm-btn spm-btn-primary" onClick={() => onClose?.()} data-action="done">{c.done}</button>
      </>
    );
  }

  const dismissText = state === "insufficient" || state === "owned-equipped" || state === "owned-stowed" ? c.close : c.cancel;
  const inner = (
    <>
      {isMobile ? <div className="spm-grab" onPointerDown={(e) => drag.start(e)} aria-hidden="true" /> : null}
      {head}
      {hero}
      {preview}
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={state}
          className="spm-state"
          data-state={state}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={FADE}
        >
          {body}
          <div className="spm-acts">{actions}</div>
          {isMobile && state !== "success" ? (
            <button type="button" className="spm-btn spm-btn-ghost spm-btn-text" onClick={close} disabled={phase === "buying"}>{dismissText}</button>
          ) : null}
          <div className="spm-foot">{foot}</div>
        </motion.div>
      </AnimatePresence>
    </>
  );

  const dialogProps = {
    ref: dialogRef,
    role: "dialog",
    "aria-modal": "true",
    "aria-labelledby": titleId,
    tabIndex: -1,
    "data-category": category,
    "data-state": state,
    style: { "--rc": rc },
    onClick: (e) => e.stopPropagation(),
  };

  const node = (
    <div
      className={`spm-root${isMobile ? " is-sheet" : ""}${reduced ? " spm-static" : ""}${kbd ? " spm-kbd" : ""}`}
      data-testid="store-purchase-modal"
    >
      <motion.div
        className="spm-scrim"
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={FADE}
        onClick={close}
      />
      <div className="spm-center" onClick={close}>
        {isMobile ? (
          <motion.div
            {...dialogProps}
            className="spm-sheet compact"
            initial={reduced ? { opacity: 0 } : { y: "100%" }}
            animate={reduced ? { opacity: 1 } : { y: 0 }}
            exit={reduced ? { opacity: 0 } : { y: "100%" }}
            transition={reduced ? FADE : SPRING_SHEET}
            drag={reduced ? false : "y"}
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_e, info) => {
              if (info.offset.y > DISMISS_DRAG_PX || info.velocity.y > 900) close();
            }}
          >
            {inner}
          </motion.div>
        ) : (
          <motion.div
            {...dialogProps}
            className="spm-m"
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, filter: "blur(8px)" }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, filter: "blur(0px)", transitionEnd: { filter: "none" } }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.97, filter: "blur(6px)" }}
            transition={reduced ? FADE : SPRING_OPEN}
          >
            {inner}
          </motion.div>
        )}
      </div>
    </div>
  );

  if (typeof document === "undefined" || !document.body) return node;
  return <OverlayPortal>{node}</OverlayPortal>;
}
