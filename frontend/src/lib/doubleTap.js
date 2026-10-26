/**
 * Double-tap / double-click → ❤️ (Master Update A2, PR-6).
 *
 * Touch & pen: two `pointerup`s within DOUBLE_TAP_MS, each tap moving less
 * than TAP_SLOP_PX, the second landing within TAP_SLOP_PX * 3 of the first.
 * Mouse: the native `dblclick`, but only when the pointer is NOT over a run
 * of message text, so a double-click on a word still selects that word.
 */

export const DOUBLE_TAP_MS = 300;
export const TAP_SLOP_PX = 10;

/** Controls, media and chips keep their own taps. */
export const DOUBLE_TAP_IGNORE_SELECTOR =
  "a, button, input, textarea, select, video, audio, img, [contenteditable='true'], .message-media, .message-reactions, .message-hover-bar, .slash-embed, .msg-edit-box, .voice-message, .dsx-poll, .app-card";

export function createDoubleTapDetector({ windowMs = DOUBLE_TAP_MS, slopPx = TAP_SLOP_PX } = {}) {
  let down = null; // { x, y, t }
  let lastTap = null; // { x, y, t }
  return {
    down(x, y, t) {
      down = { x, y, t };
    },
    /** Move beyond slop cancels the tap in progress (scroll, swipe-to-reply). */
    move(x, y) {
      if (down && Math.hypot(x - down.x, y - down.y) >= slopPx) down = null;
    },
    cancel() {
      down = null;
      lastTap = null;
    },
    /** Returns true when this pointerup completes a double tap. */
    up(x, y, t) {
      const d = down;
      down = null;
      if (!d || Math.hypot(x - d.x, y - d.y) >= slopPx || t - d.t > 600) {
        lastTap = null;
        return false;
      }
      if (
        lastTap
        && t - lastTap.t <= windowMs
        && Math.hypot(x - lastTap.x, y - lastTap.y) < slopPx * 3
      ) {
        lastTap = null;
        return true;
      }
      lastTap = { x, y, t };
      return false;
    },
  };
}

/** True when an element (or ancestor) should keep its own tap. */
export function isIgnoredTapTarget(target) {
  const el = target && target.nodeType === 1 ? target : target?.parentElement;
  if (!el || typeof el.closest !== "function") return false;
  return !!el.closest(DOUBLE_TAP_IGNORE_SELECTOR);
}

/**
 * True when (x, y) is over rendered text inside `root`, i.e. a mouse
 * double-click there should select a word instead of reacting.
 */
export function pointIsOverText(root, x, y, doc = typeof document !== "undefined" ? document : null) {
  if (!root || !doc || typeof doc.createTreeWalker !== "function") return false;
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  const range = doc.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.nodeValue || !node.nodeValue.trim()) continue;
    range.selectNodeContents(node);
    const rects = range.getClientRects();
    for (let i = 0; i < rects.length; i += 1) {
      const r = rects[i];
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
    }
  }
  return false;
}

/** The selection is a real (non-collapsed) range: the user selected text. */
export function hasTextSelection(win = typeof window !== "undefined" ? window : null) {
  try {
    const sel = win?.getSelection?.();
    return !!sel && sel.rangeCount > 0 && !sel.isCollapsed && String(sel).trim().length > 0;
  } catch {
    return false;
  }
}
