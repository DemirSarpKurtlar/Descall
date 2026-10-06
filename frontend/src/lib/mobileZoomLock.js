/**
 * Mobile zoom lock (iOS Safari / Android Chrome / Capacitor WebView).
 * - Blocks two-finger pinch zoom (iOS ignores user-scalable=no, so we cancel
 *   gesture events and multi-touch moves ourselves).
 * - Blocks double-tap zoom.
 * - After typing ends, if Safari left the page zoomed, snaps scale back to 1.
 *
 * Do NOT rewrite the viewport meta while the keyboard is open or on every
 * visualViewport resize — that fights useMobileKeyboard's --vv-height updates
 * and makes the chrome jump up/down rapidly while typing.
 */
const VIEWPORT_LOCKED =
  "width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content";

function isTouchDevice() {
  if (typeof window === "undefined") return false;
  if (window.electronAPI?.isElectron) return false;
  return "ontouchstart" in window || (navigator.maxTouchPoints || 0) > 0;
}

function isEditable(el) {
  return Boolean(
    el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ""))
  );
}

function resetViewportScale() {
  if (isEditable(document.activeElement)) return;
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta) return;
  // Re-writing the content forces iOS to recompute the scale back to 1.
  meta.setAttribute("content", VIEWPORT_LOCKED.replace("initial-scale=1.0", "initial-scale=1"));
  requestAnimationFrame(() => meta.setAttribute("content", VIEWPORT_LOCKED));
}

export function installMobileZoomLock() {
  if (!isTouchDevice() || window.__descallZoomLock) return;
  window.__descallZoomLock = true;
  // Static index.html keeps a zoomable viewport (marketing a11y); lock it here for the app.
  const meta = document.querySelector('meta[name="viewport"]');
  if (meta) meta.setAttribute("content", VIEWPORT_LOCKED);

  const cancel = (e) => {
    if (e.cancelable) e.preventDefault();
  };
  // iOS Safari pinch gestures.
  document.addEventListener("gesturestart", cancel, { passive: false });
  document.addEventListener("gesturechange", cancel, { passive: false });
  document.addEventListener("gestureend", cancel, { passive: false });
  // Any multi-finger move = pinch → cancel.
  document.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches && e.touches.length > 1) cancel(e);
      else if (typeof e.scale === "number" && e.scale !== 1) cancel(e);
    },
    { passive: false }
  );
  // Double-tap zoom.
  let lastTouchEnd = 0;
  document.addEventListener(
    "touchend",
    (e) => {
      const now = Date.now();
      if (!isEditable(e.target) && now - lastTouchEnd < 300) cancel(e);
      lastTouchEnd = now;
    },
    { passive: false }
  );
  // Keyboard closed → snap scale only if Safari actually zoomed.
  document.addEventListener("focusout", (e) => {
    if (!isEditable(e.target)) return;
    setTimeout(() => {
      if (isEditable(document.activeElement)) return;
      if (window.visualViewport && window.visualViewport.scale > 1.01) {
        resetViewportScale();
      }
    }, 320);
  });
  // Never let the page sit scrolled sideways (app would look cut off).
  // Skip while typing — useMobileKeyboard already owns scroll while the KB is open.
  const snapX = () => {
    if (isEditable(document.activeElement)) return;
    if (window.scrollX !== 0) window.scrollTo(0, window.scrollY);
  };
  window.addEventListener("scroll", snapX, { passive: true });
}
