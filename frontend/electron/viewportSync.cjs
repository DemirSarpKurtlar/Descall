'use strict';
/**
 * Keep the page viewport equal to the window's client area (2.13.6).
 *
 * Field report (Windows, during a call with a screen share): after maximize /
 * fullscreen the whole page, title bar included, stayed at the old size in
 * the top-left corner (~745x480 of 1024x549). Chromium had not delivered the
 * new size to the renderer (no resize → layout kept the stale viewport). The
 * window events still fire in main, so main now checks the renderer's
 * innerWidth/innerHeight against getContentBounds() after every maximize,
 * unmaximize, restore, resize and (leave-)full-screen, and nudges the
 * compositor until they match: invalidate(), then a same-size setBounds,
 * then a 1px content resize round trip (restored windows only).
 */

function viewportMismatch({ content, inner, zoom = 1 }) {
  if (!content || !inner) return false;
  const z = Number(zoom) > 0 ? Number(zoom) : 1;
  const w = Math.round(inner.w * z);
  const h = Math.round(inner.h * z);
  return Math.abs(w - content.width) > 4 || Math.abs(h - content.height) > 4;
}

function attachViewportSync(win, { log = () => {}, delays = [60, 250, 700] } = {}) {
  if (!win || typeof win.on !== 'function') return () => {};
  let timers = [];
  const clear = () => { timers.forEach(clearTimeout); timers = []; };
  const measure = async () => {
    if (win.isDestroyed?.()) return null;
    const inner = await win.webContents.executeJavaScript('[window.innerWidth, window.innerHeight]', true).catch(() => null);
    if (!inner) return null;
    return { content: win.getContentBounds(), inner: { w: inner[0], h: inner[1] }, zoom: win.webContents.getZoomFactor?.() || 1 };
  };
  const check = async (step) => {
    const m = await measure();
    if (!m || !viewportMismatch(m)) return;
    log(`[viewport] stale page size ${m.inner.w}x${m.inner.h} vs client ${m.content.width}x${m.content.height} (step ${step})`);
    try { win.webContents.invalidate(); } catch (_) {}
    if (step >= 1) { try { win.setBounds(win.getBounds()); } catch (_) {} }
    if (step >= 2 && !win.isMaximized() && !win.isFullScreen()) {
      try {
        const b = win.getContentBounds();
        win.setContentBounds({ ...b, width: b.width + 1 });
        win.setContentBounds(b);
      } catch (_) {}
    }
  };
  const schedule = () => {
    clear();
    delays.forEach((ms, i) => timers.push(setTimeout(() => { void check(i); }, ms)));
  };
  const events = ['maximize', 'unmaximize', 'restore', 'resize', 'enter-full-screen', 'leave-full-screen', 'show'];
  events.forEach((e) => win.on(e, schedule));
  win.once?.('closed', clear);
  return () => { clear(); events.forEach((e) => win.removeListener?.(e, schedule)); };
}

module.exports = { viewportMismatch, attachViewportSync };
