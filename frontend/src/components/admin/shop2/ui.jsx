/**
 * Vitrin ve Setler building blocks: dialog / drawer shells (portal on body, focus trap,
 * Esc, focus return, opaque surfaces), popover menu, switch, segmented control, spark
 * line, DesCoin mark, item thumbnail (real cosmetic classes), pills, number helpers.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "../../../context/LocaleContext";
import { formatNumber } from "../../../i18n/format.js";
import ShopItemThumb from "../../shop/ShopItemThumb.jsx";
import { Award, Music, Volume2, X } from "../../ui/Icon.jsx";
import { RARITY_COLOR, avatarTint, nameOf, sparkPath } from "./shop2Model.js";

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/* ------------------------------------------------------------------ hooks */

/** A clock that ticks every `ms` while the tab is visible. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      setNow(Date.now());
    }, ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** Number formatters bound to the current locale: n(1234) "1.234", c(2840000) "2,84 Mn". */
export function useFmt() {
  const { locale } = useLocale();
  return useMemo(
    () => ({
      n: (v, o) => formatNumber(Number(v || 0), locale, o),
      c: (v) => formatNumber(Number(v || 0), locale, Math.abs(Number(v || 0)) >= 10000 ? { notation: "compact", maximumFractionDigits: Math.abs(v) >= 1e6 ? 2 : 0 } : undefined),
      p: (v, d = 1) => formatNumber(Number(v || 0) / 100, locale, { style: "percent", maximumFractionDigits: d, minimumFractionDigits: 0 }),
      locale,
    }),
    [locale]
  );
}

export function useModal(open, ref, onClose, busy) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  useEffect(() => {
    if (!open) return undefined;
    const opener = typeof document !== "undefined" ? document.activeElement : null;
    const onKey = (e) => {
      if (!ref.current) return;
      const all = document.querySelectorAll("[data-as2-modal]");
      if (all.length && all[all.length - 1] !== ref.current) return;
      if (e.key === "Escape") {
        if (e.defaultPrevented) return;
        e.stopPropagation();
        if (!busyRef.current) closeRef.current?.();
        return;
      }
      if (e.key !== "Tab") return;
      const items = [...ref.current.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !ref.current.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    const raf = window.requestAnimationFrame?.(() => {
      const auto = ref.current?.querySelector("[data-autofocus]");
      (auto || ref.current)?.focus?.({ preventScroll: true });
    });
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (raf) window.cancelAnimationFrame?.(raf);
      try {
        opener?.focus?.({ preventScroll: true });
      } catch {
        /* gone */
      }
    };
  }, [open, ref]);
}

/* ------------------------------------------------------------------ shells */

export function Dialog({ open, onClose, busy = false, icon: Icon, tone = "blue", title, subtitle, width = 640, children, footer, testId, className = "" }) {
  const { t } = useLocale();
  const titleId = useId();
  const ref = useRef(null);
  useModal(open, ref, onClose, busy);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="as2-scrim" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose?.()}>
      <div ref={ref} data-as2-modal="" className={`as2-dlg ${className}`} style={{ "--as2-dlg-w": `${width}px` }} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} data-testid={testId}>
        <header className="as2-dh">
          {Icon ? (
            <span className={`as2-dh-ic is-${tone}`} aria-hidden="true">
              <Icon size={20} />
            </span>
          ) : null}
          <div className="as2-dh-t">
            <h2 id={titleId}>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button type="button" className="as2-xbtn" onClick={onClose} disabled={busy} aria-label={t("adminShop2.close")}>
            <X size={16} />
          </button>
        </header>
        <div className="as2-dlg-body">{children}</div>
        {footer ? <footer className="as2-dlg-ft">{footer}</footer> : null}
      </div>
    </div>,
    document.body
  );
}

/** Right drawer (A3, B3): slides in from the right, the page stays dimmed behind it. */
export function Drawer({ open, onClose, busy = false, icon: Icon, tone = "blue", title, subtitle, badge, width = 640, children, footer, testId }) {
  const { t } = useLocale();
  const titleId = useId();
  const ref = useRef(null);
  useModal(open, ref, onClose, busy);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="as2-scrim is-drawer" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose?.()}>
      <div ref={ref} data-as2-modal="" className="as2-drawer" style={{ "--as2-drawer-w": `${width}px` }} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} data-testid={testId}>
        <header className="as2-drh">
          {Icon ? (
            <span className={`as2-dh-ic is-${tone}`} aria-hidden="true">
              <Icon size={20} />
            </span>
          ) : null}
          <div className="as2-dh-t">
            <h2 id={titleId}>
              {title}
              {badge}
            </h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button type="button" className="as2-xbtn" onClick={onClose} disabled={busy} aria-label={t("adminShop2.close")}>
            <X size={16} />
          </button>
        </header>
        <div className="as2-drawer-body">{children}</div>
        {footer ? <footer className="as2-drawer-ft">{footer}</footer> : null}
      </div>
    </div>,
    document.body
  );
}

/** Anchored opaque menu; closes on outside click and Esc. `pos` = fixed coords for context menus. */
export function Popover({ open, onClose, anchorRef, pos, children, label, align = "end", width = 260, testId }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [place, setPlace] = useState(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current?.contains(e.target) || anchorRef?.current?.contains(e.target)) return;
      closeRef.current?.();
    };
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      closeRef.current?.();
      anchorRef?.current?.focus?.();
    };
    document.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    const raf = window.requestAnimationFrame?.(() => {
      const first = ref.current?.querySelector("[data-autofocus]") || ref.current?.querySelector(FOCUSABLE);
      first?.focus?.({ preventScroll: true });
    });
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      if (raf) window.cancelAnimationFrame?.(raf);
    };
  }, [open, anchorRef]);
  useEffect(() => {
    if (!open) return;
    if (pos) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setPlace({ left: Math.min(pos.x, vw - width - 12), top: Math.min(pos.y, vh - 260) });
      return;
    }
    const r = anchorRef?.current?.getBoundingClientRect?.();
    if (!r) return;
    const left = align === "end" ? r.right - width : r.left;
    setPlace({ left: Math.max(12, Math.min(left, window.innerWidth - width - 12)), top: r.bottom + 6 });
  }, [open, pos, anchorRef, align, width]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div ref={ref} className="as2-pop" style={{ width, left: place?.left ?? -9999, top: place?.top ?? -9999 }} role="menu" aria-label={label} data-testid={testId}>
      {children}
    </div>,
    document.body
  );
}

/* ------------------------------------------------------------------ controls */

export function Switch({ checked, onChange, label, disabled, tone = "blue", testId }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(checked)}
      aria-label={label}
      disabled={disabled}
      data-testid={testId}
      className={`as2-sw is-${tone}${checked ? " is-on" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onChange?.(!checked);
      }}
    >
      <span />
    </button>
  );
}

/** Segmented control. options: [{ id, label, count? }] */
export function Seg({ value, onChange, options, label, size = "md", testId }) {
  return (
    <div className={`as2-seg is-${size}`} role="tablist" aria-label={label} data-testid={testId}>
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id} className={value === o.id ? "is-on" : ""} onClick={() => onChange(o.id)}>
          {o.label}
          {o.count != null ? <span className="as2-seg-n tnum">{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** Underlined tabs (algorithm panel, builder side panel). */
export function Tabs({ value, onChange, options, label }) {
  return (
    <div className="as2-tabs" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id} className={value === o.id ? "is-on" : ""} onClick={() => onChange(o.id)}>
          {o.label}
          {o.count != null ? <span className="as2-tab-n tnum">{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Spark({ values, tone = "brand", w = 72, h = 22, fill = true }) {
  const d = sparkPath(values, w, h);
  if (!d) return <span className="as2-spark" style={{ width: w, height: h }} aria-hidden="true" />;
  return (
    <svg className={`as2-spark is-${tone}`} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      {fill ? <path d={`${d} L${w} ${h} L0 ${h} Z`} className="as2-spark-fill" /> : null}
      <path d={d} className="as2-spark-line" />
    </svg>
  );
}

export function Skel({ w = "100%", h = 12, r = 6 }) {
  return <span className="as2-skel" style={{ width: w, height: h, borderRadius: r }} aria-hidden="true" />;
}

export function Pill({ tone = "gray", children, className = "", title }) {
  return (
    <span className={`as2-pill is-${tone} ${className}`.trim()} title={title}>
      {children}
    </span>
  );
}

const RARITY_TONE = { common: "gray", rare: "blue", epic: "violet", legendary: "amber", mythic: "red" };
export function RarityPill({ rarity }) {
  const { t } = useLocale();
  const r = RARITY_TONE[rarity] ? rarity : "common";
  return <Pill tone={RARITY_TONE[r]}>{t(`adminShop2.rarity.${r}`)}</Pill>;
}

/** DesCoin amount with the gold "D" mark. */
export function Coin({ value, strike = null, size = "md", compact = false }) {
  const f = useFmt();
  return (
    <span className={`as2-coin is-${size}`}>
      <i className="as2-coin-d" aria-hidden="true">
        D
      </i>
      <b className="tnum">{value == null ? "–" : compact ? f.c(value) : f.n(value)}</b>
      {strike ? <s className="tnum">{f.n(strike)}</s> : null}
    </span>
  );
}

export function UserAv({ name, size = 28, src }) {
  const letter = String(name || "?").replace(/^@/, "").charAt(0).toLocaleUpperCase("tr-TR") || "?";
  if (src) return <img className="as2-uav" src={src} alt="" style={{ width: size, height: size }} />;
  return (
    <i className="as2-uav" style={{ width: size, height: size, background: avatarTint(name) }} aria-hidden="true">
      {letter}
    </i>
  );
}

/**
 * Item thumbnail. The shop's own renderer (real cosmetic classes) for every category it
 * knows; frames, badges, voice tiles and join sounds fall back to their art or a glyph.
 */
export function Thumb({ item, size = 40, className = "" }) {
  const c = item?.category;
  const art = item?.preview_url || item?.asset_url;
  if (c === "avatar_frame" && art) {
    return (
      <span className={`as2-th is-frame ${className}`} style={{ "--th": `${size}px` }} aria-hidden="true">
        <i className="as2-th-face" />
        <img src={art} alt="" draggable={false} loading="lazy" />
      </span>
    );
  }
  if (["profile_badge", "voice_tile", "join_sound"].includes(c)) {
    const Glyph = c === "join_sound" ? Music : c === "voice_tile" ? Volume2 : Award;
    return (
      <span className={`as2-th is-${c} ${className}`} style={{ "--th": `${size}px`, "--th-tint": RARITY_COLOR[item?.rarity] || "#8aa0ff" }} aria-hidden="true">
        {art ? <img src={art} alt="" draggable={false} loading="lazy" /> : <Glyph size={Math.round(size * 0.46)} />}
      </span>
    );
  }
  return <ShopItemThumb item={item} size={size} className={`as2-th ${className}`.trim()} />;
}

/** Set mark (A1 table): the set's banner art or palette, with its frame on top. */
export function SetMark({ set, size = 44 }) {
  const banner = set?.pieces?.banner;
  const frame = set?.pieces?.avatar_frame;
  const pal = set?.palette || [];
  const bg = banner?.preview_url || banner?.asset_url;
  return (
    <span
      className="as2-setmark"
      style={{ "--sm": `${size}px`, "--p0": pal[0] || "#1b1f33", "--p1": pal[1] || "#3a4a8f", "--p2": pal[2] || "#7a8fff", "--p3": pal[3] || "#e6ebff" }}
      aria-hidden="true"
    >
      {bg ? <img className="as2-setmark-bg" src={bg} alt="" loading="lazy" /> : null}
      <span className="as2-setmark-av">
        <i />
        {frame?.preview_url || frame?.asset_url ? <img src={frame.preview_url || frame.asset_url} alt="" loading="lazy" /> : null}
      </span>
    </span>
  );
}

/** Row of the 8 piece icons (A1 table under the set name). */
export function PieceDots({ set, size = 14, slots }) {
  const list = (slots || Object.keys(set?.pieces || {})).map((k) => set?.pieces?.[k]).filter(Boolean);
  return (
    <span className="as2-pdots">
      {list.map((it) => (
        <Thumb key={it.id || it.category} item={it} size={size} className="is-dot" />
      ))}
    </span>
  );
}

export function useItemName() {
  const { locale } = useLocale();
  return useCallback((it) => nameOf(it, locale), [locale]);
}

/** Small "Geri al" toast with a countdown bar. */
export function Toast({ toast, onUndo, onClose }) {
  const { t } = useLocale();
  if (!toast) return null;
  return (
    <div className={`as2-toast is-${toast.tone || "ok"}`} role="status" aria-live="polite" key={toast.id}>
      <span>{toast.text}</span>
      {toast.undo ? (
        <button type="button" className="as2-toast-undo" onClick={onUndo}>
          {t("adminShop2.undo")}
        </button>
      ) : null}
      <button type="button" className="as2-toast-x" onClick={onClose} aria-label={t("adminShop2.close")}>
        <X size={14} />
      </button>
      <i className="as2-toast-bar" style={{ animationDuration: `${toast.ms || 4500}ms` }} />
    </div>
  );
}

/** Text field for a reason (every destructive action). */
export function ReasonField({ value, onChange, label, placeholder, min = 8, autoFocus = false, testId }) {
  const { t } = useLocale();
  const id = useId();
  const short = value.trim().length > 0 && value.trim().length < min;
  return (
    <div className="as2-reason">
      <label htmlFor={id} className="as2-cap">
        {label || t("adminShop2.reason.label")}
      </label>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || t("adminShop2.reason.ph")} maxLength={300} data-autofocus={autoFocus ? "" : undefined} data-testid={testId} />
      {short ? <p className="as2-hint is-amber">{t("adminShop2.reason.short", { n: min })}</p> : null}
    </div>
  );
}
