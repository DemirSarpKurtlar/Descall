/** Keyboard taller than this counts as open even before the field is focused. */
const GAP_OPEN = 140;
/** While typing, a smaller lift is already the keyboard. */
const GAP_EDITING = 50;
/** iOS pans the visual viewport instead of shrinking it. */
const PAN_EDITING = 24;

function isTextEditing(active) {
  if (!active || active === document?.body || active === document?.documentElement) return false;
  const tag = String(active.tagName || "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return Boolean(active.isContentEditable);
}

/**
 * Where the mobile shell should sit.
 *
 * While typing, follow the visual viewport so the composer stays above the
 * keyboard. After dismiss, ignore a leftover pan and use the full layout
 * height — iOS otherwise leaves the page shifted down on a black band.
 */
export function mobileViewportBox({
  innerHeight,
  vvHeight,
  offsetTop = 0,
  offsetLeft = 0,
  editing = false,
} = {}) {
  const layoutH = Math.max(0, Math.round(Number(innerHeight) || 0));
  const visibleH = Math.max(0, Math.round(Number(vvHeight) || layoutH));
  const top = Math.max(0, Math.round(Number(offsetTop) || 0));
  const left = Math.max(0, Math.round(Number(offsetLeft) || 0));
  const gap = Math.max(0, layoutH - visibleH - top);
  const open = editing ? gap >= GAP_EDITING || top >= PAN_EDITING : gap >= GAP_OPEN;

  if (!open) {
    const height = Math.max(visibleH, layoutH);
    return { open: false, top: 0, left: 0, height, kb: 0, gap: 0 };
  }

  const fitted = Math.max(160, layoutH - top);
  const height = Math.min(visibleH > 0 ? visibleH : fitted, fitted);
  return {
    open: true,
    top,
    left,
    height,
    kb: Math.max(gap, top),
    // Bottom overlap only. A pan (offsetTop) already moves the shell; adding
    // it again would park the composer in the middle of the chat.
    gap,
  };
}

export { isTextEditing };
