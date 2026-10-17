// One message hover toolbar at a time, app-wide.
//
// Every message bubble registers with this shared owner when its toolbar opens.
// Opening a new one closes the previous one synchronously, so moving the mouse
// across messages never stacks toolbars. Leaving schedules a short grace close
// (so the pointer can travel from the bubble onto the toolbar). A lock keeps the
// toolbar open, and un-replaceable, while its emoji picker / menu is open.

export const HOVER_TOOLBAR_GRACE_MS = 120;

export function createSingleActive({
  graceMs = HOVER_TOOLBAR_GRACE_MS,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (h) => clearTimeout(h),
} = {}) {
  let active = null; // { id, close }
  let locked = false;
  let timer = null;

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

  /** Make `id` the only open toolbar. Returns false if another one is locked open. */
  function activate(id, close) {
    if (active && active.id !== id) {
      if (locked) return false;
      const prev = drop();
      try { prev.close?.(); } catch { /* ignore */ }
    }
    cancel();
    active = { id, close };
    return true;
  }

  /** Close `id` now (if it is the active one). */
  function release(id) {
    if (!active || active.id !== id) return;
    const prev = drop();
    try { prev.close?.(); } catch { /* ignore */ }
  }

  /** Close `id` after the grace period unless re-entered or locked. */
  function scheduleRelease(id, ms = graceMs) {
    if (!active || active.id !== id || locked) return;
    cancel();
    timer = setTimer(() => {
      timer = null;
      release(id);
    }, ms);
  }

  /** Pointer re-entered the bubble or toolbar: keep it open. */
  function keep(id) {
    if (active && active.id === id) cancel();
  }

  function setLocked(id, value) {
    if (!active || active.id !== id) return;
    locked = Boolean(value);
    if (locked) cancel();
  }

  /** The bubble closed itself (action taken, unmount): forget without calling close. */
  function forget(id) {
    if (active && active.id === id) drop();
  }

  return {
    activate,
    release,
    scheduleRelease,
    keep,
    setLocked,
    forget,
    getActiveId: () => (active ? active.id : null),
    isLocked: () => locked,
  };
}

export const messageHoverToolbar = createSingleActive();
