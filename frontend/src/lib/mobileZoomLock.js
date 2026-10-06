/**
 * Mobile zoom lock (iOS Safari / Android Chrome / Capacitor WebView).
 * - Blocks two-finger pinch zoom (iOS ignores user-scalable=no, so we cancel
 *   gesture events and multi-touch moves ourselves).
 * - Blocks double-tap zoom.
 * - After an input loses focus (keyboard closes) snaps the viewport back to
 *   scale 1 so the app never stays enlarged.
 */
const VIEWPORT_LOCKED =
  "width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content";

function isTouchDevice() {
  if (typeof window === "undefined") return false;
  if (window.electronAPI?.isElectron) return false;
  return "ontouchstart" in window || (navigator.maxTouchPoints || 0) > 0;
}

function resetViewportScale() {
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta) return;
  // Re-writing the content forces iOS to recompute the scale back to 1.
  meta.setAttribute("content", VIEWPORT_LOCKED.replace("initial-scale=1.0", "initial-scale=1"));
  requestAnimationFrame(() => meta.setAttribute("content", VIEWPORT_LOCKED));
}

export function installMobileZoomLock() {
  if (!isTouchDevice() || window.__descallZoomLock) return;
  window.__descallZoomLock = true;

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
      const t = e.target;
      const editable =
        t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ""));
      if (!editable && now - lastTouchEnd < 300) cancel(e);
      lastTouchEnd = now;
    },
    { passive: false }
  );
  // Keyboard closed / input blurred → snap back to normal size.
  document.addEventListener("focusout", (e) => {
    const t = e.target;
    if (!t || !(t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ""))) return;
    setTimeout(() => {
      const a = document.activeElement;
      if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName || ""))) return;
      resetViewportScale();
      if (window.visualViewport && window.visualViewport.scale > 1.01) resetViewportScale();
    }, 60);
  });
  window.visualViewport?.addEventListener("resize", () => {
    if (window.visualViewport.scale > 1.01) resetViewportScale();
  });
  // Never let the page sit scrolled sideways (app would look cut off).
  const snapX = () => {
    if (window.scrollX !== 0) window.scrollTo(0, window.scrollY);
  };
  window.addEventListener("scroll", snapX, { passive: true });
  window.visualViewport?.addEventListener("scroll", snapX);
}
