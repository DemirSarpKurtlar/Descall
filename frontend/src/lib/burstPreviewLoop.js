// Shared scheduler for the shop's live reaction-burst previews.
// One IntersectionObserver for every card, one timer per VISIBLE card,
// nothing at all while a card is offscreen, the tab is hidden or the app is
// idle/backgrounded (html.app-idle / html.app-backgrounded, lib/appVisibility.js).

export const BURST_PREVIEW_PERIOD_MS = 1800;
/** Cards start out of phase so a row does not fire in lockstep. */
export const BURST_PREVIEW_STAGGER_MS = 260;

export function prefersReducedMotion(win = typeof window !== "undefined" ? window : null) {
  try {
    return Boolean(win?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  } catch {
    return false;
  }
}

export function appIsResting(doc = typeof document !== "undefined" ? document : null) {
  if (!doc) return false;
  if (doc.hidden) return true;
  const cl = doc.documentElement?.classList;
  return Boolean(cl && (cl.contains("app-idle") || cl.contains("app-backgrounded")));
}

/**
 * Creates the loop controller. `env` is injectable for tests:
 * { IO, setTimeout, clearTimeout, isResting }.
 */
export function createBurstPreviewLoop(env = {}) {
  const IO = env.IO !== undefined ? env.IO : (typeof IntersectionObserver === "function" ? IntersectionObserver : null);
  const setT = env.setTimeout || ((fn, ms) => setTimeout(fn, ms));
  const clearT = env.clearTimeout || ((id) => clearTimeout(id));
  const isResting = env.isResting || (() => appIsResting());
  const entries = new Map(); // element -> { fire, visible, timer, index }
  let io = null;
  let counter = 0;

  const schedule = (el, delay) => {
    const e = entries.get(el);
    if (!e || e.timer != null) return;
    e.timer = setT(() => {
      e.timer = null;
      if (!entries.has(el) || !e.visible) return;
      if (!isResting()) e.fire();
      schedule(el, BURST_PREVIEW_PERIOD_MS);
    }, delay);
  };
  const stop = (el) => {
    const e = entries.get(el);
    if (e && e.timer != null) {
      clearT(e.timer);
      e.timer = null;
    }
  };
  const setVisible = (el, visible) => {
    const e = entries.get(el);
    if (!e || e.visible === visible) return;
    e.visible = visible;
    if (visible) schedule(el, 120 + (e.index % 4) * BURST_PREVIEW_STAGGER_MS);
    else stop(el);
  };

  const ensureIo = () => {
    if (io || !IO) return io;
    io = new IO(
      (list) => {
        for (const entry of list) setVisible(entry.target, entry.isIntersecting);
      },
      { rootMargin: "80px 0px", threshold: 0.15 }
    );
    return io;
  };

  return {
    observe(el, fire) {
      if (!el || entries.has(el)) return () => {};
      entries.set(el, { fire, visible: false, timer: null, index: counter++ });
      const obs = ensureIo();
      if (obs) obs.observe(el);
      else setVisible(el, true); // no IO (old WebView): just play
      return () => {
        stop(el);
        entries.delete(el);
        if (obs) obs.unobserve(el);
        if (!entries.size && io) {
          io.disconnect();
          io = null;
        }
      };
    },
    /** test helpers */
    _size: () => entries.size,
    _running: () => [...entries.values()].filter((e) => e.timer != null).length,
  };
}

let shared = null;
export function sharedBurstPreviewLoop() {
  if (!shared) shared = createBurstPreviewLoop();
  return shared;
}
