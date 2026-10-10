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
