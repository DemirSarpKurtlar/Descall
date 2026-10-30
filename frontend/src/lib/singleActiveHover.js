// One message hover toolbar at a time, app-wide.
//
// Every message bubble registers with this shared owner when its toolbar opens.
// Opening a new one closes the previous one synchronously, so moving the mouse
// across messages never stacks toolbars. Leaving schedules a short grace close
// (so the pointer can travel from the bubble onto the toolbar). A lock keeps the
// toolbar open, and un-replaceable, while its emoji picker / menu is open.
//
// Aim (3.1): the pill sits above / beside its bubble, so the way to it can
// cross a neighbouring message. While the pointer is heading toward the open
// pill, a neighbour's request waits (AIM_DELAY_MS, re-checked, at most
// AIM_MAX_MS) instead of taking over; reaching the pill cancels it, stopping
// on the neighbour grants it. Same idea as menu "safe triangles".

export const HOVER_TOOLBAR_GRACE_MS = 120;
export const AIM_DELAY_MS = 150;
export const AIM_MAX_MS = 600;
const TRAIL_MS = 100;

/**
 * Is the pointer moving toward `rect`? `trail` = recent {x, y, t}, oldest first.
 * Casts a ray along the last ~100 ms of movement and checks it enters the rect
 * (grown by `slack`) within `reach` px. A still pointer is not aiming.
 */
export function headingToward(trail, rect, { slack = 8, reach = 280 } = {}) {
  if (!rect || !Array.isArray(trail) || !trail.length) return false;
  const p1 = trail[trail.length - 1];
  const box = { left: rect.left - slack, right: rect.right + slack, top: rect.top - slack, bottom: rect.bottom + slack };
  if (p1.x >= box.left && p1.x <= box.right && p1.y >= box.top && p1.y <= box.bottom) return true;
  const p0 = trail.find((p) => p.t >= p1.t - TRAIL_MS && p !== p1);
  if (!p0) return false;
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy);
  if (len < 3) return false;
  const ux = dx / len;
  const uy = dy / len;
  let tmin = -Infinity;
  let tmax = Infinity;
  for (const [o, u, lo, hi] of [[p1.x, ux, box.left, box.right], [p1.y, uy, box.top, box.bottom]]) {
    if (Math.abs(u) < 1e-9) {
      if (o < lo || o > hi) return false;
    } else {
      const a = (lo - o) / u;
      const b = (hi - o) / u;
      tmin = Math.max(tmin, Math.min(a, b));
      tmax = Math.min(tmax, Math.max(a, b));
    }
  }
  return tmax >= Math.max(tmin, 0) && tmin <= reach;
}

export function createSingleActive({
  graceMs = HOVER_TOOLBAR_GRACE_MS,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (h) => clearTimeout(h),
  now = () => Date.now(),
  aimDelayMs = AIM_DELAY_MS,
  aimMaxMs = AIM_MAX_MS,
} = {}) {
  let active = null; // { id, close, getRect }
  let locked = false;
  let timer = null;
  let pending = null; // { id, close, getRect, onGrant, since }
  let pendingTimer = null;
  let trail = [];

  const clearPending = () => {
    if (pendingTimer != null) clearTimer(pendingTimer);
    pendingTimer = null;
    pending = null;
  };

  const aiming = () => {
    let rect = null;
    try { rect = active?.getRect?.() || null; } catch { rect = null; }
    return headingToward(trail, rect);
  };

  const cancel = () => {
    if (timer != null) {
      clearTimer(timer);
      timer = null;
    }
  };

  const drop = () => {
    const prev = active;
    active = null;
    locked = false;
    cancel();
    return prev;
  };

  const take = (id, close, getRect) => {
    if (active && active.id !== id) {
      const prev = drop();
      try { prev.close?.(); } catch { /* ignore */ }
    }
    cancel();
    active = { id, close, getRect };
  };

  const checkPending = () => {
    pendingTimer = null;
    if (!pending) return;
    if (active && !locked && aiming() && now() - pending.since < aimMaxMs) {
      pendingTimer = setTimer(checkPending, aimDelayMs);
      return;
    }
    const p = pending;
    pending = null;
    if (locked) return;
    take(p.id, p.close, p.getRect);
    try { p.onGrant?.(); } catch { /* ignore */ }
  };

  /**
   * Make `id` the only open toolbar. Returns false if another one is locked
   * open, or (with `onGrant`) while the pointer is heading to the open one:
   * then `onGrant` runs once the pointer stops aiming at it.
   */
  function activate(id, close, { getRect, onGrant } = {}) {
    if (active && active.id === id) {
      clearPending();
      cancel();
      if (close) active.close = close;
      if (getRect) active.getRect = getRect;
      return true;
    }
    if (active && locked) return false;
    if (active && onGrant && aiming()) {
      cancel();
      if (pending?.id !== id) {
        clearPending();
        pending = { id, close, getRect, onGrant, since: now() };
        pendingTimer = setTimer(checkPending, aimDelayMs);
      }
      return false;
    }
    clearPending();
    take(id, close, getRect);
    return true;
  }

  /** Feed pointer positions (document pointermove). */
  function track(x, y, t = now()) {
    trail.push({ x, y, t });
    if (trail.length > 8) trail = trail.slice(-8);
  }

  /** Close `id` now (if it is the active one). */
  function release(id) {
    if (!active || active.id !== id) return;
    const prev = drop();
    try { prev.close?.(); } catch { /* ignore */ }
  }

  /** Close `id` after the grace period unless re-entered or locked. */
  function scheduleRelease(id, ms = graceMs) {
    if (pending && pending.id === id) {
      // Left the neighbour before it took over: the open pill gets its grace.
      clearPending();
      if (active && !locked) {
        cancel();
        const target = active.id;
        timer = setTimer(() => { timer = null; release(target); }, ms);
      }
      return;
    }
    if (!active || active.id !== id || locked) return;
    cancel();
    timer = setTimer(() => {
      timer = null;
      release(id);
    }, ms);
  }

  /** Pointer re-entered the bubble or toolbar: keep it open. */
  function keep(id) {
    if (active && active.id === id) {
      cancel();
      clearPending();
    }
  }

  function setLocked(id, value) {
    if (!active || active.id !== id) return;
    locked = Boolean(value);
    if (locked) cancel();
  }

  /** The bubble closed itself (action taken, unmount): forget without calling close. */
  function forget(id) {
    if (pending && pending.id === id) clearPending();
    if (active && active.id === id) drop();
  }

  return {
    activate,
    release,
    scheduleRelease,
    keep,
    setLocked,
    forget,
    track,
    getActiveId: () => (active ? active.id : null),
    getPendingId: () => (pending ? pending.id : null),
    isLocked: () => locked,
  };
}

export const messageHoverToolbar = createSingleActive();

let trailInstalled = false;
/** One passive document listener feeds the shared toolbar's pointer trail. */
export function installHoverTrail(target = typeof document !== "undefined" ? document : null) {
  if (trailInstalled || !target?.addEventListener) return;
  trailInstalled = true;
  target.addEventListener("pointermove", (e) => {
    if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    messageHoverToolbar.track(e.clientX, e.clientY, e.timeStamp || Date.now());
  }, { passive: true, capture: true });
}
