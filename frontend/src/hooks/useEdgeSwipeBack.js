import { useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { Capacitor } from "@capacitor/core";
import {
  PHASE,
  SWIPE_BACK_DEFAULTS,
  classifyStart,
  clamp,
  createSpring,
  createSwipeBackMachine,
  easeOutCubic,
  layerFrame,
  progressFor,
} from "../lib/edgeSwipeBack";
import { hapticLight, primeHaptics } from "../lib/haptics";

/**
 * iOS-style interactive swipe-back for inner mobile screens.
 *
 *   useEdgeSwipeBack({
 *     enabled,                 // only where the main nav is hidden
 *     onBack,                  // the screen's own back handler (same as its ‹ button)
 *     surfaceRef | getSurface, // the page that follows the finger
 *     underlayRef | getUnderlay, // the live previous screen (parallax + dim), optional
 *     placeholder,             // no live previous screen → skeleton placeholder
 *     priority,                // nested screens: the highest enabled one wins
 *     canGoBack,               // false = no previous page: edge drag rubber-bands and returns
 *   })
 *
 * Motion follows /workspace/design/apple-design.md: 10px hysteresis, 1:1
 * tracking, commit by release-velocity sign + momentum projection, the finger's
 * velocity handed to a critically damped spring, interruptible from the live
 * position, haptic in the same frame as the commit, reduced motion = cross-fade.
 *
 * One shared touch driver serves every registered screen, so nested screens
 * never both react. Frames are transform/opacity only, written straight to
 * the DOM (no React render per frame). Disabled on desktop / Electron (no touch
 * input, and callers pass enabled=false there) and in the Android app, where the
 * system back gesture already runs the same back handler.
 */

// Anything open on top of the page owns the touch: modals, sheets, menus,
// pickers, the full-screen call view.
export const SWIPE_BACK_BLOCKERS = [
  "[aria-modal='true']",
  "[role='dialog']",
  "[role='alertdialog']",
  "[role='menu']",
  "[data-swipe-back-block]",
  "[data-call-overlay]",
  ".vc-mobile-overlay",
  ".video-conference",
  ".voice-call-overlay",
  ".incoming-call-card",
  ".modal-backdrop",
  ".server-modal-overlay",
  ".lfg-modal-overlay",
  ".add-modal-backdrop",
  ".login-modal-overlay",
  ".report-modal-overlay",
  ".invite-modal-overlay",
  ".legal-modal-backdrop",
  ".age-gate-backdrop",
  ".conv-confirm-overlay",
  ".feedback-overlay",
  ".shop-gift-backdrop",
  ".settings-overlay",
  ".voice-effects-panel-overlay",
  ".server-icon-picker-overlay",
  ".server-voice-menu-backdrop",
  ".members-panel-backdrop",
  ".img-crop-overlay",
  ".giphy-overlay",
  ".message-media-lightbox",
  ".reaction-picker",
  ".message-inline-picker",
  ".emoji-picker",
  ".status-picker-portal",
  ".profile-popover",
  ".user-profile-card",
  ".user-settings-shell",
].join(",");

// Non-blocking banners that happen to use role="dialog".
const NON_BLOCKING = ".ios-pwa-banner, .mkt-consent, .mobile-drawer-backdrop";

// Starting a body-zone swipe on these never steals the touch (edge still works).
const NO_SWIPE_TARGETS =
  "input, textarea, select, [contenteditable='true'], [contenteditable=''], input[type='range'], [role='slider'], video, canvas, [data-no-swipe-back], .swipe-reveal-row, .conv-group-wrap.is-swipeable";

const SPRING_COMPLETE_MS = 300;
const SPRING_CANCEL_MS = 340;
const FADE_MS = 200;

function isVisible(el) {
  if (!el || el.nodeType !== 1 || !el.isConnected) return false;
  const rects = el.getClientRects();
  if (!rects.length) return false;
  const style = window.getComputedStyle(el);
  if (style.visibility === "hidden" || style.display === "none") return false;
  if (Number(style.opacity) === 0) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 1 && rect.height > 1;
}

/** The first visible overlay that is not the screen's own container, or null. */
export function findBlockingOverlay(surface, doc = typeof document !== "undefined" ? document : null) {
  if (!doc) return null;
  const candidates = doc.querySelectorAll(SWIPE_BACK_BLOCKERS);
  for (const el of candidates) {
    if (el.matches(NON_BLOCKING)) continue;
    // The settings sheet itself is a dialog — it only blocks screens beneath it.
    if (surface && el.contains(surface)) continue;
    if (isVisible(el)) return el;
  }
  // Mobile members panel slides over the chat as a fixed sheet.
  const members = doc.querySelector(".members-panel");
  if (members && (!surface || !members.contains(surface)) && isVisible(members) && window.getComputedStyle(members).position === "fixed") {
    return members;
  }
  return null;
}

function scrollsHorizontally(el) {
  if (!(el.scrollWidth > el.clientWidth + 2)) return false;
  const overflowX = window.getComputedStyle(el).overflowX;
  return overflowX === "auto" || overflowX === "scroll" || overflowX === "overlay";
}

/** Walks from the touch target up to the surface: horizontal scrollers / sliders / inputs. */
export function inspectTouchTarget(target, surface) {
  let onHorizontalScroller = false;
  let onNoSwipeTarget = false;
  let el = target && target.nodeType === 1 ? target : target?.parentElement;
  while (el && el !== surface && el !== document.body) {
    if (!onNoSwipeTarget && el.matches?.(NO_SWIPE_TARGETS)) onNoSwipeTarget = true;
    if (!onHorizontalScroller && scrollsHorizontally(el)) onHorizontalScroller = true;
    if (onHorizontalScroller && onNoSwipeTarget) break;
    el = el.parentElement;
  }
  return { onHorizontalScroller, onNoSwipeTarget };
}

function hasTextSelection() {
  try {
    const sel = window.getSelection?.();
    return Boolean(sel && !sel.isCollapsed && String(sel).trim().length > 0);
  } catch {
    return false;
  }
}

let safeAreaProbe = null;
/** Left safe-area inset (landscape notch / Dynamic Island side) — widens the edge band. */
/** Screen-left band that always belongs to swipe-back (edge width + landscape inset). */
export function swipeBackEdgeBand() {
  return SWIPE_BACK_DEFAULTS.edgeWidth + safeAreaLeft();
}

/**
 * A reply swipe that has locked calls this while swipe-back may still be
 * pending on the same finger. Only a not-yet-locked back gesture stands down.
 * An edge swipe that already owns the page (DRAGGING) is left alone.
 */
export function cancelSwipeBackIfPending() {
  if (machine.state.phase !== PHASE.PENDING) return false;
  machine.reset();
  candidate = null;
  return true;
}

function safeAreaLeft() {
  try {
    if (!safeAreaProbe || !safeAreaProbe.isConnected) {
      safeAreaProbe = document.createElement("div");
      safeAreaProbe.setAttribute("aria-hidden", "true");
      safeAreaProbe.style.cssText =
        "position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-left:env(safe-area-inset-left,0px)";
      document.body.appendChild(safeAreaProbe);
    }
    const n = Number.parseFloat(window.getComputedStyle(safeAreaProbe).paddingLeft);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function prefersReducedMotion() {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  } catch {
    return false;
  }
}

/** Touch-capable mobile runtimes only. Electron and the Android app opt out. */
export function swipeBackSupported() {
  if (typeof window === "undefined") return false;
  if (window.electronAPI?.isElectron) return false;
  if (/Electron/i.test(navigator.userAgent || "")) return false;
  try {
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") return false;
  } catch {
    /* web */
  }
  return "ontouchstart" in window || (navigator.maxTouchPoints || 0) > 0;
}

/* ───────────────────────── registry ───────────────────────── */

const entries = new Set();
let registrationOrder = 0;

function resolve(ref, getter) {
  if (typeof getter === "function") return getter() || null;
  return ref?.current || null;
}

function entrySurface(entry) {
  const props = entry.props.current;
  return resolve(props.surfaceRef, props.getSurface);
}

function entryUnderlay(entry) {
  const props = entry.props.current;
  return resolve(props.underlayRef, props.getUnderlay);
}

/** The screen a new touch belongs to: highest priority, then most recently mounted. */
function entryCanGoBack(entry) {
  const props = entry.props.current;
  return props.canGoBack !== false && typeof props.onBack === "function";
}

function pickEntry() {
  const ordered = [...entries]
    .filter((entry) => entry.props.current.enabled && (entryCanGoBack(entry) || entry.props.current.canGoBack === false))
    .sort((a, b) => (b.props.current.priority || 0) - (a.props.current.priority || 0) || b.order - a.order);
  for (const entry of ordered) {
    const surface = entrySurface(entry);
    if (!surface || !isVisible(surface)) continue;
    if (findBlockingOverlay(surface)) return null;
    return { entry, surface };
  }
  return null;
}

/* ───────────────────────── driver ───────────────────────── */

const machine = createSwipeBackMachine(SWIPE_BACK_DEFAULTS);
let candidate = null; // { entry, surface, touchId }
let session = null; // visual session (layers + saved styles)
let anim = null; // { raf, kind }
let frameRaf = 0;
let pendingX = null;
let listenersOn = false;

function saveStyles(el, props) {
  const saved = {};
  for (const prop of props) saved[prop] = el.style[prop];
  return saved;
}

function restoreStyles(el, saved) {
  if (!el || !saved) return;
  for (const [prop, value] of Object.entries(saved)) el.style[prop] = value;
}

function zIndexOf(el) {
  const z = Number.parseInt(window.getComputedStyle(el).zIndex, 10);
  return Number.isFinite(z) ? z : 0;
}

function createPlaceholder() {
  const el = document.createElement("div");
  el.className = "edge-swipe-placeholder";
  el.setAttribute("aria-hidden", "true");
  const rows = Array.from({ length: 9 }, () => '<div class="esp-row"><span class="esp-avatar"></span><span class="esp-lines"><span></span><span></span></span></div>').join("");
  el.innerHTML = `<div class="esp-rail"></div><div class="esp-list"><div class="esp-head"><span></span></div>${rows}</div>`;
  return el;
}

function beginSession(entry, surface) {
  const props = entry.props.current;
  const parent = surface.parentNode;
  if (!parent) return null;
  const width = surface.getBoundingClientRect().width || window.innerWidth;
  const reduceMotion = prefersReducedMotion();
  const options = { ...SWIPE_BACK_DEFAULTS, ...(props.dimOpacity != null ? { dimOpacity: props.dimOpacity } : null) };
  const canGoBack = entryCanGoBack(entry);

  let underlay = canGoBack ? entryUnderlay(entry) : null;
  if (underlay === surface || (underlay && underlay.contains(surface))) underlay = null;
  let placeholder = null;
  if (canGoBack && !underlay && props.placeholder) {
    placeholder = createPlaceholder();
    parent.insertBefore(placeholder, surface);
    underlay = placeholder;
  }

  // Stacking: previous screen < dim + edge shadow < current screen. Only
  // reorder when they share a parent (same stacking context); an underlay in
  // another context (the app under the settings sheet) is already beneath.
  const sibling = Boolean(underlay && underlay.parentNode === parent);
  const baseZ = sibling ? zIndexOf(underlay) : 0;
  const surfaceZ = Math.max(zIndexOf(surface), baseZ + 2);

  const parentStyle = window.getComputedStyle(parent);
  const layerPosition = parentStyle.position === "static" ? "fixed" : "absolute";

  const scrim = document.createElement("div");
  // No previous page: an opaque backdrop shows behind the rubber-banding page.
  scrim.className = canGoBack ? "edge-swipe-scrim" : "edge-swipe-scrim is-void";
  scrim.setAttribute("aria-hidden", "true");
  scrim.style.position = layerPosition;
  scrim.style.zIndex = String(surfaceZ - 1);
  const shadow = document.createElement("div");
  shadow.className = "edge-swipe-shadow";
  shadow.setAttribute("aria-hidden", "true");
  shadow.style.position = layerPosition;
  shadow.style.zIndex = String(surfaceZ - 1);
  if (reduceMotion) shadow.style.display = "none";
  parent.insertBefore(scrim, surface);
  parent.insertBefore(shadow, surface);

  const surfaceSaved = saveStyles(surface, ["transform", "transition", "willChange", "zIndex", "opacity", "visibility", "position"]);
  surface.style.transition = "none";
  surface.style.willChange = reduceMotion ? "opacity" : "transform";
  surface.style.zIndex = String(surfaceZ);
  if (window.getComputedStyle(surface).position === "static" && !/flex|grid/.test(parentStyle.display)) {
    surface.style.position = "relative";
  }
  surface.classList.add("edge-swipe-surface");

  let underlaySaved = null;
  if (underlay && underlay !== placeholder) {
    underlaySaved = saveStyles(underlay, ["transform", "transition", "willChange", "pointerEvents"]);
    underlay.style.transition = "none";
    underlay.style.willChange = "transform";
    underlay.classList.add("edge-swipe-underlay");
  }
  if (underlay) underlay.style.pointerEvents = "none";

  parent.classList.add("edge-swipe-host");
  document.documentElement.classList.add("edge-swipe-active");

  return {
    entry,
    surface,
    parent,
    underlay,
    placeholder,
    scrim,
    shadow,
    width,
    options,
    reduceMotion,
    surfaceSaved,
    underlaySaved,
    canGoBack,
    x: 0,
    finishing: false,
    committed: false,
  };
}

function renderFrame(s, x) {
  s.x = x;
  const f = layerFrame(x, s.width, s.options, s.reduceMotion);
  if (s.reduceMotion) {
    s.surface.style.opacity = String(f.surfaceOpacity);
  } else {
    s.surface.style.transform = `translate3d(${f.surfaceX}px,0,0)`;
    s.shadow.style.transform = `translate3d(${f.surfaceX}px,0,0)`;
    s.shadow.style.opacity = String(f.shadowOpacity);
  }
  if (s.underlay) s.underlay.style.transform = s.reduceMotion ? "none" : `translate3d(${f.underlayX}px,0,0)`;
  s.scrim.style.opacity = s.canGoBack ? String(f.dimOpacity) : "1";
}

function teardown(s, { keepSurfaceHidden = false } = {}) {
  if (!s) return;
  s.scrim.remove();
  s.shadow.remove();
  if (s.underlay && s.underlay !== s.placeholder) {
    s.underlay.classList.remove("edge-swipe-underlay");
    restoreStyles(s.underlay, s.underlaySaved);
  }
  if (!keepSurfaceHidden) {
    s.surface.classList.remove("edge-swipe-surface");
    restoreStyles(s.surface, s.surfaceSaved);
    s.parent.classList.remove("edge-swipe-host");
  }
  if (s.placeholder) {
    const ph = s.placeholder;
    if (s.finishing && ph.isConnected) {
      // The real previous screen is mounted underneath now — crossfade to it.
      ph.style.transition = `opacity ${FADE_MS}ms ease`;
      requestAnimationFrame(() => {
        ph.style.opacity = "0";
      });
      window.setTimeout(() => ph.remove(), FADE_MS + 60);
    } else {
      ph.remove();
    }
  }
  if (!session || session === s) document.documentElement.classList.remove("edge-swipe-active");
}

function stopAnim() {
  if (anim?.raf) cancelAnimationFrame(anim.raf);
  anim = null;
}

function scheduleFrame(x) {
  pendingX = x;
  if (frameRaf) return;
  frameRaf = requestAnimationFrame(() => {
    frameRaf = 0;
    if (session && pendingX != null) renderFrame(session, pendingX);
    pendingX = null;
  });
}

function isIdentityTransform(value) {
  if (!value || value === "none") return true;
  const m = value.match(/^matrix\(([^)]+)\)$/);
  if (!m) return false;
  const [a, b, c, d, e, f] = m[1].split(",").map((n) => Number.parseFloat(n));
  return a === 1 && b === 0 && c === 0 && d === 1 && Math.abs(e) < 0.5 && Math.abs(f) < 0.5;
}

/**
 * True once the previous screen sits where our layer left it (x = 0, visible)
 * on its own — i.e. the back navigation has committed. Probed by dropping the
 * inline overrides for one synchronous style read (no paint in between).
 */
function underlaySettled(s) {
  const u = s.underlay;
  if (!u || u === s.placeholder || !u.isConnected) return true;
  const { transform, transition } = u.style;
  u.classList.remove("edge-swipe-underlay");
  u.style.transition = "none";
  u.style.transform = s.underlaySaved?.transform || "";
  const cs = window.getComputedStyle(u);
  const ok = cs.display !== "none" && isIdentityTransform(cs.transform);
  u.classList.add("edge-swipe-underlay");
  u.style.transform = transform;
  u.style.transition = transition;
  return ok;
}

/** Runs fn once the back navigation is on screen (or after ~1 s as a fallback). */
function whenSettled(s, fn) {
  let frames = 0;
  const check = () => {
    frames += 1;
    if (underlaySettled(s) || frames > 60) fn();
    else requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
}

function finish(s, decision) {
  stopAnim();
  if (decision !== "complete") {
    teardown(s);
    if (session === s) session = null;
    return;
  }
  s.finishing = true;
  const props = s.entry.props.current;
  // Close the keyboard with the page (like UIKit) instead of leaving it over the list.
  const active = document.activeElement;
  if (active && active !== document.body && s.surface.contains(active)) {
    try {
      active.blur();
    } catch {
      /* ignore */
    }
  }
  // The page is fully off-screen / faded out; keep it from flashing back while React swaps screens.
  s.surface.style.visibility = "hidden";
  try {
    // Commit the back navigation now so the previous screen is in its final
    // state before our layers are removed (no slide-out/slide-in flicker).
    flushSync(() => {
      props.onBack?.({ source: "edge-swipe" });
    });
  } catch (error) {
    console.error("[swipe-back] back handler failed", error);
  }
  whenSettled(s, () => {
    if (session === s) session = null;
    if (props.persistUntilUnmount) {
      // The surface plays an exit animation (AnimatePresence) — keep it hidden until it unmounts.
      teardown(s, { keepSurfaceHidden: true });
      const started = performance.now();
      const wait = () => {
        if (!s.surface.isConnected) return;
        if (performance.now() - started > 1200) {
          s.surface.classList.remove("edge-swipe-surface");
          restoreStyles(s.surface, s.surfaceSaved);
          s.parent.classList.remove("edge-swipe-host");
          return;
        }
        requestAnimationFrame(wait);
      };
      requestAnimationFrame(wait);
      return;
    }
    teardown(s);
  });
}

/** The commit moment: haptic in the same frame the page is released to go back (once per swipe). */
function commitFeedback(s, decision) {
  if (decision !== "complete" || s.committed) return;
  s.committed = true;
  hapticLight();
}

function settle(s, decision, velocity) {
  stopAnim();
  commitFeedback(s, decision);
  const target = decision === "complete" ? s.width : 0;
  if (s.reduceMotion) {
    const from = progressFor(s.x, s.width);
    const to = decision === "complete" ? 1 : 0;
    const start = performance.now();
    const tick = (now) => {
      const t = clamp((now - start) / FADE_MS, 0, 1);
      const p = from + (to - from) * easeOutCubic(t);
      renderFrame(s, p * s.width);
      if (t >= 1) finish(s, decision);
      else anim.raf = requestAnimationFrame(tick);
    };
    anim = { kind: decision, raf: requestAnimationFrame(tick) };
    return;
  }
  // The finger's release velocity is handed to a critically damped spring
  // as-is, so the page keeps moving exactly as it was let go.
  const spring = createSpring({
    from: s.x,
    to: target,
    velocity,
    response: decision === "complete" ? SPRING_COMPLETE_MS : SPRING_CANCEL_MS,
    dampingRatio: 1,
    min: 0,
    max: s.width,
  });
  let last = performance.now();
  const tick = (now) => {
    const dt = now - last;
    last = now;
    renderFrame(s, spring.step(dt));
    if (spring.done) finish(s, decision);
    else anim.raf = requestAnimationFrame(tick);
  };
  anim = { kind: decision, spring, raf: requestAnimationFrame(tick) };
}

function findTouch(list, id) {
  for (let i = 0; i < list.length; i += 1) if (list[i].identifier === id) return list[i];
  return null;
}

function onTouchStart(event) {
  if (event.touches.length > 1) {
    // Pinch / second finger: give up and spring back.
    if (session && !session.finishing && machine.state.phase === PHASE.DRAGGING) {
      machine.end({ cancelled: true });
      settle(session, "cancel", 0);
    } else machine.reset();
    candidate = null;
    return;
  }
  const touch = event.changedTouches[0];
  if (!touch) return;

  // Interruptible: a finger landing while the page is still settling catches it.
  if (session && anim && !session.finishing) {
    stopAnim();
    machine.grab({
      x: touch.clientX,
      y: touch.clientY,
      t: event.timeStamp,
      width: session.width,
      fromX: session.x,
      canGoBack: session.canGoBack,
    });
    candidate = { entry: session.entry, surface: session.surface, touchId: touch.identifier };
    return;
  }
  if (session) return; // finishing — ignore until the back navigation lands

  const picked = pickEntry();
  if (!picked) {
    candidate = null;
    return;
  }
  const canGoBack = entryCanGoBack(picked.entry);
  // Nothing to go back to: only the very edge reacts (a rubber-band "end of
  // the stack"), and not at all with reduced motion.
  if (!canGoBack && prefersReducedMotion()) {
    candidate = null;
    return;
  }
  const width = picked.surface.getBoundingClientRect().width || window.innerWidth;
  const rect = picked.surface.getBoundingClientRect();
  const x = touch.clientX - rect.left;
  const zone = classifyStart(
    {
      x,
      width,
      hasSelection: hasTextSelection(),
      edgeInset: safeAreaLeft(),
      ...(x > SWIPE_BACK_DEFAULTS.edgeWidth ? inspectTouchTarget(event.target, picked.surface) : null),
    },
    canGoBack ? SWIPE_BACK_DEFAULTS : { ...SWIPE_BACK_DEFAULTS, bodyZoneRatio: 0 },
  );
  if (!zone) {
    candidate = null;
    return;
  }
  candidate = { ...picked, touchId: touch.identifier };
  machine.begin({ x: touch.clientX, y: touch.clientY, t: event.timeStamp, width, zone, canGoBack });
}

function onTouchMove(event) {
  if (!candidate) return;
  const touch = findTouch(event.changedTouches, candidate.touchId);
  if (!touch) return;
  const phaseBefore = machine.state.phase;
  if (phaseBefore === PHASE.PENDING && hasTextSelection()) {
    machine.reset();
    candidate = null;
    return;
  }
  const result = machine.move({ x: touch.clientX, y: touch.clientY, t: event.timeStamp });
  if (result.type === "abort") {
    candidate = null;
    return;
  }
  if (result.type === "lock") {
    session = beginSession(candidate.entry, candidate.surface);
    if (!session) {
      machine.reset();
      candidate = null;
      return;
    }
    renderFrame(session, 0);
    // Load the haptics plugin now so the commit tap fires in the release frame.
    if (session.canGoBack) primeHaptics();
  }
  if (machine.state.phase === PHASE.DRAGGING && session) {
    // We own this touch now: no page scroll, no rubber-banding, no text selection.
    if (event.cancelable) event.preventDefault();
    if (result.type === "drag") scheduleFrame(result.x);
  }
}

function onTouchEnd(event) {
  if (!candidate) return;
  const touch = findTouch(event.changedTouches, candidate.touchId);
  if (!touch) return;
  const cancelled = event.type === "touchcancel";
  const result = machine.end({ t: event.timeStamp, cancelled });
  candidate = null;
  if (frameRaf) {
    cancelAnimationFrame(frameRaf);
    frameRaf = 0;
    if (session && pendingX != null) renderFrame(session, pendingX);
    pendingX = null;
  }
  if (result.type === "none" || !session) return;
  // touchcancel = the system took the touch (e.g. Safari's own back swipe): never navigate.
  settle(session, result.type, result.velocity);
}

function syncListeners() {
  const want = swipeBackSupported() && [...entries].some((entry) => entry.props.current.enabled);
  if (want === listenersOn) return;
  listenersOn = want;
  const method = want ? "addEventListener" : "removeEventListener";
  // touchmove must be non-passive so a locked swipe can stop the page from scrolling.
  // Installed only while a registered screen is enabled (never on desktop / Electron).
  document[method]("touchstart", onTouchStart, { capture: true, passive: true });
  document[method]("touchmove", onTouchMove, { capture: true, passive: false });
  document[method]("touchend", onTouchEnd, { capture: true, passive: true });
  document[method]("touchcancel", onTouchEnd, { capture: true, passive: true });
}

function dropEntry(entry) {
  entries.delete(entry);
  if (candidate?.entry === entry) {
    candidate = null;
    machine.reset();
  }
  if (session?.entry === entry && !session.finishing) {
    stopAnim();
    teardown(session);
    session = null;
  }
  syncListeners();
}

/* ───────────────────────── hook ───────────────────────── */

export function useEdgeSwipeBack(props) {
  const propsRef = useRef(props);
  propsRef.current = props;
  const entryRef = useRef(null);

  useEffect(() => {
    const entry = { props: propsRef, order: (registrationOrder += 1) };
    entryRef.current = entry;
    entries.add(entry);
    syncListeners();
    return () => dropEntry(entry);
  }, []);

  const enabled = Boolean(props.enabled);
  useEffect(() => {
    syncListeners();
    // Screen changed under an active swipe (socket navigation etc.): let go cleanly.
    if (!enabled && session?.entry === entryRef.current && !session.finishing) {
      stopAnim();
      machine.reset();
      candidate = null;
      teardown(session);
      session = null;
    }
  }, [enabled]);
}

/** Test hook: driver internals. */
export const __edgeSwipeInternals = {
  get entries() {
    return entries;
  },
  get session() {
    return session;
  },
  pickEntry,
};
