/**
 * Keep a chat scroller pinned to its newest message, and never yank someone
 * who is reading history (iOS keyboard Oct 2026; Master Update A2 PR-7).
 *
 * Rules:
 * - "Pinned" means the user really is at the bottom (< STICK_TO_BOTTOM_PX)
 *   and did not last scroll away. It changes only through the user's own
 *   scrolling, an own message, or the first paint of a conversation.
 * - A scroll whose viewport (clientHeight) changed since the last look is
 *   layout, not intent, UNLESS a finger / wheel / scrollbar is driving it.
 *   (Before: any scroll during the ~300 ms keyboard animation kept a stale
 *   pin, and the next resize pulled the reader back down.)
 * - While pinned, any size change of the scroller (keyboard, composer growth,
 *   rotation) or of the content (new row, image load) re-pins in the same
 *   frame, before paint.
 * - Not pinned: a viewport change keeps the distance from the bottom (the
 *   message you were reading stays above the keyboard), a content change
 *   keeps the first visible row where it was (our own scroll anchoring,
 *   because WebKit has no `overflow-anchor`).
 * - In-place updates (reaction, edit, delivered tick) never scroll: only an
 *   appended message, an own message or the first paint call onMessages.
 * - A new message while pinned glides over a short distance; reduced motion
 *   (or a long jump) is instant.
 */

export const STICK_TO_BOTTOM_PX = 24;
/** Smooth scroll for new rows only when the jump is short (px). */
export const SMOOTH_MAX_PX = 600;
/** How long a programmatic smooth scroll may emit scroll events (ms). */
export const PROGRAMMATIC_SCROLL_MS = 450;
/** A wheel / key / scrollbar press counts as "the user is scrolling" this long (ms). */
export const USER_INTENT_MS = 350;
/** The jump-to-bottom button shows once the newest row is this far away (px). */
export const JUMP_BUTTON_PX = 240;

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
 * @param {{ pinned: boolean, metrics: object, last?: object|null, programmatic?: boolean, userDriven?: boolean, threshold?: number }} a
 */
export function pinnedAfterScroll({ pinned, metrics, last = null, programmatic = false, userDriven = false, threshold = STICK_TO_BOTTOM_PX }) {
  if (!metrics) return pinned;
  if (isNearBottom(metrics, threshold)) return true;
  // A finger, wheel or scrollbar moved us away from the bottom: that is intent,
  // even if the keyboard happens to be animating at the same time.
  if (userDriven) return false;
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

/**
 * Where scrollTop must go when not pinned and the layout changed.
 * - viewport shrank/grew by (prevClient - client): keep distance from bottom
 * - the first visible row moved by `anchorShift` px: follow it
 */
export function preservedScrollTop({ scrollTop, prevClientHeight, clientHeight, anchorShift = 0 }) {
  const viewportDelta = Number.isFinite(prevClientHeight) ? prevClientHeight - clientHeight : 0;
  return scrollTop + viewportDelta + (Number.isFinite(anchorShift) ? anchorShift : 0);
}

function prefersReducedMotion() {
  try {
    return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  } catch {
    return false;
  }
}

/** First child of `content` whose bottom is below the scroller's top edge. */
const ANCHOR_CLASSES = ["message-group", "message-day-sep", "message-unread-sep"];
function anchorRows(content) {
  const out = [];
  const kids = content?.children || [];
  for (let i = 0; i < kids.length; i += 1) {
    const cl = kids[i]?.classList;
    // Only in-flow rows (no portals, hover cards or the jump dock).
    if (!cl || ANCHOR_CLASSES.some((c) => cl.contains(c))) out.push(kids[i]);
  }
  return out;
}

function firstVisibleChild(content, scrollerTop) {
  const kids = anchorRows(content);
  if (!kids || !kids.length || typeof kids[0]?.getBoundingClientRect !== "function") return null;
  let lo = 0;
  let hi = kids.length - 1;
  let found = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = kids[mid].getBoundingClientRect();
    if (r.bottom > scrollerTop + 0.5) { found = kids[mid]; hi = mid - 1; } else { lo = mid + 1; }
  }
  return found;
}

/**
 * Wire a scroller. Returns a controller; call `destroy()` on unmount.
 * @param {HTMLElement} scroller
 * @param {{ content?: HTMLElement|null, enabled?: () => boolean, threshold?: number, initialPinned?: boolean|null, onChange?: (s: {pinned: boolean, distance: number, unseen: number}) => void }} [opts]
 */
export function attachStickToBottom(scroller, {
  content = null,
  enabled = () => true,
  threshold = STICK_TO_BOTTOM_PX,
  initialPinned = null,
  onChange = null,
} = {}) {
  if (!scroller) return null;
  let last = readMetrics(scroller);
  // Only a fresh conversation starts pinned; a re-attach keeps what was true.
  let pinned = typeof initialPinned === "boolean" ? initialPinned : isNearBottom(last, threshold);
  let lastClientHeight = last.clientHeight;
  let programmaticUntil = 0;
  let userIntentUntil = 0;
  let touching = false;
  let suspendedUntil = 0;
  let unseen = 0;
  let anchor = null; // { el, top }
  let raf = 0;
  let anchorRaf = 0;
  const timers = new Set();
  const now = () => Date.now();

  // We do the anchoring ourselves (WebKit lacks it); two anchors would fight.
  try { if (scroller.style) scroller.style.overflowAnchor = "none"; } catch { /* ignore */ }

  let lastSent = "";
  const notify = () => {
    if (typeof onChange !== "function") return;
    const distance = distanceFromBottom(readMetrics(scroller));
    const state = { pinned, distance, unseen };
    const key = `${pinned}|${distance > JUMP_BUTTON_PX}|${unseen}`;
    if (key === lastSent) return;
    lastSent = key;
    try { onChange(state); } catch { /* UI errors never break pinning */ }
  };

  const scrollerTop = () => (typeof scroller.getBoundingClientRect === "function" ? scroller.getBoundingClientRect().top : 0);
  const recordAnchor = () => {
    if (!content) { anchor = null; return; }
    const top = scrollerTop();
    const el = firstVisibleChild(content, top);
    anchor = el ? { el, top: el.getBoundingClientRect().top - top } : null;
  };
  const anchorShift = () => {
    if (!anchor?.el || anchor.el.isConnected === false) return 0;
    return (anchor.el.getBoundingClientRect().top - scrollerTop()) - anchor.top;
  };

  const userDriven = () => touching || now() < userIntentUntil;

  const pinNow = (behavior = "auto") => {
    if (!enabled() || now() < suspendedUntil) return;
    const target = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    if (Math.abs(scroller.scrollTop - target) >= 1) {
      if (behavior === "smooth" && typeof scroller.scrollTo === "function") {
        programmaticUntil = now() + PROGRAMMATIC_SCROLL_MS;
        scroller.scrollTo({ top: target, behavior: "smooth" });
      } else {
        programmaticUntil = now() + 50;
        scroller.scrollTop = target;
      }
    }
    last = readMetrics(scroller);
    lastClientHeight = last.clientHeight;
    if (unseen) unseen = 0;
    recordAnchor();
    notify();
  };

  const onScroll = () => {
    const metrics = readMetrics(scroller);
    const programmatic = now() < programmaticUntil;
    const driven = userDriven();
    const layoutChange = Boolean(last) && Math.abs(metrics.clientHeight - last.clientHeight) >= 1;
    pinned = pinnedAfterScroll({ pinned, metrics, last, programmatic, userDriven: driven, threshold });
    last = metrics;
    if (pinned && unseen) unseen = 0;
    // Layout (not the user) moved us off the bottom while pinned: put it back
    // this frame. A user scroll within the threshold is left alone.
    if (pinned && layoutChange && !programmatic && !driven && !isNearBottom(metrics, 1)) {
      pinNow("auto");
      return;
    }
    cancelAnimationFrame(anchorRaf);
    anchorRaf = requestAnimationFrame(recordAnchor);
    notify();
  };

  // A finger, wheel, scrollbar press or scroll key on the list is the user
  // leading: it ends any glide we started and marks the next scrolls as intent.
  const onIntent = () => { programmaticUntil = 0; userIntentUntil = now() + USER_INTENT_MS; };
  const onTouchStart = () => { touching = true; onIntent(); };
  const onTouchEnd = () => { touching = false; userIntentUntil = now() + 700; /* momentum */ };
  const onKeyDown = (e) => {
    const k = e?.key;
    if (k === "PageUp" || k === "PageDown" || k === "ArrowUp" || k === "ArrowDown" || k === "Home" || k === "End" || k === " ") onIntent();
  };

  const onResize = () => {
    if (pinned) { pinNow("auto"); return; }
    const m = readMetrics(scroller);
    if (enabled() && now() >= suspendedUntil && !userDriven()) {
      const target = preservedScrollTop({
        scrollTop: m.scrollTop,
        prevClientHeight: lastClientHeight,
        clientHeight: m.clientHeight,
        anchorShift: anchorShift(),
      });
      const max = Math.max(0, m.scrollHeight - m.clientHeight);
      const clamped = Math.max(0, Math.min(max, target));
      if (Math.abs(clamped - m.scrollTop) >= 1) {
        programmaticUntil = now() + 50;
        scroller.scrollTop = clamped;
      }
    }
    last = readMetrics(scroller);
    lastClientHeight = last.clientHeight;
    recordAnchor();
    notify();
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
  scroller.addEventListener("touchstart", onTouchStart, { passive: true });
  scroller.addEventListener("touchend", onTouchEnd, { passive: true });
  scroller.addEventListener("touchcancel", onTouchEnd, { passive: true });
  scroller.addEventListener("wheel", onIntent, { passive: true });
  scroller.addEventListener("pointerdown", onIntent, { passive: true });
  scroller.addEventListener("keydown", onKeyDown);

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
  recordAnchor();

  return {
    get pinned() { return pinned; },
    set pinned(v) { pinned = Boolean(v); notify(); },
    get unseen() { return unseen; },
    /**
     * After the message list changed. Only `appended` (a new last message),
     * `own` or `initial` may scroll; in-place patches pass none of them.
     */
    onMessages({ own = false, initial = false, appended = false } = {}) {
      if (own || initial) pinned = true;
      if (!own && !initial && !appended) return;
      if (!pinned) {
        if (appended) { unseen += 1; notify(); }
        return;
      }
      const distance = distanceFromBottom(readMetrics(scroller));
      pinNow(pinBehavior({ reducedMotion: prefersReducedMotion(), distance, initial }));
    },
    /** "Go to message" / search jump: no pinning or anchoring for `ms`. */
    suspendPin(ms = 1500) {
      suspendedUntil = now() + ms;
      pinned = false;
      notify();
    },
    /** The jump-to-bottom button. */
    jumpToBottom() {
      suspendedUntil = 0;
      pinned = true;
      unseen = 0;
      const distance = distanceFromBottom(readMetrics(scroller));
      pinNow(pinBehavior({ reducedMotion: prefersReducedMotion(), distance }));
    },
    pinNow,
    destroy() {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(anchorRaf);
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
      scroller.removeEventListener("scroll", onScroll);
      scroller.removeEventListener("touchstart", onTouchStart);
      scroller.removeEventListener("touchend", onTouchEnd);
      scroller.removeEventListener("touchcancel", onTouchEnd);
      scroller.removeEventListener("wheel", onIntent);
      scroller.removeEventListener("pointerdown", onIntent);
      scroller.removeEventListener("keydown", onKeyDown);
      ro?.disconnect();
      vv?.removeEventListener("resize", settle);
      window.removeEventListener("resize", settle);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", settle);
    },
  };
}
