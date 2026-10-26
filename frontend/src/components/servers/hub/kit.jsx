/* Descall 3.0.0 server sheets: the approved mockup kit (dev/after/kit.cjs) as React.
 * Every class/size here mirrors kit.cjs 1:1 so the built screens match the mockups. */
import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { usePressFeedbackScope } from "../../../hooks/usePressFeedback";
import { SPRINGS, framerSpring, REDUCED_MOTION_FADE } from "../../../lib/fluid/springs";
import { resolveAvatarUrl } from "../../../lib/userProfile";
import { SX_PATHS, SX_AVATAR_COLORS } from "./icons";
import { useReducedMotionPref } from "./useHubMode";
import "./svh.css";

export function I({ n, s = 18, w = 2, style, className }) {
  return (
    <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style} className={className} dangerouslySetInnerHTML={{ __html: SX_PATHS[n] || "" }} />
  );
}

export function Chev({ menu }) {
  return (
    <svg className="chev" viewBox="0 0 8 13" aria-hidden="true" style={menu ? { opacity: 0.5, width: 7 } : undefined}>
      <path d="M1.5 1.5 6.5 6.5 1.5 11.5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Ico({ n, c = "gray", style, s }) {
  return <span className={`svh-ico c-${c}`} style={style}><I n={n} s={s || 18} w={2.1} /></span>;
}

export const cx = (...a) => a.filter(Boolean).join(" ");

/** Grouped-list row (kit.cjs row()). Clickable rows are buttons with highlight-only press. */
export function Row({ ico, c = "gray", av, lead, t, sub, val, tail, tg, check, chev, red, blue, sel, center, bold, inset, style, onClick, disabled, wrap, label, tall, children, rowRef }) {
  const cls = cx("svh-row", ico || av || lead ? "" : "noico", red && "red", blue && "blue", (tall || sub) && "tall", sel && "sel", center && "center", onClick && "svh-tap");
  const leadNode = ico ? <Ico n={ico} c={c} /> : av || lead || null;
  const lab = center ? (
    <b style={{ fontWeight: bold ? 600 : 500 }}>{t}</b>
  ) : (
    <span className="lab">
      <b className={wrap ? "wrap" : undefined} style={wrap ? { whiteSpace: "normal", fontSize: 15, lineHeight: 1.3 } : undefined}>{t}</b>
      {sub ? <small>{sub}</small> : null}
    </span>
  );
  const st = { ...(inset ? { "--inset": `${inset}px` } : null), ...style };
  const body = (
    <>
      {leadNode}
      {lab}
      {children}
      {val != null && val !== false ? <span className="val">{val}</span> : null}
      {tail || null}
      {tg != null ? <span className={cx("svh-tg", tg && "on")} /> : null}
      {check ? <span className="svh-check"><I n="check" s={18} w={2.6} /></span> : null}
      {chev ? <Chev /> : null}
    </>
  );
  if (onClick) {
    const sw = tg != null;
    return (
      <button type="button" ref={rowRef} className={cls} style={st} onClick={onClick} disabled={disabled} data-press-scale="1"
        role={sw ? "switch" : undefined} aria-checked={sw ? Boolean(tg) : undefined} aria-label={label} aria-current={sel ? "true" : undefined}>
        {body}
      </button>
    );
  }
  return <div ref={rowRef} className={cls} style={st} aria-label={label}>{body}</div>;
}

export const Group = ({ children, style, className }) => <div className={cx("svh-group", className)} style={style}>{children}</div>;
export const Sec = ({ children, first, style }) => <div className={cx("svh-sec", first && "first")} style={style}>{children}</div>;
export const Foot = ({ children, style }) => <div className="svh-foot" style={style}>{children}</div>;
export const Large = ({ children, style }) => <div className="svh-large" style={style}>{children}</div>;

export function initials(name) {
  return String(name || "?").trim().split(/\s+/).filter(Boolean).map((p) => Array.from(p)[0] || "").join("").slice(0, 2).toLocaleUpperCase("tr") || "?";
}

export const PRESENCE_DOT = { online: "#30D158", idle: "#FFD60A", dnd: "#FF453A" };

/** Round avatar: photo when the user has one, else the kit's letter colour. */
export function Av({ user, name, s = 36, dot, img, style }) {
  const n = name || user?.displayName || user?.username || "?";
  const L = (Array.from(String(n))[0] || "?").toLocaleUpperCase("tr");
  const url = img || (user ? resolveAvatarUrl(user) : null);
  const st = { width: s, height: s, fontSize: s * 0.42, ...(url ? { backgroundImage: `url("${url}")` } : { background: SX_AVATAR_COLORS[L] || "#555" }), ...style };
  return (
    <span className="svh-av" style={st} aria-hidden="true">
      {url ? null : L}
      {dot ? <i className="svh-dot" style={{ background: dot }} /> : null}
    </span>
  );
}

/** Rounded-square server mark (kit sq()). Uses the real icon when the server has one. */
export function Sq({ server, txt, s = 30, bg, style }) {
  const url = server?.iconUrl || null;
  const st = { width: s, height: s, fontSize: s * 0.36, ...(bg ? { background: bg } : null), ...style };
  return (
    <span className="svh-sq" style={st} aria-hidden="true">
      {url ? <img src={url} alt="" draggable="false" /> : txt || initials(server?.name)}
    </span>
  );
}

export function NavText({ children, onClick, disabled, label }) {
  return <button type="button" onClick={onClick} disabled={disabled} aria-label={label} data-press-scale="1">{children}</button>;
}
export function Back({ label, onClick }) {
  return (
    <button type="button" onClick={onClick} data-press-scale="1" aria-label={label}>
      <I n="chevl" s={22} w={2.4} />
      <span>{label}</span>
    </button>
  );
}
export function XBtn({ onClick, label = "Kapat" }) {
  return <button type="button" className="svh-xbtn" onClick={onClick} aria-label={label}><I n="x" s={15} w={2.6} /></button>;
}

/** Nav bar: grid 1fr auto 1fr. `right` disabled ⇒ the kit's dim state. */
export function Nav({ left, title, right, style }) {
  return (
    <div className="svh-nav" style={style}>
      <span className="l">{left || null}</span>
      <span className="t">{title || ""}</span>
      <span className="r">{right || null}</span>
    </div>
  );
}

export function Toggle({ on, onChange, disabled, label }) {
  return <button type="button" role="switch" aria-checked={Boolean(on)} aria-label={label} disabled={disabled} className={cx("svh-tg", on && "on")} data-press="off" onClick={() => onChange?.(!on)} />;
}

export function Seg({ options, value, onChange, style }) {
  return (
    <div className="svh-seg" role="tablist" style={style}>
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id} className={value === o.id ? "on" : ""} data-press-scale="1" onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

/** Tri-state permission: izin ver · varsayılan · engelle. */
export function Tri({ value, onChange, disabled, labels = ["İzin ver", "Varsayılan", "Engelle"] }) {
  return (
    <span className="svh-tri" role="radiogroup">
      <button type="button" role="radio" aria-checked={value === "allow"} aria-label={labels[0]} disabled={disabled} className={value === "allow" ? "ok" : ""} onClick={() => onChange("allow")}><I n="check" s={15} w={2.6} /></button>
      <button type="button" role="radio" aria-checked={value === "inherit"} aria-label={labels[1]} disabled={disabled} className={value === "inherit" ? "mid" : ""} onClick={() => onChange("inherit")}><I n="minus" s={15} w={2.6} /></button>
      <button type="button" role="radio" aria-checked={value === "deny"} aria-label={labels[2]} disabled={disabled} className={value === "deny" ? "no" : ""} onClick={() => onChange("deny")}><I n="x" s={15} w={2.6} /></button>
    </span>
  );
}

export function Field({ value, onChange, placeholder, pre, icon, autoFocus, right, style, multiline, onEnter, inputMode, maxLength, label, inputRef, autoCapitalize = "off", rows, type = "text", autoComplete }) {
  const empty = !value;
  const common = {
    value: value ?? "",
    onChange: (e) => onChange?.(e.target.value),
    placeholder,
    autoFocus,
    maxLength,
    "aria-label": label || placeholder,
    autoCapitalize,
    autoCorrect: "off",
    spellCheck: false,
    ref: inputRef,
  };
  return (
    <label className={cx("svh-field", empty && icon && "ph")} style={style}>
      {icon ? <I n={icon} s={17} /> : null}
      {pre ? <span className="pre" style={{ color: "rgba(235,238,255,.45)" }}>{pre}</span> : null}
      {multiline ? (
        <textarea {...common} rows={rows || 4} />
      ) : (
        <input {...common} type={type} autoComplete={autoComplete} inputMode={inputMode} enterKeyHint={onEnter ? "go" : undefined} onKeyDown={(e) => { if (e.key === "Enter" && onEnter) { e.preventDefault(); onEnter(); } }} />
      )}
      {right || null}
    </label>
  );
}

export function Btn({ children, variant, sm, disabled, onClick, style, label, type = "button" }) {
  return (
    <button type={type} className={cx("svh-btn", variant, sm && "sm", "svh-tap")} disabled={disabled} onClick={onClick} style={style} aria-label={label} data-press-scale={sm ? "0.96" : undefined}>
      {children}
    </button>
  );
}

export function Act({ i, label, onClick, disabled }) {
  return (
    <button type="button" className="svh-act svh-tap" onClick={onClick} disabled={disabled}>
      <I n={i} s={21} />
      <span>{label}</span>
    </button>
  );
}

export function Chip({ color, children, style, onClick, on }) {
  if (onClick) {
    return (
      <button type="button" className="svh-chip" style={{ ...(on ? { background: "#587AF6" } : null), ...style }} onClick={onClick} aria-pressed={Boolean(on)} data-press-scale="0.95">
        {color ? <i style={{ background: color }} /> : null}{children}
      </button>
    );
  }
  return <span className="svh-chip" style={style}>{color ? <i style={{ background: color }} /> : null}{children}</span>;
}

export const Spinner = () => <div className="svh-spin" role="status" aria-label="Yükleniyor" />;

/** Portal root: heavy-glass layer with delegated press feedback + Escape to close. */
export function Layer({ children, onClose, z, label, className }) {
  const ref = useRef(null);
  usePressFeedbackScope(ref, { enabled: true });
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      // Only the top-most layer reacts.
      const roots = document.querySelectorAll(".svh-root");
      if (roots[roots.length - 1] !== ref.current) return;
      e.stopPropagation();
      closeRef.current?.();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div ref={ref} className={cx("svh-root", className)} style={z ? { "--svh-z": z } : undefined} role="presentation" aria-label={label}>
      {children}
    </div>,
    document.body
  );
}

const fadeT = REDUCED_MOTION_FADE;
const dimT = { type: "tween", duration: 0.24, ease: "easeOut" };

export function Dim({ strong, blur, onClick, style }) {
  return (
    <motion.div className={cx("svh-dim", strong && "strong", blur && "blur")} style={style} onClick={onClick}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={dimT} />
  );
}

/** iOS sheet (large or medium) with grab handle; drag the grab/nav down to dismiss. */
export function Sheet({ onClose, medium, h, children, label, z, dimStrong }) {
  const reduced = useReducedMotionPref();
  const controls = useDragControls();
  const onPointerDown = useCallback((e) => {
    if (reduced) return;
    const tgt = e.target;
    if (!tgt?.closest?.(".svh-grab, .svh-nav")) return;
    if (tgt.closest("button, input, textarea, a")) return;
    controls.start(e);
  }, [controls, reduced]);
  return (
    <Layer onClose={onClose} z={z} label={label}>
      <Dim strong={dimStrong} onClick={onClose} />
      <motion.div
        className={cx("svh-sheet", "svh-heavy", medium && "medium")}
        style={h ? { "--h": `${h}px` } : undefined}
        role="dialog" aria-modal="true" aria-label={label}
        initial={reduced ? { opacity: 0 } : { y: "100%" }}
        animate={reduced ? { opacity: 1 } : { y: 0 }}
        exit={reduced ? { opacity: 0 } : { y: "100%" }}
        transition={reduced ? fadeT : framerSpring(SPRINGS.sheet)}
        drag={reduced ? false : "y"} dragListener={false} dragControls={controls}
        dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0.02, bottom: 0.9 }} dragMomentum={false}
        onDragEnd={(_, info) => { if (info.offset.y > 110 || info.velocity.y > 650) onClose?.(); }}
        onPointerDown={onPointerDown}
      >
        <div className="svh-grab" />
        {children}
      </motion.div>
    </Layer>
  );
}

/** iPad form: centred heavy panel, optional 320px side column (kit formP()). */
export function FormPanel({ onClose, w = 900, h = 720, side, children, label, z, dimStyle }) {
  const reduced = useReducedMotionPref();
  return (
    <Layer onClose={onClose} z={z} label={label}>
      <Dim strong onClick={onClose} style={dimStyle} />
      <div className="svh-center">
        <motion.div className="svh-form svh-heavy" style={{ "--w": `${w}px`, "--h": `${h}px` }} role="dialog" aria-modal="true" aria-label={label}
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
          transition={reduced ? fadeT : framerSpring(SPRINGS.materialize)}>
          {side != null ? <div className="side">{side}</div> : null}
          <div className="main">{children}</div>
        </motion.div>
      </div>
    </Layer>
  );
}

/** Body scroller of a sheet page / form main. */
export function Scroll({ children, style, form }) {
  return <div className="svh-scroll" style={form ? { padding: "0 22px 24px", ...style } : style}>{children}</div>;
}

/** iOS alert (kit alertBox()). */
export function AlertBox({ title, msg, cancel = "Vazgeç", confirm, red = true, onCancel, onConfirm, busy, z }) {
  const reduced = useReducedMotionPref();
  return (
    <Layer onClose={onCancel} z={z || 10060} label={title}>
      <Dim strong onClick={onCancel} />
      <div className="svh-center">
        <motion.div className="svh-alert svh-heavy" role="alertdialog" aria-modal="true" aria-label={title}
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 1.12 }} animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: reduced ? 1 : 0.96 }} transition={reduced ? fadeT : framerSpring(SPRINGS.materialize)}>
          <div className="bd"><h4>{title}</h4><p>{msg}</p></div>
          <div className="bt">
            <button type="button" onClick={onCancel} data-press-scale="1">{cancel}</button>
            <button type="button" className={red ? "red" : ""} style={red ? undefined : { fontWeight: 600 }} onClick={onConfirm} disabled={busy} data-press-scale="1">{confirm}</button>
          </div>
        </motion.div>
      </div>
    </Layer>
  );
}

/** iOS action sheet (kit S22 iPhone). */
export function ActionSheet({ title, sub, actions, cancel = "Vazgeç", onCancel, z }) {
  const reduced = useReducedMotionPref();
  return (
    <Layer onClose={onCancel} z={z || 10060} label={title}>
      <Dim strong onClick={onCancel} />
      <motion.div className="svh-as" role="dialog" aria-modal="true" aria-label={title}
        initial={reduced ? { opacity: 0 } : { y: "110%" }} animate={reduced ? { opacity: 1 } : { y: 0 }} exit={reduced ? { opacity: 0 } : { y: "110%" }}
        transition={reduced ? fadeT : framerSpring(SPRINGS.sheet)}>
        <div className="grp svh-heavy">
          <div style={{ textAlign: "center", padding: "16px 20px 12px" }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "rgba(235,238,255,.7)" }}>{title}</div>
            {sub ? <div style={{ fontSize: 13, color: "rgba(235,238,255,.5)", marginTop: 3 }}>{sub}</div> : null}
          </div>
          {actions.map((a) => (
            <button key={a.t} type="button" className="svh-tap" data-press-scale="1" onClick={a.onClick} disabled={a.disabled}
              style={{ height: 56, width: "100%", display: "grid", placeItems: "center", fontSize: 19, color: a.color || "#8FA6FF", borderTop: ".5px solid rgba(255,255,255,.12)" }}>
              {a.t}
            </button>
          ))}
        </div>
        <button type="button" className="grp svh-heavy svh-tap" data-press-scale="1" onClick={onCancel}
          style={{ height: 56, display: "grid", placeItems: "center", fontSize: 19, fontWeight: 600, color: "#8FA6FF" }}>
          {cancel}
        </button>
      </motion.div>
    </Layer>
  );
}

/** Context-menu items (kit menu()). "-" = thick separator. */
export function MenuItems({ items }) {
  return items.map((it, i) => {
    if (it === "-") return <div key={`s${i}`} className="svh-msep" />;
    if (!it) return null;
    return (
      <button key={it.key || it.t} type="button" className={cx("svh-mi", "svh-tap", it.red && "red", it.hl && "hl")} data-press-scale="1" onClick={it.onClick} disabled={it.disabled} role="menuitem">
        {it.lead || null}
        <span className="x">{it.t}{it.sub ? <div className="sub">{it.sub}</div> : null}</span>
        {it.chev ? <Chev menu /> : null}
        {it.check ? <I n="check" s={17} w={2.6} /> : null}
        {it.i ? <I n={it.i} s={19} w={1.9} /> : null}
      </button>
    );
  });
}

export function MenuBox({ items, style, className, children, menuRef }) {
  return (
    <div ref={menuRef} className={cx("svh-menu", "svh-heavy", className)} style={style} role="menu">
      {children}
      {items ? <MenuItems items={items} /> : null}
    </div>
  );
}

/** Push/pop page stack for one iOS sheet. pages: [{ key, node }].
 * keepMounted: pages under the top stay mounted (scroll + drafts survive a push/pop, like UINavigationController). */
export function PageStack({ pages, dir, keepMounted }) {
  const reduced = useReducedMotionPref();
  const topIndex = pages.length - 1;
  const variants = reduced
    ? {
        enter: { opacity: 0 },
        center: { opacity: 1, visibility: "visible" },
        under: { opacity: 0, transitionEnd: { visibility: "hidden" } },
        exit: { opacity: 0 },
      }
    : {
        enter: (d) => (d > 0 ? { x: "100%", opacity: 1 } : d < 0 ? { x: "-30%", opacity: 0 } : { opacity: 0 }),
        center: { x: 0, opacity: 1, visibility: "visible" },
        under: { x: "-30%", opacity: 0, transitionEnd: { visibility: "hidden" } },
        exit: (d) => (d > 0 ? { x: "-30%", opacity: 0 } : d < 0 ? { x: "100%", opacity: 1 } : { opacity: 0 }),
      };
  const shown = keepMounted ? pages : pages.slice(-1);
  return (
    <div className="svh-pages">
      <AnimatePresence initial={false} custom={dir}>
        {shown.map((p) => {
          const isTop = p === pages[topIndex];
          return (
            <motion.div key={p.key} className="svh-page" custom={dir} variants={variants} initial="enter" animate={isTop ? "center" : "under"} exit="exit"
              transition={reduced ? fadeT : framerSpring(SPRINGS.default)} aria-hidden={isTop ? undefined : true}
              style={isTop ? undefined : { pointerEvents: "none" }} inert={isTop ? undefined : ""}>
              {p.node}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
