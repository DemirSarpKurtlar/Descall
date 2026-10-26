import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { rowMenuMotion } from "../../lib/rowMenuMotion";
import { hapticSelection } from "../../lib/fluid/haptics";
import "../groups/GroupMenu.css";

/**
 * 3.0.0 (A2, mockup #05): the "⋯" menu for the chat header and the profile.
 * Same heavy frosted material as the group row menu (.grp-menu, listed in
 * frost.css, opaque under Reduce Transparency). It opens from its button
 * (transform-origin at the anchor) and closes on pick, outside tap or Esc.
 *
 * sections: [[{ id, label, icon: Icon, onSelect, danger?, badge? }], ...]
 */
export default function GlassActionMenu({ open, anchorRef, onClose, sections = [], ariaLabel, testId, zIndex, variant, offset }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open ? (
        <MenuBody
          key="menu"
          anchorRef={anchorRef}
          onClose={onClose}
          sections={sections}
          ariaLabel={ariaLabel}
          testId={testId}
          zIndex={zIndex}
          variant={variant}
          offset={offset}
        />
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

function MenuBody({ anchorRef, onClose, sections, ariaLabel, testId, zIndex, variant, offset }) {
  const reduceMotion = useReducedMotion();
  const menuRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, origin: "top right", visibility: "hidden" });

  useLayoutEffect(() => {
    const menu = menuRef.current;
    const anchor = anchorRef?.current;
    if (!menu) return undefined;
    const place = () => {
      const w = menu.offsetWidth;
      const h = menu.offsetHeight;
      const pad = 8;
      const r = anchor?.getBoundingClientRect?.() || { top: pad, bottom: pad, right: window.innerWidth - pad };
      // offset: optional { x, y } nudge from the default spot (right edges
      // aligned, 6px below the anchor), e.g. to match a mockup.
      const dx = Number(offset?.x) || 0;
      const dy = Number(offset?.y) || 0;
      let top = r.bottom + 6 + dy;
      let below = true;
      if (top + h > window.innerHeight - pad) { top = r.top - h - 6; below = false; }
      top = Math.max(pad, Math.min(top, window.innerHeight - h - pad));
      const left = Math.max(pad, Math.min(r.right - w + dx, window.innerWidth - w - pad));
      setPos({ top, left, origin: below ? "top right" : "bottom right", visibility: "visible" });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [anchorRef, offset?.x, offset?.y]);

  useEffect(() => {
    const outside = (e) => {
      if (menuRef.current?.contains(e.target)) return;
      if (anchorRef?.current?.contains?.(e.target)) return;
      onClose?.();
    };
    const key = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose?.(); return; }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const items = [...(menuRef.current?.querySelectorAll('[role="menuitem"]') || [])];
      if (!items.length) return;
      e.preventDefault();
      const i = items.indexOf(document.activeElement);
      const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i <= 0 ? items.length - 1 : i - 1);
      items[next]?.focus();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", key, true);
    const first = window.requestAnimationFrame?.(() => {
      // Keyboard users land on the first item; touch keeps focus where it was.
      try {
        if (window.matchMedia?.("(any-pointer: fine)").matches) menuRef.current?.querySelector('[role="menuitem"]')?.focus({ preventScroll: true });
      } catch { /* ignore */ }
    });
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", key, true);
      if (first) window.cancelAnimationFrame?.(first);
    };
  }, [onClose, anchorRef]);

  return (
    <>
      <motion.div
        className={`grp-menu-catcher${variant === "ios" ? " grp-menu-catcher--ios" : ""}`}
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        style={zIndex ? { zIndex: zIndex - 1 } : undefined}
        onClick={(e) => { e.stopPropagation(); onClose?.(); }}
      />
      <motion.div
        ref={menuRef}
        role="menu"
        aria-label={ariaLabel}
        className={`grp-menu g-action-menu${variant === "ios" ? " g-action-menu--ios" : ""}`}
        data-testid={testId}
        {...rowMenuMotion(reduceMotion)}
        style={{ top: pos.top, left: pos.left, visibility: pos.visibility, transformOrigin: pos.origin, ...(zIndex ? { zIndex } : null) }}
        onClick={(e) => e.stopPropagation()}
      >
        {sections.filter((sec) => sec?.length).map((sec, si) => (
          <div className="grp-menu-section" key={si}>
            {sec.filter(Boolean).map((it) => {
              const Icon = it.icon;
              return (
                <button
                  key={it.id}
                  type="button"
                  role="menuitem"
                  className={`grp-menu-item${it.danger ? " is-danger" : ""}`}
                  data-testid={testId ? `${testId}-${it.id}` : undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    try { hapticSelection(); } catch { /* ignore */ }
                    onClose?.();
                    it.onSelect?.();
                  }}
                >
                  <span className="g-action-menu-label">
                    {it.label}
                    {it.badge ? <span className="g-action-menu-badge">{it.badge}</span> : null}
                  </span>
                  {Icon ? (variant === "ios" ? <Icon size={19} strokeWidth={1.9} /> : <Icon size={18} strokeWidth={2} />) : null}
                </button>
              );
            })}
          </div>
        ))}
      </motion.div>
    </>
  );
}
