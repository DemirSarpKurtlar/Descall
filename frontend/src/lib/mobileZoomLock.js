/**
 * Mobile pinch / double-tap zoom block (iOS Safari / Android Chrome).
 *
 * Intentionally does NOT rewrite <meta name="viewport">.
 * Setting user-scalable=no / maximum-scale=1 (and re-writing the meta while
 * the keyboard is open) fights useMobileKeyboard's visualViewport height
 * tracking and makes the app jump / rubber-band while typing.
 *
 * Auto-zoom-on-focus is prevented by 16px inputs in mobile.css instead.
 */
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
  // Multi-finger move = pinch → cancel (do not touch single-finger pans).
  document.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches && e.touches.length > 1) cancel(e);
    },
    { passive: false }
  );
  // Double-tap zoom (skip when the target is an editable field).
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
}
