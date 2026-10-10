/**
 * Swipe-to-reply vs edge swipe-back.
 *
 * One finger owns one gesture (apple-design.md: recognise in parallel, then
 * cancel the loser). The left edge band is the same width swipe-back already
 * uses (`SWIPE_BACK_DEFAULTS.edgeWidth`, 28px, which covers the ~20–24pt
 * system-back zone). A touch that starts there is navigation only.
 * A horizontal drag that starts on a bubble outside that band is reply only.
 *
 * Own messages reply to the left, others to the right — the directions the
 * bubble drag already used. The conflict was the shared rightward axis on
 * other people's bubbles, not which way a reply goes.
 *
 * No DOM here. `attachReplySwipe` is the touch driver (device touch events);
 * the state machine is unit-tested with those same event shapes.
 */

import { SWIPE_BACK_DEFAULTS, classifyStart, createSwipeBackMachine } from "./edgeSwipeBack.js";

export const REPLY_SWIPE_DEFAULTS = Object.freeze({
  /** Exclusive with swipe-back. Do not use a smaller band or both gestures own the boundary. */
  edgeWidth: SWIPE_BACK_DEFAULTS.edgeWidth,
  lockSlop: SWIPE_BACK_DEFAULTS.lockSlop,
  /** Existing reply threshold (was drag offset ±48). */
  threshold: 48,
  /** Existing drag cap (was constraints ±72). Past this the finger keeps moving; the bubble stops. 1:1 up to the cap. */
  max: 72,
});

function idle() {
  return { phase: "idle", dx: 0, haptic: false };
}

/**
 * `direction` is "left" (own message) or "right" (someone else's).
 * `begin` returns `{ owner: "edge" }` when the touch is inside the back band
 * and this gesture must not track.
 */
export function createReplySwipe(options = {}) {
  const opts = { ...REPLY_SWIPE_DEFAULTS, ...options };
  let state = idle();

  function sign() {
    return state.direction === "left" ? -1 : 1;
  }

  return {
    get state() {
      return state;
    },
    get options() {
      return opts;
    },
    begin({ x, y, direction }) {
      const edge = opts.edgeWidth ?? REPLY_SWIPE_DEFAULTS.edgeWidth;
      if (!(x > edge)) {
        state = { ...idle(), phase: "yielded", reason: "edge" };
        return { owner: "edge" };
      }
      state = { phase: "pending", x0: x, y0: y, direction, dx: 0, haptic: false, claimed: false };
      return { owner: "pending" };
    },
    /**
     * Returns
     *   { type: "none" }                          still inside the 10px slop
     *   { type: "abort", reason }                 vertical scroll, or the wrong way
     *   { type: "drag", x, crossed, claim }       1:1 offset, claim on the lock frame
     */
    move({ x, y }) {
      if (state.phase !== "pending" && state.phase !== "dragging") {
        return { type: "none", x: 0, crossed: false, claim: false };
      }
      const dx = x - state.x0;
      const dy = y - state.y0;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      if (state.phase === "pending") {
        const slop = opts.lockSlop ?? REPLY_SWIPE_DEFAULTS.lockSlop;
        if (adx < slop && ady < slop) return { type: "none", x: 0, crossed: false, claim: false };
        const rightWay = dx * sign() > 0 && adx > ady;
        if (!rightWay) {
          const reason = ady >= adx ? "vertical" : "reverse";
          state = { ...idle(), phase: "aborted", reason };
          return { type: "abort", reason, x: 0, crossed: false, claim: false };
        }
        state.phase = "dragging";
        state.claimed = true;
      }
      const travel = Math.max(0, dx * sign());
      const cap = opts.max ?? REPLY_SWIPE_DEFAULTS.max;
      const shown = Math.min(cap, travel) * sign();
      const threshold = opts.threshold ?? REPLY_SWIPE_DEFAULTS.threshold;
      const crossed = !state.haptic && travel >= threshold;
      if (crossed) state.haptic = true;
      state.dx = shown;
      return { type: "drag", x: shown, crossed, claim: state.claimed };
    },
    end() {
      if (state.phase !== "dragging") {
        state = idle();
        return { type: "cancel", reply: false };
      }
      const threshold = opts.threshold ?? REPLY_SWIPE_DEFAULTS.threshold;
      const reply = Math.abs(state.dx) >= threshold;
      state = idle();
      return { type: reply ? "reply" : "cancel", reply };
    },
    reset() {
      state = idle();
    },
  };
}

function findTouch(list, id) {
  if (!list) return null;
  for (let i = 0; i < list.length; i += 1) {
    if (list[i].identifier === id) return list[i];
  }
  return null;
}

/**
 * Touch driver used by message bubbles. Listens to real touch events
 * (identifier, clientX/Y, timeStamp). Does not preventDefault until the
 * axis has locked horizontal, so vertical scrolling stays native.
 * Calls `onClaim` once when reply takes the gesture so a still-pending
 * swipe-back can stand down. An edge-band start never tracks.
 */
export function attachReplySwipe(el, {
  getDirection,
  getEdgeWidth = () => REPLY_SWIPE_DEFAULTS.edgeWidth,
  shouldIgnore = () => false,
  onClaim = () => {},
  onMove = () => {},
  onHaptic = () => {},
  onReply = () => {},
  onCancel = () => {},
} = {}) {
  if (!el || typeof el.addEventListener !== "function") return () => {};
  let gesture = null;
  let touchId = null;
  let claimed = false;

  function finish(commit) {
    if (!gesture) return;
    const result = commit ? gesture.end() : { reply: false };
    gesture = null;
    touchId = null;
    claimed = false;
    if (result.reply) onReply();
    else onCancel();
  }

  function onStart(event) {
    if (!event.touches || event.touches.length !== 1) {
      finish(false);
      return;
    }
    const touch = event.changedTouches?.[0] || event.touches[0];
    if (!touch || shouldIgnore(event.target)) {
      gesture = null;
      return;
    }
    gesture = createReplySwipe({ edgeWidth: getEdgeWidth() });
    const began = gesture.begin({
      x: touch.clientX,
      y: touch.clientY,
      direction: getDirection(),
    });
    if (began.owner === "edge") {
      gesture = null;
      touchId = null;
      return;
    }
    touchId = touch.identifier;
    claimed = false;
  }

  function handleMove(event) {
    if (!gesture || touchId == null) return;
    const touch = findTouch(event.touches, touchId) || findTouch(event.changedTouches, touchId);
    if (!touch) return;
    const result = gesture.move({ x: touch.clientX, y: touch.clientY });
    if (result.type === "abort") {
      gesture = null;
      touchId = null;
      onCancel();
      return;
    }
    if (result.type !== "drag") return;
    if (!claimed) {
      claimed = true;
      onClaim();
    }
    if (event.cancelable) event.preventDefault();
    onMove(result.x);
    if (result.crossed) onHaptic();
  }

  function onEnd(event) {
    if (!gesture || touchId == null) return;
    const touch = findTouch(event.changedTouches, touchId);
    if (!touch && event.type !== "touchcancel") return;
    finish(event.type !== "touchcancel");
  }

  const startOpts = { passive: true };
  const moveOpts = { passive: false };
  el.addEventListener("touchstart", onStart, startOpts);
  el.addEventListener("touchmove", handleMove, moveOpts);
  el.addEventListener("touchend", onEnd, startOpts);
  el.addEventListener("touchcancel", onEnd, startOpts);
  return () => {
    el.removeEventListener("touchstart", onStart, startOpts);
    el.removeEventListener("touchmove", handleMove, moveOpts);
    el.removeEventListener("touchend", onEnd, startOpts);
    el.removeEventListener("touchcancel", onEnd, startOpts);
  };
}

/**
 * Both recognisers, fed the same touch points a finger would produce.
 * `onBubble` marks the hit target as `data-no-swipe-back` (body-zone back
 * does not start). Returns who owned the gesture and how far each surface moved.
 */
export function simulateConversationGesture({
  points,
  width = 440,
  onBubble = false,
  direction = "right",
  edgeWidth = REPLY_SWIPE_DEFAULTS.edgeWidth,
}) {
  if (!points?.length) {
    return { owner: null, pageX: 0, replyX: 0, haptic: 0, replied: false, scrollCancelled: false };
  }
  const start = points[0];
  const zone = classifyStart({
    x: start.x ?? start.clientX,
    width,
    onNoSwipeTarget: Boolean(onBubble),
  }, { ...SWIPE_BACK_DEFAULTS, edgeWidth });
  const back = createSwipeBackMachine();
  const reply = createReplySwipe({ edgeWidth });
  const began = reply.begin({
    x: start.x ?? start.clientX,
    y: start.y ?? start.clientY ?? 0,
    direction,
  });
  if (zone) {
    back.begin({
      x: start.x ?? start.clientX,
      y: start.y ?? start.clientY ?? 0,
      t: start.t ?? start.timeStamp ?? 0,
      width,
      zone,
      canGoBack: true,
    });
  }

  let owner = began.owner === "edge" && zone === "edge" ? "back" : null;
  let pageX = 0;
  let replyX = 0;
  let haptic = 0;
  let scrollCancelled = false;

  for (let i = 1; i < points.length; i += 1) {
    const p = points[i];
    const x = p.x ?? p.clientX;
    const y = p.y ?? p.clientY ?? 0;
    const t = p.t ?? p.timeStamp ?? i * 16;
    if (began.owner !== "edge" && (reply.state.phase === "pending" || reply.state.phase === "dragging")) {
      const result = reply.move({ x, y });
      if (result.type === "abort") {
        replyX = 0;
      } else if (result.type === "drag") {
        if (back.state.phase === "pending") back.reset();
        owner = "reply";
        replyX = result.x;
        pageX = 0;
        scrollCancelled = true;
        if (result.crossed) haptic += 1;
      }
    }
    if (owner !== "reply" && back.state.phase !== "idle") {
      const result = back.move({ x, y, t });
      if (result.type === "abort") {
        pageX = 0;
        if (owner === "back") owner = null;
      } else if (result.type === "lock" || result.type === "drag") {
        owner = "back";
        pageX = result.x;
        replyX = 0;
        scrollCancelled = true;
      }
    }
  }

  const end = began.owner === "edge" ? { reply: false } : reply.end();
  return {
    owner,
    zone,
    pageX,
    replyX,
    haptic,
    replied: Boolean(end.reply),
    scrollCancelled: owner === "reply" ? scrollCancelled : false,
  };
}
