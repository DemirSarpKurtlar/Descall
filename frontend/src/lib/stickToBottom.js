/**
 * Keep a chat scroller pinned to its newest message (iOS keyboard, Oct 2026).
 *
 * Why: when the iOS keyboard opens, the mobile shell shrinks to the visual
 * viewport (`--vv-height`, `useMobileKeyboard`). The messages scroller gets
 * shorter but its `scrollTop` stays where it was, so the bottom rows (the
 * newest messages) end up hidden below the fold. The old list only watched
 * its *content* (ResizeObserver on `.message-list`), never the scroller's own
 * height, and a scroll event fired by that layout change was read as "the
 * user scrolled up" and dropped the pin for good.
 *
 * Rules:
 * - "Pinned" changes only through the user's own scrolling. A scroll whose
 *   viewport (clientHeight) changed since the last look is layout, not intent.
 * - While pinned, any size change of the scroller (keyboard, composer growth,
 *   rotation) or of the content (new row, image load) re-pins in the same
 *   frame, before paint: the list tracks the keyboard 1:1 with no animation
 *   of its own (apple-design §2, make-interfaces-feel-better motion budget).
 * - Someone reading history (not pinned) is never yanked.
 * - A new message while pinned glides over a short distance; reduced motion
 *   (or a long jump) is instant.
 */

export const STICK_TO_BOTTOM_PX = 100;
/** Smooth scroll for new rows only when the jump is short (px). */
export const SMOOTH_MAX_PX = 600;
/** How long a programmatic smooth scroll may emit scroll events (ms). */
export const PROGRAMMATIC_SCROLL_MS = 450;

export function readMetrics(el) {
  if (!el) return null;
  return { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
}

export function distanceFromBottom(m) {
  if (!m) return 0;
  return Math.max(0, m.scrollHeight - m.scrollTop - m.clientHeight);
}

export function isNearBottom(m, threshold = STICK_TO_BOTTOM_PX) {
  return distanceFromBottom(m) <= threshold;
}

/**
 * Pinned state after a scroll event.
 * @param {{ pinned: boolean, metrics: object, last?: object|null, programmatic?: boolean, threshold?: number }} a
 */
export function pinnedAfterScroll({ pinned, metrics, last = null, programmatic = false, threshold = STICK_TO_BOTTOM_PX }) {
  if (!metrics) return pinned;
  if (isNearBottom(metrics, threshold)) return true;
  // Our own smooth scroll still on its way down.
  if (programmatic) return pinned;
  // The viewport changed size (keyboard / visual viewport / composer): the
  // browser moved or clamped scrollTop, the user did not scroll.
  if (last && Math.abs(metrics.clientHeight - last.clientHeight) >= 1) return pinned;
  return false;
}

/** Scroll behaviour for a pin caused by a new message. */
export function pinBehavior({ reducedMotion = false, distance = 0, initial = false } = {}) {
  if (initial || reducedMotion) return "auto";
  if (distance <= 1 || distance > SMOOTH_MAX_PX) return "auto";
  return "smooth";
}

function prefersReducedMotion() {
  try {
    return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  } catch {
    return false;
  }
}

/**
 * Wire a scroller. Returns a controller; call `destroy()` on unmount.
 * @param {HTMLElement} scroller
 * @param {{ content?: HTMLElement|null, enabled?: () => boolean, threshold?: number }} [opts]
 */
export function attachStickToBottom(scroller, { content = null, enabled = () => true, threshold = STICK_TO_BOTTOM_PX } = {}) {
  if (!scroller) return null;
  let pinned = true;
  let last = readMetrics(scroller);
  let programmaticUntil = 0;
  let raf = 0;
  const timers = new Set();

  const pinNow = (behavior = "auto") => {
    if (!enabled()) return;
    const target = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    if (Math.abs(scroller.scrollTop - target) < 1) {
      last = readMetrics(scroller);
      return;
    }
    if (behavior === "smooth" && typeof scroller.scrollTo === "function") {
      programmaticUntil = Date.now() + PROGRAMMATIC_SCROLL_MS;
      scroller.scrollTo({ top: target, behavior: "smooth" });
    } else {
      programmaticUntil = Date.now() + 50;
      scroller.scrollTop = target;
    }
    last = readMetrics(scroller);
  };

  const onScroll = () => {
    const metrics = readMetrics(scroller);
    const programmatic = Date.now() < programmaticUntil;
    const layoutChange = Boolean(last) && Math.abs(metrics.clientHeight - last.clientHeight) >= 1;
    pinned = pinnedAfterScroll({ pinned, metrics, last, programmatic, threshold });
    last = metrics;
    // Layout (not the user) moved us off the bottom while pinned: put it back
    // this frame. A user scroll within the threshold is left alone.
    if (pinned && layoutChange && !programmatic && !isNearBottom(metrics, 1)) pinNow("auto");
  };

  // A finger or wheel on the list ends any glide we started: the user leads.
  const onUserIntent = () => { programmaticUntil = 0; };

  const onResize = () => {
    if (pinned) pinNow("auto");
    else last = readMetrics(scroller);
  };

  // The keyboard animates over ~250-350 ms and WKWebView may report its
  // native inset after the visual viewport settles: re-check across it.
  const settle = () => {
    onResize();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(onResize);
    for (const ms of [120, 320, 520]) {
      const id = window.setTimeout(() => { timers.delete(id); onResize(); }, ms);
      timers.add(id);
    }
  };

  scroller.addEventListener("scroll", onScroll, { passive: true });
  scroller.addEventListener("touchstart", onUserIntent, { passive: true });
  scroller.addEventListener("wheel", onUserIntent, { passive: true });

  let ro = null;
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(onResize);
    ro.observe(scroller);
    if (content) ro.observe(content);
  }
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  vv?.addEventListener("resize", settle);
  window.addEventListener("resize", settle);
  // Focusing the composer opens the keyboard.
  const onFocusIn = (e) => {
    const t = e.target;
    const tag = String(t?.tagName || "").toUpperCase();
    if (tag === "TEXTAREA" || tag === "INPUT" || t?.isContentEditable) settle();
  };
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", settle);

  return {
    get pinned() { return pinned; },
    set pinned(v) { pinned = Boolean(v); },
    /** Re-pin after new messages. `initial` = first paint of a conversation. */
    onMessages({ own = false, initial = false } = {}) {
      if (own || initial) pinned = true;
      if (!pinned) return;
      const distance = distanceFromBottom(readMetrics(scroller));
      pinNow(pinBehavior({ reducedMotion: prefersReducedMotion(), distance, initial }));
    },
    pinNow,
    destroy() {
      cancelAnimationFrame(raf);
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
      scroller.removeEventListener("scroll", onScroll);
      scroller.removeEventListener("touchstart", onUserIntent);
      scroller.removeEventListener("wheel", onUserIntent);
      ro?.disconnect();
      vv?.removeEventListener("resize", settle);
      window.removeEventListener("resize", settle);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", settle);
    },
  };
}
