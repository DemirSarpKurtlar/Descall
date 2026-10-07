import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";

const MENU_MAX = 248;
const GAP = 6;

/**
 * Styled dropdown used by the birth date fields (replaces the raw native <select> lists).
 * Menu is portaled to <body> so modals with overflow don't clip it; flips upward when needed.
 * Keyboard: Enter/Space/ArrowDown opens, arrows/Home/End move, Enter selects, Esc closes, type to jump.
 */
export default function BirthSelect({ id, label, placeholder, value, options, onChange, variant = "app" }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const typeRef = useRef({ text: "", at: 0 });
  const listId = `${id}-list`;
  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const below = vh - r.bottom - GAP - 8;
    const above = r.top - GAP - 8;
    const up = below < Math.min(MENU_MAX, 180) && above > below;
    const maxHeight = Math.max(120, Math.min(MENU_MAX, up ? above : below));
    const width = Math.max(r.width, 96);
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    setPos(up ? { left, width, maxHeight, bottom: vh - r.top + GAP } : { left, width, maxHeight, top: r.bottom + GAP });
  }, []);

  const openMenu = useCallback(() => {
    place();
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }, [place, selectedIndex]);

  const close = useCallback((focus = true) => {
    setOpen(false);
    if (focus) triggerRef.current?.focus();
  }, []);

  const choose = (i) => {
    const opt = options[i];
    if (!opt) return;
    onChange?.(opt.value);
    close();
  };

  useLayoutEffect(() => {
    if (!open) return undefined;
    place();
    const onWin = () => place();
    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, true);
    return () => {
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (triggerRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      close(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open, close]);

  useEffect(() => {
    if (!open || active < 0) return;
    const node = menuRef.current?.querySelector(`[data-index="${active}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  // Center the current value when the menu first opens.
  useLayoutEffect(() => {
    if (!open || !menuRef.current) return;
    const node = menuRef.current.querySelector('[aria-selected="true"]');
    if (node) menuRef.current.scrollTop = node.offsetTop - menuRef.current.clientHeight / 2 + node.offsetHeight / 2;
  }, [open]);

  const onKeyDown = (e) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Tab") {
      close(false);
    } else if (e.key.length === 1) {
      const now = Date.now();
      const t = typeRef.current;
      t.text = now - t.at > 700 ? e.key.toLocaleLowerCase() : t.text + e.key.toLocaleLowerCase();
      t.at = now;
      const hit = options.findIndex((o) => String(o.label).toLocaleLowerCase().startsWith(t.text));
      if (hit >= 0) setActive(hit);
    }
  };

  return (
    <>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        className={`birth-select${open ? " is-open" : ""}${selected ? "" : " is-empty"}`}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? `${id}-opt-${active}` : undefined}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKeyDown}
      >
        <span className="birth-select-value">{selected ? selected.label : placeholder}</span>
        <ChevronDown size={16} className="birth-select-chevron" aria-hidden="true" />
      </button>
      {open && pos
        ? createPortal(
            <ul
              ref={menuRef}
              id={listId}
              role="listbox"
              aria-label={label}
              className={`birth-select-menu birth-select-menu--${variant}${pos.bottom != null ? " is-up" : ""}`}
              style={{
                left: pos.left,
                width: pos.width,
                maxHeight: pos.maxHeight,
                ...(pos.bottom != null ? { bottom: pos.bottom } : { top: pos.top }),
              }}
            >
              {options.map((o, i) => {
                const isSel = o.value === value;
                return (
                  <li
                    key={o.value}
                    id={`${id}-opt-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={isSel}
                    className={`birth-select-option${i === active ? " is-active" : ""}${isSel ? " is-selected" : ""}`}
                    onPointerEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(i)}
                  >
                    <span>{o.label}</span>
                    {isSel ? <Check size={14} aria-hidden="true" /> : null}
                  </li>
                );
              })}
            </ul>,
            document.body
          )
        : null}
    </>
  );
}
