/** Stage 3: on Liquid Glass the message menu is an iOS long-press, not a tap. */
export const MESSAGE_MENU_LONG_PRESS_MS = 450;

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
