import { createPortal } from "react-dom";

/**
 * Every modal, sheet, dialog, popover and context menu renders through this
 * (or another createPortal into document.body). Rendered in place, a
 * position: fixed scrim is scoped to the nearest ancestor with a transform,
 * filter, backdrop-filter, perspective, contain or will-change, which is what
 * made the profile popup blur only the right panel (seam at the panel edge,
 * card centred in the panel). In document.body the scrim covers the whole
 * window. React events still bubble through the React tree, so onClick /
 * Escape handlers and focus traps keep working unchanged.
 */
export default function OverlayPortal({ children, disabled = false }) {
  if (disabled || typeof document === "undefined" || !document.body) return children;
  return createPortal(children, document.body);
}
