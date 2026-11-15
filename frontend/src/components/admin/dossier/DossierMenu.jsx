/**
 * Kullanıcı dosyası "Daha fazla" menu and the user-list row menu: an opaque
 * glass list anchored under its button (right edges aligned, flips above when
 * there is no room), closed by a pick, an outside click or Esc; arrow keys move.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../../../styles/admin-dossier.css";

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {{current: HTMLElement|null}} props.anchorRef
 * @param {() => void} props.onClose
 * @param {Array<{id: string, label: string, sub?: string, icon?: any, danger?: boolean, onSelect: () => void}|"sep">} props.items
 * @param {string} props.label
 * @param {number} [props.width]
 */
export default function DossierMenu({ open, anchorRef, onClose, items, label, width = 280, testId }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, visible: false });
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const menu = ref.current;
      const r = anchorRef?.current?.getBoundingClientRect?.();
      if (!menu || !r) return;
      const pad = 8;
      const h = menu.offsetHeight;
      const w = menu.offsetWidth;
      let top = r.bottom + 6;
      if (top + h > window.innerHeight - pad) top = Math.max(pad, r.top - h - 6);
      const left = Math.max(pad, Math.min(r.right - w, window.innerWidth - w - pad));
      setPos({ top, left, visible: true });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return undefined;
    const outside = (e) => {
      if (ref.current?.contains(e.target) || anchorRef?.current?.contains?.(e.target)) return;
      closeRef.current?.();
    };
    const key = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current?.();
        anchorRef?.current?.focus?.({ preventScroll: true });
        return;
      }
      if (e.key === "Tab") {
        closeRef.current?.();
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
      const list = [...(ref.current?.querySelectorAll('[role="menuitem"]') || [])];
      if (!list.length) return;
      e.preventDefault();
      const i = list.indexOf(document.activeElement);
      let next = 0;
      if (e.key === "ArrowDown") next = (i + 1) % list.length;
      else if (e.key === "ArrowUp") next = i <= 0 ? list.length - 1 : i - 1;
      else if (e.key === "End") next = list.length - 1;
      list[next]?.focus();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", key, true);
    const raf = window.requestAnimationFrame?.(() => ref.current?.querySelector('[role="menuitem"]')?.focus({ preventScroll: true }));
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", key, true);
      if (raf) window.cancelAnimationFrame?.(raf);
    };
  }, [open, anchorRef]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={ref}
      className="dsr-menu"
      role="menu"
      aria-label={label}
      data-testid={testId}
      style={{ top: pos.top, left: pos.left, width, visibility: pos.visible ? "visible" : "hidden" }}
    >
      {items.map((it, i) =>
        it === "sep" ? (
          <div key={`sep-${i}`} className="dsr-menu-sep" role="separator" />
        ) : (
          <button
            key={it.id}
            type="button"
            role="menuitem"
            className={`dsr-mi${it.danger ? " is-danger" : ""}`}
            data-testid={testId ? `${testId}-${it.id}` : undefined}
            onClick={() => {
              closeRef.current?.();
              it.onSelect?.();
            }}
          >
            {it.icon ? <it.icon size={17} /> : null}
            <span>
              {it.label}
              {it.sub ? <small>{it.sub}</small> : null}
            </span>
          </button>
        )
      )}
    </div>,
    document.body
  );
}
