import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Gift, Copy, Check, Coins, Clock, AlertCircle, Timer, X, Lock, ShoppingBag, Award, Ticket } from "../ui/Icon.jsx";
import { framerSpring, REDUCED_MOTION_FADE, SPRINGS } from "../../lib/fluid/springs";
import { hapticError, hapticSuccess } from "../../lib/fluid/haptics";
import usePressFeedback from "../../hooks/usePressFeedback";
import { useLocale } from "../../context/LocaleContext";
import { copyText } from "../../lib/copyText";
import { redeemPromoCode } from "../../api/promo";
import { normalizeCode, codeGroups, displayCode, mmss, popupUntil, longDate, fmtNum, lockLeft } from "../../lib/promoCode";
import { describePromoBadge, getPromoBadges } from "../../lib/promoBadges";
import "../../styles/promo.css";

/* ---------- shared bits ---------- */

/** Wrong-try lock survives closing the sheet (the server enforces it anyway). */
const LOCK_KEY = "descall:promoLockUntil";
function readLock() {
  try { return Number(sessionStorage.getItem(LOCK_KEY)) || 0; } catch { return 0; }
}
function writeLock(until) {
  try { sessionStorage.setItem(LOCK_KEY, String(until)); } catch { /* private mode */ }
}

export function PressButton({ className, onClick, disabled, children, ...rest }) {
  const press = usePressFeedback({ disabled });
  return (
    <button type="button" className={className} onClick={onClick} disabled={disabled} {...press} {...rest}>
      {children}
    </button>
  );
}

export function BadgeGlyph({ badgeId, size = 18 }) {
  const Icon = getPromoBadges()?.Icon;
  if (Icon) return <Icon badgeId={badgeId} size={size} />;
  return <Award size={Math.round(size * 0.8)} className="pc-gold" />;
}

/** Frosted scrim + heavy glass card, same materialize motion as GlassConfirm. */
export function PromoScrim({ children, className = "", label, onEscape }) {
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!onEscape) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onEscape();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onEscape]);
  const transition = reduce ? REDUCED_MOTION_FADE : framerSpring(SPRINGS.materialize);
  return createPortal(
    <motion.div className="g-alert-scrim pc-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
      <motion.div
        className={`g-alert g-glass g-heavy ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.1 }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1 }}
        transition={transition}
      >
        {children}
      </motion.div>
    </motion.div>,
    document.body,
  );
}

/* ---------- segmented code field ---------- */

/**
 * Four 4-char groups, as drawn. One real <input> lies over the groups so typing,
 * paste, autofill and the iOS keyboard all behave like a normal text field;
 * input is upper-cased and stripped to A–Z/0–9 (dashes are added visually).
 */
export function CodeInput({ value = "", onChange, onSubmit, state = "idle", label, autoFocus = false, disabled = false, inputRef }) {
  const { t } = useLocale();
  const ownRef = useRef(null);
  const ref = inputRef || ownRef;
  const [focused, setFocused] = useState(false);
  const v = normalizeCode(value);
  const groups = codeGroups(v);
  const activeIdx = Math.min(3, Math.floor(v.length / 4));
  const caret = focused && state === "idle" && v.length < 16;
  useEffect(() => {
    if (autoFocus && !disabled) ref.current?.focus({ preventScroll: true });
  }, [autoFocus, disabled, ref]);
  return (
    <div className={`pc-codein is-${state}`} role="group" aria-label={label || t("promo.inputLabel")}>
      {groups.map((g, i) => (
        <span key={i} className="pc-codein-row" aria-hidden="true">
          <span className={`pc-codein-g${caret && i === activeIdx ? " is-active" : ""}${g.length === 4 ? " is-full" : ""}`}>
            {[0, 1, 2, 3].map((j) => (
              <span key={j} className={`pc-codein-c${g[j] ? "" : " is-empty"}`}>
                {g[j] || "•"}
                {caret && i === activeIdx && j === g.length ? <i className="pc-caret" /> : null}
              </span>
            ))}
          </span>
          {i < 3 ? <span className="pc-codein-dash">–</span> : null}
        </span>
      ))}
      <input
        ref={ref}
        className="pc-codein-input"
        value={displayCode(v, "-")}
        aria-label={label || t("promo.inputLabel")}
        aria-invalid={state === "error" || undefined}
        inputMode="text"
        autoCapitalize="characters"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="go"
        maxLength={40}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange?.(normalizeCode(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit?.();
          }
        }}
      />
    </div>
  );
}

/* ---------- gift popup ---------- */

export function rewardMeta(reward, t) {
  if (!reward) return null;
  if (reward.type === "descoin") return <span><Coins size={14} /> <b className="tnum">{fmtNum(reward.amount)}</b> DesCoin</span>;
  if (reward.type === "shop_item") return <span><ShoppingBag size={14} /> {reward.name || t("promo.rewardItem")}</span>;
  return <span><BadgeGlyph badgeId={reward.badgeId} size={16} /> {t("promo.badgeName", { name: describePromoBadge(reward.badgeId).name })}</span>;
}

export function PromoGiftPopup({ popup, onLater, onUse, onClose }) {
  const { t, locale } = useLocale();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const id = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(id);
  }, [copied]);
  if (!popup) return null;
  return (
    <PromoScrim className="pc-gift" label={t("promo.giftTitle")} onEscape={onClose}>
      <button type="button" className="pc-x" aria-label={t("promo.close")} onClick={onClose}><X size={16} /></button>
      <div className="pc-gift-ico"><Gift size={30} /></div>
      <div className="pc-eyebrow">{t("promo.giftEyebrow")}</div>
      <h2 className="pc-title">{t("promo.giftTitle")}</h2>
      {popup.message ? <p className="pc-msg">“{popup.message}”</p> : null}
      <div className="pc-gift-code">
        <span className="pc-mono">{displayCode(popup.code)}</span>
        <PressButton
          className={`pc-copy${copied ? " is-done" : ""}`}
          onClick={async () => {
            await copyText(displayCode(popup.code, "-"));
            setCopied(true);
          }}
        >
          {copied ? <><Check size={14} /> {t("promo.copied")}</> : <><Copy size={14} /> {t("promo.copy")}</>}
        </PressButton>
      </div>
      <div className="pc-gift-meta">
        {rewardMeta(popup.reward, t)}
        {popup.expiresAt ? <><span className="pc-sep" /><span><Clock size={14} /> {t("promo.until", { date: popupUntil(popup.expiresAt, locale) })}</span></> : null}
      </div>
      <div className="g-alert-actions pc-actions">
        <PressButton className="g-alert-btn is-cancel" onClick={onLater}>{t("promo.later")}</PressButton>
        <PressButton className="g-alert-btn is-action pc-primary" onClick={onUse}>{t("promo.useNow")}</PressButton>
      </div>
    </PromoScrim>
  );
}

/* ---------- redeem sheet ---------- */

const CONF = [
  [-118, 18, "#ffd166", 0, 18], [-96, -22, "#7aa2ff", 1, -30], [-62, -44, "#ff7ab6", 0, 40], [-136, 62, "#6ee7b7", 1, 12],
  [-84, 82, "#ffd166", 2, 0], [96, -30, "#6ee7b7", 0, -20], [122, 10, "#ff7ab6", 1, 34], [70, -50, "#ffd166", 2, 0],
  [138, 58, "#7aa2ff", 0, 60], [92, 84, "#ffd166", 1, -12], [-30, -58, "#6ee7b7", 2, 0], [34, -60, "#7aa2ff", 0, 75],
  [-150, 24, "#ff7ab6", 2, 0], [152, 30, "#ffd166", 2, 0],
];

function Confetti() {
  const reduce = useReducedMotion();
  return (
    <svg className="pc-confetti" viewBox="-170 -70 340 170" aria-hidden="true">
      {CONF.map(([x, y, c, k, r], i) => {
        const shape = k === 2 ? <circle cx={x} cy={y} r="3" fill={c} />
          : k === 1 ? <rect x={x - 2} y={y - 6} width="4" height="12" rx="2" fill={c} transform={`rotate(${r} ${x} ${y})`} />
            : <rect x={x - 4} y={y - 3} width="8" height="6" rx="1.5" fill={c} transform={`rotate(${r} ${x} ${y})`} />;
        if (reduce) return <g key={i}>{shape}</g>;
        return (
          <motion.g
            key={i}
            initial={{ opacity: 0, x: -x * 0.7, y: -y * 0.7 + 10, scale: 0.4 }}
            animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
            transition={{ ...framerSpring(SPRINGS.flick), delay: 0.08 + i * 0.012 }}
          >
            {shape}
          </motion.g>
        );
      })}
    </svg>
  );
}

function errorText(err, t, locale) {
  const code = err?.code || "server_error";
  if (code === "age") return t("promo.e_age", { days: err.days ?? "", date: longDate(err.availableAt, locale) });
  const key = `promo.e_${code}`;
  const s = t(key);
  return s && s !== key ? s : t("promo.e_server_error");
}

/**
 * Redeem flow: idle → (error | rate countdown) → success reveal.
 * onDone(result) runs after a successful redeem (balance also arrives over the socket).
 */
export function RedeemSheet({ initialCode = "", initialResult = null, onClose, onGoShop, onWearBadge, onDone }) {
  const { t, locale } = useLocale();
  const reduce = useReducedMotion();
  const [value, setValue] = useState(normalizeCode(initialCode));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [lockUntil, setLockUntil] = useState(() => readLock());
  const [now, setNow] = useState(() => Date.now());
  const [result, setResult] = useState(initialResult);
  const inputRef = useRef(null);
  const left = lockLeft(lockUntil, now);
  const locked = left > 0;

  useEffect(() => {
    if (!locked) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [locked]);
  useEffect(() => {
    if (lockUntil && !locked) {
      writeLock(0);
      setLockUntil(0);
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [locked, lockUntil]);

  const submit = async () => {
    if (busy || locked || value.length < 16) return;
    setBusy(true);
    setError(null);
    try {
      const out = await redeemPromoCode(value);
      hapticSuccess();
      setResult(out);
      onDone?.(out);
    } catch (err) {
      hapticError();
      if (err?.code === "rate_limited") {
        const until = Date.now() + (Number(err.retryAfter) || 600) * 1000;
        writeLock(until);
        setLockUntil(until);
        setNow(Date.now());
      } else {
        setError(err);
      }
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    const r = result.reward || {};
    const balance = fmtNum(result.balance, locale);
    let stage = <motion.div className="pc-coin" initial={reduce ? false : { scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={reduce ? REDUCED_MOTION_FADE : framerSpring(SPRINGS.flick)}><Coins size={40} /></motion.div>;
    let title = t("promo.plusDescoin", { n: fmtNum(r.amount, locale) });
    const nb = t("promo.newBalance", { n: "\u0000" }).split("\u0000 DC");
    let body = <>{nb[0]}<b className="tnum">{balance} DC</b>{nb[1]}</>;
    let actions = (
      <>
        <PressButton className="g-alert-btn is-cancel" onClick={onClose}>{t("promo.close")}</PressButton>
        <PressButton className="g-alert-btn is-action pc-primary" onClick={onGoShop}>{t("promo.goShop")}</PressButton>
      </>
    );
    if (r.type === "shop_item" && r.alreadyOwned) {
      title = t("promo.itemOwnedTitle", { n: fmtNum(r.refund, locale) });
      body = t("promo.itemOwnedBody", { name: r.name || "", balance });
    } else if (r.type === "shop_item") {
      stage = <motion.div className="pc-coin pc-coin-item" initial={reduce ? false : { scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={reduce ? REDUCED_MOTION_FADE : framerSpring(SPRINGS.materialize)}><ShoppingBag size={36} /></motion.div>;
      title = t("promo.itemTitle", { name: r.name || t("promo.rewardItem") });
      body = t("promo.itemBody");
    } else if (r.type === "special_badge") {
      const b = describePromoBadge(r.badgeId);
      stage = <motion.div initial={reduce ? false : { scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={reduce ? REDUCED_MOTION_FADE : framerSpring(SPRINGS.materialize)}><BadgeGlyph badgeId={r.badgeId} size={88} /></motion.div>;
      title = t("promo.badgeTitle", { name: b.name });
      body = <>{b.tierLabel ? <>{b.tierLabel}{b.holders != null ? <> · <b className="tnum">{fmtNum(b.holders, locale)}</b></> : null}. </> : null}{t("promo.badgeBody")}</>;
      actions = (
        <>
          <PressButton className="g-alert-btn is-cancel" onClick={onClose}>{t("promo.later")}</PressButton>
          <PressButton className="g-alert-btn is-action pc-primary" onClick={onWearBadge || onClose}>{t("promo.wearNow")}</PressButton>
        </>
      );
    }
    return (
      <PromoScrim className="pc-sheet pc-success" label={t("promo.usedEyebrow")} onEscape={onClose}>
        <div className="pc-reveal-stage">
          <Confetti />
          {stage}
        </div>
        <div className="pc-eyebrow" role="status">{t("promo.usedEyebrow")}</div>
        <h2 className="pc-title tnum">{title}</h2>
        <p className="pc-msg">{body}</p>
        <div className="g-alert-actions pc-actions">{actions}</div>
      </PromoScrim>
    );
  }

  const fieldState = error ? "error" : locked ? "locked" : "idle";
  return (
    <PromoScrim className="pc-sheet" label={t("promo.sheetTitle")} onEscape={busy ? undefined : onClose}>
      <button type="button" className="pc-x" aria-label={t("promo.close")} onClick={onClose} disabled={busy}><X size={16} /></button>
      <div className="pc-sheet-ico"><Ticket size={24} /></div>
      <h2 className="pc-title">{t("promo.sheetTitle")}</h2>
      <p className="pc-msg">{t("promo.sheetLead")}</p>
      <div className="pc-sheet-field">
        <CodeInput
          inputRef={inputRef}
          value={value}
          state={fieldState}
          autoFocus
          disabled={locked || busy}
          onChange={(v) => { setValue(v); if (error) setError(null); }}
          onSubmit={submit}
        />
        {error ? <p className="pc-field-msg is-err" role="alert"><AlertCircle size={14} /> {errorText(error, t, locale)}</p> : null}
        {locked ? <p className="pc-field-msg is-warn" role="alert"><Timer size={14} /> {t("promo.rateA")} <RateLine left={left} t={t} /></p> : null}
        {!error && !locked ? <p className="pc-field-msg"><Lock size={13} /> {t("promo.onceHint")}</p> : null}
      </div>
      <div className="g-alert-actions pc-actions">
        <PressButton className="g-alert-btn is-cancel" onClick={onClose} disabled={busy}>{t("promo.cancel")}</PressButton>
        <PressButton className="g-alert-btn is-action pc-primary" onClick={submit} disabled={locked || busy || value.length < 16} aria-busy={busy || undefined}>
          {locked ? <span className="tnum">{mmss(left)}</span> : t("promo.use")}
        </PressButton>
      </div>
    </PromoScrim>
  );
}

/** "<b>09:42</b> sonra tekrar deneyebilirsin." with the time bolded wherever the language puts it. */
function RateLine({ left, t }) {
  const parts = useMemo(() => t("promo.rateB", { time: "\u0000" }).split("\u0000"), [t]);
  return <>{parts[0]}<b className="tnum">{mmss(left)}</b>{parts[1] || ""}</>;
}
