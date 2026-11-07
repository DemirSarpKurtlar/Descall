import { useEffect } from "react";

/** The key that opens a context menu from the keyboard: the menu key or Shift+F10. */
export function isContextMenuKey(e) {
  return e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey);
}

/** Arrow Up/Down, Home and End move focus between a menu's enabled buttons (onKeyDown on role="menu"). */
export function menuArrowKeys(e) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
  const items = [...e.currentTarget.querySelectorAll("button:not(:disabled), [role='menuitem']:not([aria-disabled='true'])")];
  if (!items.length) return;
  const i = items.indexOf(document.activeElement);
  const next = e.key === "Home" ? 0
    : e.key === "End" ? items.length - 1
      : e.key === "ArrowDown" ? (i + 1) % items.length
        : (i - 1 + items.length) % items.length;
  e.preventDefault();
  items[next].focus();
}

/**
 * A menu opened from the keyboard: its first item takes focus, and when it closes focus
 * goes back to where it was (the row). Mouse-opened menus (`active` false) are untouched.
 */
export function useKeyboardMenuFocus(ref, active) {
  useEffect(() => {
    if (!active || typeof document === "undefined") return undefined;
    const el = ref.current;
    const back = document.activeElement;
    const id = requestAnimationFrame(() => el?.querySelector("button:not(:disabled), [role='menuitem']")?.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(id);
      const now = document.activeElement;
      if (now && now !== document.body && !el?.contains(now)) return;
      if (back && back !== document.body && back.isConnected) back.focus?.({ preventScroll: true });
    };
    // Mount only: the menu decides once, when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
