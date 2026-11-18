import { useEffect, useRef } from "react";

// Open Escape-closable layers, innermost last: one Escape closes only the top one.
const stack = [];

// Layers that handle Escape themselves (confirm / prompt alerts, menus, listboxes,
// the image cropper). While one is open, a server modal under it must stay open.
const FOREIGN_LAYERS = '[role="alertdialog"], .g-alert-scrim, [role="menu"], [role="listbox"], .img-crop-overlay';

function foreignLayerOpen(doc) {
  try {
    return Array.from(doc.querySelectorAll(FOREIGN_LAYERS)).some((el) => el.getClientRects().length > 0);
  } catch {
    return false;
  }
}

/**
 * Escape closes the modal (polish pass: the server modals ignored Escape, only the
 * backdrop or the close button worked). Only the top-most layer reacts, never while a
 * confirm, menu or cropper is open over it, never during IME composition, and not when
 * `enabled` is false (pass false while saving so a half-done change is not dropped).
 */
export default function useEscapeClose(onClose, { enabled = true } = {}) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!enabled || typeof document === "undefined") return undefined;
    const token = {};
    stack.push(token);
    const onKey = (e) => {
      if (e.key !== "Escape" || e.isComposing || e.defaultPrevented) return;
      if (stack[stack.length - 1] !== token) return;
      if (foreignLayerOpen(document)) return;
      e.preventDefault();
      ref.current?.();
    };
    // window, bubbling: handlers on document (menus, alerts) run first and can preventDefault.
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const i = stack.indexOf(token);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [enabled]);
}

export { foreignLayerOpen as _foreignLayerOpen, FOREIGN_LAYERS as _FOREIGN_LAYERS };
