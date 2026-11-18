/**
 * Closing the Settings window (UserPanel).
 *
 * Polish scan Nov 2026:
 *   - Escape inside a dialog opened from Settings (username change, a confirm, the image crop)
 *     also closed the whole Settings window: AppLayout listened on window and closed on every
 *     Escape. Settings now owns its Escape and leaves it alone while anything sits above it.
 *   - Escape, the close button, a click on the dim and the swipe back threw away unsaved profile
 *     edits without a word. Every close path now goes through one request that asks first.
 */

const norm = (v) => (v == null ? "" : String(v));

/** Same rule as the profile tab's save bar: name, bio or custom status differ from the account. */
export function profileDraftDirty(draft, me) {
  if (!me) return false;
  const savedName = me.displayName || me.display_name || me.username || "";
  return (
    norm(draft?.displayName) !== norm(savedName) ||
    norm(draft?.bio) !== norm(me.bio) ||
    norm(draft?.customStatus) !== norm(me.customStatus || me.custom_status)
  );
}

/** Overlays that can sit above Settings without a dialog role. */
export const NESTED_OVERLAY_SELECTOR = [
  ".img-crop-overlay",
  ".g-alert-scrim",
  ".un-overlay",
  ".amp-scrim",
  ".bp-pop",
].join(",");

function visible(el, win) {
  if (!el || !el.isConnected) return false;
  if (typeof el.getClientRects === "function" && el.getClientRects().length === 0) return false;
  try {
    const cs = win?.getComputedStyle?.(el);
    if (cs && (cs.visibility === "hidden" || cs.display === "none")) return false;
  } catch {
    /* ignore */
  }
  return true;
}

/**
 * True when a dialog or overlay other than the Settings panel itself is on screen, so Escape
 * belongs to it and not to Settings.
 */
export function nestedOverlayOpen(panel, doc = typeof document !== "undefined" ? document : null) {
  if (!doc) return false;
  const win = doc.defaultView || (typeof window !== "undefined" ? window : null);
  const nodes = [
    ...doc.querySelectorAll('[role="dialog"], [role="alertdialog"]'),
    ...doc.querySelectorAll(NESTED_OVERLAY_SELECTOR),
  ];
  for (const el of nodes) {
    if (el === panel) continue;
    // The Settings shell and the panel's own parts are not "above" it.
    if (panel && typeof el.contains === "function" && el.contains(panel)) continue;
    if (visible(el, win)) return true;
  }
  return false;
}
