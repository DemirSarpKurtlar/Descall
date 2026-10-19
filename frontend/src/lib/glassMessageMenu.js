/** Stage 3: on Liquid Glass the message menu is an iOS long-press, not a tap. */
export const MESSAGE_MENU_LONG_PRESS_MS = 450;

/**
 * After the photo / GIF viewer closes, ignore presses for this long.
 * The close tap can land on the bubble once the overlay is gone.
 */
export const LIGHTBOX_CLOSE_GUARD_MS = 700;

/**
 * One photo or GIF bubble. The viewer and the long-press share one token:
 * opening the viewer retires the press that started it, and closing arms
 * the guard. A long-press fires only while its own token is still current
 * and the viewer is shut.
 */
export function createMediaPressGate({ now = () => Date.now() } = {}) {
  let token = 0;
  let guardUntil = 0;
  let lightboxOpen = false;

  return {
    noteLightbox(open, at = now()) {
      const next = Boolean(open);
      if (next === lightboxOpen) return false;
      const wasOpen = lightboxOpen;
      lightboxOpen = next;
      token += 1;
      if (wasOpen && !next) guardUntil = at + LIGHTBOX_CLOSE_GUARD_MS;
      return true;
    },
    arm(at = now()) {
      if (lightboxOpen || at < guardUntil) return 0;
      token += 1;
      return token;
    },
    armed(id, at = now()) {
      return id !== 0 && id === token && !lightboxOpen && at >= guardUntil;
    },
    accepts(at = now()) {
      return !lightboxOpen && at >= guardUntil;
    },
    cancel() {
      token += 1;
    },
  };
}

export function messageMenuOpensOnTap(glass) {
  return !glass;
}

const VISUAL_EXT = /\.(gif|png|jpe?g|webp|avif|heic|heif)(\?|#|$)/i;

/**
 * Photo / GIF the long-press menu should keep on screen. Signed storage
 * URLs often have no extension; the type, mime, or filename still counts.
 * A non-image file does not.
 */
export function visualMediaPreview(message) {
  const url = String(message?.mediaUrl || message?.media_url || "").trim();
  if (!url) return null;
  const type = String(message?.mediaType || message?.media_type || "").toLowerCase();
  const mime = String(message?.mimeType || message?.mime_type || "").toLowerCase();
  const name = String(message?.originalName || message?.original_name || "");
  const looks =
    VISUAL_EXT.test(url) ||
    VISUAL_EXT.test(name) ||
    /giphy\.com|tenor\.com/i.test(url) ||
    mime.startsWith("image/");
  const typed =
    type === "gif" ||
    type === "image" ||
    type === "photo" ||
    type === "sticker" ||
    type.startsWith("image/");
  if (!typed && !looks) return null;
  const isGif =
    type === "gif" ||
    mime === "image/gif" ||
    /\.gif(\?|#|$)/i.test(url) ||
    /giphy\.com/i.test(url);
  return { src: url, isGif };
}

/** On-screen size so the lifted copy cannot collapse to an empty box. */
export function liftMediaBox(imageRect, bubbleRect) {
  const width =
    imageRect && imageRect.width >= 24
      ? Math.round(imageRect.width)
      : Math.min(240, Math.max(160, Math.round((bubbleRect?.width || 200) - 8)));
  const height =
    imageRect && imageRect.height >= 24
      ? Math.round(Math.min(imageRect.height, 240))
      : Math.min(160, Math.round(width * 0.72));
  return { width, height };
}

/**
 * A row (or the scrim) runs only if this finger pressed down on that control.
 * The long-press that opened the menu pressed the bubble, so its release
 * cannot Edit, Report, or dismiss.
 */
export function pressToActivate(run) {
  let armed = false;
  return {
    onPointerDown(event) {
      if (event.button != null && event.button !== 0) return;
      armed = true;
    },
    onPointerCancel() {
      armed = false;
    },
    onClick(event) {
      if (!armed) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      armed = false;
      run?.(event);
    },
  };
}

/**
 * Swallow the pointerup / touchend that is still down when the menu opens,
 * and the click that same gesture synthesizes. The guard stays until that
 * click, or until the next pointerdown (a new press on a row). No timer:
 * a long hold cannot activate the control that slid under the finger.
 */
export function swallowOpeningPress() {
  if (typeof window === "undefined") return () => {};
  let live = true;
  const stop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  };
  const detach = () => {
    if (!live) return;
    live = false;
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onUp, true);
    window.removeEventListener("touchend", onUp, true);
    window.removeEventListener("click", onClick, true);
    window.removeEventListener("pointerdown", onNextDown, true);
  };
  const onUp = (event) => {
    if (!live) return;
    stop(event);
    if (event.type === "pointercancel") detach();
  };
  const onClick = (event) => {
    if (!live) return;
    stop(event);
    detach();
  };
  const onNextDown = () => {
    if (!live) return;
    detach();
  };
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("pointercancel", onUp, true);
  window.addEventListener("touchend", onUp, true);
  window.addEventListener("click", onClick, true);
  window.addEventListener("pointerdown", onNextDown, true);
  return detach;
}

/**
 * Arm a long-press on `el` for the same pointer. The timer fires only while
 * that token is current. pointerup / pointercancel / touchend / touchcancel,
 * a 24px move, scroll, or a hidden page all retire it. Returns null when the
 * viewer is open or the close guard has not elapsed.
 */
export function attachMenuPress({
  gate,
  event,
  el,
  win = typeof window !== "undefined" ? window : null,
  doc = typeof document !== "undefined" ? document : null,
  delay = MESSAGE_MENU_LONG_PRESS_MS,
  schedule = setTimeout,
  cancelTimer = clearTimeout,
  onFire,
  onTeardown,
} = {}) {
  if (!gate || !el || !win || !doc || !event) return null;
  const id = gate.arm();
  if (!id) return null;
  const sx = event.clientX;
  const sy = event.clientY;
  const pointerId = event.pointerId;
  let timer = null;
  let live = true;
  const tracked = (ev) => {
    if (!ev || ev.pointerId == null || pointerId == null) return true;
    if (typeof ev.type === "string" && ev.type.startsWith("touch")) return true;
    return ev.pointerId === pointerId;
  };
  const detach = () => {
    if (!live) return;
    live = false;
    if (timer != null) cancelTimer(timer);
    timer = null;
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", up);
    win.removeEventListener("pointerup", up, true);
    win.removeEventListener("pointercancel", up, true);
    win.removeEventListener("touchend", up, true);
    win.removeEventListener("touchcancel", up, true);
    win.removeEventListener("scroll", onScroll, true);
    doc.removeEventListener("visibilitychange", onHide);
    onTeardown?.();
  };
  const abort = (ev) => {
    if (ev && !tracked(ev)) return;
    gate.cancel();
    detach();
  };
  const move = (ev) => {
    if (!tracked(ev)) return;
    if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 24) abort();
  };
  const up = (ev) => abort(ev);
  const onScroll = () => abort();
  const onHide = () => {
    if (doc.hidden) abort();
  };
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
  win.addEventListener("pointerup", up, true);
  win.addEventListener("pointercancel", up, true);
  win.addEventListener("touchend", up, true);
  win.addEventListener("touchcancel", up, true);
  win.addEventListener("scroll", onScroll, { capture: true, passive: true });
  doc.addEventListener("visibilitychange", onHide);
  timer = schedule(() => {
    if (!live || !gate.armed(id)) {
      detach();
      return;
    }
    detach();
    onFire?.();
  }, delay);
  return { detach };
}

/* ── Lifted bubble (2.11.17) ──────────────────────────────────────────────
 * The long-press preview is a clone of the real, rendered bubble: same skin
 * classes (cosmetic-chat-bubble bubble-*), same markdown, newlines, media,
 * reactions and size. It used to be a plain text copy in a fixed blue
 * `.g-lift-bub`, so skins, **bold** and line breaks were lost.
 */

/** Long-press stack geometry (CSS px). Matches styles/glass/chat.css. */
export const LIFT_GAP = 10;
export const REACT_BAR_H = 56;
export const MENU_W = 250;
export const EDGE = 12;

/** Reaction bar width: padding 8+8, n chips of 44 + the 40 "more" button, 4px gaps. */
export function reactBarWidth(count) {
  const n = Math.max(0, Number(count) || 0);
  return 16 + n * 44 + 40 + n * 4;
}

/** Menu height estimate: 6+6 padding, 46px rows, separators, optional picker. */
export function menuHeight({ rows = 2, separators = 0, picker = false } = {}) {
  return 12 + rows * 46 + separators * 11 + (picker ? 190 : 0);
}

function clamp(v, lo, hi) {
  return Math.min(Math.max(v, lo), Math.max(lo, hi));
}

/** Lift scale for the in-place pop (iMessage-style). Tall bubbles stay at 1. */
export const LIFT_SCALE = 1.03;

/**
 * Where the reaction bar, the lifted bubble and the menu go (2.13.1).
 * The bubble never moves: it lifts in place (small scale from its own
 * centre, no translate), so it is exactly where the finger pressed it.
 * The reaction bar sits just above it and the menu just below it. Only when
 * there is no room do they flip, in this order:
 *   1. bar above, menu below (default)
 *   2. bar below, menu under the bar (bubble near the top)
 *   3. bar above, menu above the bar (bubble near the bottom)
 *   4. no room either way (very tall bubble): bar clamped to the safe top,
 *      menu clamped to the safe bottom, both over the bubble.
 * `vh` is the visible height (visualViewport when the keyboard is up).
 */
export function liftLayout({
  rect,
  vw,
  vh,
  isOwn,
  barW,
  menuH,
  menuW = MENU_W,
  barH = REACT_BAR_H,
  gap = LIFT_GAP,
  safeTop = 62,
  safeBottom = 34,
  viewTop = 0,
}) {
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const top = rect.top;
  const bottom = rect.top + height;
  const lo = viewTop + safeTop;
  const hi = viewTop + vh - safeBottom;
  const scale = height > vh * 0.5 ? 1 : LIFT_SCALE;
  // Visual extent of the scaled bubble (scaled about its centre).
  const grow = (height * (scale - 1)) / 2;
  const vTop = top - grow;
  const vBottom = bottom + grow;
  const roomAbove = vTop - lo;
  const roomBelow = hi - vBottom;
  const needBar = barH + gap;
  const needMenu = menuH + gap;
  let barTop;
  let menuTop;
  let placement;
  if (roomAbove >= needBar && roomBelow >= needMenu) {
    placement = "bar-above-menu-below";
    barTop = vTop - gap - barH;
    menuTop = vBottom + gap;
  } else if (roomBelow >= needBar + needMenu) {
    placement = "both-below";
    barTop = vBottom + gap;
    menuTop = barTop + barH + gap;
  } else if (roomAbove >= needBar + needMenu) {
    placement = "both-above";
    barTop = vTop - gap - barH;
    menuTop = barTop - gap - menuH;
  } else {
    placement = "clamped";
    barTop = clamp(vTop - gap - barH, lo, hi - menuH - gap - barH);
    menuTop = clamp(vBottom + gap, barTop + barH + gap, hi - menuH);
  }
  const bw = Math.min(barW, vw - EDGE * 2);
  const mw = Math.min(menuW, vw - EDGE * 2);
  const anchorLeft = (w) =>
    isOwn ? clamp(rect.left + width - w, EDGE, vw - EDGE - w) : clamp(rect.left, EDGE, vw - EDGE - w);
  return {
    placement,
    liftTop: top,
    liftLeft: rect.left,
    liftScale: scale,
    liftH: height,
    dy: 0,
    barTop: Math.round(barTop),
    barLeft: Math.round(anchorLeft(bw)),
    barW: bw,
    menuTop: Math.round(menuTop),
    menuLeft: Math.round(anchorLeft(mw)),
    menuW: mw,
    origin: "50% 50%",
    // The bar/menu materialize from the edge that touches the bubble.
    barFromBelow: barTop < top,
    menuFromAbove: menuTop > top,
  };
}

/**
 * Border-box size of `el` without its transforms (the press shrink), keeping
 * sub-pixel precision. offsetWidth rounds, and a lifted copy that is even
 * 0.4px narrower than the original re-wraps its text ("nold" / "u").
 */
export function untransformedBox(el, cs) {
  if (!el) return { width: 0, height: 0 };
  let width = 0;
  let height = 0;
  if (cs) {
    const px = (p) => parseFloat(cs.getPropertyValue(p)) || 0;
    width = px("width");
    height = px("height");
    if (cs.getPropertyValue("box-sizing") !== "border-box") {
      width += px("padding-left") + px("padding-right") + px("border-left-width") + px("border-right-width");
      height += px("padding-top") + px("padding-bottom") + px("border-top-width") + px("border-bottom-width");
    }
  }
  if (!(width > 0)) width = el.offsetWidth || 0;
  if (!(height > 0)) height = el.offsetHeight || 0;
  return { width, height };
}

const LIFT_STRIP_SELECTOR = ".message-hover-bar, .message-inline-picker, .message-swipe-hint, .msg-edit-box";
const LIFT_STATE_CLASSES = ["menu-open", "is-editing"];
const LIFT_COPY_PROPS = [
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-left-radius",
  "border-bottom-right-radius",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
];

function copyCustomProps(from, to) {
  const style = from?.style;
  if (!style) return;
  for (let i = 0; i < style.length; i += 1) {
    const name = style[i];
    if (name.startsWith("--")) to.style.setProperty(name, style.getPropertyValue(name));
  }
}

/**
 * Clone `bubble` for the lifted preview.
 * The clone sits inside `display: contents` copies of its ancestors up to
 * `.app-root` (same classes, data attributes and CSS custom properties), so
 * every `html.glass-ui .app-root.g-shell …` / `.message-group.own …` rule and
 * every theme variable still applies, yet those wrappers draw no box.
 * Returns { root, clone } or null.
 */
export function buildLiftedBubble(bubble, { win = typeof window !== "undefined" ? window : null } = {}) {
  if (!bubble || !bubble.ownerDocument) return null;
  const doc = bubble.ownerDocument;
  const cs = win?.getComputedStyle ? win.getComputedStyle(bubble) : null;
  const { width, height } = untransformedBox(bubble, cs);

  const chain = [];
  for (let node = bubble.parentElement; node && node !== doc.body && node !== doc.documentElement; node = node.parentElement) {
    chain.unshift(node);
    if (node.classList?.contains("app-root")) break;
  }
  let root = null;
  let parent = null;
  for (const anc of chain) {
    const div = doc.createElement("div");
    if (anc.className && typeof anc.className === "string") div.className = anc.className;
    for (const attr of Array.from(anc.attributes || [])) {
      if (attr.name.startsWith("data-")) div.setAttribute(attr.name, attr.value);
    }
    copyCustomProps(anc, div);
    div.style.setProperty("display", "contents", "important");
    div.setAttribute("data-lift-mirror", "");
    if (parent) parent.appendChild(div);
    else root = div;
    parent = div;
  }

  const clone = bubble.cloneNode(true);
  for (const cls of LIFT_STATE_CLASSES) clone.classList.remove(cls);
  clone.removeAttribute("data-pressed");
  clone.removeAttribute("data-editing");
  clone.removeAttribute("id");
  clone.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
  clone.querySelectorAll(LIFT_STRIP_SELECTOR).forEach((n) => n.remove());
  clone.querySelectorAll("img").forEach((img) => {
    img.setAttribute("loading", "eager");
    img.setAttribute("decoding", "sync");
  });
  clone.querySelectorAll("video").forEach((v) => {
    v.removeAttribute("autoplay");
    v.muted = true;
  });
  clone.querySelectorAll("a, button, input, textarea, [tabindex]").forEach((n) => n.setAttribute("tabindex", "-1"));
  clone.setAttribute("aria-hidden", "true");
  clone.setAttribute("inert", "");
  clone.setAttribute("data-lifted", "");
  const s = clone.style;
  if (cs) for (const prop of LIFT_COPY_PROPS) s.setProperty(prop, cs.getPropertyValue(prop));
  s.setProperty("transform", "none", "important");
  s.setProperty("opacity", "1", "important");
  s.setProperty("visibility", "visible", "important");
  s.setProperty("margin", "0", "important");
  s.setProperty("box-sizing", "border-box", "important");
  s.setProperty("width", `${width}px`, "important");
  s.setProperty("min-width", `${width}px`, "important");
  s.setProperty("max-width", `${width}px`, "important");
  s.setProperty("height", `${height}px`, "important");
  s.setProperty("pointer-events", "none", "important");
  s.setProperty("position", "relative", "important");
  s.setProperty("touch-action", "none");
  if (parent) parent.appendChild(clone);
  else root = clone;
  return {
    root,
    clone,
    width,
    height,
    radius: cs
      ? ["border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius"]
          .map((p) => cs.getPropertyValue(p) || "0px")
          .join(" ")
      : "18px",
  };
}
