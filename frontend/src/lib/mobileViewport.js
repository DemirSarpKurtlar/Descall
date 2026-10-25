/** While typing, a smaller lift is already the keyboard (composer follows it). */
const GAP_EDITING = 50;
/** iOS pans the visual viewport instead of shrinking it. */
const PAN_EDITING = 24;
/**
 * The tab bar only goes away for a real software keyboard: a field is focused
 * AND the visual viewport shrank by more than this. Safari 26's expanded
 * floating toolbar alone is ~145pt (address row + buttons + home indicator),
 * hardware-keyboard shortcut bars ~55-75pt, real keyboards 260pt and up.
 */
const KB_REAL = 150;
/** A fixed box running past the visual viewport by more than this is stale
 *  keyboard residue (iOS 26 leaves it after dismiss), not a toolbar. */
const LIFT_MAX = 200;

function isTextEditing(active) {
  if (!active || active === document?.body || active === document?.documentElement) return false;
  const tag = String(active.tagName || "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return Boolean(active.isContentEditable);
}

/**
 * Where the mobile shell should sit, and whether the tab bar may hide.
 *
 * Fail-safe: nothing is "open" unless a text field is focused (web) or the
 * native keyboard plugin reports an inset (iOS app). No viewport geometry on
 * its own (Safari toolbars, stale visual viewports) can hide the tab bar.
 *
 * While typing, follow the visual viewport so the composer stays above the
 * keyboard. After dismiss, ignore a leftover pan and use the full layout
 * height, iOS otherwise leaves the page shifted down on a black band.
 */
export function mobileViewportBox({
  innerHeight,
  vvHeight,
  offsetTop = 0,
  offsetLeft = 0,
  editing = false,
  nativeInset = 0,
  fixedBottom = 0,
  restHeight = 0,
} = {}) {
  const layoutH = Math.max(0, Math.round(Number(innerHeight) || 0));
  // Bottom edge of the box fixed elements are laid out in (measured). iOS can
  // report an innerHeight that already shrank with the keyboard, or one that
  // differs from that box by the toolbar. Fixed things lift from this bottom.
  const fixedMeasured = Math.max(0, Math.round(Number(fixedBottom) || 0));
  const fixedH = editing ? fixedMeasured : 0;
  const refH = fixedH > 0 ? fixedH : layoutH;
  const visibleH = Math.max(0, Math.round(Number(vvHeight) || layoutH));
  const top = Math.max(0, Math.round(Number(offsetTop) || 0));
  const left = Math.max(0, Math.round(Number(offsetLeft) || 0));
  const gap = Math.max(0, refH - visibleH - top);
  // UIKit overlap when WKWebView does not shrink for the keyboard. Already
  // included in `gap` when the visual viewport did shrink, never add both.
  const native = Math.max(0, Math.round(Number(nativeInset) || 0));
  const covered = Math.max(gap, native);
  // Keyboard size against the tallest resting visual viewport (same width):
  // browser toolbars are in both numbers and cancel out.
  const rest = Math.max(0, Math.round(Number(restHeight) || 0));
  const shrink = rest > 0 ? Math.max(0, rest - visibleH) : gap;
  const nativeKb = native >= GAP_EDITING;
  const open = nativeKb || (editing && (covered >= GAP_EDITING || top >= PAN_EDITING));
  const hideBar = nativeKb || (editing && Math.min(shrink, covered + top) > KB_REAL);

  if (!open) {
    const height = Math.max(visibleH, layoutH);
    // Where fixed elements actually land vs. what the user sees: Safari 26
    // can lay the fixed box out under its floating toolbar. Fixed bottom
    // chrome (the tab bar) lifts by that strip so it is never behind Safari.
    const strip = fixedMeasured > 0 ? fixedMeasured - (visibleH + top) : 0;
    const lift = strip > 0 && strip <= LIFT_MAX ? strip : 0;
    return { open: false, hideBar: false, top: 0, left: 0, height, kb: 0, gap: 0, lift };
  }

  const extra = Math.max(0, native - gap);
  const base = Math.min(visibleH > 0 ? visibleH : refH, Math.max(160, refH - top));
  const height = Math.max(160, base - extra);
  return {
    open: true,
    hideBar,
    top,
    left,
    height,
    kb: Math.max(covered, top),
    // Lift from the fixed-box bottom. A pan (offsetTop) is not added again.
    gap: covered,
    lift: 0,
  };
}

export { isTextEditing, KB_REAL, LIFT_MAX };
